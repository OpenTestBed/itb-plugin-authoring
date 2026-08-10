import React, { useEffect, useRef, useState } from 'react';
import {
  FileCode2, Sun, Moon, Settings, Columns, MoreHorizontal, Rocket,
  Download, Loader2, ChevronDown,
} from 'lucide-react';

interface Props {
  isDark: boolean;
  setIsDark: (v: boolean) => void;
  /** Primary action is Deploy when a test bed is reachable, else Download ZIP. */
  canDeploy: boolean;
  deploying: boolean;
  primaryEnabled: boolean;
  onPrimary: () => void;
  saveLabel: string;
  canSave: boolean;
  /** When the source is read-only, Save *is* Download — so don't offer both. */
  canWrite: boolean;
  onSave: () => void;
  onSaveAs: () => void;
  onImport: () => void;
  onDownloadFeature: () => void;
  onDownloadZip: () => void;
  xmlOpen: boolean;
  onToggleXml: () => void;
  onOpenLanguage: () => void;
  onOpenTarget: () => void;
}

const item =
  'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-gray-700 ' +
  'hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent ' +
  'dark:text-gray-200 dark:hover:bg-slate-700';

export const Navbar: React.FC<Props> = ({
  isDark, setIsDark, canDeploy, deploying, primaryEnabled, onPrimary,
  saveLabel, canSave, canWrite, onSave, onSaveAs, onImport, onDownloadFeature, onDownloadZip,
  xmlOpen, onToggleXml, onOpenLanguage, onOpenTarget,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const run = (fn: () => void) => () => { setMenuOpen(false); fn(); };

  return (
    <header className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
      <FileCode2 size={17} className="text-blue-600 dark:text-blue-400" />
      <span className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">
        ITB Test Workbench
      </span>

      <div className="flex-1" />

      <button
        onClick={onPrimary}
        disabled={!primaryEnabled || deploying}
        title={canDeploy ? 'Deploy the compiled suite to the test bed' : 'Download the compiled suite as a ZIP'}
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
      >
        {deploying ? <Loader2 size={13} className="animate-spin" />
          : canDeploy ? <Rocket size={13} /> : <Download size={13} />}
        {deploying ? 'Deploying…' : canDeploy ? 'Deploy to ITB' : 'Download ZIP'}
      </button>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="More actions"
          className="rounded-md border border-gray-200 p-1.5 text-gray-500 transition-colors hover:text-gray-800 dark:border-slate-600 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <MoreHorizontal size={15} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-9 z-40 w-56 rounded-lg border border-gray-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            <button role="menuitem" className={item} onClick={run(onSave)} disabled={!canSave}>
              {saveLabel}
              <kbd className="ml-auto font-mono text-[10px] text-gray-400">Ctrl+S</kbd>
            </button>
            <button role="menuitem" className={item} onClick={run(onSaveAs)}>Save as…</button>
            <button role="menuitem" className={item} onClick={run(onImport)}>Import file…</button>
            <hr className="my-1 border-gray-100 dark:border-slate-700" />
            {canWrite && (
              <button role="menuitem" className={item} onClick={run(onDownloadFeature)}>Download .feature</button>
            )}
            <button role="menuitem" className={item} onClick={run(onDownloadZip)}>Download ZIP</button>
          </div>
        )}
      </div>

      <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-slate-700" />

      <button
        onClick={onOpenLanguage}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:text-gray-900 dark:border-slate-600 dark:text-gray-400 dark:hover:text-gray-100"
      >
        Language <ChevronDown size={11} />
      </button>

      <button
        onClick={onToggleXml}
        aria-pressed={xmlOpen}
        title={xmlOpen ? 'Hide compiled XML' : 'Show compiled XML'}
        className={`rounded-md border p-1.5 transition-colors ${
          xmlOpen
            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            : 'border-gray-200 text-gray-500 hover:text-gray-800 dark:border-slate-600 dark:text-gray-400 dark:hover:text-gray-100'
        }`}
      >
        <Columns size={15} />
      </button>

      <button
        onClick={onOpenTarget}
        title="Test bed settings"
        className="rounded-md border border-gray-200 p-1.5 text-gray-500 transition-colors hover:text-gray-800 dark:border-slate-600 dark:text-gray-400 dark:hover:text-gray-100"
      >
        <Settings size={15} />
      </button>

      <button
        onClick={() => setIsDark(!isDark)}
        title={isDark ? 'Light mode' : 'Dark mode'}
        className="rounded-md border border-gray-200 p-1.5 text-gray-500 transition-colors hover:text-gray-800 dark:border-slate-600 dark:text-gray-400 dark:hover:text-gray-100"
      >
        {isDark ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    </header>
  );
};
