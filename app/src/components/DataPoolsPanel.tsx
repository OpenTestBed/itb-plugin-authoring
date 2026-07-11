import React, { useState, useEffect } from 'react';
import { Database, ChevronRight, Plus, Trash2, Copy } from 'lucide-react';
import { SamplePool, SamplePoolsConfig, loadSamplePools } from '../data/samplePools';

interface DataPoolsPanelProps {
  onInsertPoolStep: (poolId: string) => void;
  isDark: boolean;
}

export const DataPoolsPanel: React.FC<DataPoolsPanelProps> = ({ onInsertPoolStep, isDark }) => {
  const [config, setConfig] = useState<SamplePoolsConfig | null>(null);
  const [expandedPool, setExpandedPool] = useState<string | null>(null);
  const [customPools, setCustomPools] = useState<SamplePool[]>(() => {
    try {
      const saved = localStorage.getItem('customSamplePools');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    loadSamplePools().then(setConfig).catch(() => setConfig({ pools: [] }));
  }, []);

  useEffect(() => {
    localStorage.setItem('customSamplePools', JSON.stringify(customPools));
  }, [customPools]);

  const allPools = [...(config?.pools ?? []), ...customPools];

  const handleAddPool = () => {
    const id = `custom-pool-${Date.now()}`;
    setCustomPools(prev => [...prev, {
      id,
      label: 'New Data Pool',
      description: 'Custom sample data pool',
      resources: []
    }]);
    setExpandedPool(id);
  };

  const handleDeletePool = (id: string) => {
    setCustomPools(prev => prev.filter(p => p.id !== id));
    if (expandedPool === id) setExpandedPool(null);
  };

  const isCustom = (id: string) => customPools.some(p => p.id === id);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading data pools...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col text-sm">
      <div className="p-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-blue-500" />
          <span className="font-medium text-gray-700 dark:text-gray-300">Sample Data Pools</span>
        </div>
        <button
          onClick={handleAddPool}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400"
          title="Add custom pool"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {allPools.length === 0 && (
          <div className="p-6 text-center text-gray-400 text-xs">
            No data pools defined. Add one or place pools in <code>public/data/sample-pools.json</code>.
          </div>
        )}

        {allPools.map(pool => (
          <div key={pool.id} className="border-b border-gray-100 dark:border-slate-800">
            <button
              onClick={() => setExpandedPool(expandedPool === pool.id ? null : pool.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronRight
                size={12}
                className={`transition-transform text-gray-400 ${expandedPool === pool.id ? 'rotate-90' : ''}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800 dark:text-gray-200 text-xs truncate">
                    {pool.label}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300">
                    {pool.resources.length} resource{pool.resources.length !== 1 ? 's' : ''}
                  </span>
                  {isCustom(pool.id) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-300">
                      custom
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  {pool.description}
                </p>
              </div>
            </button>

            {expandedPool === pool.id && (
              <div className="px-3 pb-3 space-y-2">
                {/* Pool ID for reference */}
                <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 dark:bg-slate-800 rounded text-[11px]">
                  <span className="text-gray-500 dark:text-gray-400">Pool ID:</span>
                  <code className="text-blue-600 dark:text-blue-400 font-mono">{pool.id}</code>
                </div>

                {/* Resources list */}
                {pool.resources.map((res, idx) => (
                  <div key={idx} className="px-2 py-1.5 bg-gray-50 dark:bg-slate-800 rounded text-[11px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-purple-600 dark:text-purple-400">{res.resourceType}</span>
                      <span className="text-gray-400 truncate text-[10px]">{res.profile}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600 dark:text-gray-400">
                      {Object.entries(res.data).map(([k, v]) => (
                        <div key={k} className="truncate">
                          <span className="text-gray-400">{k}:</span> {v}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onInsertPoolStep(pool.id)}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    <Copy size={11} /> Insert step
                  </button>
                  {isCustom(pool.id) && (
                    <button
                      onClick={() => handleDeletePool(pool.id)}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
