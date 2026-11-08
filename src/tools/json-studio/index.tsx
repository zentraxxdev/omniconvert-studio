import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Copy,
  Check,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowUpDown,
  Code2,
  FolderTree,
} from 'lucide-react';
import JsonWorker from '../../workers/json.worker?worker';
import type {
  JsonWorkerRequest,
  JsonWorkerResult,
  JsonTreeItem,
} from '../../workers/json.worker';
import { useWorker } from '../../hooks/useWorker';
import { useI18n } from '../../hooks/useI18n';
import { useWorkspaceStore } from '../../hooks/useWorkspaceStore';
import { useClipboard } from '../../hooks/useClipboard';
import { SplitPane } from '../../components/SplitPane';
import { StreamDropZone } from '../../components/StreamDropZone';
import { VirtualList } from '../../components/VirtualList';
import { PipeToMenu } from '../../components/PipeToMenu';

export const JsonStudioTool: React.FC = () => {
  const { t } = useI18n();
  const rawInput = useWorkspaceStore((s) => s.toolInputs['json-studio']);
  const setToolInput = useWorkspaceStore((s) => s.setToolInput);

  const [indent, setIndent] = useState<0 | 2 | 4>(2);
  const [sortKeys, setSortKeys] = useState(false);
  const [jsonPath, setJsonPath] = useState('');
  const [viewMode, setViewMode] = useState<'code' | 'tree'>('code');
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [workerResult, setWorkerResult] = useState<JsonWorkerResult | null>(null);

  const workerFactory = useCallback(() => new JsonWorker(), []);
  const { run } = useWorker<JsonWorkerRequest, JsonWorkerResult>(workerFactory);
  const { copied, copy } = useClipboard();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void run({ raw: rawInput, indent, sortKeys, jsonPath })
        .then(setWorkerResult)
        .catch(() => {
          // Handled inside worker state
        });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [rawInput, indent, sortKeys, jsonPath, run]);

  const toggleNodeCollapse = useCallback((path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    if (!workerResult) return;
    const branchPaths = workerResult.treeNodes
      .filter((n) => n.hasChildren && n.depth > 0)
      .map((n) => n.path);
    setCollapsedPaths(new Set(branchPaths));
  }, [workerResult]);

  const expandAll = useCallback(() => {
    setCollapsedPaths(new Set());
  }, []);

  const visibleTreeNodes = useMemo<JsonTreeItem[]>(() => {
    if (!workerResult?.treeNodes) return [];
    if (collapsedPaths.size === 0) return workerResult.treeNodes;

    const visible: JsonTreeItem[] = [];
    for (const node of workerResult.treeNodes) {
      let hidden = false;
      for (const collapsedPrefix of collapsedPaths) {
        if (
          node.path !== collapsedPrefix &&
          (node.path.startsWith(`${collapsedPrefix}.`) ||
            node.path.startsWith(`${collapsedPrefix}[`))
        ) {
          hidden = true;
          break;
        }
      }
      if (!hidden) visible.push(node);
    }
    return visible;
  }, [workerResult, collapsedPaths]);

  const leftPane = (
    <div className="flex flex-col h-full min-h-0 gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIndent(2)}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              indent === 2
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t('tools.jsonStudio.indent2')}
          </button>
          <button
            type="button"
            onClick={() => setIndent(4)}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              indent === 4
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t('tools.jsonStudio.indent4')}
          </button>
          <button
            type="button"
            onClick={() => setIndent(0)}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              indent === 0
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t('tools.jsonStudio.minify')}
          </button>
          <button
            type="button"
            onClick={() => setSortKeys((v) => !v)}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              sortKeys
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>{t('tools.jsonStudio.sortKeys')}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setToolInput('json-studio', '')}
          className="min-h-[36px] px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 text-xs flex items-center gap-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{t('app.clear')}</span>
        </button>
      </div>

      <StreamDropZone
        accept=".json,.txt,.geojson,.har,.jsonl"
        onTextStreamed={(text) => setToolInput('json-studio', text)}
      />

      {workerResult && !workerResult.valid && workerResult.error && (
        <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs space-y-1.5 shrink-0">
          <div className="flex items-center gap-2 font-semibold text-zinc-100">
            <AlertTriangle className="w-4 h-4 shrink-0 text-zinc-300" />
            <span>
              {t('tools.jsonStudio.syntaxError', {
                line: workerResult.error.line,
                col: workerResult.error.column,
                message: workerResult.error.message,
              })}
            </span>
          </div>
          {workerResult.error.errorLineText && (
            <pre className="p-2 rounded bg-zinc-950 font-mono text-[11px] text-zinc-300 overflow-x-auto">
              {workerResult.error.errorLineText}
              {'\n'}
              {' '.repeat(Math.max(0, workerResult.error.column - 1))}^
            </pre>
          )}
        </div>
      )}

      <textarea
        value={rawInput}
        onChange={(e) => setToolInput('json-studio', e.target.value)}
        placeholder={t('tools.jsonStudio.inputPlaceholder')}
        spellCheck={false}
        className="flex-1 min-h-0 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 font-mono text-xs leading-relaxed text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 resize-none"
      />
    </div>
  );

  const rightPane = (
    <div className="flex flex-col h-full min-h-0 gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode('code')}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              viewMode === 'code'
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>{t('tools.jsonStudio.viewFormatted')}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('tree')}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              viewMode === 'tree'
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>{t('tools.jsonStudio.viewTree')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!workerResult?.formatted}
            onClick={() => void copy(workerResult?.formatted ?? '')}
            className="min-h-[36px] px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 text-xs text-zinc-200 flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? t('app.copied') : t('app.copy')}</span>
          </button>

          <PipeToMenu outputPayload={workerResult?.formatted ?? ''} />
        </div>
      </div>

      <div className="relative flex items-center shrink-0">
        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
        <input
          type="text"
          value={jsonPath}
          onChange={(e) => setJsonPath(e.target.value)}
          placeholder={t('tools.jsonStudio.jsonPathPlaceholder')}
          spellCheck={false}
          className="min-h-[38px] w-full pl-8 pr-16 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
        />
        {jsonPath && (
          <button
            type="button"
            onClick={() => setJsonPath('')}
            className="absolute right-2.5 text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            {t('app.clear')}
          </button>
        )}
      </div>

      {workerResult?.valid && (
        <div className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs text-zinc-200 shrink-0">
          <span className="flex items-center gap-1.5 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-zinc-300" />
            {t('tools.jsonStudio.validJson', {
              keys: workerResult.totalNodes,
              size: workerResult.byteSize,
            })}
          </span>
          {viewMode === 'tree' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="text-[11px] text-zinc-300 hover:underline"
              >
                {t('tools.jsonStudio.expandAll')}
              </button>
              <span className="text-zinc-600">•</span>
              <button
                type="button"
                onClick={collapseAll}
                className="text-[11px] text-zinc-300 hover:underline"
              >
                {t('tools.jsonStudio.collapseAll')}
              </button>
            </div>
          )}
        </div>
      )}

      {viewMode === 'code' ? (
        <textarea
          readOnly
          value={workerResult?.formatted ?? ''}
          spellCheck={false}
          className="flex-1 min-h-0 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 font-mono text-xs leading-relaxed text-zinc-100 focus:outline-none resize-none"
        />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
          <VirtualList
            items={visibleTreeNodes}
            rowHeight={28}
            className="flex-1 min-h-0 p-2"
            renderRow={(node) => {
              const isCollapsed = collapsedPaths.has(node.path);
              return (
                <div
                  style={{ paddingLeft: `${node.depth * 16}px` }}
                  className="w-full flex items-center justify-between gap-2 px-2 py-0.5 rounded hover:bg-zinc-800/60 font-mono text-xs group"
                >
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    {node.hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggleNodeCollapse(node.path)}
                        className="p-0.5 rounded hover:bg-zinc-700 text-zinc-400"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ) : (
                      <span className="w-4 inline-block" />
                    )}

                    {node.key !== null && (
                      <span className="text-zinc-100 font-semibold shrink-0">
                        &quot;{node.key}&quot;:
                      </span>
                    )}

                    <span className="truncate text-zinc-400">{node.valuePreview}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setJsonPath(node.path)}
                    className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300 hover:text-zinc-100 shrink-0 transition-opacity"
                  >
                    {node.path}
                  </button>
                </div>
              );
            }}
          />
          <div className="px-3 py-1 bg-zinc-950 border-t border-zinc-800 text-[10px] font-mono text-zinc-500">
            {t('tools.jsonStudio.nodesRendered', {
              visible: visibleTreeNodes.length,
              total: workerResult?.totalNodes ?? 0,
            })}
          </div>
        </div>
      )}
    </div>
  );

  return <SplitPane leftPane={leftPane} rightPane={rightPane} />;
};
