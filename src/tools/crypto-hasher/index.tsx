import React, { useState, useEffect, useCallback } from 'react';
import {
  Fingerprint,
  KeyRound,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Sparkles,
} from 'lucide-react';
import CryptoWorker from '../../workers/crypto.worker?worker';
import type {
  CryptoWorkerRequest,
  CryptoWorkerResult,
  DigestEntry,
} from '../../workers/crypto.worker';
import { useWorker } from '../../hooks/useWorker';
import { useI18n } from '../../hooks/useI18n';
import { useWorkspaceStore } from '../../hooks/useWorkspaceStore';
import { useClipboard } from '../../hooks/useClipboard';
import { SplitPane } from '../../components/SplitPane';
import { StreamDropZone } from '../../components/StreamDropZone';
import { VirtualList } from '../../components/VirtualList';
import { PipeToMenu } from '../../components/PipeToMenu';

export const CryptoHasherTool: React.FC = () => {
  const { t } = useI18n();
  const rawInput = useWorkspaceStore((s) => s.toolInputs['crypto-hasher']);
  const setToolInput = useWorkspaceStore((s) => s.setToolInput);

  const [mode, setMode] = useState<'hash' | 'uuid'>('hash');
  const [hmacKey, setHmacKey] = useState('');
  const [uppercase, setUppercase] = useState(false);
  const [compareHash, setCompareHash] = useState('');
  const [digests, setDigests] = useState<DigestEntry[]>([]);

  const [uuidCount, setUuidCount] = useState(250);
  const [uuidHyphens, setUuidHyphens] = useState(true);
  const [uuidBraces, setUuidBraces] = useState(false);
  const [uuids, setUuids] = useState<string[]>([]);

  const workerFactory = useCallback(() => new CryptoWorker(), []);
  const { run } = useWorker<CryptoWorkerRequest, CryptoWorkerResult>(workerFactory);
  const { copied, copy } = useClipboard();
  const [copiedAlgo, setCopiedAlgo] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'hash') return;
    const timer = window.setTimeout(() => {
      void run({
        mode: 'hash',
        input: rawInput,
        hmacKey,
        uppercase,
      })
        .then((res) => {
          if (res.digests) setDigests(res.digests);
        })
        .catch(() => {
          // Handled by worker
        });
    }, 45);
    return () => window.clearTimeout(timer);
  }, [mode, rawInput, hmacKey, uppercase, run]);

  const generateUuidBatch = useCallback(() => {
    void run({
      mode: 'uuid',
      count: uuidCount,
      hyphens: uuidHyphens,
      uppercase,
      braces: uuidBraces,
    })
      .then((res) => {
        if (res.uuids) setUuids(res.uuids);
      })
      .catch(() => {
        // Handled by worker
      });
  }, [run, uuidCount, uuidHyphens, uppercase, uuidBraces]);

  useEffect(() => {
    if (mode === 'uuid') {
      generateUuidBatch();
    }
  }, [mode, generateUuidBatch]);

  const copySingleDigest = async (algo: string, value: string) => {
    await copy(value);
    setCopiedAlgo(algo);
    window.setTimeout(() => setCopiedAlgo(null), 1500);
  };

  const normalizedCompare = compareHash.trim().toLowerCase();
  const matchedAlgorithm = normalizedCompare
    ? digests.find(
        (d) =>
          d.hex.toLowerCase() === normalizedCompare ||
          d.base64.toLowerCase() === normalizedCompare
      )
    : undefined;

  const leftPane = (
    <div className="flex flex-col h-full min-h-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode('hash')}
            className={`min-h-[38px] px-3 py-1 rounded-md text-xs font-semibold border flex items-center gap-1.5 ${
              mode === 'hash'
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Fingerprint className="w-3.5 h-3.5" />
            <span>{t('tools.cryptoHasher.modeHash')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('uuid')}
            className={`min-h-[38px] px-3 py-1 rounded-md text-xs font-semibold border flex items-center gap-1.5 ${
              mode === 'uuid'
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('tools.cryptoHasher.modeUuid')}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setUppercase((v) => !v)}
          className={`min-h-[38px] px-2.5 py-1 rounded-md text-xs font-mono border ${
            uppercase
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-bold'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {t('tools.cryptoHasher.uppercase')}
        </button>
      </div>

      {mode === 'hash' ? (
        <>
          <StreamDropZone onTextStreamed={(txt) => setToolInput('crypto-hasher', txt)} />

          <div className="relative flex items-center shrink-0">
            <KeyRound className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={hmacKey}
              onChange={(e) => setHmacKey(e.target.value)}
              placeholder={t('tools.cryptoHasher.hmacKeyPlaceholder')}
              spellCheck={false}
              className="min-h-[38px] w-full pl-8 pr-3 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <textarea
            value={rawInput}
            onChange={(e) => setToolInput('crypto-hasher', e.target.value)}
            placeholder={t('tools.cryptoHasher.inputPlaceholder')}
            spellCheck={false}
            className="flex-1 min-h-0 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 font-mono text-xs leading-relaxed text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 resize-none"
          />
        </>
      ) : (
        <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 font-semibold">
                {t('tools.cryptoHasher.uuidCount')}
              </span>
              <span className="font-mono text-zinc-100 font-bold">{uuidCount} UUIDs</span>
            </div>
            <input
              type="range"
              min={10}
              max={5000}
              step={10}
              value={uuidCount}
              onChange={(e) => setUuidCount(parseInt(e.target.value, 10))}
              className="w-full accent-zinc-200 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-zinc-500">
              <span>10</span>
              <span>100</span>
              <span>1,000</span>
              <span>5,000</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setUuidHyphens((v) => !v)}
              className={`min-h-[38px] px-3 py-1 rounded-md text-xs font-medium border ${
                uuidHyphens
                  ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}
            >
              {t('tools.cryptoHasher.uuidHyphens')}
            </button>
            <button
              type="button"
              onClick={() => setUuidBraces((v) => !v)}
              className={`min-h-[38px] px-3 py-1 rounded-md text-xs font-medium border ${
                uuidBraces
                  ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}
            >
              {t('tools.cryptoHasher.uuidBraces')}
            </button>
          </div>

          <button
            type="button"
            onClick={generateUuidBatch}
            className="min-h-[42px] w-full rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('tools.cryptoHasher.generateUuids')}</span>
          </button>
        </div>
      )}
    </div>
  );

  const rightPane =
    mode === 'hash' ? (
      <div className="flex flex-col h-full min-h-0 gap-2.5 overflow-y-auto pr-1">
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={compareHash}
            onChange={(e) => setCompareHash(e.target.value)}
            placeholder={t('tools.cryptoHasher.comparePlaceholder')}
            spellCheck={false}
            className="min-h-[38px] flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-3 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
          />
          {normalizedCompare && (
            <span
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 border ${
                matchedAlgorithm
                  ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-700'
              }`}
            >
              {matchedAlgorithm ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {t('tools.cryptoHasher.matchSuccess')} ({matchedAlgorithm.algorithm})
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5" />
                  <span>{t('tools.cryptoHasher.matchFail')}</span>
                </>
              )}
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          {digests.map((d) => {
            const isMatched = matchedAlgorithm?.algorithm === d.algorithm;
            return (
              <div
                key={d.algorithm}
                className={`p-3 rounded-lg bg-zinc-900 border transition-colors space-y-1.5 ${
                  isMatched ? 'border-zinc-300 bg-zinc-800/60' : 'border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-xs font-bold text-zinc-100">
                      {hmacKey ? `HMAC-${d.algorithm}` : d.algorithm}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500">{d.bits}-bit</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copySingleDigest(d.algorithm, d.hex)}
                      className="px-2 py-1 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 flex items-center gap-1"
                    >
                      {copiedAlgo === d.algorithm ? (
                        <Check className="w-3 h-3 text-zinc-100" />
                      ) : (
                        <Copy className="w-3 h-3 text-zinc-400" />
                      )}
                      <span>Hex</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void copySingleDigest(`${d.algorithm}-b64`, d.base64)}
                      className="px-2 py-1 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 flex items-center gap-1"
                    >
                      {copiedAlgo === `${d.algorithm}-b64` ? (
                        <Check className="w-3 h-3 text-zinc-100" />
                      ) : (
                        <Copy className="w-3 h-3 text-zinc-400" />
                      )}
                      <span>Base64</span>
                    </button>
                  </div>
                </div>

                <div className="p-2 rounded bg-zinc-950 font-mono text-xs text-zinc-200 break-all select-all">
                  {d.hex}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ) : (
      <div className="flex flex-col h-full min-h-0 gap-2.5">
        <div className="flex items-center justify-between shrink-0">
          <span className="text-xs font-mono text-zinc-400">
            {uuids.length} × UUID v4 (RFC 4122 / CSPRNG)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void copy(uuids.join('\n'))}
              className="min-h-[36px] px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t('app.copied') : t('app.copy')}</span>
            </button>
            <PipeToMenu outputPayload={uuids.join('\n')} />
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden flex flex-col">
          <VirtualList
            items={uuids}
            rowHeight={28}
            className="flex-1 min-h-0 p-2 font-mono text-xs"
            renderRow={(uuid, idx) => (
              <div className="w-full flex items-center justify-between px-2 py-0.5 rounded hover:bg-zinc-800/60 group">
                <div className="flex items-center gap-3">
                  <span className="w-10 text-right text-[10px] text-zinc-500 select-none">
                    #{idx + 1}
                  </span>
                  <span className="text-zinc-200 select-all">{uuid}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void copy(uuid)}
                  className="opacity-0 group-hover:opacity-100 text-[11px] text-zinc-300 hover:underline"
                >
                  {t('app.copy')}
                </button>
              </div>
            )}
          />
        </div>
      </div>
    );

  return <SplitPane leftPane={leftPane} rightPane={rightPane} />;
};
