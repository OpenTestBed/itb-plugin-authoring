import React, { useCallback, useEffect, useState } from 'react';
import {
  FileText, RefreshCw, Lightbulb, FolderOpen, AlertCircle, Loader2,
  ChevronDown, ChevronRight, X, Circle,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Doc, DocOrigin } from '../context/useDocuments';
import { ExampleMeta, exampleMetas, loadExampleContent } from '../data/models';

interface Props {
  /** Buffers currently open, in tab order. */
  openTabs: string[];
  docs: Record<string, Doc>;
  activeName: string | null;
  isDirty: (name: string) => boolean;
  onFocus: (name: string) => void;
  onClose: (name: string) => void;
  onOpen: (name: string, content: string, origin: DocOrigin) => void;
}

type GroupId = 'open' | 'available' | 'examples';

const rowBase =
  'group flex w-full items-center gap-2 px-2.5 py-1 pl-4 text-left font-mono text-[11.5px] transition-colors';
const rowIdle =
  'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-gray-100';
const rowOn =
  'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';

const GroupHeader: React.FC<{
  label: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  chip?: string;
  action?: React.ReactNode;
}> = ({ label, count, open, onToggle, chip, action }) => (
  <div className="flex w-full items-center gap-1.5 px-2 pb-1 pt-2.5">
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="flex min-w-0 flex-1 items-center gap-1 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
    >
      {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="font-normal tabular-nums opacity-70">{count}</span>}
    </button>
    {chip && (
      <span className="max-w-[120px] truncate rounded bg-gray-200 px-1.5 py-px text-[9.5px] font-medium text-gray-600 dark:bg-slate-700 dark:text-gray-300">
        {chip}
      </span>
    )}
    {action}
  </div>
);

