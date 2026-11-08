import React, { useState, useEffect, useCallback } from 'react';
import {
  Regex,
  Copy,
  Check,
  AlertTriangle,
  Sparkles,
  Replace,
  CaseSensitive,
} from 'lucide-react';
import RegexWorker from '../../workers/regex.worker?worker';
import type {
  RegexWorkerRequest,
  RegexWorkerResult,
} from '../../workers/regex.worker';
import { useWorker } from '../../hooks/useWorker';
import { useI18n } from '../../hooks/useI18n';
import { useWorkspaceStore } from '../../hooks/useWorkspaceStore';
import { useClipboard } from '../../hooks/useClipboard';
import { SplitPane } from '../../components/SplitPane';
import { StreamDropZone } from '../../components/StreamDropZone';
import { VirtualList } from '../../components/VirtualList';
import { PipeToMenu } from '../../components/PipeToMenu';

const REGEX_FLAGS = ['g', 'i', 'm', 's'] as const;

export const RegexLabTool: React.FC = () => {
  const { t } = useI18n();
  const testString = useWorkspaceStore((s) => s.toolInputs['regex-lab']);
  const setToolInput = useWorkspaceStore((s) => s.setToolInput);

  const [pattern, setPattern] = useState('([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})');
  const [flags, setFlags] = useState<string>('gi');
  const [replacement, setReplacement] = useState('$1@[REDACTED]');
  const [outputTab, setOutputTab] = useState<'matches' | 'replace' | 'transform'>('matches');
  const [workerResult, setWorkerResult] = useState<RegexWorkerResult | null>(null);

  const workerFactory = useCallback(() => new RegexWorker(), []);
  const { run } = useWorker<RegexWorkerRequest, RegexWorkerResult>(workerFactory);
  const { copied, copy } = useClipboard();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void run({ pattern, flags, testString, replacement })
        .then(setWorkerResult)
        .catch(() => {
          // Handled by worker
        });
    }, 55);
    return () => window.clearTimeout(timer);
  }, [pattern, flags, testString, replacement, run]);

  const toggleFlag = (f: string) => {
    setFlags((prev) => (prev.includes(f) ? prev.replace(f, '') : `${prev}${f}`));
  };

  const leftPane = (
    <div className="flex flex-col h-full min-h-0 gap-2.5">
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 flex items-center">
            <span className="absolute left-3 font-mono text-zinc-400 font-bold">/</span>
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={t('tools.regexLab.patternPlaceholder')}
              spellCheck={false}
              className="min-h-[38px] w-full pl-6 pr-6 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            />
            <span className="absolute right-3 font-mono text-zinc-400 font-bold">/</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {REGEX_FLAGS.map((flag) => {
              const active = flags.includes(flag);
              return (
                <button
                  key={flag}
                  type="button"
                  onClick={() => toggleFlag(flag)}
                  className={`min-h-[38px] min-w-[34px] rounded-md font-mono text-xs font-bold border transition-colors ${
                    active
                      ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {flag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setPattern('([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})')
              }
              className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300"
            >
              {t('tools.regexLab.presetEmail')}
            </button>
            <button
              type="button"
              onClick={() =>
                setPattern(
                  '\\b((?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)(?:\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)){3})\\b'
                )
              }
              className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300"
            >
              {t('tools.regexLab.presetIpv4')}
            </button>
            <button
              type="button"
              onClick={() =>
                setPattern('([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
              }
              className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300"
            >
              {t('tools.regexLab.presetUuid')}
            </button>
            <button
              type="button"
              onClick={() =>
                setPattern('(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z?)')
              }
              className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300"
            >
              {t('tools.regexLab.presetIsoDate')}
            </button>
          </div>
        </div>

        <input
          type="text"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder={t('tools.regexLab.replacementPlaceholder')}
          spellCheck={false}
          className="min-h-[36px] w-full px-3 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
        />
      </div>

      <StreamDropZone onTextStreamed={(txt) => setToolInput('regex-lab', txt)} />

      {workerResult && !workerResult.valid && workerResult.error && (
        <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{t('tools.regexLab.invalidRegex', { error: workerResult.error })}</span>
        </div>
      )}

      <textarea
        value={testString}
        onChange={(e) => setToolInput('regex-lab', e.target.value)}
        placeholder={t('tools.regexLab.testStringPlaceholder')}
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
            onClick={() => setOutputTab('matches')}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
              outputTab === 'matches'
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Regex className="w-3.5 h-3.5" />
            <span>{t('tools.regexLab.tabMatches')}</span>
          </button>
          <button
            type="button"
            onClick={() => setOutputTab('replace')}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
              outputTab === 'replace'
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Replace className="w-3.5 h-3.5" />
            <span>{t('tools.regexLab.tabReplace')}</span>
          </button>
          <button
            type="button"
            onClick={() => setOutputTab('transform')}
            className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
              outputTab === 'transform'
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CaseSensitive className="w-3.5 h-3.5" />
            <span>{t('tools.regexLab.tabTransform')}</span>
          </button>
        </div>

        <PipeToMenu
          outputPayload={
            outputTab === 'replace'
              ? workerResult?.replacedOutput ?? ''
              : (workerResult?.matches ?? []).map((m) => m.fullMatch).join('\n')
          }
        />
      </div>

      <div className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-200 shrink-0">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          {t('tools.regexLab.matchCount', {
            count: workerResult?.matches.length ?? 0,
            groups: workerResult?.totalCaptures ?? 0,
          })}
        </span>
      </div>

      {outputTab === 'matches' && (
        <div className="flex-1 min-h-0 rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden flex flex-col">
          {(workerResult?.matches.length ?? 0) === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
              {t('tools.regexLab.noMatches')}
            </div>
          ) : (
            <VirtualList
              items={workerResult?.matches ?? []}
              rowHeight={64}
              className="flex-1 min-h-0 p-2"
              renderRow={(m) => (
                <div className="w-full h-[58px] px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col justify-between font-mono text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-400 font-semibold">
                      {t('tools.regexLab.fullMatch', {
                        index: m.matchIndex,
                        start: m.start,
                        end: m.end,
                      })}
                    </span>
                    <span className="text-zinc-100 font-bold truncate">{m.fullMatch}</span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto text-[11px]">
                    {m.groups.map((g) => (
                      <span
                        key={g.index}
                        className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 shrink-0"
                      >
                        {g.name
                          ? `${g.name}: ${g.value}`
                          : `${t('tools.regexLab.groupIndex', { index: g.index })}: ${g.value}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            />
          )}
        </div>
      )}

      {outputTab === 'replace' && (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <textarea
            readOnly
            value={workerResult?.replacedOutput ?? ''}
            spellCheck={false}
            className="flex-1 min-h-0 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 font-mono text-xs text-zinc-100 focus:outline-none resize-none"
          />
          <button
            type="button"
            onClick={() => void copy(workerResult?.replacedOutput ?? '')}
            className="min-h-[38px] px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 flex items-center justify-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? t('app.copied') : t('app.copy')}</span>
          </button>
        </div>
      )}

      {outputTab === 'transform' && workerResult?.transforms && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
          {(
            [
              ['camelCase', workerResult.transforms.camelCase],
              ['PascalCase', workerResult.transforms.pascalCase],
              ['snake_case', workerResult.transforms.snakeCase],
              ['kebab-case', workerResult.transforms.kebabCase],
              ['CONSTANT_CASE', workerResult.transforms.constantCase],
              ['Title Case', workerResult.transforms.titleCase],
              ['Deduplicated Lines', workerResult.transforms.dedupedLines],
              ['Sorted Lines (A-Z)', workerResult.transforms.sortedLines],
            ] as const
          ).map(([label, val]) => (
            <div
              key={label}
              className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200 font-mono">{label}</span>
                <button
                  type="button"
                  onClick={() => void copy(val)}
                  className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3 text-zinc-400" />
                  <span>{t('app.copy')}</span>
                </button>
              </div>
              <pre className="p-2 rounded bg-zinc-950 font-mono text-xs text-zinc-300 overflow-x-auto max-h-24">
                {val}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return <SplitPane leftPane={leftPane} rightPane={rightPane} />;
};
