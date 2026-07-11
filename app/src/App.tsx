import React, { useState } from 'react';
import { FileCode2, Sun, Moon, Settings, BookOpen, Edit3, Rocket, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppContextProvider, useAppContext } from './context/AppContext';
import { useGherkinEngine } from './context/useGherkinEngine';
import { LanguageExplorerPage } from './modules/language-explorer/LanguageExplorerPage';
import { TestAuthoringPage } from './modules/test-authoring/TestAuthoringPage';
import { DeployExportPage } from './modules/deploy-export/DeployExportPage';
import { ITBSettingsDialog } from './components/ITBSettingsDialog';

type PanelId = 'language' | 'authoring' | 'deploy';

const panels: { id: PanelId; label: string; icon: React.ReactNode }[] = [
  { id: 'language', label: 'Language', icon: <BookOpen size={14} /> },
  { id: 'authoring', label: 'Tests', icon: <Edit3 size={14} /> },
  { id: 'deploy', label: 'Compile & Deploy', icon: <Rocket size={14} /> },
];

function AppShell() {
  const { isDark, setIsDark, itbConfig, itbSettingsOpen, setITBSettingsOpen, saveConfig } = useAppContext();
  const engine = useGherkinEngine();

  // Track which panels are expanded — at least one must be
  const [expanded, setExpanded] = useState<Set<PanelId>>(() => {
    // If importing from external, start with authoring panel
    if (window.location.hash.includes('import')) {
      return new Set<PanelId>(['authoring']);
    }
    return new Set<PanelId>(['authoring']);
  });

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
    // Double-click or single-click on collapsed: focus this panel only
    if (!expanded.has(id)) {
      setExpanded(new Set([id]));
    }
  };

  const expandedCount = expanded.size;

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar — minimal */}
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-4 flex-shrink-0">
        <div className="flex items-center h-10">
          <FileCode2 size={18} className="text-blue-600 dark:text-blue-400" />
          <span className="font-bold text-sm text-gray-900 dark:text-gray-100 ml-2">FHIR Test Workbench</span>
          <div className="flex-1" />
          <button onClick={() => setITBSettingsOpen(true)} className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors" title="Settings">
            <Settings size={15} />
          </button>
          <button onClick={() => setIsDark(!isDark)} className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      {/* Horizontal accordion */}
      <div className="flex-1 flex min-h-0">
        {panels.map((panel, idx) => {
          const isExpanded = expanded.has(panel.id);
          const isLast = idx === panels.length - 1;

          return (
            <React.Fragment key={panel.id}>
              {/* Panel header (vertical sidebar when collapsed, horizontal bar when expanded) */}
              {!isExpanded ? (
                /* Collapsed: vertical label */
                <button
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
              ) : (
                /* Expanded: panel with header + content */
                <div className={`flex flex-col min-w-0 ${!isLast ? 'border-r border-gray-200 dark:border-slate-700' : ''}`}
                  style={{ flex: expandedCount === 1 ? '1 1 100%' : expandedCount === 2 ? '1 1 50%' : '1 1 33%' }}
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
                    {panel.id === 'language' && (
                      <LanguageExplorerPage onInsertStep={(text) => {
                        engine.setGherkinContent(engine.gherkinContent + '\n' + text);
                        if (!expanded.has('authoring')) setExpanded(new Set([...expanded, 'authoring']));
                      }} />
                    )}
                    {panel.id === 'authoring' && (
                      <TestAuthoringPage engine={engine} />
                    )}
                    {panel.id === 'deploy' && (
                      <DeployExportPage engine={engine} />
                    )}
                  </div>
                </div>
              )}
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
}

function App() {
  return (
    <AppContextProvider>
      <AppShell />
    </AppContextProvider>
  );
}

export default App;
