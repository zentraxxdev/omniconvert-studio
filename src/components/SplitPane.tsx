import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GripVertical } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { useWorkspaceStore } from '../hooks/useWorkspaceStore';

interface SplitPaneProps {
  leftPane: React.ReactNode;
  rightPane: React.ReactNode;
  defaultLeftPercent?: number;
}

export const SplitPane: React.FC<SplitPaneProps> = ({
  leftPane,
  rightPane,
  defaultLeftPercent = 50,
}) => {
  const { t } = useI18n();
  const mobilePaneTab = useWorkspaceStore((s) => s.mobilePaneTab);
  const setMobilePaneTab = useWorkspaceStore((s) => s.setMobilePaneTab);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftPercent, setLeftPercent] = useState(defaultLeftPercent);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const rawPercent = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(78, Math.max(22, rawPercent));
      setLeftPercent(clamped);
    },
    [isDragging]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [isDragging, handlePointerMove, handlePointerUp]);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
      {/* Mobile / Tablet Segmented Full-Width Tabs (< lg) with >= 44px touch targets */}
      <div className="flex lg:hidden border-b border-zinc-800 bg-zinc-950 px-3 py-1.5 gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setMobilePaneTab('input')}
          className={`flex-1 min-h-[44px] rounded-md text-xs font-semibold tracking-wide uppercase transition-colors ${
            mobilePaneTab === 'input'
              ? 'bg-zinc-100 text-zinc-900'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
          }`}
        >
          [ {t('app.tabInput')} ]
        </button>
        <button
          type="button"
          onClick={() => setMobilePaneTab('output')}
          className={`flex-1 min-h-[44px] rounded-md text-xs font-semibold tracking-wide uppercase transition-colors ${
            mobilePaneTab === 'output'
              ? 'bg-zinc-100 text-zinc-900'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
          }`}
        >
          [ {t('app.tabOutput')} ]
        </button>
      </div>

      {/* Mobile Active Pane */}
      <div className="flex-1 min-h-0 flex flex-col lg:hidden overflow-hidden">
        {mobilePaneTab === 'input' ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-3">{leftPane}</div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-3">{rightPane}</div>
        )}
      </div>

      {/* Desktop Resizable Side-by-Side Split View (lg+) */}
      <div
        ref={containerRef}
        className={`hidden lg:flex flex-1 min-h-0 w-full overflow-hidden ${
          isDragging ? 'select-none cursor-col-resize' : ''
        }`}
      >
        <div
          style={{ width: `${leftPercent}%` }}
          className="h-full min-h-0 flex flex-col overflow-hidden p-3.5"
        >
          {leftPane}
        </div>

        {/* Resizable Splitter Handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={() => setIsDragging(true)}
          onDoubleClick={() => setLeftPercent(50)}
          className={`w-2 shrink-0 flex items-center justify-center cursor-col-resize group transition-colors border-x border-zinc-800/80 ${
            isDragging ? 'bg-zinc-700' : 'bg-zinc-950 hover:bg-zinc-800'
          }`}
        >
          <GripVertical className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-200 transition-colors" />
        </div>

        <div
          style={{ width: `${100 - leftPercent}%` }}
          className="h-full min-h-0 flex flex-col overflow-hidden p-3.5"
        >
          {rightPane}
        </div>
      </div>
    </div>
  );
};
