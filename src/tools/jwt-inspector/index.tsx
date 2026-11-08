import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  KeyRound,
  Copy,
  Check,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import { useWorkspaceStore } from '../../hooks/useWorkspaceStore';
import { useClipboard } from '../../hooks/useClipboard';
import { SplitPane } from '../../components/SplitPane';
import { PipeToMenu } from '../../components/PipeToMenu';

function decodeBase64UrlToUtf8(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function encodeBytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function formatDuration(seconds: number): string {
  const abs = Math.abs(Math.floor(seconds));
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const mins = Math.floor((abs % 3600) / 60);
  const secs = abs % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

const HMAC_HASH_MAP: Record<string, 'SHA-256' | 'SHA-384' | 'SHA-512'> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
};

export const JwtInspectorTool: React.FC = () => {
  const { t, locale } = useI18n();
  const rawToken = useWorkspaceStore((s) => s.toolInputs['jwt-inspector']);
  const setToolInput = useWorkspaceStore((s) => s.setToolInput);
  const setExecutionMetrics = useWorkspaceStore((s) => s.setExecutionMetrics);

  const [hmacSecret, setHmacSecret] = useState('omniconvert-local-secret-key');
  const [sigStatus, setSigStatus] = useState<'idle' | 'valid' | 'invalid' | 'unsupported'>('idle');
  const [nowEpochSec, setNowEpochSec] = useState(() => Math.floor(Date.now() / 1000));
  const { copied, copy } = useClipboard();

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowEpochSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const parsedJwt = useMemo(() => {
    const start = performance.now();
    const trimmed = rawToken.trim();
    const parts = trimmed.split('.');
    if (parts.length !== 3) {
      return {
        validFormat: false,
        headerRaw: parts[0] ?? '',
        payloadRaw: parts[1] ?? '',
        signatureRaw: parts[2] ?? '',
        headerJson: null as Record<string, unknown> | null,
        payloadJson: null as Record<string, unknown> | null,
        headerFormatted: '',
        payloadFormatted: '',
        elapsedMs: performance.now() - start,
      };
    }

    try {
      const headerStr = decodeBase64UrlToUtf8(parts[0]);
      const payloadStr = decodeBase64UrlToUtf8(parts[1]);
      const headerObj = JSON.parse(headerStr) as Record<string, unknown>;
      const payloadObj = JSON.parse(payloadStr) as Record<string, unknown>;

      return {
        validFormat: true,
        headerRaw: parts[0],
        payloadRaw: parts[1],
        signatureRaw: parts[2],
        headerJson: headerObj,
        payloadJson: payloadObj,
        headerFormatted: JSON.stringify(headerObj, null, 2),
        payloadFormatted: JSON.stringify(payloadObj, null, 2),
        elapsedMs: Math.max(0.1, performance.now() - start),
      };
    } catch {
      return {
        validFormat: false,
        headerRaw: parts[0],
        payloadRaw: parts[1],
        signatureRaw: parts[2],
        headerJson: null,
        payloadJson: null,
        headerFormatted: '',
        payloadFormatted: '',
        elapsedMs: Math.max(0.1, performance.now() - start),
      };
    }
  }, [rawToken]);

  useEffect(() => {
    setExecutionMetrics(parsedJwt.elapsedMs, false);
  }, [parsedJwt.elapsedMs, setExecutionMetrics]);

  const verifyHmacSignature = useCallback(async () => {
    if (!parsedJwt.validFormat || !parsedJwt.headerJson) {
      setSigStatus('invalid');
      return;
    }
    const alg = String(parsedJwt.headerJson.alg ?? '');
    const hashName = HMAC_HASH_MAP[alg];
    if (!hashName) {
      setSigStatus('unsupported');
      return;
    }

    const start = performance.now();
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(hmacSecret);
      const signingInput = encoder.encode(`${parsedJwt.headerRaw}.${parsedJwt.payloadRaw}`);

      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: { name: hashName } },
        false,
        ['sign']
      );
      const signatureBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, signingInput);
      const expectedSig = encodeBytesToBase64Url(new Uint8Array(signatureBuffer));

      setExecutionMetrics(Math.max(0.1, performance.now() - start), false);
      setSigStatus(expectedSig === parsedJwt.signatureRaw ? 'valid' : 'invalid');
    } catch {
      setSigStatus('invalid');
    }
  }, [parsedJwt, hmacSecret, setExecutionMetrics]);

  useEffect(() => {
    void verifyHmacSignature();
  }, [verifyHmacSignature]);

  const handleSignWithSecret = async () => {
    if (!parsedJwt.validFormat || !parsedJwt.headerJson) return;
    const alg = String(parsedJwt.headerJson.alg ?? 'HS256');
    const hashName = HMAC_HASH_MAP[alg] ?? 'SHA-256';

    const start = performance.now();
    const encoder = new TextEncoder();
    const keyData = encoder.encode(hmacSecret);
    const signingInput = encoder.encode(`${parsedJwt.headerRaw}.${parsedJwt.payloadRaw}`);

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: { name: hashName } },
      false,
      ['sign']
    );
    const signatureBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, signingInput);
    const newSignature = encodeBytesToBase64Url(new Uint8Array(signatureBuffer));
    setExecutionMetrics(Math.max(0.1, performance.now() - start), false);
    setToolInput(
      'jwt-inspector',
      `${parsedJwt.headerRaw}.${parsedJwt.payloadRaw}.${newSignature}`
    );
  };

  const formatTimestamp = (epochSec: unknown): string | null => {
    if (typeof epochSec !== 'number' || !Number.isFinite(epochSec)) return null;
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'long',
      }).format(new Date(epochSec * 1000));
    } catch {
      return new Date(epochSec * 1000).toISOString();
    }
  };

  const expValue =
    typeof parsedJwt.payloadJson?.exp === 'number' ? parsedJwt.payloadJson.exp : null;
  const expDeltaSec = expValue !== null ? expValue - nowEpochSec : null;

  const leftPane = (
    <div className="flex flex-col h-full min-h-0 gap-3">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
          <KeyRound className="w-4 h-4 text-zinc-300" />
          <span>JWT (RFC 7519)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copy(rawToken)}
            className="min-h-[36px] px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? t('app.copied') : t('app.copy')}</span>
          </button>
          <button
            type="button"
            onClick={() => setToolInput('jwt-inspector', '')}
            className="min-h-[36px] px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 text-xs flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('app.clear')}</span>
          </button>
        </div>
      </div>

      <textarea
        value={rawToken}
        onChange={(e) => setToolInput('jwt-inspector', e.target.value)}
        placeholder={t('tools.jwtInspector.inputPlaceholder')}
        spellCheck={false}
        className="h-36 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 font-mono text-xs leading-relaxed text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 resize-none shrink-0"
      />

      {/* Monochrome Token Segment Breakdown */}
      <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs break-all leading-relaxed shrink-0">
        {parsedJwt.validFormat ? (
          <>
            <span className="text-zinc-100 font-bold underline decoration-zinc-600">
              {parsedJwt.headerRaw}
            </span>
            <span className="text-zinc-500 font-bold"> . </span>
            <span className="text-zinc-300 font-medium">{parsedJwt.payloadRaw}</span>
            <span className="text-zinc-500 font-bold"> . </span>
            <span className="text-zinc-400">{parsedJwt.signatureRaw}</span>
          </>
        ) : (
          <span className="text-zinc-300">{t('tools.jwtInspector.malformed')}</span>
        )}
      </div>

      {/* Offline HMAC Verification & Signing Box */}
      <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
            {t('tools.jwtInspector.signature')}
          </span>
          {sigStatus === 'valid' && (
            <span className="flex items-center gap-1 text-xs font-semibold text-zinc-100">
              <ShieldCheck className="w-4 h-4" />
              {t('tools.jwtInspector.sigValid')}
            </span>
          )}
          {sigStatus === 'invalid' && (
            <span className="flex items-center gap-1 text-xs font-semibold text-zinc-400">
              <ShieldAlert className="w-4 h-4" />
              {t('tools.jwtInspector.sigInvalid')}
            </span>
          )}
          {sigStatus === 'unsupported' && (
            <span className="text-xs text-zinc-400">{t('tools.jwtInspector.sigUnsupported')}</span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={hmacSecret}
            onChange={(e) => setHmacSecret(e.target.value)}
            placeholder={t('tools.jwtInspector.secretPlaceholder')}
            spellCheck={false}
            className="min-h-[38px] flex-1 rounded-md bg-zinc-950 border border-zinc-800 px-3 font-mono text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
          />
          <button
            type="button"
            onClick={() => void handleSignWithSecret()}
            className="min-h-[38px] px-3 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('tools.jwtInspector.signBtn')}</span>
          </button>
        </div>
      </div>

      {/* Expiration Live Countdown Banner */}
      <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs text-zinc-200 shrink-0">
        <div className="flex items-center gap-2 font-semibold">
          <Clock className="w-4 h-4 shrink-0 text-zinc-300" />
          <span>
            {expDeltaSec === null
              ? t('tools.jwtInspector.noExp')
              : expDeltaSec > 0
              ? t('tools.jwtInspector.expValid', { time: formatDuration(expDeltaSec) })
              : t('tools.jwtInspector.expExpired', { time: formatDuration(expDeltaSec) })}
          </span>
        </div>
        {expValue !== null && (
          <span className="font-mono text-[11px] text-zinc-400">{formatTimestamp(expValue)}</span>
        )}
      </div>
    </div>
  );

  const rightPane = (
    <div className="flex flex-col h-full min-h-0 gap-3 overflow-y-auto pr-1">
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0">
        <div className="px-3 py-2 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
            {t('tools.jwtInspector.header')}
          </span>
          <span className="text-[11px] font-mono text-zinc-400">
            {String(parsedJwt.headerJson?.alg ?? 'UNKNOWN')}
          </span>
        </div>
        <pre className="p-3 font-mono text-xs text-zinc-200 overflow-x-auto">
          {parsedJwt.headerFormatted || '{}'}
        </pre>
      </div>

      <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0">
        <div className="px-3 py-2 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
            {t('tools.jwtInspector.payload')}
          </span>
          <PipeToMenu outputPayload={parsedJwt.payloadFormatted} />
        </div>
        <pre className="p-3 font-mono text-xs text-zinc-200 overflow-x-auto">
          {parsedJwt.payloadFormatted || '{}'}
        </pre>
      </div>

      {parsedJwt.payloadJson && (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0">
          <div className="px-3 py-2 bg-zinc-950 border-b border-zinc-800 text-xs font-bold text-zinc-300 uppercase tracking-wider">
            {t('tools.jwtInspector.claimsTable')}
          </div>
          <div className="divide-y divide-zinc-800/80 text-xs">
            {Object.entries(parsedJwt.payloadJson).map(([key, val]) => {
              const isTimestampKey =
                (key === 'exp' || key === 'iat' || key === 'nbf' || key === 'auth_time') &&
                typeof val === 'number';
              const humanDate = isTimestampKey ? formatTimestamp(val) : null;

              return (
                <div key={key} className="px-3 py-2 flex items-start justify-between gap-4">
                  <span className="font-mono font-semibold text-zinc-100 shrink-0">{key}</span>
                  <div className="text-right font-mono text-zinc-300 break-all">
                    <div>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</div>
                    {humanDate && (
                      <div className="text-[11px] text-zinc-400 mt-0.5">{humanDate}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return <SplitPane leftPane={leftPane} rightPane={rightPane} />;
};
