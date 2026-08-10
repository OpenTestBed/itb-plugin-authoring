import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';

import { useAppContext } from '../context/AppContext';
import { useDocuments, DocOrigin } from '../context/useDocuments';
import { useGherkinEngine } from '../context/useGherkinEngine';
import { useDeploy } from '../context/useDeploy';
import { useComponents, environmentProblems } from '../context/useComponents';
import { parseRequirements, checkRequirements } from '../parser/languageRequirements';
import { useIsMobile } from '../hooks/useIsMobile';
import { asFeatureName } from '../services/fileSources';
import { hostLabel } from '../services/itbTargets';

import { Editor, EditorHandle, StepCompletion } from '../components/Editor';
import { ExplorerPanel } from '../components/ExplorerPanel';
import { StepCatalog } from '../components/StepCatalog';
import { DataPoolsPanel } from '../components/DataPoolsPanel';
import { ComponentsPanel } from '../components/ComponentsPanel';
import { ITBSettingsDialog } from '../components/ITBSettingsDialog';
import { useCatalogData } from '../modules/language-explorer/useCatalogData';

import { Navbar } from './Navbar';
import { ActivityRail, RailSection, SectionId } from './ActivityRail';
import { Sidebar } from './Sidebar';
import { TabStrip } from './TabStrip';
import { XmlPane } from './XmlPane';
import { BottomDrawer, DrawerTab, Problem } from './BottomDrawer';
import { StatusBar } from './StatusBar';
import { ITBTargetPopover } from './ITBTargetPopover';
import { LanguageOverlay, LanguageTab } from './LanguageOverlay';

const SECTION_TITLES: Record<SectionId, string> = {
  explorer: 'Explorer',
  steps: 'Steps',
  data: 'Data pools',
  env: 'Environment',
};

