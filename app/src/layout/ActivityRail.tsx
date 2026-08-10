import React from 'react';
import { FolderOpen, Braces, Database, Server } from 'lucide-react';

export type SectionId = 'explorer' | 'steps' | 'data' | 'env';

export interface RailSection {
  id: SectionId;
  label: string;
  /** Small warning badge, e.g. unhealthy component count. */
  badge?: number;
}

const ICONS: Record<SectionId, React.ReactNode> = {
  explorer: <FolderOpen size={17} />,
  steps: <Braces size={17} />,
  data: <Database size={17} />,
  env: <Server size={17} />,
};

interface Props {
  sections: RailSection[];
  active: SectionId;
  sidebarOpen: boolean;
  /** Clicking the active section collapses the sidebar. */
  onSelect: (id: SectionId) => void;
}

export const ActivityRail: React.FC<Props> = ({ sections, active, sidebarOpen, onSelect }) => (
  <nav
    aria-label="Sidebar sections"
    className="flex w-[46px] flex-shrink-0 flex-col items-center gap-1 border-r border-gray-200 bg-gray-100 pt-2 dark:border-slate-700 dark:bg-slate-950"
  >
    {sections.map(s => {
      const on = s.id === active && sidebarOpen;
      return (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          aria-pressed={on}
          title={s.label}
          className={`relative grid h-[34px] w-[34px] place-items-center rounded-lg transition-colors ${
            on
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              : 'text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-slate-800 dark:hover:text-gray-200'
          }`}
        >
          {on && (
            <span className="absolute -left-1.5 top-[7px] h-5 w-[2.5px] rounded bg-blue-600 dark:bg-blue-400" />
          )}
          {ICONS[s.id]}
          {!!s.badge && (
            <span className="absolute right-0.5 top-0.5 min-w-[13px] rounded-full bg-amber-500 px-[3px] text-center text-[9px] font-bold leading-[13px] text-white">
              {s.badge}
            </span>
          )}
        </button>
      );
    })}
  </nav>
);
