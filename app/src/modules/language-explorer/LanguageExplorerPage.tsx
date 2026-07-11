import React, { useState, useMemo } from 'react';
import { Tag, Cpu, Copy, Check } from 'lucide-react';
import { useCatalogData, DocStep } from './useCatalogData';
import { StepCatalog, renderDocPattern } from '../../components/StepCatalog';
import { useAppContext } from '../../context/AppContext';

interface Props {
  onInsertStep?: (text: string) => void;
}

export const LanguageExplorerPage: React.FC<Props> = ({ onInsertStep }) => {
  const { isDark } = useAppContext();
  const { steps } = useCatalogData();
  const [selectedDoc, setSelectedDoc] = useState<DocStep | null>(null);
  const [tryInput, setTryInput] = useState('');
  const [copied, setCopied] = useState(false);

  // Try-it: match input against all step patterns
  const tryMatch = useMemo(() => {
    if (!tryInput.trim()) return null;
    const text = tryInput.trim();
    for (const step of steps) {
      const re = new RegExp(step.match, 'i');
      const m = re.exec(text);
      if (m) return { step, groups: m.slice(1) };
    }
    return undefined;
  }, [tryInput, steps]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Render regex with capture/optional coloring
  const renderPattern = (pattern: string) => {
    const parts: { text: string; type: 'literal' | 'capture' | 'optional' }[] = [];
    let i = 0;
    while (i < pattern.length) {
      if (pattern[i] === '(' && pattern[i + 1] === '?') {
        let depth = 1, j = i + 1;
        while (j < pattern.length && depth > 0) { j++; if (pattern[j] === '(') depth++; if (pattern[j] === ')') depth--; }
        parts.push({ text: pattern.slice(i, j + 1), type: 'optional' });
        i = j + 1;
      } else if (pattern[i] === '(') {
        let depth = 1, j = i;
        while (j < pattern.length && depth > 0) { j++; if (pattern[j] === '(' && pattern[j-1] !== '\\') depth++; if (pattern[j] === ')' && pattern[j-1] !== '\\') depth--; }
        parts.push({ text: pattern.slice(i, j + 1), type: 'capture' });
        i = j + 1;
      } else {
        let j = i; while (j < pattern.length && pattern[j] !== '(') j++;
        parts.push({ text: pattern.slice(i, j), type: 'literal' });
        i = j;
      }
    }
    return (
      <span className="font-mono text-[10px]">
        {parts.map((p, idx) => (
          <span key={idx} className={
            p.type === 'capture' ? 'text-blue-600 dark:text-blue-400 font-semibold' :
            p.type === 'optional' ? 'text-gray-400 dark:text-gray-500 italic' :
            'text-gray-600 dark:text-gray-400'
          }>{p.text}</span>
        ))}
      </span>
    );
  };

  return (
    <div className="flex-1 flex min-h-0">
      {/* Left: Step catalog */}
      <div className="w-[40%] min-w-[250px] border-r border-gray-200 dark:border-slate-700">
        <StepCatalog onStepClick={setSelectedDoc} selectedDoc={selectedDoc} />
      </div>

      {/* Right: Detail + Try it */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedDoc ? (
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  selectedDoc.source === 'core' ? 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400'
                  : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                }`}>{selectedDoc.source}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                  {selectedDoc.category}
                </span>
                {selectedDoc.variants.length > 1 && (
                  <span className="text-[10px] text-gray-400">{selectedDoc.variants.length} variants</span>
                )}
              </div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-relaxed">
                {renderDocPattern(selectedDoc.docPattern)}
              </h3>
            </div>

            {/* Syntax key */}
            <div className="flex items-center gap-4 text-[10px]">
              <span><span className="text-blue-600 dark:text-blue-400 font-semibold">&lt;param&gt;</span> = required</span>
              <span><span className="text-gray-400 italic">[optional]</span> = optional</span>
            </div>

            {/* Regex variants */}
            <div>
              <h4 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Pattern Variants ({selectedDoc.variants.length})
              </h4>
              <div className="space-y-2">
                {selectedDoc.variants.map((v, i) => (
                  <div key={i} className="p-2 bg-gray-50 dark:bg-slate-800 rounded-md space-y-1">
                    <div className="overflow-x-auto">{renderPattern(v.match)}</div>
                    <div className="text-[10px] text-gray-400">→ {v.humanPattern}</div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleCopy(v.humanPattern)} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                      {onInsertStep && (
                        <button onClick={() => onInsertStep(`    And ${v.humanPattern}`)} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">
                          Insert
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* IR Actions */}
            <div>
              <h4 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                IR Actions ({selectedDoc.variants[0].actions.length})
              </h4>
              <div className="space-y-1">
                {selectedDoc.variants[0].actions.map((action, i) => {
                  const type = Object.keys(action)[0];
                  const detail = action[type];
                  return (
                    <div key={i} className="flex items-start gap-2 px-2 py-1 bg-gray-50 dark:bg-slate-800 rounded text-[11px]">
                      <Tag size={10} className="text-gray-400 mt-0.5 flex-shrink-0" />
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{type}</span>
                      {detail?.handler && (
                        <span className="text-gray-500">
                          <Cpu size={9} className="inline mr-0.5" />{detail.handler}
                          {detail.operation && <span className="opacity-60">.{detail.operation}</span>}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a step to see details
          </div>
        )}

        {/* Try it panel */}
        <div className="border-t border-gray-200 dark:border-slate-700 p-3 bg-gray-50 dark:bg-slate-800 flex-shrink-0">
          <h4 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Try a step</h4>
          <input
            type="text"
            value={tryInput}
            onChange={e => setTryInput(e.target.value)}
            placeholder='e.g.: User is the system under test'
            className="w-full px-2 py-1.5 text-[11px] border border-gray-200 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 font-mono"
          />
          {tryInput.trim() && (
            <div className="mt-1.5 text-[11px]">
              {tryMatch === null ? null : tryMatch === undefined ? (
                <span className="text-red-500">No matching pattern</span>
              ) : (
                <div className="space-y-1">
                  <div className="text-green-600 dark:text-green-400 font-medium">Matched: {tryMatch.step.humanPattern}</div>
                  {tryMatch.groups.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tryMatch.groups.map((g, i) => (
                        <span key={i} className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded font-mono text-[9px]">
                          ${i + 1}={g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
