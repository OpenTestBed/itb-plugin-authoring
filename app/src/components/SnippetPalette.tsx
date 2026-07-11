import React, { useState, useMemo } from 'react';
import { Search, ChevronRight, Plus } from 'lucide-react';
import { snippetCategories, Snippet, SnippetCategory } from '../data/snippets';

interface SnippetPaletteProps {
  onInsert: (text: string) => void;
  isDark: boolean;
}

export const SnippetPalette: React.FC<SnippetPaletteProps> = ({ onInsert, isDark }) => {
  const [search, setSearch] = useState('');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['structure']));

  const toggle = (id: string) =>
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const filtered: SnippetCategory[] = useMemo(() => {
    if (!search.trim()) return snippetCategories;
    const q = search.toLowerCase();
    return snippetCategories
      .map(cat => ({
        ...cat,
        snippets: cat.snippets.filter(
          s =>
            s.label.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            s.template.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.snippets.length > 0);
  }, [search]);

  // When searching, auto-expand all matching categories
  const isExpanded = (id: string) =>
    search.trim() ? true : expandedCats.has(id);

  return (
    <div className="h-full flex flex-col text-sm">
      {/* Search */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search steps..."
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map(cat => (
          <CategoryGroup
            key={cat.id}
            category={cat}
            expanded={isExpanded(cat.id)}
            onToggle={() => toggle(cat.id)}
            onInsert={onInsert}
          />
        ))}
        {filtered.length === 0 && (
          <div className="p-6 text-center text-gray-400 text-xs">
            No matching steps found.
          </div>
        )}
      </div>
    </div>
  );
};

// ── Category group ───────────────────────────────────────────────────

const CategoryGroup: React.FC<{
  category: SnippetCategory;
  expanded: boolean;
  onToggle: () => void;
  onInsert: (text: string) => void;
}> = ({ category, expanded, onToggle, onInsert }) => (
  <div>
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      <ChevronRight
        size={12}
        className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
      />
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-200 dark:bg-gray-700 text-[10px] font-bold text-gray-600 dark:text-gray-300">
        {category.icon}
      </span>
      <span className="flex-1 text-left">{category.label}</span>
      <span className="text-gray-400 text-[10px]">{category.snippets.length}</span>
    </button>

    {expanded && (
      <div className="pb-1">
        {category.snippets.map(snippet => (
          <SnippetItem key={snippet.id} snippet={snippet} onInsert={onInsert} />
        ))}
      </div>
    )}
  </div>
);

// ── Single snippet ───────────────────────────────────────────────────

const SnippetItem: React.FC<{
  snippet: Snippet;
  onInsert: (text: string) => void;
}> = ({ snippet, onInsert }) => {
  const keywordColor =
    snippet.keyword === 'Given'
      ? 'text-purple-500'
      : snippet.keyword === 'When'
      ? 'text-blue-500'
      : snippet.keyword === 'Then'
      ? 'text-green-500'
      : 'text-gray-500';

  return (
    <button
      onClick={() => onInsert(snippet.template)}
      className="w-full text-left px-3 py-2 ml-5 mr-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group flex items-start gap-2"
      title={snippet.template}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono font-bold ${keywordColor}`}>
            {snippet.keyword}
          </span>
          <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
            {snippet.label}
          </span>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
          {snippet.description}
        </p>
      </div>
      <Plus
        size={14}
        className="mt-0.5 opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity flex-shrink-0"
      />
    </button>
  );
};
