/// <reference lib="webworker" />
import type { PipelineStepConfig } from '../hooks/useWorkspaceStore';

export interface PipelineStepTrace {
  stepId: string;
  operation: PipelineStepConfig['operation'];
  durationMs: number;
  outputPreview: string;
}

export interface PipelineWorkerRequest {
  input: string;
  steps: PipelineStepConfig[];
}

export interface PipelineWorkerResult {
  success: boolean;
  finalOutput: string;
  traces: PipelineStepTrace[];
  failedStepIndex?: number;
  error?: string;
}

function decodeBase64Utf8(str: string): string {
  const clean = str.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), '=');
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function sortJsonKeys(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(sortJsonKeys);
  if (val !== null && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(val as Record<string, unknown>).sort()) {
      out[k] = sortJsonKeys((val as Record<string, unknown>)[k]);
    }
    return out;
  }
  return val;
}

function filterJsonKeys(val: unknown, arg?: string): unknown {
  const query = (arg ?? '').trim();
  if (!query) return val;

  // Support simple JSONPath $.a.b or comma-separated key list
  if (query.startsWith('$.')) {
    const parts = query.slice(2).split('.');
    let curr: unknown = val;
    for (const p of parts) {
      if (curr !== null && typeof curr === 'object' && p in (curr as Record<string, unknown>)) {
        curr = (curr as Record<string, unknown>)[p];
      } else {
        return null;
      }
    }
    return curr;
  }

  const keys = new Set(
    query
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  if (keys.size === 0) return val;

  const filterObj = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(filterObj);
    if (node !== null && typeof node === 'object') {
      const res: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (keys.has(k)) res[k] = v;
      }
      return res;
    }
    return node;
  };
  return filterObj(val);
}

// Lightweight MD5 for pipeline step
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
  MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
}

function md5Hex(str: string): string {
  const inputBytes = new TextEncoder().encode(str);
  const origLen = inputBytes.length;
  const bitLen = origLen * 8;
  const padLen = ((56 - ((origLen + 1) % 64)) + 64) % 64;
  const totalLen = origLen + 1 + padLen + 8;
  const buffer = new ArrayBuffer(totalLen);
  const bytes = new Uint8Array(buffer);
  bytes.set(inputBytes);
  bytes[origLen] = 0x80;
  const view = new DataView(buffer);
  view.setUint32(totalLen - 8, bitLen >>> 0, true);
  view.setUint32(totalLen - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const M = new Uint32Array(16);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let j = 0; j < 16; j++) M[j] = view.getUint32(offset + j * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F = 0, g = 0;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + MD5_K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      const shift = MD5_S[i];
      B = (B + (((F << shift) | (F >>> (32 - shift))) >>> 0)) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }
  const out = new ArrayBuffer(16);
  const outView = new DataView(out);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return Array.from(new Uint8Array(out))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function executeSingleStep(input: string, step: PipelineStepConfig): Promise<string> {
  switch (step.operation) {
    case 'base64Decode':
      return decodeBase64Utf8(input);
    case 'base64Encode':
      return encodeBase64Utf8(input);
    case 'urlDecode':
      return decodeURIComponent(input.trim());
    case 'urlEncode':
      return encodeURIComponent(input);
    case 'jsonPrettify':
      return JSON.stringify(JSON.parse(input), null, 2);
    case 'jsonMinify':
      return JSON.stringify(JSON.parse(input));
    case 'jsonSortKeys':
      return JSON.stringify(sortJsonKeys(JSON.parse(input)), null, 2);
    case 'jsonFilterKeys':
      return JSON.stringify(filterJsonKeys(JSON.parse(input), step.arg), null, 2);
    case 'jwtExtractPayload': {
      const parts = input.trim().split('.');
      if (parts.length < 2) throw new Error('Invalid JWT format (missing payload segment)');
      return JSON.stringify(JSON.parse(decodeBase64Utf8(parts[1])), null, 2);
    }
    case 'sha256': {
      const data = new TextEncoder().encode(input);
      const buf = await self.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    case 'md5':
      return md5Hex(input);
    case 'trimLines':
      return input
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n');
    case 'dedupeLines':
      return Array.from(new Set(input.split('\n'))).join('\n');
    case 'sortLines':
      return input
        .split('\n')
        .sort((a, b) => a.localeCompare(b))
        .join('\n');
    case 'upperCase':
      return input.toUpperCase();
    case 'lowerCase':
      return input.toLowerCase();
  }
}

self.onmessage = async (event: MessageEvent<{ id: number; payload: PipelineWorkerRequest }>) => {
  const start = performance.now();
  const { id, payload } = event.data;
  const { input, steps } = payload;

  const traces: PipelineStepTrace[] = [];
  let current = input;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepStart = performance.now();
    try {
      current = await executeSingleStep(current, step);
      const stepElapsed = Math.max(0.05, performance.now() - stepStart);
      traces.push({
        stepId: step.id,
        operation: step.operation,
        durationMs: Number(stepElapsed.toFixed(2)),
        outputPreview: current.slice(0, 120),
      });
    } catch (err) {
      const result: PipelineWorkerResult = {
        success: false,
        finalOutput: current,
        traces,
        failedStepIndex: i + 1,
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage({
        id,
        ok: true,
        result,
        durationMs: performance.now() - start,
      });
      return;
    }
  }

  const result: PipelineWorkerResult = {
    success: true,
    finalOutput: current,
    traces,
  };

  self.postMessage({
    id,
    ok: true,
    result,
    durationMs: performance.now() - start,
  });
};
