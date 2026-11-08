/// <reference lib="webworker" />

export interface CryptoHashRequest {
  mode: 'hash';
  input: string;
  hmacKey: string;
  uppercase: boolean;
}

export interface CryptoUuidRequest {
  mode: 'uuid';
  count: number;
  hyphens: boolean;
  uppercase: boolean;
  braces: boolean;
}

export type CryptoWorkerRequest = CryptoHashRequest | CryptoUuidRequest;

export interface DigestEntry {
  algorithm: 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
  hex: string;
  base64: string;
  bits: number;
}

export interface CryptoWorkerResult {
  mode: 'hash' | 'uuid';
  digests?: DigestEntry[];
  uuids?: string[];
}

// Fast RFC 1321 MD5 implementation in pure TypeScript (zero dependencies)
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

function md5Bytes(inputBytes: Uint8Array): Uint8Array {
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
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(offset + j * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F = 0;
      let g = 0;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }

      F = (F + A + MD5_K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      const shift = MD5_S[i];
      const rotated = ((F << shift) | (F >>> (32 - shift))) >>> 0;
      B = (B + rotated) >>> 0;
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
  return new Uint8Array(out);
}

function hmacMd5Bytes(keyBytes: Uint8Array, messageBytes: Uint8Array): Uint8Array {
  const blockSize = 64;
  let k = keyBytes;
  if (k.length > blockSize) {
    k = md5Bytes(k);
  }
  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(k);

  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = paddedKey[i] ^ 0x5c;
    iKeyPad[i] = paddedKey[i] ^ 0x36;
  }

  const innerInput = new Uint8Array(blockSize + messageBytes.length);
  innerInput.set(iKeyPad);
  innerInput.set(messageBytes, blockSize);
  const innerHash = md5Bytes(innerInput);

  const outerInput = new Uint8Array(blockSize + innerHash.length);
  outerInput.set(oKeyPad);
  outerInput.set(innerHash, blockSize);
  return md5Bytes(outerInput);
}

function bytesToHex(bytes: Uint8Array, uppercase: boolean): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return uppercase ? hex.toUpperCase() : hex;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function computeWebCryptoDigest(
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512',
  msgBytes: Uint8Array,
  hmacKeyBytes: Uint8Array | null
): Promise<Uint8Array> {
  const safeMsg = new Uint8Array(msgBytes);
  if (hmacKeyBytes && hmacKeyBytes.length > 0) {
    const safeKey = new Uint8Array(hmacKeyBytes);
    const cryptoKey = await self.crypto.subtle.importKey(
      'raw',
      safeKey,
      { name: 'HMAC', hash: { name: algorithm } },
      false,
      ['sign']
    );
    const sig = await self.crypto.subtle.sign('HMAC', cryptoKey, safeMsg);
    return new Uint8Array(sig);
  }
  const digest = await self.crypto.subtle.digest(algorithm, safeMsg);
  return new Uint8Array(digest);
}

self.onmessage = async (event: MessageEvent<{ id: number; payload: CryptoWorkerRequest }>) => {
  const start = performance.now();
  const { id, payload } = event.data;

  try {
    if (payload.mode === 'uuid') {
      const safeCount = Math.min(10000, Math.max(1, payload.count));
      const uuids: string[] = new Array(safeCount);
      for (let i = 0; i < safeCount; i++) {
        let u: string = self.crypto.randomUUID();
        if (!payload.hyphens) {
          u = u.replace(/-/g, '');
        }
        if (payload.uppercase) {
          u = u.toUpperCase();
        }
        if (payload.braces) {
          u = `{${u}}`;
        }
        uuids[i] = u;
      }
      const result: CryptoWorkerResult = { mode: 'uuid', uuids };
      self.postMessage({ id, ok: true, result, durationMs: performance.now() - start });
      return;
    }

    const encoder = new TextEncoder();
    const msgBytes = encoder.encode(payload.input);
    const hmacKeyBytes = payload.hmacKey ? encoder.encode(payload.hmacKey) : null;

    const md5Raw =
      hmacKeyBytes && hmacKeyBytes.length > 0
        ? hmacMd5Bytes(hmacKeyBytes, msgBytes)
        : md5Bytes(msgBytes);

    const [sha1Raw, sha256Raw, sha384Raw, sha512Raw] = await Promise.all([
      computeWebCryptoDigest('SHA-1', msgBytes, hmacKeyBytes),
      computeWebCryptoDigest('SHA-256', msgBytes, hmacKeyBytes),
      computeWebCryptoDigest('SHA-384', msgBytes, hmacKeyBytes),
      computeWebCryptoDigest('SHA-512', msgBytes, hmacKeyBytes),
    ]);

    const digests: DigestEntry[] = [
      {
        algorithm: 'MD5',
        hex: bytesToHex(md5Raw, payload.uppercase),
        base64: bytesToBase64(md5Raw),
        bits: 128,
      },
      {
        algorithm: 'SHA-1',
        hex: bytesToHex(sha1Raw, payload.uppercase),
        base64: bytesToBase64(sha1Raw),
        bits: 160,
      },
      {
        algorithm: 'SHA-256',
        hex: bytesToHex(sha256Raw, payload.uppercase),
        base64: bytesToBase64(sha256Raw),
        bits: 256,
      },
      {
        algorithm: 'SHA-384',
        hex: bytesToHex(sha384Raw, payload.uppercase),
        base64: bytesToBase64(sha384Raw),
        bits: 384,
      },
      {
        algorithm: 'SHA-512',
        hex: bytesToHex(sha512Raw, payload.uppercase),
        base64: bytesToBase64(sha512Raw),
        bits: 512,
      },
    ];

    const result: CryptoWorkerResult = {
      mode: 'hash',
      digests,
    };

    self.postMessage({
      id,
      ok: true,
      result,
      durationMs: performance.now() - start,
    });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: performance.now() - start,
    });
  }
};
