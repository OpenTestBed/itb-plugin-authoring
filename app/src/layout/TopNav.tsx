import React from 'react';
import { FileCode2, Sun, Moon, Settings, BookOpen, Edit3, Rocket } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export type AppTab = 'language' | 'authoring' | 'deploy';

interface Props {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const tabs: { id: AppTab; label: string; icon: React.ReactNode }[] = [
  { id: 'language', label: 'Language', icon: <BookOpen size={14} /> },
  { id: 'authoring', label: 'Tests', icon: <Edit3 size={14} /> },
  { id: 'deploy', label: 'Deploy', icon: <Rocket size={14} /> },
];

export const TopNav: React.FC<Props> = ({ activeTab, onTabChange }) => {
  const { isDark, setIsDark, setITBSettingsOpen } = useAppContext();

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-4 py-0 flex-shrink-0">
      <div className="flex items-center h-11">
        {/* Brand */}
        <div className="flex items-center gap-2 mr-6">
          <FileCode2 size={18} className="text-blue-600 dark:text-blue-400" />
          <span className="font-bold text-sm text-gray-900 dark:text-gray-100">FHIR Test Workbench</span>
        </div>

        {/* Tabs */}
        <nav className="flex items-center h-full gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-4 h-full text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-blue-600 dark:text-blue-400 border-blue-500'
                  : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings + Theme */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setITBSettingsOpen(true)}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            title="Settings"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
};
