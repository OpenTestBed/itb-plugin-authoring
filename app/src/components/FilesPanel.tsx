import React, { useCallback, useEffect, useState } from 'react';
import { FileText, RefreshCw, Save, FilePlus } from 'lucide-react';

// Server-side feature files (the itb-cli/features folder mounted into the
// authoring plugin container). Served by server.mjs:
//   GET  /api/features          -> ["a.feature", ...]
//   GET  /api/feature?name=X    -> file content
//   POST /api/feature?name=X    -> save body as file content
// In `npm run dev` these endpoints do not exist -> panel shows a hint instead.

interface FilesPanelProps {
  currentFile: string | null;
  gherkinContent: string;
  onLoad: (name: string, content: string) => void;
  onSaved?: (name: string) => void;
}

export const FilesPanel: React.FC<FilesPanelProps> = ({ currentFile, gherkinContent, onLoad, onSaved }) => {
  const [files, setFiles] = useState<string[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/features');
      if (!r.ok) throw new Error(String(r.status));
      setFiles(await r.json());
      setUnavailable(false);
    } catch {
      setFiles(null);
      setUnavailable(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const load = async (name: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/feature?name=${encodeURIComponent(name)}`);
      if (!r.ok) throw new Error(`load failed (${r.status})`);
      onLoad(name, await r.text());
      setMessage(`loaded ${name}`);
    } catch (e) { setMessage(String(e)); }
    setBusy(false);
  };

  const save = async (name: string) => {
    if (!name.endsWith('.feature')) name = `${name}.feature`;
    setBusy(true);
    try {
      const r = await fetch(`/api/feature?name=${encodeURIComponent(name)}`, { method: 'POST', body: gherkinContent });
      if (!r.ok) throw new Error(`save failed (${r.status})`);
      setMessage(`saved ${name}`);
      onSaved?.(name);
      setNewName('');
      refresh();
    } catch (e) { setMessage(String(e)); }
    setBusy(false);
  };

  if (unavailable) {
    return (
      <div className="p-4 text-sm text-gray-600 dark:text-gray-400 space-y-2">
        <p className="font-medium text-gray-800 dark:text-gray-200">Server files unavailable</p>
        <p>This panel lists the feature files of the mounted <code>itb-cli/features</code> folder.
          It works when the workbench runs as the authoring plugin (docker compose), not in
          <code> npm run dev</code>.</p>
        <button onClick={refresh} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800">
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1">
          Feature files <span className="font-normal text-gray-500">(itb-cli/features)</span>
        </h3>
        <button onClick={refresh} title="Refresh" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500">
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {(files ?? []).map(f => (
          <div key={f} className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer group ${
            f === currentFile ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300'
          }`}>
            <FileText size={13} className="flex-shrink-0" />
            <span className="flex-1 truncate" onClick={() => load(f)} title={`Load ${f}`}>{f}</span>
            <button
              onClick={() => save(f)}
              disabled={busy || !gherkinContent.trim()}
              title={`Save editor content to ${f}`}
              className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
            >
              <Save size={10} /> save
            </button>
          </div>
        ))}
        {files && files.length === 0 && (
          <div className="text-xs text-gray-500 p-2">No .feature files yet — save one below.</div>
        )}
      </div>

      <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="new-name.feature"
            className="flex-1 px-2 py-1 text-xs rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-800 dark:text-gray-200"
          />
          <button
            onClick={() => newName.trim() && save(newName.trim())}
            disabled={busy || !newName.trim() || !gherkinContent.trim()}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <FilePlus size={12} /> Save as
          </button>
        </div>
        {message && <div className="text-[11px] text-gray-500 truncate">{message}</div>}
      </div>
    </div>
  );
};
