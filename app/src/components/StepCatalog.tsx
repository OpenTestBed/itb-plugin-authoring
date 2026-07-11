import React, { useState, useMemo } from 'react';
import { Search, ChevronRight, ChevronDown, Layers } from 'lucide-react';
import { useCatalogData, DocStep } from '../modules/language-explorer/useCatalogData';

interface Props {
  /** Called when a step is clicked. Receives the doc step. */
  onStepClick: (doc: DocStep) => void;
  /** Optional: currently selected step (for highlighting) */
  selectedDoc?: DocStep | null;
}

/** Render a doc pattern with <params> in blue and [optional] in gray/italic */
export function renderDocPattern(pattern: string) {
  const parts: { text: string; type: 'literal' | 'param' | 'optional' }[] = [];
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === '[') {
      const end = pattern.indexOf(']', i);
      if (end > i) {
        parts.push({ text: pattern.slice(i, end + 1), type: 'optional' });
        i = end + 1;
        continue;
      }
    }
    if (pattern[i] === '<') {
      const end = pattern.indexOf('>', i);
      if (end > i) {
        parts.push({ text: pattern.slice(i, end + 1), type: 'param' });
        i = end + 1;
        continue;
      }
    }
    let j = i + 1;
    while (j < pattern.length && pattern[j] !== '<' && pattern[j] !== '[') j++;
    parts.push({ text: pattern.slice(i, j), type: 'literal' });
    i = j;
  }
  return (
    <span className="text-xs">
      {parts.map((p, idx) => (
        <span key={idx} className={
          p.type === 'param' ? 'text-blue-600 dark:text-blue-400 font-semibold' :
          p.type === 'optional' ? 'text-gray-400 dark:text-gray-500 italic' :
          'text-gray-700 dark:text-gray-300'
        }>
          {p.text}
        </span>
      ))}
    </span>
  );
}

export const StepCatalog: React.FC<Props> = ({ onStepClick, selectedDoc }) => {
  const { docSteps, categories, loading } = useCatalogData();
  const [search, setSearch] = useState('');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(categories));

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return docSteps;
    const q = search.toLowerCase();
    return docSteps.filter(d =>
      d.docPattern.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      d.source.toLowerCase().includes(q) ||
      d.variants.some(v => v.match.toLowerCase().includes(q))
    );
  }, [docSteps, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, DocStep[]>();
    for (const d of filteredDocs) {
      const list = map.get(d.category) || [];
      list.push(d);
      map.set(d.category, list);
    }
    return map;
  }, [filteredDocs]);

  const visibleCats = search.trim() ? [...grouped.keys()] : categories.filter(c => grouped.has(c));

  const toggleCat = (cat: string) => {
    const next = new Set(expandedCats);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setExpandedCats(next);
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-2 py-2 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 flex-shrink-0">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search steps..."
            className="w-full pl-7 pr-2 py-1 text-[11px] border border-gray-200 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="text-[9px] text-gray-400 mt-1">{filteredDocs.length} steps</div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {visibleCats.map(cat => {
          const catSteps = grouped.get(cat) || [];
          const isExpanded = search.trim() || expandedCats.has(cat);
          return (
            <div key={cat}>
              <button
                onClick={() => toggleCat(cat)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors sticky top-0 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800"
              >
                {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <Layers size={10} />
                {cat}
                <span className="ml-auto text-[9px] text-gray-400 bg-gray-100 dark:bg-slate-800 px-1 rounded">
                  {catSteps.length}
                </span>
              </button>
              {isExpanded && catSteps.map((doc, i) => (
                <button
                  key={i}
                  onClick={() => onStepClick(doc)}
                  className={`w-full text-left px-3 py-1.5 text-[11px] border-b border-gray-50 dark:border-slate-800 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors ${
                    selectedDoc === doc ? 'bg-blue-50 dark:bg-slate-800 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <div className="leading-relaxed">
                    {renderDocPattern(doc.docPattern)}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[9px] px-1 rounded ${
                      doc.source === 'core'
                        ? 'bg-gray-100 dark:bg-slate-700 text-gray-500'
                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                    }`}>
                      {doc.source}
                    </span>
                    {doc.variants.length > 1 && (
                      <span className="text-[9px] px-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        {doc.variants.length} variants
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
