import React, { useRef, useState } from 'react';
import { FileCode2, Sun, Moon, Settings, BookOpen, Edit3, Rocket, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppContextProvider, useAppContext } from './context/AppContext';
import { useGherkinEngine } from './context/useGherkinEngine';
import { LanguageExplorerPage } from './modules/language-explorer/LanguageExplorerPage';
import { TestAuthoringPage } from './modules/test-authoring/TestAuthoringPage';
import { DeployExportPage } from './modules/deploy-export/DeployExportPage';
import { ITBSettingsDialog } from './components/ITBSettingsDialog';
import { useIsMobile } from './hooks/useIsMobile';

type PanelId = 'language' | 'authoring' | 'deploy';

const panels: { id: PanelId; label: string; icon: React.ReactNode }[] = [
  { id: 'language', label: 'Language', icon: <BookOpen size={14} /> },
  { id: 'authoring', label: 'Tests', icon: <Edit3 size={14} /> },
  { id: 'deploy', label: 'Compile & Deploy', icon: <Rocket size={14} /> },
];

function AppShell() {
  const { isDark, setIsDark, itbConfig, itbSettingsOpen, setITBSettingsOpen, saveConfig } = useAppContext();
  const engine = useGherkinEngine();
  const isMobile = useIsMobile();

  // Track which panels are expanded — at least one must be (desktop)
  const [expanded, setExpanded] = useState<Set<PanelId>>(() => new Set<PanelId>(['authoring']));

  // Mobile: exactly one active panel, switched via the bottom tab bar
  const [mobileActive, setMobileActive] = useState<PanelId>('authoring');

  // Desktop: relative widths of the expanded panels (flex-grow weights),
  // adjusted by dragging the divider between two expanded panels
  const [weights, setWeights] = useState<Record<PanelId, number>>({ language: 1, authoring: 1.4, deploy: 1 });
  const rowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    left: PanelId; right: PanelId; startX: number;
    leftW: number; rightW: number; total: number; rowWidth: number;
  } | null>(null);

  const startDrag = (e: React.PointerEvent, left: PanelId, right: PanelId) => {
    const row = rowRef.current;
    if (!row) return;
    const total = panels.filter(p => expanded.has(p.id)).reduce((s, p) => s + weights[p.id], 0);
    dragRef.current = {
      left, right, startX: e.clientX,
      leftW: weights[left], rightW: weights[right],
      total, rowWidth: row.getBoundingClientRect().width,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.rowWidth <= 0) return;
    const deltaW = ((e.clientX - d.startX) / d.rowWidth) * d.total;
    const min = d.total * 0.15; // each panel keeps at least ~15% of the row
    let newLeft = d.leftW + deltaW;
    let newRight = d.rightW - deltaW;
    if (newLeft < min) { newRight -= min - newLeft; newLeft = min; }
    if (newRight < min) { newLeft -= min - newRight; newRight = min; }
    setWeights(w => ({ ...w, [d.left]: newLeft, [d.right]: newRight }));
  };

  const endDrag = () => { dragRef.current = null; };

  const togglePanel = (id: PanelId) => {
    const next = new Set(expanded);
    if (next.has(id)) {
      // Don't collapse if it's the last one
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setExpanded(next);
  };

  const focusPanel = (id: PanelId) => {
    // Click on collapsed: focus this panel only
    if (!expanded.has(id)) {
      setExpanded(new Set([id]));
    }
  };

  const renderPanel = (id: PanelId) => {
    switch (id) {
      case 'language':
        return (
          <LanguageExplorerPage onInsertStep={(text: string) => {
            engine.setGherkinContent(engine.gherkinContent + '\n' + text);
            if (isMobile) {
              setMobileActive('authoring');
            } else if (!expanded.has('authoring')) {
              setExpanded(new Set([...expanded, 'authoring']));
            }
          }} />
        );
      case 'authoring':
        return <TestAuthoringPage engine={engine} />;
      case 'deploy':
        return <DeployExportPage engine={engine} />;
    }
  };

  const header = (
    <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-4 flex-shrink-0">
      <div className="flex items-center h-10">
        <FileCode2 size={18} className="text-blue-600 dark:text-blue-400" />
        <span className="font-bold text-sm text-gray-900 dark:text-gray-100 ml-2 truncate">FHIR Test Workbench</span>
        <div className="flex-1" />
        <button onClick={() => setITBSettingsOpen(true)} className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors" title="Settings">
          <Settings size={15} />
        </button>
        <button onClick={() => setIsDark(!isDark)} className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors" title={isDark ? 'Light mode' : 'Dark mode'}>
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );

  // ── Mobile: one full-width panel + bottom tab bar ─────────────────────
  if (isMobile) {
    return (
      <div className="h-screen flex flex-col">
        {header}
        <div className="flex-1 min-h-0 flex flex-col">
          {renderPanel(mobileActive)}
        </div>
        <nav className="flex-shrink-0 flex border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 pb-[env(safe-area-inset-bottom)]">
          {panels.map(panel => {
            const active = panel.id === mobileActive;
            return (
              <button
                key={panel.id}
                onClick={() => setMobileActive(panel.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                  active
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <span className={active ? '' : 'opacity-80'}>{panel.icon}</span>
                {panel.label}
              </button>
            );
          })}
        </nav>
        {itbSettingsOpen && (
          <ITBSettingsDialog config={itbConfig} onSave={saveConfig} onClose={() => setITBSettingsOpen(false)} />
        )}
      </div>
    );
  }

  // ── Desktop: horizontal accordion with resizable dividers ─────────────
  let lastExpanded: PanelId | null = null;

  return (
    <div className="h-screen flex flex-col">
      {header}

      <div ref={rowRef} className="flex-1 flex min-h-0">
        {panels.map((panel, idx) => {
          const isExpanded = expanded.has(panel.id);
          const isLast = idx === panels.length - 1;

          if (!isExpanded) {
            /* Collapsed: vertical label strip */
            return (
              <button
                key={panel.id}
                onClick={() => focusPanel(panel.id)}
                className="flex-shrink-0 w-9 flex flex-col items-center justify-center gap-2 bg-gray-50 dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors group"
                title={`Expand ${panel.label}`}
              >
                <span className="text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {panel.icon}
                </span>
                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 [writing-mode:vertical-lr] rotate-180">
                  {panel.label}
                </span>
              </button>
            );
          }

          const divider = lastExpanded !== null ? (
            <div
              key={`divider-${panel.id}`}
              onPointerDown={(e) => { const l = lastExpandedFor(panel.id); if (l) startDrag(e, l, panel.id); }}
              onPointerMove={onDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="flex-shrink-0 w-1.5 cursor-col-resize bg-gray-200 dark:bg-slate-700 hover:bg-blue-400 dark:hover:bg-blue-500 active:bg-blue-500 transition-colors touch-none"
              title="Drag to resize"
            />
          ) : null;
          lastExpanded = panel.id;

          return (
            <React.Fragment key={panel.id}>
              {divider}
              <div
                className={`flex flex-col min-w-0 ${!isLast ? 'border-r border-gray-200 dark:border-slate-700' : ''}`}
                style={{ flexGrow: weights[panel.id], flexShrink: 1, flexBasis: 0 }}
              >
                {/* Panel header bar */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
                  <span className="text-blue-600 dark:text-blue-400">{panel.icon}</span>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">{panel.label}</span>
                  <div className="flex-1" />
                  <button
                    onClick={() => togglePanel(panel.id)}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-400 transition-colors"
                    title={`Collapse ${panel.label}`}
                  >
                    {idx === 0 ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>

                {/* Panel content */}
                <div className="flex-1 min-h-0 flex flex-col">
                  {renderPanel(panel.id)}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Global dialogs */}
      {itbSettingsOpen && (
        <ITBSettingsDialog
          config={itbConfig}
          onSave={saveConfig}
          onClose={() => setITBSettingsOpen(false)}
        />
      )}
    </div>
  );

  /** The expanded panel that precedes `id` in panel order (for divider drag). */
  function lastExpandedFor(id: PanelId): PanelId | null {
    let prev: PanelId | null = null;
    for (const p of panels) {
      if (p.id === id) return prev;
      if (expanded.has(p.id)) prev = p.id;
    }
    return prev;
  }
}

function App() {
  return (
    <AppContextProvider>
      <AppShell />
    </AppContextProvider>
  );
}

export default App;
