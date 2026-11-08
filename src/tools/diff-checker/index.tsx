import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  Columns2,
  AlignJustify,
} from 'lucide-react';
import DiffWorker from '../../workers/diff.worker?worker';
import type {
  DiffWorkerRequest,
  DiffWorkerResult,
  DiffCharSegment,
} from '../../workers/diff.worker';
import { useWorker } from '../../hooks/useWorker';
import { useI18n } from '../../hooks/useI18n';
import { useWorkspaceStore } from '../../hooks/useWorkspaceStore';
import { SplitPane } from '../../components/SplitPane';
import { StreamDropZone } from '../../components/StreamDropZone';
import { VirtualList } from '../../components/VirtualList';

function renderSegments(
  content: string,
  segments: DiffCharSegment[] | undefined,
  highlightClass: string
): React.ReactNode {
  if (!segments || segments.length === 0) {
    return content || ' ';
  }
  return segments.map((seg, i) =>
    seg.highlight ? (
      <span key={i} className={`${highlightClass} rounded-xs px-0.5 font-semibold`}>
        {seg.text}
      </span>
    ) : (
      <span key={i}>{seg.text}</span>
    )
  );
}

export const DiffCheckerTool: React.FC = () => {
  const { t } = useI18n();
  const originalText = useWorkspaceStore((s) => s.toolInputs['diff-checker']);
  const modifiedText = useWorkspaceStore((s) => s.diffSecondaryInput);
  const setToolInput = useWorkspaceStore((s) => s.setToolInput);
  const setDiffSecondaryInput = useWorkspaceStore((s) => s.setDiffSecondaryInput);

  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffWorkerResult | null>(null);

  const workerFactory = useCallback(() => new DiffWorker(), []);
  const { run } = useWorker<DiffWorkerRequest, DiffWorkerResult>(workerFactory);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void run({
        original: originalText,
        modified: modifiedText,
        ignoreWhitespace,
        ignoreCase,
      })
        .then(setDiffResult)
        .catch(() => {
          // Handled by worker hook
        });
    }, 65);
    return () => window.clearTimeout(timer);
  }, [originalText, modifiedText, ignoreWhitespace, ignoreCase, run]);

  const swapTexts = () => {
    const prevOrig = originalText;
    setToolInput('diff-checker', modifiedText);
    setDiffSecondaryInput(prevOrig);
  };

  const leftPane = (
    <div className="flex flex-col h-full min-h-0 gap-2.5">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          {t('tools.diffChecker.originalLabel')} ↔ {t('tools.diffChecker.modifiedLabel')}
        </span>
        <button
          type="button"
          onClick={swapTexts}
          className="min-h-[36px] px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 flex items-center gap-1.5"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span>{t('tools.diffChecker.swapInputs')}</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
          <span>— {t('tools.diffChecker.originalLabel')}</span>
          <span>{originalText.split('\n').length} lines</span>
        </div>
        <StreamDropZone onTextStreamed={(txt) => setToolInput('diff-checker', txt)} />
        <textarea
          value={originalText}
          onChange={(e) => setToolInput('diff-checker', e.target.value)}
          placeholder={t('tools.diffChecker.originalPlaceholder')}
          spellCheck={false}
          className="flex-1 min-h-0 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-2.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 resize-none"
        />
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] text-zinc-200 font-mono">
          <span>+ {t('tools.diffChecker.modifiedLabel')}</span>
          <span>{modifiedText.split('\n').length} lines</span>
        </div>
        <StreamDropZone onTextStreamed={(txt) => setDiffSecondaryInput(txt)} />
        <textarea
          value={modifiedText}
          onChange={(e) => setDiffSecondaryInput(e.target.value)}
          placeholder={t('tools.diffChecker.modifiedPlaceholder')}
          spellCheck={false}
          className="flex-1 min-h-0 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-2.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 resize-none"
        />
      </div>
    </div>
  );

  const rightPane = (
    <div className="flex flex-col h-full min-h-0 gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode('unified')}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
              viewMode === 'unified'
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <AlignJustify className="w-3.5 h-3.5" />
            <span>{t('tools.diffChecker.unifiedView')}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
              viewMode === 'split'
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>{t('tools.diffChecker.splitView')}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIgnoreWhitespace((v) => !v)}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border ${
              ignoreWhitespace
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t('tools.diffChecker.ignoreWhitespace')}
          </button>
          <button
            type="button"
            onClick={() => setIgnoreCase((v) => !v)}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border ${
              ignoreCase
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t('tools.diffChecker.ignoreCase')}
          </button>
        </div>
      </div>

      {diffResult && (
        <div className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs shrink-0">
          <span className="font-mono text-zinc-300">
            {t('tools.diffChecker.stats', {
              added: diffResult.added,
              removed: diffResult.removed,
              unchanged: diffResult.unchanged,
            })}
          </span>
          {diffResult.identical && (
            <span className="flex items-center gap-1 text-zinc-100 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('tools.diffChecker.identical')}
            </span>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden flex flex-col">
        {viewMode === 'unified' ? (
          <VirtualList
            items={diffResult?.unified ?? []}
            rowHeight={24}
            className="flex-1 min-h-0 font-mono text-xs"
            renderRow={(row) => {
              const rowBg =
                row.type === 'add'
                  ? 'bg-zinc-800/90 text-zinc-100'
                  : row.type === 'remove'
                  ? 'bg-zinc-950 text-zinc-500 line-through'
                  : 'text-zinc-300';
              const prefix = row.type === 'add' ? '+' : row.type === 'remove' ? '-' : ' ';
              const charHighlight =
                row.type === 'add'
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'bg-zinc-700 text-zinc-100';

              return (
                <div className={`w-full h-full flex items-center px-2 ${rowBg}`}>
                  <span className="w-10 text-right pr-2 text-[10px] text-zinc-500 select-none shrink-0">
                    {row.oldLineNumber ?? ''}
                  </span>
                  <span className="w-10 text-right pr-2 text-[10px] text-zinc-500 select-none border-r border-zinc-800 shrink-0">
                    {row.newLineNumber ?? ''}
                  </span>
                  <span className="w-5 text-center select-none font-bold shrink-0">{prefix}</span>
                  <pre className="truncate font-mono">
                    {renderSegments(row.content, row.segments, charHighlight)}
                  </pre>
                </div>
              );
            }}
          />
        ) : (
          <VirtualList
            items={diffResult?.split ?? []}
            rowHeight={24}
            className="flex-1 min-h-0 font-mono text-xs"
            renderRow={(row) => {
              const leftBg =
                row.leftType === 'remove'
                  ? 'bg-zinc-950 text-zinc-500'
                  : row.leftType === 'empty'
                  ? 'bg-zinc-950/60'
                  : 'text-zinc-300';
              const rightBg =
                row.rightType === 'add'
                  ? 'bg-zinc-800/90 text-zinc-100'
                  : row.rightType === 'empty'
                  ? 'bg-zinc-950/60'
                  : 'text-zinc-300';

              return (
                <div className="w-full h-full grid grid-cols-2 divide-x divide-zinc-800">
                  <div className={`flex items-center px-2 overflow-hidden ${leftBg}`}>
                    <span className="w-8 text-right pr-2 text-[10px] text-zinc-500 select-none shrink-0">
                      {row.leftLineNumber ?? ''}
                    </span>
                    <pre className="truncate font-mono">
                      {renderSegments(
                        row.leftContent,
                        row.leftSegments,
                        'bg-zinc-700 text-zinc-100'
                      )}
                    </pre>
                  </div>
                  <div className={`flex items-center px-2 overflow-hidden ${rightBg}`}>
                    <span className="w-8 text-right pr-2 text-[10px] text-zinc-500 select-none shrink-0">
                      {row.rightLineNumber ?? ''}
                    </span>
                    <pre className="truncate font-mono">
                      {renderSegments(
                        row.rightContent,
                        row.rightSegments,
                        'bg-zinc-100 text-zinc-950'
                      )}
                    </pre>
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>
    </div>
  );

  return <SplitPane leftPane={leftPane} rightPane={rightPane} />;
};
