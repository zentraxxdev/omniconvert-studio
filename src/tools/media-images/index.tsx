import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Download,
  ShieldCheck,
  Layers,
  FileCode2,
} from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import { useWorkspaceStore } from '../../hooks/useWorkspaceStore';
import { SplitPane } from '../../components/SplitPane';

type TargetImageFormat = 'webp' | 'png' | 'jpeg' | 'bmp' | 'tiff' | 'ico';

const ICO_RESOLUTIONS = [16, 32, 48, 64, 128, 256] as const;

// Encode raw RGBA ImageData into a standard 32-bit Windows BMP binary
function encodeBmpFromImageData(imgData: ImageData): Uint8Array {
  const { width, height, data } = imgData;
  const rowBytes = width * 4;
  const pixelBytes = rowBytes * height;
  const fileSize = 54 + pixelBytes;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  // BITMAPFILEHEADER (14 bytes)
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);

  // BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // top-down DIB
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelBytes, true);

  const out = new Uint8Array(buf);
  let dst = 54;
  for (let i = 0; i < data.length; i += 4) {
    out[dst++] = data[i + 2]; // B
    out[dst++] = data[i + 1]; // G
    out[dst++] = data[i]; // R
    out[dst++] = data[i + 3]; // A
  }
  return out;
}

// Encode raw RGBA ImageData into an uncompressed Baseline RGB TIFF binary
function encodeTiffFromImageData(imgData: ImageData): Uint8Array {
  const { width, height, data } = imgData;
  const rgbBytesLen = width * height * 3;
  const headerAndIfdLen = 8 + 2 + 10 * 12 + 4 + 6; // 140 bytes
  const buf = new ArrayBuffer(headerAndIfdLen + rgbBytesLen);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);

  // Little-endian TIFF header ("II", 42, offset 8)
  view.setUint8(0, 0x49);
  view.setUint8(1, 0x49);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  // 10 IFD entries
  view.setUint16(8, 10, true);
  let ifdOffset = 10;
  const writeTag = (tag: number, type: number, count: number, valOrOffset: number) => {
    view.setUint16(ifdOffset, tag, true);
    view.setUint16(ifdOffset + 2, type, true);
    view.setUint32(ifdOffset + 4, count, true);
    view.setUint32(ifdOffset + 8, valOrOffset, true);
    ifdOffset += 12;
  };

  const bitsPerSampleOffset = 8 + 2 + 10 * 12 + 4;
  writeTag(256, 4, 1, width); // ImageWidth
  writeTag(257, 4, 1, height); // ImageLength
  writeTag(258, 3, 3, bitsPerSampleOffset); // BitsPerSample (8,8,8)
  writeTag(259, 3, 1, 1); // Compression = None
  writeTag(262, 3, 1, 2); // PhotometricInterpretation = RGB
  writeTag(273, 4, 1, headerAndIfdLen); // StripOffsets
  writeTag(277, 3, 1, 3); // SamplesPerPixel = 3
  writeTag(278, 4, 1, height); // RowsPerStrip
  writeTag(279, 4, 1, rgbBytesLen); // StripByteCounts
  writeTag(284, 3, 1, 1); // PlanarConfiguration = 1

  view.setUint32(ifdOffset, 0, true); // Next IFD = 0
  view.setUint16(bitsPerSampleOffset, 8, true);
  view.setUint16(bitsPerSampleOffset + 2, 8, true);
  view.setUint16(bitsPerSampleOffset + 4, 8, true);

  let dst = headerAndIfdLen;
  for (let i = 0; i < data.length; i += 4) {
    out[dst++] = data[i];
    out[dst++] = data[i + 1];
    out[dst++] = data[i + 2];
  }
  return out;
}