function download(name: string, content: BlobPart, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const AppShell: React.FC = () => {
  const {
    isDark, setIsDark, selectedModel, itbConfig, itbStatus, saveConfig,
    itbSettingsOpen, setITBSettingsOpen,
    source, sourceKind, setSourceKind, hasServerFiles, hasLocalFs, localDirName,
    dialectsVersion, refreshFiles,
  } = useAppContext();

  const docs = useDocuments();
  const engine = useGherkinEngine(docs.activeDoc?.content ?? '');
  const deployState = useDeploy();
  const isMobile = useIsMobile();
  const { steps: catalogSteps, components: catalogComponents, core } = useCatalogData();

  const itbConnected = itbStatus === 'connected';
  const comps = useComponents(dialectsVersion, hasServerFiles || itbConnected);

  const editorRef = useRef<EditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [section, setSection] = useState<SectionId>('explorer');
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [xmlOpen, setXmlOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('problems');
  const [overlay, setOverlay] = useState<LanguageTab | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(t => (t === msg ? null : t)), 2600);
  }, []);

  // ── Problems: parser + language + environment ──────────────────────
  // Language issues come first: when a file targets a catalog you don't have,
  // that one line explains the pile of "no mapping for step" errors under it.
  const problems: Problem[] = useMemo(() => {
    const parser: Problem[] = engine.issues.map(i => ({
      severity: i.severity === 'error' ? 'error' : 'warning',
      line: i.line,
      message: i.message,
      from: 'parser' as const,
    }));

    const unmatched = engine.issues.filter(
      i => typeof i.message === 'string' && /no mapping for step/i.test(i.message),
    ).length;
    const language: Problem[] = checkRequirements(
      parseRequirements(engine.featureTags),
      core,
      catalogComponents,
      unmatched,
    ).map(i => ({ severity: i.severity, message: i.message, from: 'language' as const }));

    const env = environmentProblems(
      engine.requiredActors,
      comps.components,
      hasServerFiles || itbConnected,
    );
    return [...language, ...parser, ...env];
  }, [
    engine.issues, engine.featureTags, engine.requiredActors,
    core, catalogComponents, comps.components, hasServerFiles, itbConnected,
  ]);

  const errorCount = problems.filter(p => p.severity === 'error').length;
  const warnCount = problems.length - errorCount;

  // The drawer rests as a 30px strip and pops open the first time the active
  // file turns out to have problems — so the error check is always visible but
  // costs nothing when there is nothing to say. Manual toggles stick.
  const autoOpenedFor = useRef<string | null>(null);
  useEffect(() => {
    if (docs.active === autoOpenedFor.current) return;
    if (problems.length > 0) {
      autoOpenedFor.current = docs.active;
      setDrawerTab('problems');
      setDrawerOpen(true);
    }
  }, [docs.active, problems.length]);

  // ── Ctrl+Space completions from the live catalog ───────────────────
  const completions: StepCompletion[] = useMemo(
    () => catalogSteps.map(s => {
      let i = 0;
      const insert = s.humanPattern.replace(/<([^>]+)>/g, (_, name) => `\${${++i}:${name}}`);
      return {
        label: s.humanPattern,
        insertText: insert,
        detail: s.source === 'core' ? s.category : `${s.source} · ${s.category}`,
        documentation: s.match,
      };
    }),
    [catalogSteps],
  );

  // ── Content imported from itb-test-manager ─────────────────────────
  const { openFresh } = docs;
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'workbench-import' && e.data.gherkin) {
        openFresh(e.data.name || 'imported.feature', e.data.gherkin, 'scratch');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [openFresh]);

  // ── File actions ───────────────────────────────────────────────────
  const activeDoc = docs.activeDoc;
  const canWrite = source.writable;
  const saveLabel = canWrite ? 'Save' : 'Download';

  const doSave = useCallback(async () => {
    if (!activeDoc) return;
    if (!canWrite) {
      download(activeDoc.name, activeDoc.content);
      flash(`Downloaded ${activeDoc.name}`);
      return;
    }
    try {
      await source.write(activeDoc.name, activeDoc.content);
      docs.markSaved(activeDoc.name, source.kind as DocOrigin);
      refreshFiles();
      flash(`Saved ${activeDoc.name}`);
    } catch (e: any) {
      flash(`Save failed — ${e?.message ?? e}`);
    }
  }, [activeDoc, canWrite, source, docs, refreshFiles, flash]);

  const doSaveAs = useCallback(async () => {
    if (!activeDoc) return;
    const raw = window.prompt('Save as', activeDoc.name);
    if (!raw?.trim()) return;
    const name = asFeatureName(raw);
    if (!canWrite) {
      download(name, activeDoc.content);
      flash(`Downloaded ${name}`);
      return;
    }
    try {
      await source.write(name, activeDoc.content);
      docs.markSaved(activeDoc.name, source.kind as DocOrigin, name);
      refreshFiles();
      flash(`Saved ${name}`);
    } catch (e: any) {
      flash(`Save failed — ${e?.message ?? e}`);
    }
  }, [activeDoc, canWrite, source, docs, refreshFiles, flash]);

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => docs.openFresh(file.name, String(ev.target?.result ?? ''), 'scratch');
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const downloadZip = useCallback(async () => {
    const out = engine.xmlOutput;
    if (!out) { flash('Nothing compiled yet'); return; }
    const zip = new JSZip();
    for (const file of out.files) zip.file(file.filename, file.xml);
    download(
      `${out.testcaseName.replace(/[^a-zA-Z0-9]/g, '_')}.zip`,
      await zip.generateAsync({ type: 'blob' }),
      'application/zip',
    );
    flash(`Downloaded ${out.files.length} file(s) as ZIP`);
  }, [engine.xmlOutput, flash]);

  const compileReady = !!engine.xmlOutput && engine.errorCount === 0;

  const onPrimary = useCallback(() => {
    if (itbConnected) {
      if (!engine.xmlOutput) return;
      setDrawerTab('deploy');
      setDrawerOpen(true);
      void deployState.deploy(engine.xmlOutput);
    } else {
      void downloadZip();
    }
  }, [itbConnected, engine.xmlOutput, deployState, downloadZip]);

  // ── Keyboard ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void doSave();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doSave]);

  // ── Sidebar ────────────────────────────────────────────────────────
  const railSections: RailSection[] = [
    { id: 'explorer', label: 'Explorer' },
    { id: 'steps', label: 'Steps' },
    { id: 'data', label: 'Data pools' },
    { id: 'env', label: 'Environment', badge: comps.unhealthy || undefined },
  ];

  const focusSection = (id: SectionId) => { setSection(id); setSidebarOpen(true); };

  const onRailSelect = (id: SectionId) => {
    if (id === section && sidebarOpen) { setSidebarOpen(false); return; }
    focusSection(id);
  };

  const insertAtCursor = (text: string) => {
    if (!docs.active) {
      docs.openFresh('untitled.feature', `${text}\n`, 'scratch');
      return;
    }
    editorRef.current?.insertText(text);
  };

  const sidebarBody = (() => {
    switch (section) {
      case 'explorer':
        return (
          <ExplorerPanel
            openTabs={docs.openTabs}
            docs={docs.docs}
            activeName={docs.active}
            isDirty={docs.isDirty}
            onFocus={docs.focus}
            onClose={docs.close}
            onOpen={(name, content, origin) => docs.open(name, content, origin)}
          />
        );
      case 'steps':
        return <StepCatalog onStepClick={doc => insertAtCursor(`    And ${doc.variants[0].humanPattern}`)} />;
      case 'data':
        return (
          <DataPoolsPanel
            isDark={isDark}
            onInsertPoolStep={id =>
              insertAtCursor(`    Given the test environment is configured with data pool "${id}"`)}
          />
        );
      case 'env':
        return <ComponentsPanel requiredActors={engine.requiredActors} />;
    }
  })();

  // ── Output tab lines ───────────────────────────────────────────────
  const outputLines = activeDoc ? [
    { label: 'parse', text: `${activeDoc.name} — ${activeDoc.content.split('\n').length} lines, ${problems.length} issue(s)` },
    { label: 'catalog', text: `${catalogSteps.length} steps` },
    { label: 'generate', text: `${engine.xmlOutput?.files.length ?? 0} GITB XML file(s)` },
    ...(compileReady
      ? [{ label: 'ok', text: 'ready to deploy', tone: 'ok' as const }]
      : [{ label: 'blocked', text: `${engine.errorCount} error(s) must be fixed`, tone: 'bad' as const }]),
  ] : [];

  return (
    <div className="relative flex h-screen flex-col bg-white dark:bg-slate-900">
      <Navbar
        isDark={isDark}
        setIsDark={setIsDark}
        canDeploy={itbConnected}
        deploying={deployState.deploying}
        primaryEnabled={compileReady}
        onPrimary={onPrimary}
        saveLabel={saveLabel}
        canSave={!!activeDoc}
        canWrite={canWrite}
        onSave={() => void doSave()}
        onSaveAs={() => void doSaveAs()}
        onImport={() => fileInputRef.current?.click()}
        onDownloadFeature={() => activeDoc && download(activeDoc.name, activeDoc.content)}
        onDownloadZip={() => void downloadZip()}
        xmlOpen={xmlOpen}
        onToggleXml={() => setXmlOpen(o => !o)}
        onOpenLanguage={() => setOverlay('steps')}
        onOpenTarget={() => setTargetOpen(o => !o)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".feature"
        onChange={onImportFile}
        className="hidden"
      />

      <div className="flex min-h-0 flex-1">
        <ActivityRail
          sections={railSections}
          active={section}
          sidebarOpen={sidebarOpen}
          onSelect={onRailSelect}
        />

        {sidebarOpen && (
          <Sidebar title={SECTION_TITLES[section]} width={sidebarWidth} onResize={setSidebarWidth}>
            {sidebarBody}
          </Sidebar>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <TabStrip
            tabs={docs.openTabs}
            active={docs.active}
            isDirty={docs.isDirty}
            onSelect={docs.focus}
            onClose={docs.close}
            onNew={() => docs.newScratch()}
          />

          <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: xmlOpen ? '1.45fr 1fr' : '1fr' }}>
            <div className="flex min-h-0 min-w-0 flex-col">
              {activeDoc ? (
                <Editor
                  ref={editorRef}
                  value={activeDoc.content}
                  onChange={v => docs.setContent(activeDoc.name, v)}
                  errors={engine.issues}
                  isDark={isDark}
                  highlights={engine.stepHighlights}
                  completions={completions}
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-gray-400">
                  <strong className="text-sm font-semibold text-gray-500 dark:text-gray-400">No file open</strong>
                  <span className="text-xs">Pick one from the Explorer, or start a new file with +.</span>
                </div>
              )}
            </div>

            {xmlOpen && <XmlPane xmlOutput={engine.xmlOutput} onClose={() => setXmlOpen(false)} />}
          </div>
        </div>
      </div>

      <BottomDrawer
        open={drawerOpen}
        onToggle={() => setDrawerOpen(o => !o)}
        tab={drawerTab}
        onTab={setDrawerTab}
        problems={problems}
        outputLines={outputLines}
        itbConnected={itbConnected}
        deployState={deployState}
        canDeploy={compileReady}
        onDeploy={onPrimary}
        onRun={() => engine.xmlOutput && void deployState.runTests(engine.xmlOutput)}
        onOpenTarget={() => setTargetOpen(true)}
        onGotoLine={line => editorRef.current?.revealLine(line)}
      />

      <div className="relative">
        <StatusBar
          sourceKind={sourceKind}
          sourceLabel={
            sourceKind === 'local' && localDirName ? `${localDirName}/`
              : sourceKind === 'server' ? 'itb-cli/features'
              : 'bundled'
          }
          onFilesClick={() => {
            // Cycle through the sources this environment actually offers.
            const order = ['bundled', hasServerFiles && 'server', hasLocalFs && 'local']
              .filter(Boolean) as ('bundled' | 'server' | 'local')[];
            const next = order[(order.indexOf(sourceKind) + 1) % order.length];
            setSourceKind(next);
            focusSection('explorer');
          }}
          itbStatus={itbStatus}
          itbLabel={hostLabel(itbConfig)}
          specLabel={itbConfig.specificationId ?? null}
          onItbClick={() => setTargetOpen(o => !o)}
          showHealth={(hasServerFiles || itbConnected) && comps.components.length > 0}
          healthy={comps.healthy}
          totalComponents={comps.components.length}
          onHealthClick={() => focusSection('env')}
          errors={errorCount}
          warnings={warnCount}
          onProblemsClick={() => { setDrawerTab('problems'); setDrawerOpen(true); }}
          modelName={selectedModel.name}
          onModelClick={() => focusSection('data')}
          dialectCount={comps.components.filter(c => c.enabled).length}
          onDialectsClick={() => setOverlay('dialects')}
        />
        {targetOpen && (
          <ITBTargetPopover
            onClose={() => setTargetOpen(false)}
            onOpenFullSettings={() => { setTargetOpen(false); setITBSettingsOpen(true); }}
          />
        )}
      </div>

      {overlay && (
        <LanguageOverlay
          tab={overlay}
          onTab={setOverlay}
          onClose={() => setOverlay(null)}
          onInsertStep={text => { insertAtCursor(text); setOverlay(null); }}
        />
      )}

      {itbSettingsOpen && (
        <ITBSettingsDialog
          config={itbConfig}
          onSave={saveConfig}
          onClose={() => setITBSettingsOpen(false)}
        />
      )}

      {toast && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-md bg-gray-900/90 px-3 py-1.5 text-xs text-white shadow-lg dark:bg-slate-700">
          {toast}
        </div>
      )}
    </div>
  );
};
