import React, { useState, useEffect, useRef } from 'react';
import {
  Download, Upload, PanelLeftClose, PanelLeftOpen,
  Lightbulb, Database, Puzzle, AlertCircle, CheckCircle,
  FolderOpen, Save,
} from 'lucide-react';
import { Editor, EditorHandle } from '../../components/Editor';
import { ExamplesPanel } from '../../components/ExamplesPanel';
import { FilesPanel } from '../../components/FilesPanel';
import { DataPoolsPanel } from '../../components/DataPoolsPanel';
import { ComponentsPanel } from '../../components/ComponentsPanel';
import { StepCatalog } from '../../components/StepCatalog';
import { DocStep } from '../../modules/language-explorer/useCatalogData';
import { useAppContext } from '../../context/AppContext';
import { GherkinEngine } from '../../context/useGherkinEngine';
import { exampleMetas, loadExampleContent } from '../../data/models';
import { ExampleScenario } from '../../types';
import JSZip from 'jszip';

type RightPanel = 'issues' | 'files' | 'examples' | 'datapools' | 'components';

interface Props {
  engine: GherkinEngine;
}

export const TestAuthoringPage: React.FC<Props> = ({ engine }) => {
  const { isDark, selectedModel } = useAppContext();
  const {
    gherkinContent, setGherkinContent,
    parsedScenario, xmlOutput, issues, requiredActors, stepHighlights,
    errorCount, warnCount, scenarioCount,
  } = engine;

  const [catalogOpen, setCatalogOpen] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>('issues');
  const [loadedExamples, setLoadedExamples] = useState<ExampleScenario[]>([]);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const editorRef = useRef<EditorHandle>(null);

  const handleServerFileLoad = (name: string, content: string) => {
    setGherkinContent(content);
    setCurrentFile(name);
  };

  const handleQuickSave = async () => {
    if (!currentFile) { setRightPanel('files'); return; }
    await fetch(`/api/feature?name=${encodeURIComponent(currentFile)}`, { method: 'POST', body: gherkinContent });
  };

  // Load examples
  useEffect(() => {
    Promise.allSettled(
      exampleMetas.map(async (meta) => {
        const content = await loadExampleContent(meta);
        return { ...meta, content } as ExampleScenario;
      })
    ).then((results) => {
      setLoadedExamples(
        results
          .filter((r): r is PromiseFulfilledResult<ExampleScenario> => r.status === 'fulfilled')
          .map(r => r.value)
      );
    });
  }, []);

  // No auto-load — editor starts empty. User picks from Examples tab.

  const handleExampleSelect = (example: ExampleScenario) => {
    setGherkinContent(example.content);
    setRightPanel('issues');
  };

  const handleStepClick = (doc: DocStep) => {
    // Insert the first variant's human pattern as a Gherkin step
    const pattern = doc.variants[0].humanPattern;
    editorRef.current?.insertText(`    And ${pattern}\n`);
  };

  const handleInsertPoolStep = (poolId: string) => {
    const step = `    Given the test environment is configured with data pool "${poolId}"`;
    editorRef.current?.insertText(step);
  };

  const handleDownloadXML = async () => {
    if (!xmlOutput) return;
    const zip = new JSZip();
    for (const file of xmlOutput.files) {
      zip.file(file.filename, file.xml);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${xmlOutput.testcaseName.replace(/[^a-zA-Z0-9]/g, '_')}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.feature')) {
      const reader = new FileReader();
      reader.onload = (e) => setGherkinContent(e.target?.result as string);
      reader.readAsText(file);
    }
    event.target.value = '';
  };

  const handleDownloadFeature = () => {
    if (!gherkinContent) return;
    const blob = new Blob([gherkinContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scenario.feature';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
        <button onClick={() => setCatalogOpen(!catalogOpen)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors" title={catalogOpen ? 'Hide step catalog' : 'Show step catalog'}>
          {catalogOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>

        {/* Status */}
        {parsedScenario && (
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              {scenarioCount} scenario{scenarioCount !== 1 ? 's' : ''}
            </span>
            {errorCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 flex items-center gap-1">
                <AlertCircle size={11} /> {errorCount}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 flex items-center gap-1">
                <CheckCircle size={11} /> Valid
              </span>
            )}
            {warnCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300">
                {warnCount} warn
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* File actions */}
        {currentFile && (
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[180px]" title={currentFile}>{currentFile}</span>
        )}
        <button onClick={handleQuickSave} disabled={!gherkinContent.trim()} title={currentFile ? `Save to ${currentFile}` : 'Pick a file in the Files tab first'} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
          <Save size={12} /> Save
        </button>
        <input type="file" accept=".feature" onChange={handleFileUpload} className="hidden" id="file-upload" />
        <label htmlFor="file-upload" className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
          <Upload size={12} /> Import
        </label>
        <button onClick={handleDownloadFeature} disabled={!gherkinContent.trim()} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
          <Download size={12} /> .feature
        </button>
        <button onClick={handleDownloadXML} disabled={!xmlOutput || errorCount > 0} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
          <Download size={12} /> ZIP
        </button>
      </div>

      {/* Main area */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Step Catalog */}
        <div className={`flex-shrink-0 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 transition-all duration-200 ${catalogOpen ? 'w-60' : 'w-0 overflow-hidden'}`}>
          {catalogOpen && <StepCatalog onStepClick={handleStepClick} />}
        </div>

        {/* Center: Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0 p-2">
            <Editor
              ref={editorRef}
              value={gherkinContent}
              onChange={setGherkinContent}
              errors={issues}
              isDark={isDark}
              highlights={stepHighlights}
            />
          </div>
        </div>

        {/* Right: Output / Examples / Data Pools / Components */}
        <div className="w-[42%] max-w-[650px] min-w-[300px] flex flex-col border-l border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          {/* Tabs */}
          <div className="flex items-center border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
            {([
              { id: 'issues' as const, label: 'Issues', icon: <AlertCircle size={13} />, badge: errorCount + warnCount || undefined },
              { id: 'files' as const, label: 'Files', icon: <FolderOpen size={13} /> },
              { id: 'examples' as const, label: 'Examples', icon: <Lightbulb size={13} /> },
              { id: 'datapools' as const, label: 'Data', icon: <Database size={13} /> },
              { id: 'components' as const, label: 'Components', icon: <Puzzle size={13} /> },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setRightPanel(tab.id)}
                className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1 ${
                  rightPanel === tab.id
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {tab.icon} {tab.label}
                {tab.badge && (
                  <span className="ml-0.5 px-1 py-0 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-[10px]">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0">
            {rightPanel === 'issues' ? (
              <div className="h-full overflow-auto p-3 space-y-2">
                {issues.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 py-4 justify-center">
                    <CheckCircle size={16} /> No issues — ready to compile
                  </div>
                ) : (
                  issues.map((issue, i) => (
                    <div key={i} className={`px-3 py-2 rounded text-xs ${
                      issue.severity === 'error'
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300'
                    }`}>
                      {issue.line && <span className="font-mono mr-1">L{issue.line}</span>}
                      {issue.message}
                    </div>
                  ))
                )}
              </div>
            ) : rightPanel === 'files' ? (
              <FilesPanel
                currentFile={currentFile}
                gherkinContent={gherkinContent}
                onLoad={handleServerFileLoad}
                onSaved={setCurrentFile}
              />
            ) : rightPanel === 'datapools' ? (
              <DataPoolsPanel onInsertPoolStep={handleInsertPoolStep} isDark={isDark} />
            ) : rightPanel === 'components' ? (
              <ComponentsPanel isDark={isDark} requiredActors={requiredActors} />
            ) : (
              <ExamplesPanel examples={loadedExamples} selectedModel={selectedModel} onExampleSelect={handleExampleSelect} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
