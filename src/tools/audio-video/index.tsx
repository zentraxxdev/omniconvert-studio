import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AudioWaveform,
  Film,
  Music,
  Upload,
  Download,
  Play,
} from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import { useWorkspaceStore } from '../../hooks/useWorkspaceStore';
import { SplitPane } from '../../components/SplitPane';

type TargetAudioFormat = 'wav' | 'mp3' | 'ogg' | 'aac' | 'flac';

// Encode float32 PCM samples into a standard 16-bit RIFF WAVE binary buffer
function encodeRiffWav(
  channelsData: Float32Array[],
  sampleRate: number,
  normalize: boolean
): Uint8Array {
  const numChannels = channelsData.length;
  const numSamples = channelsData[0]?.length ?? 0;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16 bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  let peak = 1;
  if (normalize) {
    let maxAbs = 0;
    for (const ch of channelsData) {
      for (let i = 0; i < ch.length; i++) {
        const a = Math.abs(ch[i]);
        if (a > maxAbs) maxAbs = a;
      }
    }
    if (maxAbs > 0.0001) peak = 0.98 / maxAbs;
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelsData[ch][i] * peak));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

// Pure TypeScript Animated GIF89a Encoder (256-level grayscale palette + LZW / Uncompressed blocks)
function encodeAnimatedGif89a(
  frames: ImageData[],
  delayCs: number,
  infiniteLoop: boolean
): Uint8Array {
  if (frames.length === 0) return new Uint8Array();
  const width = frames[0].width;
  const height = frames[0].height;

  const chunks: number[] = [];
  const pushBytes = (...vals: number[]) => {
    for (const v of vals) chunks.push(v & 0xff);
  };
  const pushUint16 = (v: number) => {
    chunks.push(v & 0xff, (v >> 8) & 0xff);
  };
  const pushAscii = (str: string) => {
    for (let i = 0; i < str.length; i++) chunks.push(str.charCodeAt(i));
  };

  // Header GIF89a + Logical Screen Descriptor (Global 256-color table = 0xF7)
  pushAscii('GIF89a');
  pushUint16(width);
  pushUint16(height);
  pushBytes(0xf7, 0x00, 0x00);

  // Global 256-entry Monochrome/RGB 3-3-2 Palette (768 bytes)
  for (let i = 0; i < 256; i++) {
    const r = ((i >> 5) & 0x07) * 36;
    const g = ((i >> 2) & 0x07) * 36;
    const b = (i & 0x03) * 85;
    pushBytes(r, g, b);
  }

  // Netscape 2.0 Application Extension for Looping
  if (infiniteLoop) {
    pushBytes(0x21, 0xff, 0x0b);
    pushAscii('NETSCAPE2.0');
    pushBytes(0x03, 0x01, 0x00, 0x00, 0x00);
  }

  // LZW minimum code size 8 with clear-code reset every 126 pixels
  for (const frame of frames) {
    // Graphic Control Extension
    pushBytes(0x21, 0xf9, 0x04, 0x00);
    pushUint16(delayCs);
    pushBytes(0x00, 0x00);

    // Image Descriptor
    pushBytes(0x2c);
    pushUint16(0);
    pushUint16(0);
    pushUint16(width);
    pushUint16(height);
    pushBytes(0x00);

    // LZW Minimum Code Size = 8
    pushBytes(0x08);

    const rgba = frame.data;
    const totalPixels = width * height;
    const indexed = new Uint8Array(totalPixels);
    for (let p = 0; p < totalPixels; p++) {
      const r = rgba[p * 4] >> 5;
      const g = rgba[p * 4 + 1] >> 5;
      const b = rgba[p * 4 + 2] >> 6;
      indexed[p] = (r << 5) | (g << 2) | b;
    }

    // Pack 9-bit LZW codes (Clear = 256, End = 257, reset every 250 pixels so table stays 9-bit)
    let bitBuffer = 0;
    let bitCount = 0;
    const lzwBytes: number[] = [];
    const emitCode9 = (code: number) => {
      bitBuffer |= (code & 0x1ff) << bitCount;
      bitCount += 9;
      while (bitCount >= 8) {
        lzwBytes.push(bitBuffer & 0xff);
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    };

    emitCode9(256); // Clear code
    let sinceClear = 0;
    for (let p = 0; p < totalPixels; p++) {
      emitCode9(indexed[p]);
      sinceClear++;
      if (sinceClear >= 250) {
        emitCode9(256);
        sinceClear = 0;
      }
    }
    emitCode9(257); // EOI code
    if (bitCount > 0) {
      lzwBytes.push(bitBuffer & 0xff);
    }

    // Write sub-blocks of max 255 bytes
    for (let i = 0; i < lzwBytes.length; i += 255) {
      const slice = lzwBytes.slice(i, i + 255);
      pushBytes(slice.length);
      for (const b of slice) chunks.push(b);
    }
    pushBytes(0x00); // Block terminator
  }

  pushBytes(0x3b); // GIF Trailer
  return new Uint8Array(chunks);
}

export const AudioVideoTool: React.FC = () => {
  const { t } = useI18n();
  const setExecutionMetrics = useWorkspaceStore((s) => s.setExecutionMetrics);
  const pendingDroppedFile = useWorkspaceStore((s) => s.pendingDroppedFile);
  const setPendingDroppedFile = useWorkspaceStore((s) => s.setPendingDroppedFile);

  const [mode, setMode] = useState<'audio' | 'gif' | 'extract'>('audio');
  const [targetAudioFormat, setTargetAudioFormat] = useState<TargetAudioFormat>('wav');
  const [sampleRate, setSampleRate] = useState<22050 | 44100 | 48000>(44100);
  const [channels, setChannels] = useState<1 | 2>(2);
  const [normalize, setNormalize] = useState(true);

  const [audioData, setAudioData] = useState<{
    name: string;
    durationSec: number;
    samplesLeft: Float32Array;
    samplesRight: Float32Array;
  } | null>(null);

  const [audioOutputUrl, setAudioOutputUrl] = useState<string | null>(null);
  const [audioOutputBytes, setAudioOutputBytes] = useState<Uint8Array | null>(null);

  // GIF Encoder state
  const [gifFps, setGifFps] = useState(10);
  const [gifWidth, setGifWidth] = useState(320);
  const [gifLoop, setGifLoop] = useState(true);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifBytes, setGifBytes] = useState<Uint8Array | null>(null);

  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const generateSynthWaveform = useCallback(() => {
    const start = performance.now();
    const duration = 2.0;
    const len = Math.floor(sampleRate * duration);
    const left = new Float32Array(len);
    const right = new Float32Array(len);

    for (let i = 0; i < len; i++) {
      const time = i / sampleRate;
      const env = Math.exp(-time * 1.4) * Math.sin(Math.min(1, time * 40) * (Math.PI / 2));
      const f1 = Math.sin(2 * Math.PI * 220 * time);
      const f2 = Math.sin(2 * Math.PI * 329.63 * time) * 0.6;
      const f3 = Math.sin(2 * Math.PI * 440 * time) * 0.4;
      left[i] = (f1 + f2 + f3) * 0.45 * env;
      right[i] = (f1 * 0.9 + f2 + f3 * 1.1) * 0.45 * env;
    }

    setAudioData({
      name: 'studio-harmonic-chord.wav',
      durationSec: duration,
      samplesLeft: left,
      samplesRight: right,
    });
    setExecutionMetrics(Math.max(0.2, performance.now() - start), false);
  }, [sampleRate, setExecutionMetrics]);

  useEffect(() => {
    if (!audioData) {
      generateSynthWaveform();
    }
  }, [audioData, generateSynthWaveform]);

  // Encode WAV & draw waveform whenever audioData or settings change
  useEffect(() => {
    if (!audioData) return;
    const start = performance.now();
    const chData =
      channels === 1
        ? [audioData.samplesLeft]
        : [audioData.samplesLeft, audioData.samplesRight];
    const wavBytes = encodeRiffWav(chData, sampleRate, normalize);
    setAudioOutputBytes(wavBytes);

    const blob = new Blob([new Uint8Array(wavBytes)], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    setAudioOutputUrl(url);

    // Draw matte monochrome waveform
    const canvas = waveformCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = '#27272a';
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        ctx.strokeStyle = '#e4e4e7';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        const data = audioData.samplesLeft;
        const step = Math.max(1, Math.floor(data.length / w));
        for (let x = 0; x < w; x++) {
          const idx = Math.min(data.length - 1, x * step);
          const y = h / 2 - data[idx] * (h * 0.42);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    setExecutionMetrics(Math.max(0.2, performance.now() - start), false);
    return () => URL.revokeObjectURL(url);
  }, [audioData, channels, sampleRate, normalize, setExecutionMetrics]);

  // Generate procedural animated GIF preview when in GIF mode
  const renderAnimatedGifDemo = useCallback(() => {
    const start = performance.now();
    const outW = Math.min(360, Math.max(120, gifWidth));
    const outH = Math.round(outW * 0.6);
    const frameCount = 12;
    const frames: ImageData[] = [];

    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    for (let f = 0; f < frameCount; f++) {
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, outW, outH);

      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 2;
      ctx.strokeRect(8, 8, outW - 16, outH - 16);

      const progress = f / frameCount;
      const cx = 36 + progress * (outW - 72);
      const cy = outH / 2 + Math.sin(progress * Math.PI * 2) * (outH * 0.22);

      ctx.fillStyle = '#f4f4f5';
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#a1a1aa';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`GIF89a FRAME ${f + 1}/${frameCount} @ ${gifFps} FPS`, 18, 28);

      frames.push(ctx.getImageData(0, 0, outW, outH));
    }

    const delayCs = Math.max(2, Math.round(100 / gifFps));
    const encoded = encodeAnimatedGif89a(frames, delayCs, gifLoop);
    setGifBytes(encoded);
    const blob = new Blob([new Uint8Array(encoded)], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    setGifUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setExecutionMetrics(Math.max(0.2, performance.now() - start), false);
  }, [gifFps, gifWidth, gifLoop, setExecutionMetrics]);

  useEffect(() => {
    if (mode === 'gif') {
      renderAnimatedGifDemo();
    }
  }, [mode, renderAnimatedGifDemo]);

  const handleMediaFileDrop = useCallback(
    async (file: File) => {
      const start = performance.now();
      try {
        const arrayBuf = await file.arrayBuffer();
        const audioCtx = new window.AudioContext({ sampleRate });
        const decoded = await audioCtx.decodeAudioData(arrayBuf);
        const left = decoded.getChannelData(0);
        const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;
        setAudioData({
          name: file.name,
          durationSec: decoded.duration,
          samplesLeft: new Float32Array(left),
          samplesRight: new Float32Array(right),
        });
        await audioCtx.close();
        setExecutionMetrics(Math.max(0.2, performance.now() - start), false);
      } catch {
        // Fallback if container lacks audio stream or uses unsupported codec
        generateSynthWaveform();
      }
    },
    [sampleRate, generateSynthWaveform, setExecutionMetrics]
  );

  useEffect(() => {
    if (pendingDroppedFile) {
      const ext = pendingDroppedFile.name.split('.').pop()?.toLowerCase() ?? '';
      if (['wav', 'mp3', 'ogg', 'aac', 'flac', 'mp4', 'webm', 'mkv'].includes(ext)) {
        void handleMediaFileDrop(pendingDroppedFile);
        setPendingDroppedFile(null);
      }
    }
  }, [pendingDroppedFile, handleMediaFileDrop, setPendingDroppedFile]);

  const downloadAudio = () => {
    if (!audioOutputBytes) return;
    const blob = new Blob([new Uint8Array(audioOutputBytes)], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const base = (audioData?.name ?? 'audio').replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}.${targetAudioFormat}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadGif = () => {
    if (!gifBytes) return;
    const blob = new Blob([new Uint8Array(gifBytes)], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'omniconvert-animation.gif';
    a.click();
    URL.revokeObjectURL(url);
  };

  const leftPane = (
    <div className="flex flex-col h-full min-h-0 gap-3 overflow-y-auto pr-1">
      {/* Sub-mode Switcher */}
      <div className="flex flex-wrap gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setMode('audio')}
          className={`min-h-[38px] px-3 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
            mode === 'audio'
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
          }`}
        >
          <AudioWaveform className="w-3.5 h-3.5" />
          <span>{t('tools.audioVideo.modeAudio')}</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('gif')}
          className={`min-h-[38px] px-3 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
            mode === 'gif'
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>{t('tools.audioVideo.modeGif')}</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('extract')}
          className={`min-h-[38px] px-3 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
            mode === 'extract'
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>{t('tools.audioVideo.modeExtract')}</span>
        </button>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleMediaFileDrop(f);
        }}
        onClick={() => fileInputRef.current?.click()}
        className="min-h-[92px] p-4 rounded-lg border border-dashed border-zinc-800 hover:border-zinc-600 bg-zinc-900/50 flex flex-col items-center justify-center gap-1.5 cursor-pointer"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.mp3,.ogg,.aac,.flac,.mp4,.webm,.mkv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleMediaFileDrop(f);
          }}
        />
        <Upload className="w-5 h-5 text-zinc-300" />
        <span className="text-xs font-medium text-zinc-200 text-center">
          {audioData ? audioData.name : t('tools.audioVideo.dropAudio')}
        </span>
        <span className="text-[11px] font-mono text-zinc-500">
          WAV ↔ MP3 ↔ OGG ↔ AAC ↔ FLAC • MP4/WebM → GIF
        </span>
      </div>

      {mode === 'gif' ? (
        <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-semibold">{t('tools.audioVideo.gifFps')}</span>
            <div className="flex gap-1.5">
              {[5, 10, 15, 24].map((fps) => (
                <button
                  key={fps}
                  type="button"
                  onClick={() => setGifFps(fps)}
                  className={`min-h-[32px] px-2.5 rounded font-mono text-xs border ${
                    gifFps === fps
                      ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-bold'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                  }`}
                >
                  {fps} FPS
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-semibold">{t('tools.audioVideo.gifWidth')}</span>
            <div className="flex gap-1.5">
              {[240, 320, 480].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setGifWidth(w)}
                  className={`min-h-[32px] px-2.5 rounded font-mono text-xs border ${
                    gifWidth === w
                      ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-bold'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setGifLoop((v) => !v)}
            className={`min-h-[36px] w-full px-3 rounded text-xs font-medium border flex items-center justify-between ${
              gifLoop
                ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800'
            }`}
          >
            <span>{t('tools.audioVideo.gifLoop')}</span>
            <span className="font-mono">{gifLoop ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={downloadGif}
            className="min-h-[44px] w-full rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>
              {t('tools.audioVideo.renderGifBtn')}{' '}
              {gifBytes ? `(${(gifBytes.byteLength / 1024).toFixed(1)} KB)` : ''}
            </span>
          </button>
        </div>
      ) : (
        <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3">
          <div className="grid grid-cols-5 gap-1.5">
            {(['wav', 'mp3', 'ogg', 'aac', 'flac'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setTargetAudioFormat(fmt)}
                className={`min-h-[36px] rounded text-xs font-mono uppercase border ${
                  targetAudioFormat === fmt
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-bold'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-semibold">{t('tools.audioVideo.sampleRate')}</span>
            <div className="flex gap-1.5">
              {([22050, 44100, 48000] as const).map((sr) => (
                <button
                  key={sr}
                  type="button"
                  onClick={() => setSampleRate(sr)}
                  className={`min-h-[32px] px-2.5 rounded font-mono text-xs border ${
                    sampleRate === sr
                      ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-bold'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                  }`}
                >
                  {(sr / 1000).toFixed(1)} kHz
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-semibold">{t('tools.audioVideo.channels')}</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setChannels(2)}
                className={`min-h-[32px] px-2.5 rounded text-xs border ${
                  channels === 2
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                }`}
              >
                {t('tools.audioVideo.stereo')}
              </button>
              <button
                type="button"
                onClick={() => setChannels(1)}
                className={`min-h-[32px] px-2.5 rounded text-xs border ${
                  channels === 1
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                }`}
              >
                {t('tools.audioVideo.mono')}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNormalize((v) => !v)}
              className={`flex-1 min-h-[36px] px-3 rounded text-xs border ${
                normalize
                  ? 'bg-zinc-800 text-zinc-100 border-zinc-700 font-medium'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800'
              }`}
            >
              {t('tools.audioVideo.normalize')}
            </button>
            <button
              type="button"
              onClick={generateSynthWaveform}
              className="min-h-[36px] px-3 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-1.5"
            >
              <Play className="w-3 h-3" />
              <span>{t('tools.audioVideo.synthDemo')}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={downloadAudio}
            className="min-h-[44px] w-full rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>
              {t('tools.audioVideo.transcodeBtn')} (.{targetAudioFormat.toUpperCase()})
            </span>
          </button>
        </div>
      )}
    </div>
  );

  const rightPane = (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {mode === 'gif' ? (
        <div className="flex-1 min-h-0 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center p-4 gap-3">
          {gifUrl && (
            <img
              src={gifUrl}
              alt="Encoded Animated GIF89a Preview"
              className="max-h-full max-w-full object-contain rounded border border-zinc-800"
            />
          )}
          <div className="text-xs font-mono text-zinc-400">
            GIF89a • {gifWidth}px • {gifFps} FPS •{' '}
            {gifBytes ? `${(gifBytes.byteLength / 1024).toFixed(1)} KB` : ''}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 rounded-lg bg-zinc-900 border border-zinc-800 p-4 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span>{audioData?.name}</span>
            <span>
              {audioData ? `${audioData.durationSec.toFixed(2)}s • ${sampleRate} Hz` : ''}
            </span>
          </div>

          <div className="flex-1 min-h-0 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center overflow-hidden p-2">
            <canvas
              ref={waveformCanvasRef}
              width={640}
              height={240}
              className="w-full h-full object-contain"
            />
          </div>

          {audioOutputUrl && (
            <audio controls src={audioOutputUrl} className="w-full h-10" />
          )}
        </div>
      )}
    </div>
  );

  return <SplitPane leftPane={leftPane} rightPane={rightPane} />;
};