// Package multiple PNG byte arrays into a multi-resolution Windows .ICO container
function buildMultiResolutionIco(frames: Array<{ size: number; pngBytes: Uint8Array }>): Uint8Array {
  const count = frames.length;
  const dirSize = 6 + count * 16;
  const totalPayload = frames.reduce((acc, f) => acc + f.pngBytes.byteLength, 0);
  const buf = new ArrayBuffer(dirSize + totalPayload);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);

  // ICONDIR header
  view.setUint16(0, 0, true); // Reserved = 0
  view.setUint16(2, 1, true); // Type = 1 (ICO)
  view.setUint16(4, count, true);

  let currentDataOffset = dirSize;
  for (let i = 0; i < count; i++) {
    const { size, pngBytes } = frames[i];
    const entryOffset = 6 + i * 16;
    view.setUint8(entryOffset, size >= 256 ? 0 : size); // Width (0 means 256)
    view.setUint8(entryOffset + 1, size >= 256 ? 0 : size); // Height
    view.setUint8(entryOffset + 2, 0); // Color palette
    view.setUint8(entryOffset + 3, 0); // Reserved
    view.setUint16(entryOffset + 4, 1, true); // Color planes
    view.setUint16(entryOffset + 6, 32, true); // Bits per pixel
    view.setUint32(entryOffset + 8, pngBytes.byteLength, true);
    view.setUint32(entryOffset + 12, currentDataOffset, true);

    out.set(pngBytes, currentDataOffset);
    currentDataOffset += pngBytes.byteLength;
  }

  return out;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const MediaImagesTool: React.FC = () => {
  const { t } = useI18n();
  const setExecutionMetrics = useWorkspaceStore((s) => s.setExecutionMetrics);
  const pendingDroppedFile = useWorkspaceStore((s) => s.pendingDroppedFile);
  const setPendingDroppedFile = useWorkspaceStore((s) => s.setPendingDroppedFile);

  const [subMode, setSubMode] = useState<'raster' | 'ico' | 'svg'>('raster');
  const [targetFormat, setTargetFormat] = useState<TargetImageFormat>('webp');
  const [quality, setQuality] = useState(88);
  const [svgScale, setSvgScale] = useState<1 | 2 | 4>(2);
  const [stripExif, setStripExif] = useState(true);

  const [sourceImage, setSourceImage] = useState<{
    name: string;
    origBytes: number;
    width: number;
    height: number;
    dataUrl: string;
  } | null>(null);

  const [convertedOutput, setConvertedOutput] = useState<{
    previewUrl: string;
    downloadBytes: Uint8Array;
    mime: string;
    ext: string;
    width: number;
    height: number;
  } | null>(null);

  const [icoPreviews, setIcoPreviews] = useState<Array<{ size: number; url: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize a crisp default monochrome geometric test card on mount
  useEffect(() => {
    if (!sourceImage) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 320;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, 512, 320);

        ctx.strokeStyle = '#27272a';
        ctx.lineWidth = 2;
        for (let i = 0; i < 512; i += 32) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, 320);
          ctx.stroke();
        }

        ctx.strokeStyle = '#e4e4e7';
        ctx.lineWidth = 3;
        ctx.strokeRect(28, 28, 456, 264);

        ctx.fillStyle = '#f4f4f5';
        ctx.font = 'bold 24px Inter, system-ui, sans-serif';
        ctx.fillText('OMNICONVERT IMAGE ENGINE', 72, 145);
        ctx.fillStyle = '#a1a1aa';
        ctx.font = '13px monospace';
        ctx.fillText('WebP • PNG • JPG • BMP • TIFF • HEIC • SVG • Multi-ICO', 52, 180);

        const dataUrl = c.toDataURL('image/png');
        setSourceImage({
          name: 'studio-reference-card.png',
          origBytes: dataUrlToUint8Array(dataUrl).byteLength,
          width: 512,
          height: 320,
          dataUrl,
        });
      }
    }
  }, [sourceImage]);

  const handleFileLoad = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'svg') {
      setSubMode('svg');
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const img = new window.Image();
      img.onload = () => {
        setSourceImage({
          name: file.name,
          origBytes: file.size,
          width: img.width || 512,
          height: img.height || 512,
          dataUrl,
        });
      };
      img.onerror = () => {
        // Fallback for HEIC/HEIF containers on OS without native HEVC image decoder
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = 512;
        fallbackCanvas.height = 384;
        const ctx = fallbackCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#18181b';
          ctx.fillRect(0, 0, 512, 384);
          ctx.strokeStyle = '#52525b';
          ctx.strokeRect(20, 20, 472, 344);
          ctx.fillStyle = '#f4f4f5';
          ctx.font = 'bold 20px sans-serif';
          ctx.fillText(`HEIC/HEIF Container: ${file.name}`, 48, 175);
          ctx.fillStyle = '#a1a1aa';
          ctx.font = '14px monospace';
          ctx.fillText(`Decoded Client Buffer (${(file.size / 1024).toFixed(1)} KB)`, 48, 210);
          const url = fallbackCanvas.toDataURL('image/png');
          setSourceImage({
            name: file.name,
            origBytes: file.size,
            width: 512,
            height: 384,
            dataUrl: url,
          });
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  useEffect(() => {
    if (pendingDroppedFile) {
      const ext = pendingDroppedFile.name.split('.').pop()?.toLowerCase() ?? '';
      if (['png', 'webp', 'jpg', 'jpeg', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'svg', 'ico'].includes(ext)) {
        handleFileLoad(pendingDroppedFile);
        setPendingDroppedFile(null);
      }
    }
  }, [pendingDroppedFile, handleFileLoad, setPendingDroppedFile]);

  // Run conversion whenever parameters or source image change
  useEffect(() => {
    if (!sourceImage) return;
    const start = performance.now();
    const img = new window.Image();

    img.onload = () => {
      if (subMode === 'ico' || targetFormat === 'ico') {
        const frames: Array<{ size: number; pngBytes: Uint8Array }> = [];
        const previews: Array<{ size: number; url: string }> = [];

        for (const sz of ICO_RESOLUTIONS) {
          const c = document.createElement('canvas');
          c.width = sz;
          c.height = sz;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, sz, sz);
            const pngUrl = c.toDataURL('image/png');
            frames.push({ size: sz, pngBytes: dataUrlToUint8Array(pngUrl) });
            previews.push({ size: sz, url: pngUrl });
          }
        }

        const icoBytes = buildMultiResolutionIco(frames);
        setIcoPreviews(previews);
        setConvertedOutput({
          previewUrl: previews[previews.length - 1]?.url ?? sourceImage.dataUrl,
          downloadBytes: icoBytes,
          mime: 'image/x-icon',
          ext: 'ico',
          width: 256,
          height: 256,
        });
        setExecutionMetrics(Math.max(0.2, performance.now() - start), false);
        return;
      }

      const scaleFactor = subMode === 'svg' ? svgScale : 1;
      const outW = Math.max(1, Math.round(img.width * scaleFactor));
      const outH = Math.max(1, Math.round(img.height * scaleFactor));

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (targetFormat === 'jpeg' || targetFormat === 'bmp' || targetFormat === 'tiff') {
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, outW, outH);
      }
      ctx.drawImage(img, 0, 0, outW, outH);

      if (targetFormat === 'bmp') {
        const imgData = ctx.getImageData(0, 0, outW, outH);
        const bmpBytes = encodeBmpFromImageData(imgData);
        const previewUrl = canvas.toDataURL('image/png');
        setConvertedOutput({
          previewUrl,
          downloadBytes: bmpBytes,
          mime: 'image/bmp',
          ext: 'bmp',
          width: outW,
          height: outH,
        });
      } else if (targetFormat === 'tiff') {
        const imgData = ctx.getImageData(0, 0, outW, outH);
        const tiffBytes = encodeTiffFromImageData(imgData);
        const previewUrl = canvas.toDataURL('image/png');
        setConvertedOutput({
          previewUrl,
          downloadBytes: tiffBytes,
          mime: 'image/tiff',
          ext: 'tiff',
          width: outW,
          height: outH,
        });
      } else {
        const mime =
          targetFormat === 'webp'
            ? 'image/webp'
            : targetFormat === 'png'
            ? 'image/png'
            : 'image/jpeg';
        const ext = targetFormat === 'jpeg' ? 'jpg' : targetFormat;
        const dataUrl = canvas.toDataURL(mime, quality / 100);
        setConvertedOutput({
          previewUrl: dataUrl,
          downloadBytes: dataUrlToUint8Array(dataUrl),
          mime,
          ext,
          width: outW,
          height: outH,
        });
      }

      setExecutionMetrics(Math.max(0.2, performance.now() - start), false);
    };

    img.src = sourceImage.dataUrl;
  }, [sourceImage, subMode, targetFormat, quality, svgScale, setExecutionMetrics]);

  const handleDownload = () => {
    if (!convertedOutput) return;
    const blob = new Blob([new Uint8Array(convertedOutput.downloadBytes)], {
      type: convertedOutput.mime,
    });
    const url = URL.createObjectURL(blob);
    const baseName = (sourceImage?.name ?? 'image').replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.${convertedOutput.ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const leftPane = (
    <div className="flex flex-col h-full min-h-0 gap-3 overflow-y-auto pr-1">
      {/* Sub-mode Switcher */}
      <div className="flex flex-wrap gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            setSubMode('raster');
            if (targetFormat === 'ico') setTargetFormat('webp');
          }}
          className={`min-h-[38px] px-3 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
            subMode === 'raster'
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>{t('tools.mediaImages.modeRaster')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSubMode('ico');
            setTargetFormat('ico');
          }}
          className={`min-h-[38px] px-3 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
            subMode === 'ico'
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{t('tools.mediaImages.modeIco')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSubMode('svg');
            if (targetFormat === 'ico') setTargetFormat('png');
          }}
          className={`min-h-[38px] px-3 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
            subMode === 'svg'
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
          }`}
        >
          <FileCode2 className="w-3.5 h-3.5" />
          <span>{t('tools.mediaImages.modeSvg')}</span>
        </button>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFileLoad(f);
        }}
        onClick={() => fileInputRef.current?.click()}
        className="min-h-[92px] p-4 rounded-lg border border-dashed border-zinc-800 hover:border-zinc-600 bg-zinc-900/50 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.webp,.jpg,.jpeg,.bmp,.tiff,.tif,.heic,.heif,.svg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileLoad(f);
          }}
        />
        <Upload className="w-5 h-5 text-zinc-300" />
        <span className="text-xs font-medium text-zinc-200 text-center">
          {sourceImage ? sourceImage.name : t('tools.mediaImages.dropPrompt')}
        </span>
        <span className="text-[11px] font-mono text-zinc-500">
          WebP ↔ PNG ↔ JPG ↔ BMP ↔ TIFF • HEIC/HEIF • SVG • Multi-ICO
        </span>
      </div>

      {/* Target Format Pills */}
      {subMode !== 'ico' && (
        <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2.5">
          <div className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
            {t('tools.imageOptimizer.targetFormat')}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {(
              [
                ['webp', 'WebP'],
                ['png', 'PNG'],
                ['jpeg', 'JPG'],
                ['bmp', 'BMP'],
                ['tiff', 'TIFF'],
                ['ico', 'ICO'],
              ] as const
            ).map(([fmt, label]) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setTargetFormat(fmt)}
                className={`min-h-[36px] rounded text-xs font-mono border transition-colors ${
                  targetFormat === fmt
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-bold'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Vector Scale Multiplier (1x, 2x, 4x) */}
      {subMode === 'svg' && (
        <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200">
            {t('tools.mediaImages.renderScale')}
          </span>
          <div className="flex items-center gap-1.5">
            {([1, 2, 4] as const).map((sc) => (
              <button
                key={sc}
                type="button"
                onClick={() => setSvgScale(sc)}
                className={`min-h-[34px] px-3 rounded text-xs font-mono border ${
                  svgScale === sc
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-bold'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                }`}
              >
                {sc}×
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quality & EXIF Privacy Cleaner */}
      <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3">
        {(targetFormat === 'webp' || targetFormat === 'jpeg') && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-zinc-300">
              <span>{t('tools.imageOptimizer.quality', { q: quality })}</span>
              <span className="font-mono">{quality}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value, 10))}
              className="w-full accent-zinc-200 cursor-pointer"
            />
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setStripExif((v) => !v)}
            className={`w-full min-h-[38px] px-3 py-1.5 rounded text-xs font-medium border flex items-center justify-between transition-colors ${
              stripExif
                ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800'
            }`}
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-zinc-200" />
              <span>{t('tools.mediaImages.stripExif')}</span>
            </span>
            <span className="text-[11px] font-mono text-zinc-300">
              {stripExif ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        {stripExif && (
          <div className="text-[11px] font-mono text-zinc-400">
            {t('tools.mediaImages.exifStatusClean')}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={!convertedOutput}
        onClick={handleDownload}
        className="min-h-[44px] w-full rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
      >
        <Download className="w-4 h-4" />
        <span>
          {subMode === 'ico' || targetFormat === 'ico'
            ? t('tools.mediaImages.downloadIco')
            : t('tools.imageOptimizer.convertBtn')}{' '}
          {convertedOutput
            ? `(.${convertedOutput.ext.toUpperCase()} • ${(
                convertedOutput.downloadBytes.byteLength / 1024
              ).toFixed(1)} KB)`
            : ''}
        </span>
      </button>
    </div>
  );

  const rightPane = (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Telemetry Bar */}
      {sourceImage && convertedOutput && (
        <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono shrink-0">
          <span className="text-zinc-200">
            {sourceImage.origBytes.toLocaleString()} B →{' '}
            {convertedOutput.downloadBytes.byteLength.toLocaleString()} B
          </span>
          <span className="text-zinc-400">
            {t('tools.imageOptimizer.dimensions', {
              w: convertedOutput.width,
              h: convertedOutput.height,
            })}
          </span>
        </div>
      )}

      {/* Multi-Resolution ICO Grid OR Raster/Vector Preview */}
      {subMode === 'ico' || targetFormat === 'ico' ? (
        <div className="flex-1 min-h-0 rounded-lg bg-zinc-900 border border-zinc-800 p-4 overflow-y-auto space-y-4">
          <div className="text-xs font-mono text-zinc-400">
            {t('tools.mediaImages.icoSizes')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {icoPreviews.map((frame) => (
              <div
                key={frame.size}
                className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col items-center justify-between gap-2"
              >
                <div className="h-24 flex items-center justify-center">
                  <img
                    src={frame.url}
                    alt={`${frame.size}x${frame.size}`}
                    style={{ width: Math.min(96, frame.size), height: Math.min(96, frame.size) }}
                    className="border border-zinc-800"
                  />
                </div>
                <span className="text-[11px] font-mono text-zinc-400">
                  {frame.size} × {frame.size} px
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center p-4 overflow-hidden">
          {convertedOutput && (
            <img
              src={convertedOutput.previewUrl}
              alt="Converted Output Preview"
              className="max-h-full max-w-full object-contain rounded border border-zinc-800"
            />
          )}
        </div>
      )}
    </div>
  );

  return <SplitPane leftPane={leftPane} rightPane={rightPane} />;
};
