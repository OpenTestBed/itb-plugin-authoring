import React from 'react';
import {
  CheckCircle, ChevronDown, ExternalLink, Loader2, Play, Settings,
} from 'lucide-react';
import { DeployState } from '../context/useDeploy';

export type DrawerTab = 'problems' | 'output' | 'deploy' | 'run';

export interface Problem {
  severity: 'error' | 'warning' | string;
  line?: number;
  message: string;
  /** Which check produced this — shown right-aligned on the row. */
  from: 'parser' | 'scriptlet' | 'language' | 'environment';
}

interface Props {
  open: boolean;
  onToggle: () => void;
  tab: DrawerTab;
  onTab: (t: DrawerTab) => void;
  problems: Problem[];
  /** Lines shown under Output — parse/compile summary. */
  outputLines: { label: string; text: string; tone?: 'ok' | 'warn' | 'bad' }[];
  itbConnected: boolean;
  deployState: DeployState;
  canDeploy: boolean;
  onDeploy: () => void;
  onRun: () => void;
  onOpenTarget: () => void;
  onGotoLine: (line: number) => void;
}

const tone = {
  ok: 'text-green-600 dark:text-green-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-red-600 dark:text-red-400',
};

export const BottomDrawer: React.FC<Props> = ({
  open, onToggle, tab, onTab, problems, outputLines,
  itbConnected, deployState, canDeploy, onDeploy, onRun, onOpenTarget, onGotoLine,
}) => {
  const errors = problems.filter(p => p.severity === 'error').length;
  const clean = problems.length === 0;

  // Deploy exists once there is a test bed or a result to show; Run only after
  // a successful deploy. Problems and Output are always available.
  const tabs: DrawerTab[] = ['problems', 'output'];
  if (itbConnected || deployState.result) tabs.push('deploy');
  if (deployState.result?.success || deployState.testResults) tabs.push('run');
  const activeTab = tabs.includes(tab) ? tab : 'problems';

  return (
    <div className="flex flex-none flex-col border-t border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div role="tablist" className="flex h-[30px] flex-none items-stretch bg-gray-50 dark:bg-slate-800">
        {tabs.map(t => {
          const on = t === activeTab;
          const label = t === 'problems' && clean ? 'Problems' : t.charAt(0).toUpperCase() + t.slice(1);
          return (
            <button
              key={t}
              role="tab"
              aria-selected={on}
              onClick={() => onTab(t)}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 text-[10.5px] font-bold uppercase tracking-wider transition-colors ${
                on
                  ? 'border-blue-500 text-blue-700 dark:text-blue-300'
                  : 'border-transparent text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200'
              }`}
            >
              {label}
              {t === 'problems' && (clean
                ? <CheckCircle size={11} className="text-green-600 dark:text-green-400" />
                : (
                  <span className={`min-w-[15px] rounded-full px-1 text-center text-[9px] font-bold leading-[14px] text-white ${
                    errors ? 'bg-red-500' : 'bg-amber-500'
                  }`}>
                    {problems.length}
                  </span>
                ))}
            </button>
          );
        })}
        <div className="ml-auto flex items-center pr-1.5">
          <button
            onClick={onToggle}
            title={open ? 'Collapse panel' : 'Expand panel'}
            className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-slate-700"
          >
            <ChevronDown size={14} className={open ? '' : 'rotate-180'} />
          </button>
        </div>
      </div>

      {open && (
        <div className="h-[124px] overflow-y-auto py-1">
          {activeTab === 'problems' && (
            clean ? (
              <p className="px-3.5 py-2 text-xs text-green-600 dark:text-green-400">
                No problems — ready to compile.
              </p>
            ) : problems.map((p, i) => (
              <button
                key={i}
                onClick={() => p.line && onGotoLine(p.line)}
                className="flex w-full items-baseline gap-2.5 px-3.5 py-1 text-left text-xs text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-800"
              >
                <span className={`flex-none rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${
                  p.severity === 'error'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                }`}>
                  {p.severity === 'error' ? 'error' : 'warn'}
                </span>
                <span className="w-8 flex-none font-mono text-[11px] text-gray-400">
                  {p.line ? `L${p.line}` : ''}
                </span>
                <span className="min-w-0 flex-1 break-words">{p.message}</span>
                <span className="flex-none text-[9.5px] uppercase tracking-wide text-gray-400">{p.from}</span>
              </button>
            ))
          )}

          {activeTab === 'output' && (
            outputLines.length === 0
              ? <p className="px-3.5 py-2 text-xs text-gray-400">Nothing open.</p>
              : outputLines.map((l, i) => (
                <div key={i} className={`px-3.5 py-0.5 font-mono text-[11.5px] ${l.tone ? tone[l.tone] : 'text-gray-500 dark:text-gray-400'}`}>
                  <b className="font-semibold text-gray-800 dark:text-gray-200">{l.label}</b> {l.text}
                </div>
              ))
          )}

          {activeTab === 'deploy' && (
            !itbConnected && !deployState.result ? (
              <div className="max-w-[74ch] px-3.5 py-2.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                <strong className="text-gray-800 dark:text-gray-100">No test bed configured.</strong>{' '}
                Deploy appears once a base URL and community key are set. Until then the primary action is
                <strong className="text-gray-800 dark:text-gray-100"> Download ZIP</strong> — the same artefact, delivered by hand.
                <button
                  onClick={onOpenTarget}
                  className="mt-2 flex items-center gap-1.5 rounded border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-700"
                >
                  <Settings size={11} /> Configure a test bed
                </button>
              </div>
            ) : deployState.deploying ? (
              <div className="flex items-center gap-2 px-3.5 py-2 font-mono text-[11.5px] text-gray-500">
                <Loader2 size={12} className="animate-spin" /> deploying…
              </div>
            ) : deployState.result ? (
              <div className="space-y-1 px-3.5 py-1.5">
                <div className={`font-mono text-[11.5px] ${deployState.result.success ? tone.ok : tone.bad}`}>
                  <b>{deployState.result.success ? 'ok' : 'failed'}</b> {deployState.result.message}
                </div>
                {(deployState.result.details?.errors ?? []).map((e: any, i: number) => (
                  <div key={`e${i}`} className={`font-mono text-[11px] ${tone.bad}`}>error: {e.description}</div>
                ))}
                {(deployState.result.details?.warnings ?? []).map((w: any, i: number) => (
                  <div key={`w${i}`} className={`font-mono text-[11px] ${tone.warn}`}>warning: {w.description}</div>
                ))}
                {deployState.result.success && (
                  <div className="flex items-center gap-2 pt-1.5">
                    <a
                      href={deployState.appUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-700"
                    >
                      <ExternalLink size={11} /> Open in ITB
                    </a>
                    <button
                      onClick={onRun}
                      disabled={deployState.running}
                      className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      {deployState.running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                      Run tests
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-[74ch] px-3.5 py-2.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Ready to deploy.{' '}
                <button
                  onClick={onDeploy}
                  disabled={!canDeploy}
                  className="font-medium text-blue-600 hover:underline disabled:opacity-40 dark:text-blue-400"
                >
                  Deploy the compiled suite
                </button>{' '}
                or use the button in the toolbar.
              </div>
            )
          )}

          {activeTab === 'run' && (
            deployState.running ? (
              <div className="flex items-center gap-2 px-3.5 py-2 font-mono text-[11.5px] text-gray-500">
                <Loader2 size={12} className="animate-spin" /> running…
              </div>
            ) : deployState.testResults?.length ? (
              deployState.testResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3.5 py-1 text-xs">
                  {r.result && (
                    <span className={`rounded px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide ${
                      r.result === 'SUCCESS'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {r.result}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 break-words text-gray-700 dark:text-gray-300">{r.message}</span>
                </div>
              ))
            ) : (
              <p className="px-3.5 py-2 text-xs text-gray-400">
                No runs yet — deploy first, then press Run tests.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
};
