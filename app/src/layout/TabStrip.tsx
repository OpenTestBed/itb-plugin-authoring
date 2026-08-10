import React from 'react';
import { Plus, X } from 'lucide-react';

interface Props {
  tabs: string[];
  active: string | null;
  isDirty: (name: string) => boolean;
  onSelect: (name: string) => void;
  onClose: (name: string) => void;
  onNew: () => void;
}

export const TabStrip: React.FC<Props> = ({ tabs, active, isDirty, onSelect, onClose, onNew }) => (
  <div className="flex h-8 flex-shrink-0 items-stretch overflow-x-auto border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
    {tabs.map(name => {
      const on = name === active;
      const dirty = isDirty(name);
      return (
        <div
          key={name}
          role="tab"
          aria-selected={on}
          tabIndex={0}
          onClick={() => onSelect(name)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(name); } }}
          onAuxClick={e => { if (e.button === 1) { e.preventDefault(); onClose(name); } }}
          className={`group flex cursor-pointer items-center gap-2 whitespace-nowrap border-r border-t-2 border-r-gray-200 pl-3 pr-2 font-mono text-[11.5px] dark:border-r-slate-700 ${
            on
              ? 'border-t-blue-500 bg-white text-gray-900 dark:bg-slate-900 dark:text-gray-100'
              : 'border-t-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          {dirty && <span className="h-1.5 w-1.5 flex-none rounded-full bg-amber-500" title="Unsaved changes" />}
          <span>{name}</span>
          <button
            onClick={e => { e.stopPropagation(); onClose(name); }}
            aria-label={`Close ${name}`}
            className={`grid h-[15px] w-[15px] place-items-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-800 dark:hover:bg-slate-700 dark:hover:text-gray-100 ${
              on ? '' : 'invisible group-hover:visible'
            }`}
          >
            <X size={11} />
          </button>
        </div>
      );
    })}
    <button
      onClick={onNew}
      title="New feature file"
      className="grid w-8 flex-none place-items-center border-r border-gray-200 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:border-slate-700 dark:hover:bg-slate-700 dark:hover:text-gray-200"
    >
      <Plus size={14} />
    </button>
  </div>
);
