import React, { useState, useRef, useCallback } from 'react';

interface VirtualListProps<T> {
  items: readonly T[];
  rowHeight: number;
  className?: string;
  overscan?: number;
  renderRow: (item: T, index: number) => React.ReactNode;
}

export function VirtualList<T>({
  items,
  rowHeight,
  className = '',
  overscan = 8,
  renderRow,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
    if (target.clientHeight > 0 && target.clientHeight !== viewportHeight) {
      setViewportHeight(target.clientHeight);
    }
  }, [viewportHeight]);

  const totalHeight = items.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const offsetY = startIndex * rowHeight;

  const visibleSlice = items.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-y-auto overflow-x-auto relative ${className}`}
    >
      <div style={{ height: `${totalHeight}px`, position: 'relative', width: '100%' }}>
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleSlice.map((item, idx) => (
            <div
              key={startIndex + idx}
              style={{ height: `${rowHeight}px` }}
              className="flex items-center"
            >
              {renderRow(item, startIndex + idx)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