export const ExplorerPanel: React.FC<Props> = ({
  openTabs, docs, activeName, isDirty, onFocus, onClose, onOpen,
}) => {
  const {
    source, sourceKind, hasLocalFs, hasServerFiles,
    pickLocalFolder, filesVersion, refreshFiles, localDirName,
  } = useAppContext();

  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<GroupId, boolean>>({
    open: true, available: true, examples: false,
  });
  // Once a group is toggled by hand, stop moving it around.
  const [pinned, setPinned] = useState<Partial<Record<GroupId, boolean>>>({});
  const toggle = (g: GroupId) => {
    setPinned(p => ({ ...p, [g]: true }));
    setOpen(o => ({ ...o, [g]: !o[g] }));
  };

  // The working set is the focus, so the sample list folds away as soon as
  // there is one — but stays open while there is nothing to work on, otherwise
  // a first-time user opens the app to an empty panel.
  useEffect(() => {
    if (pinned.available) return;
    setOpen(o => ({ ...o, available: openTabs.length === 0 }));
  }, [openTabs.length, pinned.available]);

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setFiles(await source.list());
    } catch (e: any) {
      setFiles([]);
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [source]);

  useEffect(() => { void reload(); }, [reload, filesVersion]);

  const openFile = async (name: string) => {
    try {
      onOpen(name, await source.read(name), source.kind as DocOrigin);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const openExample = async (meta: ExampleMeta) => {
    try {
      onOpen(`${meta.id}.feature`, await loadExampleContent(meta), 'scratch');
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const needsFolder = sourceKind === 'local' && !localDirName;
  // "Available" means available to open — anything already in the working set
  // has moved up to the Open group rather than being listed twice.
  const available = files.filter(f => !openTabs.includes(f));

  const sourceChip = sourceKind === 'bundled' ? 'read-only'
    : sourceKind === 'server' ? 'itb-cli/features'
    : `${localDirName}/`;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {/* ── Open: the working set ──────────────────────── */}
        <GroupHeader label="Open" count={openTabs.length} open={open.open} onToggle={() => toggle('open')} />
        {open.open && (
          openTabs.length === 0 ? (
            <p className="px-4 py-1 text-[11px] italic text-gray-400">Nothing open.</p>
          ) : openTabs.map(name => {
            const on = name === activeName;
            const doc = docs[name];
            return (
              <div
                key={name}
                className={`${rowBase} ${on ? rowOn : rowIdle} cursor-pointer`}
                onClick={() => onFocus(name)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') onFocus(name); }}
              >
                {isDirty(name)
                  ? <Circle size={7} className="flex-none fill-amber-500 text-amber-500" />
                  : <FileText size={12} className="flex-none opacity-60" />}
                <span className="truncate">{name}</span>
                {doc?.origin === 'scratch' && (
                  <span className="flex-none font-sans text-[9px] uppercase tracking-wide text-gray-400">
                    unsaved
                  </span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); onClose(name); }}
                  aria-label={`Close ${name}`}
                  className="ml-auto hidden flex-none rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-800 group-hover:block dark:hover:bg-slate-700 dark:hover:text-gray-100"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })
        )}

        {/* ── Available: what this source offers ─────────── */}
        <GroupHeader
          label="Available"
          count={needsFolder ? undefined : available.length}
          open={open.available}
          onToggle={() => toggle('available')}
          chip={sourceChip}
          action={
            <button
              onClick={() => refreshFiles()}
              title="Refresh"
              className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-slate-700"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            </button>
          }
        />
        {open.available && (
          needsFolder ? (
            <div className="mx-2.5 my-2 rounded-lg border border-dashed border-gray-300 p-3.5 text-center text-[11.5px] leading-relaxed text-gray-500 dark:border-slate-600 dark:text-gray-400">
              <strong className="mb-1.5 block text-[12.5px] text-gray-800 dark:text-gray-100">No folder open</strong>
              Pick a folder and the workbench reads and writes its <code className="font-mono">.feature</code> files
              directly — no server needed.
              <button
                onClick={() => void pickLocalFolder()}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-700"
              >
                <FolderOpen size={12} /> Open folder…
              </button>
            </div>
          ) : error ? (
            <div className="mx-2.5 my-2 flex items-start gap-2 rounded-md bg-red-50 px-2.5 py-2 text-[11px] text-red-700 dark:bg-red-900/20 dark:text-red-300">
              <AlertCircle size={12} className="mt-0.5 flex-none" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          ) : available.length === 0 ? (
            <p className="px-4 py-1 text-[11px] italic text-gray-400">
              {files.length === 0 ? 'No .feature files here yet.' : 'All files are open.'}
            </p>
          ) : available.map(name => (
            <button
              key={name}
              onClick={() => void openFile(name)}
              className={`${rowBase} ${rowIdle}`}
            >
              <FileText size={12} className="flex-none opacity-60" />
              <span className="truncate">{name}</span>
            </button>
          ))
        )}

        {/* ── Examples: bundled, always openable ─────────── */}
        <GroupHeader
          label="Examples"
          count={exampleMetas.length}
          open={open.examples}
          onToggle={() => toggle('examples')}
          chip="bundled"
        />
        {open.examples && exampleMetas.map(meta => (
          <button
            key={meta.id}
            onClick={() => void openExample(meta)}
            title={meta.description}
            className={`${rowBase} ${rowIdle}`}
          >
            <Lightbulb size={12} className="flex-none opacity-60" />
            <span className="truncate">{meta.id}.feature</span>
          </button>
        ))}
      </div>

      {/* ── Footer: what this source can do ─────────────── */}
      <div className="flex-none border-t border-gray-100 px-2.5 py-2 text-[11px] leading-snug text-gray-500 dark:border-slate-700 dark:text-gray-400">
        {sourceKind === 'server' ? (
          <>Mounted from <code className="font-mono">itb-cli/features</code>.</>
        ) : sourceKind === 'local' ? (
          <>Local folder via the File System Access API.</>
        ) : hasLocalFs ? (
          <>
            Bundled features are read-only.{' '}
            <button onClick={() => void pickLocalFolder()} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Open a local folder
            </button>{' '}
            to edit and save.
          </>
        ) : hasServerFiles ? (
          <>Bundled features are read-only. Switch to the mounted folder in the status bar.</>
        ) : (
          <>Read-only. This browser has no File System Access API — Chrome or Edge can open a local folder; here, use Import and Download.</>
        )}
      </div>
    </div>
  );
};
