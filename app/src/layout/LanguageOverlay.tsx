import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { LanguageExplorerPage } from '../modules/language-explorer/LanguageExplorerPage';
import { DialectSources } from '../components/DialectSources';

export type LanguageTab = 'steps' | 'dialects';

interface Props {
  tab: LanguageTab;
  onTab: (t: LanguageTab) => void;
  onClose: () => void;
  onInsertStep: (text: string) => void;
}

/**
 * The language reference, maximized. It is reference material, so it covers the
 * workspace rather than competing with it for a panel, and Esc puts you back.
 */
export const LanguageOverlay: React.FC<Props> = ({ tab, onTab, onClose, onInsertStep }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Language reference"
      className="absolute inset-0 z-40 flex flex-col bg-white dark:bg-slate-900"
    >
      <div className="flex h-10 flex-none items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 dark:border-slate-700 dark:bg-slate-800">
        <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Language reference</span>
        <div role="tablist" className="flex gap-0.5">
          {(['steps', 'dialects'] as LanguageTab[]).map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={t === tab}
              onClick={() => onTab(t)}
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold capitalize transition-colors ${
                t === tab
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 dark:border-slate-600 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <X size={13} /> Close <kbd className="font-mono text-[10px] text-gray-400">Esc</kbd>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'steps' ? (
          <LanguageExplorerPage onInsertStep={onInsertStep} />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl">
              <DialectSources />
              <p className="mt-5 max-w-[62ch] text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
                A dialect extends the grammar, so it lives beside the steps it contributes rather than in a
                components panel. Adding one reloads the catalog and the parser immediately.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
