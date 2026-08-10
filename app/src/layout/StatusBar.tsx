import React from 'react';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { FileSourceKind } from '../services/fileSources';
import { ITBStatus } from '../context/AppContext';

interface Props {
  sourceKind: FileSourceKind;
  sourceLabel: string;
  onFilesClick: () => void;

  itbStatus: ITBStatus;
  itbLabel: string;
  specLabel: string | null;
  onItbClick: () => void;

  /** Health rollup — hidden when there is no runtime to report on. */
  showHealth: boolean;
  healthy: number;
  totalComponents: number;
  onHealthClick: () => void;

  errors: number;
  warnings: number;
  onProblemsClick: () => void;

  modelName: string;
  onModelClick: () => void;

  dialectCount: number;
  onDialectsClick: () => void;
}

const seg =
  'inline-flex items-center gap-1.5 px-2.5 text-[11px] transition-colors hover:bg-gray-200 dark:hover:bg-slate-700';

export const StatusBar: React.FC<Props> = ({
  sourceKind, sourceLabel, onFilesClick,
  itbStatus, itbLabel, specLabel, onItbClick,
  showHealth, healthy, totalComponents, onHealthClick,
  errors, warnings, onProblemsClick,
  modelName, onModelClick, dialectCount, onDialectsClick,
}) => (
  <div className="flex h-[26px] flex-none items-stretch border-t border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-400">
    <button onClick={onFilesClick} className={seg} title="Where feature files are read from">
      <span className="font-mono text-[10.5px]">{sourceLabel}</span>
      {sourceKind === 'bundled' && <span className="text-[9.5px] uppercase tracking-wide">read-only</span>}
    </button>

    <button onClick={onItbClick} className={seg} title="Test bed target">
      {itbStatus === 'checking' ? (
        <Loader2 size={9} className="animate-spin" />
      ) : (
        <span className={`h-[7px] w-[7px] rounded-full ${
          itbStatus === 'connected' ? 'bg-green-500'
            : itbStatus === 'unreachable' ? 'bg-red-500'
            : 'border-[1.5px] border-gray-400'
        }`} />
      )}
      <span className="font-mono text-[10.5px]">
        {itbStatus === 'unconfigured' ? 'no test bed' : itbLabel}
        {specLabel && itbStatus === 'connected' ? ` · ${specLabel}` : ''}
      </span>
    </button>

    {showHealth && (
      <button onClick={onHealthClick} className={seg} title="Component health">
        <span className={`h-[7px] w-[7px] rounded-full ${
          healthy === totalComponents ? 'bg-green-500' : 'bg-amber-500'
        }`} />
        {healthy}/{totalComponents} healthy
      </button>
    )}

    <button onClick={onProblemsClick} className={`${seg} ml-auto tabular-nums`} title="Problems">
      {errors === 0 && warnings === 0 ? (
        <><CheckCircle size={11} className="text-green-600 dark:text-green-400" /> no problems</>
      ) : (
        <>
          {errors > 0 && (
            <span className="font-semibold text-red-600 dark:text-red-400">
              <AlertCircle size={10} className="mr-0.5 inline" />{errors} error{errors === 1 ? '' : 's'}
            </span>
          )}
          {warnings > 0 && (
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {warnings} warning{warnings === 1 ? '' : 's'}
            </span>
          )}
        </>
      )}
    </button>

    <button onClick={onModelClick} className={seg}>{modelName}</button>
    <button onClick={onDialectsClick} className={seg}>
      {dialectCount} dialect{dialectCount === 1 ? '' : 's'}
    </button>
  </div>
);
