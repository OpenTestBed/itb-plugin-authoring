import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { checkITBHealth } from '../services/itbClient';
import {
  ITBTarget, loadTargets, upsertTarget, removeTarget, setActiveTargetId, activeTargetId, hostLabel,
} from '../services/itbTargets';

interface Props {
  onClose: () => void;
  onOpenFullSettings: () => void;
}

const label = 'mb-1 block text-[9.5px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500';
const input =
  'w-full rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1.5 font-mono text-[11.5px] ' +
  'text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 ' +
  'dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100';

/**
 * Where the test bed is, in one place: pick a saved target or edit the base URL
 * and specification inline. Keys and the numeric UI ids stay in the full dialog.
 */
export const ITBTargetPopover: React.FC<Props> = ({ onClose, onOpenFullSettings }) => {
  const { itbConfig, saveConfig, recheckITB } = useAppContext();
  const ref = useRef<HTMLDivElement>(null);

  const [targets, setTargets] = useState<ITBTarget[]>(loadTargets);
  const [baseUrl, setBaseUrl] = useState(itbConfig.baseUrl ?? '');
  const [spec, setSpec] = useState(itbConfig.specificationId ?? '');
  const [newLabel, setNewLabel] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const apply = (url: string, specification: string) => {
    saveConfig({ ...itbConfig, baseUrl: url.trim(), specificationId: specification.trim() || undefined });
  };

  const selectTarget = (id: string) => {
    const t = targets.find(x => x.id === id);
    if (!t) return;
    setActiveTargetId(id);
    setBaseUrl(t.config.baseUrl ?? '');
    setSpec(t.config.specificationId ?? '');
    saveConfig(t.config);
    setResult(null);
  };

  const test = async () => {
    setChecking(true);
    setResult(null);
    apply(baseUrl, spec);
    try {
      setResult(await checkITBHealth(baseUrl.trim()));
    } catch (e: any) {
      setResult({ ok: false, message: String(e?.message ?? e) });
    }
    setChecking(false);
    recheckITB();
  };

  const save = () => {
    if (!newLabel.trim()) return;
    apply(baseUrl, spec);
    setTargets(upsertTarget(newLabel.trim(), {
      ...itbConfig,
      baseUrl: baseUrl.trim(),
      specificationId: spec.trim() || undefined,
    }));
    setNewLabel('');
  };

  const current = activeTargetId();

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Test bed target"
      className="absolute bottom-[26px] left-2 z-50 w-[380px] rounded-lg border border-gray-200 bg-white p-3.5 shadow-2xl dark:border-slate-700 dark:bg-slate-800"
    >
      <h3 className="mb-3 text-[12.5px] font-semibold text-gray-900 dark:text-gray-100">Test bed target</h3>

      {targets.length > 0 && (
        <div className="mb-3">
          <span className={label}>Saved targets</span>
          <div className="space-y-1">
            {targets.map(t => (
              <div key={t.id} className="flex items-center gap-2">
                <button
                  onClick={() => selectTarget(t.id)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-xs ${
                    t.id === current
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="truncate font-medium">{t.label}</span>
                  <span className="ml-auto truncate font-mono text-[10px] text-gray-400">
                    {hostLabel(t.config)}
                  </span>
                </button>
                <button
                  onClick={() => setTargets(removeTarget(t.id))}
                  title={`Remove ${t.label}`}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2.5">
        <label className={label} htmlFor="po-base">Base URL</label>
        <input
          id="po-base"
          className={input}
          value={baseUrl}
          onChange={e => { setBaseUrl(e.target.value); setResult(null); }}
          onBlur={() => apply(baseUrl, spec)}
          placeholder="http://localhost:9000"
        />
      </div>

      <div className="mb-2.5">
        <label className={label} htmlFor="po-spec">Specification</label>
        <input
          id="po-spec"
          className={input}
          value={spec}
          onChange={e => setSpec(e.target.value)}
          onBlur={() => apply(baseUrl, spec)}
          placeholder="target specification id"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void test()}
          disabled={checking || !baseUrl.trim()}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-700"
        >
          {checking ? <Loader2 size={11} className="animate-spin" /> : null}
          Test connection
        </button>
        <button
          onClick={onOpenFullSettings}
          className="ml-auto text-[11.5px] text-blue-600 hover:underline dark:text-blue-400"
        >
          All settings…
        </button>
      </div>

      {result && (
        <div className={`mt-2 flex items-center gap-1.5 text-[11.5px] ${
          result.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {result.ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
          {result.message}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-slate-700">
        <input
          className="flex-1 rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
          placeholder="Save this as… (e.g. EC acceptance)"
          aria-label="Name for a saved target"
        />
        <button
          onClick={save}
          disabled={!newLabel.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          <Plus size={11} /> Save
        </button>
      </div>

      <p className="mt-3 border-t border-gray-100 pt-2.5 text-[11px] italic leading-snug text-gray-500 dark:border-slate-700 dark:text-gray-400">
        Served from GitHub Pages, the browser calls ITB directly — the test bed must allow CORS, and an
        <code className="font-mono not-italic"> http://localhost </code> test bed is unreachable from an
        <code className="font-mono not-italic"> https:// </code> page.
      </p>
    </div>
  );
};
