import React, { useState } from 'react';
import { Globe, Loader2, Plus, X } from 'lucide-react';
import {
  loadRemoteComponent, queryDialectUrls, getStoredDialectUrls,
  addStoredDialectUrl, removeStoredDialectUrl,
} from '../parser/languageCatalog';
import { useAppContext } from '../context/AppContext';

/**
 * Remote plugin dialects: base URLs of a plugin repo's dialect folder
 * (component.yml + steps.yml [+ scriptlets/]). The bundled fhir-validator
 * dialect stays the default; a remote dialect with the same id overrides it,
 * others are added alongside. Persisted in localStorage.
 *
 * Lives with the language reference rather than the components panel — these
 * extend the grammar, so they belong beside the steps they contribute.
 */
export const DialectSources: React.FC = () => {
  const { refreshDialects } = useAppContext();
  const [stored, setStored] = useState<string[]>(() => getStoredDialectUrls());
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromQuery = queryDialectUrls();

  const add = async () => {
    const url = input.trim().replace(/\/+$/, '');
    if (!url) return;
    setAdding(true);
    setError(null);
    const remote = await loadRemoteComponent(url);
    if (!remote) {
      setError('No loadable dialect at this URL — it must serve component.yml (+ steps.yml), directly or under /gherkin-dialect, with CORS enabled.');
      setAdding(false);
      return;
    }
    setStored(addStoredDialectUrl(url));
    setInput('');
    setAdding(false);
    refreshDialects();
  };

  const remove = (url: string) => {
    setStored(removeStoredDialectUrl(url));
    refreshDialects();
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800/60">
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2 dark:border-slate-700">
        <Globe size={12} className="text-blue-500 dark:text-blue-400" />
        <span className="text-[11.5px] font-medium text-gray-700 dark:text-gray-300">Dialect sources</span>
        <span className="ml-auto text-[9.5px] text-gray-400 dark:text-gray-500">
          fhir-validator bundled by default
        </span>
      </div>
      <div className="space-y-1.5 px-3 py-2.5">
        {fromQuery.map(url => (
          <div key={`q-${url}`} className="flex items-center gap-2 text-[10.5px]">
            <span className="flex-1 truncate font-mono text-gray-600 dark:text-gray-300" title={url}>{url}</span>
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              ?dialects=
            </span>
          </div>
        ))}
        {stored.map(url => (
          <div key={url} className="flex items-center gap-2 text-[10.5px]">
            <span className="flex-1 truncate font-mono text-gray-600 dark:text-gray-300" title={url}>{url}</span>
            <button
              onClick={() => remove(url)}
              title="Remove dialect"
              className="rounded p-0.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <div className="flex gap-1.5 pt-0.5">
          <input
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') void add(); }}
            placeholder="https://…/dialect or service URL (/gherkin-dialect)"
            aria-label="Dialect URL"
            className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 font-mono text-[10.5px] text-gray-800 focus:border-transparent focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-200"
          />
          <button
            onClick={() => void add()}
            disabled={adding || !input.trim()}
            className="flex items-center gap-1 rounded bg-blue-500 px-2 py-1 text-[10.5px] font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
          >
            {adding ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
            Add
          </button>
        </div>
        {error && <p className="text-[10.5px] text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
};
