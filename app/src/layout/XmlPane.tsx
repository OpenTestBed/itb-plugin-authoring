import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, X } from 'lucide-react';
import { XMLOutput } from '../parser/xmlGenerator';

interface Props {
  xmlOutput: XMLOutput | null;
  onClose: () => void;
}

/** Live view of the compiled GITB XML, beside the source that produced it. */
export const XmlPane: React.FC<Props> = ({ xmlOutput, onClose }) => {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const files = xmlOutput?.files ?? [];
  const expanded = open ?? files[0]?.filename ?? null;

  const copy = (name: string, xml: string) => {
    void navigator.clipboard.writeText(xml);
    setCopied(name);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-col border-l border-gray-200 dark:border-slate-700">
      <div className="flex h-[30px] flex-none items-center gap-2 border-b border-gray-200 bg-gray-50 px-2.5 dark:border-slate-700 dark:bg-slate-800">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Compiled XML
        </span>
        {!!files.length && (
          <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-green-700 dark:bg-green-900/30 dark:text-green-300">
            <span className="h-1 w-1 rounded-full bg-current" /> live
          </span>
        )}
        <span className="ml-auto font-mono text-[10.5px] text-gray-400">
          {files.length} file{files.length === 1 ? '' : 's'}
        </span>
        <button
          onClick={onClose}
          title="Hide compiled XML"
          className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-slate-700"
        >
          <X size={13} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {files.length === 0 ? (
          <p className="p-4 text-xs text-gray-400">
            Nothing compiled yet — the XML appears once the feature parses.
          </p>
        ) : (
          files.map(file => {
            const isOpen = expanded === file.filename;
            return (
              <div key={file.filename} className="border-b border-gray-100 dark:border-slate-800">
                <button
                  onClick={() => setOpen(isOpen ? '' : file.filename)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  {isOpen ? <ChevronDown size={11} className="text-gray-400" /> : <ChevronRight size={11} className="text-gray-400" />}
                  <span className="flex-1 truncate font-mono text-[11px] text-gray-700 dark:text-gray-300">
                    {file.filename}
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 text-[9.5px] uppercase text-gray-500 dark:bg-slate-700 dark:text-gray-400">
                    {file.type}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => { e.stopPropagation(); copy(file.filename, file.xml); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); copy(file.filename, file.xml); } }}
                    className="rounded p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    title="Copy XML"
                  >
                    {copied === file.filename ? <Check size={11} /> : <Copy size={11} />}
                  </span>
                </button>
                {isOpen && (
                  <pre className="overflow-x-auto px-3 pb-2.5 font-mono text-[10.5px] leading-relaxed text-gray-600 dark:text-gray-400">
                    {file.xml}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
