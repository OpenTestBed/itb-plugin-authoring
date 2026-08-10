import React from 'react';

interface Props {
  title: string;
  children: React.ReactNode;
  width: number;
  onResize: (px: number) => void;
}

export const Sidebar: React.FC<Props> = ({ title, children, width, onResize }) => {
  const dragRef = React.useRef<{ startX: number; startW: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startW: width };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    onResize(Math.min(Math.max(d.startW + (e.clientX - d.startX), 180), 460));
  };
  const endDrag = () => { dragRef.current = null; };

  return (
    <>
      <aside
        style={{ width }}
        className="flex min-h-0 flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex h-[30px] flex-none items-center border-b border-gray-100 px-2.5 dark:border-slate-800">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {title}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </aside>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="Drag to resize"
        className="w-1 flex-none cursor-col-resize touch-none bg-transparent transition-colors hover:bg-blue-400 active:bg-blue-500"
      />
    </>
  );
};
