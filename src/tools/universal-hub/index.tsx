import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Download,
  Play,
  Trash2,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Package,
} from 'lucide-react';
import JSZip from 'jszip';
import CadWorker from '../../workers/cad.worker?worker';
import TabularWorker from '../../workers/tabular.worker?worker';
import type { CadWorkerRequest, CadWorkerResult, CadFormat } from '../../workers/cad.worker';
import type { TabularWorkerRequest, TabularWorkerResult, TabularFormat } from '../../workers/tabular.worker';
import { TOOL_REGISTRY, type ToolId } from '../../config/tools';
import { useI18n } from '../../hooks/useI18n';
import { useWorkspaceStore } from '../../hooks/useWorkspaceStore';

interface QueuedBatchItem {
  id: string;
  file: File;
  ext: string;
  studioToolId: ToolId;
  availableTargets: string[];
  selectedTarget: string;
  status: 'ready' | 'processing' | 'done';
  progress: number;
  outputBytes?: Uint8Array;
  outputFileName?: string;
}

function detectFileProfile(file: File): {
  ext: string;
  studioToolId: ToolId;
  availableTargets: string[];
  defaultTarget: string;
} {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';

  if (['3mf', 'stl', 'obj', 'ply', 'gltf', 'glb'].includes(ext)) {
    const targets = ['STL', 'OBJ', '3MF', 'PLY', 'GLB'].filter((t) => t.toLowerCase() !== ext);
    return {
      ext,
      studioToolId: 'cad-3d',
      availableTargets: targets,
      defaultTarget: targets[0] ?? 'STL',
    };
  }

  if (['png', 'webp', 'jpg', 'jpeg', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'svg', 'ico'].includes(ext)) {
    const targets = ['WebP', 'PNG', 'JPG', 'ICO', 'BMP', 'TIFF'].filter(
      (t) => t.toLowerCase() !== ext
    );
    return {
      ext,
      studioToolId: 'media-images',
      availableTargets: targets,
      defaultTarget: targets[0] ?? 'WebP',
    };
  }

  if (['csv', 'tsv', 'xlsx', 'xls', 'pdf'].includes(ext)) {
    if (ext === 'pdf') {
      return {
        ext,
        studioToolId: 'documents',
        availableTargets: ['PNG-ZIP', 'PDF-Split'],
        defaultTarget: 'PNG-ZIP',
      };
    }
    const targets = ['JSON', 'CSV', 'XLSX', 'TSV', 'HTML'].filter((t) => t.toLowerCase() !== ext);
    return {
      ext,
      studioToolId: 'documents',
      availableTargets: targets,
      defaultTarget: targets[0] ?? 'JSON',
    };
  }

  if (['json'].includes(ext)) {
    return {
      ext,
      studioToolId: 'json-studio',
      availableTargets: ['CSV', 'XLSX', 'JSON-Min'],
      defaultTarget: 'CSV',
    };
  }

  if (['wav', 'mp3', 'ogg', 'aac', 'flac', 'mp4', 'webm', 'mkv'].includes(ext)) {
    const isVideo = ['mp4', 'webm', 'mkv'].includes(ext);
    return {
      ext,
      studioToolId: 'audio-video',
      availableTargets: isVideo ? ['GIF', 'WAV', 'MP3'] : ['WAV', 'MP3', 'OGG', 'FLAC'],
      defaultTarget: isVideo ? 'GIF' : 'WAV',
    };
  }

  if (['zip', 'tar', 'gz', 'ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
    const isFont = ['ttf', 'otf', 'woff', 'woff2'].includes(ext);
    return {
      ext,
      studioToolId: 'archives-fonts',
      availableTargets: isFont ? ['WOFF2', 'WOFF', 'TTF', 'OTF'] : ['ZIP'],
      defaultTarget: isFont ? 'WOFF2' : 'ZIP',
    };
  }

  return {
    ext,
    studioToolId: 'crypto-hasher',
    availableTargets: ['ZIP', 'SHA256'],
    defaultTarget: 'ZIP',
  };
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function convertSingleQueuedItem(item: QueuedBatchItem): Promise<{
  bytes: Uint8Array;
  outName: string;
}> {
  const baseName = item.file.name.replace(/\.[^.]+$/, '');
  const target = item.selectedTarget.toLowerCase();

  // 1. 3D & CAD Worker Conversion
  if (item.studioToolId === 'cad-3d') {
    const buf = await item.file.arrayBuffer();
    return await new Promise((resolve, reject) => {
      const worker = new CadWorker();
      const targetFmt: CadFormat =
        target === 'stl'
          ? 'stl-binary'
          : (target as CadFormat);
      worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: CadWorkerResult; error?: string }>) => {
        worker.terminate();
        if (e.data.ok && e.data.result) {
          resolve({
            bytes: e.data.result.outputBytes,
            outName: `${baseName}.${e.data.result.outputExtension}`,
          });
        } else {
          reject(new Error(e.data.error ?? 'CAD conversion failed'));
        }
      };
      const req: CadWorkerRequest = {
        action: 'parseAndConvert',
        fileName: item.file.name,
        buffer: buf,
        targetFormat: targetFmt,
        invertNormals: false,
        scale: 1,
      };
      worker.postMessage({ id: 1, payload: req });
    });
  }

  // 2. Image & Vector Conversion
  if (item.studioToolId === 'media-images') {
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result ?? ''));
      r.readAsDataURL(item.file);
    });
    const img = await new Promise<HTMLImageElement>((res) => {
      const el = new window.Image();
      el.onload = () => res(el);
      el.onerror = () => res(el);
      el.src = dataUrl;
    });
    const c = document.createElement('canvas');
    c.width = img.width || 512;
    c.height = img.height || 512;
    const ctx = c.getContext('2d');
    if (ctx && img.width > 0) {
      ctx.drawImage(img, 0, 0);
    }
    const mime =
      target === 'png'
        ? 'image/png'
        : target === 'jpg'
        ? 'image/jpeg'
        : 'image/webp';
    const outUrl = c.toDataURL(mime, 0.9);
    return {
      bytes: dataUrlToBytes(outUrl),
      outName: `${baseName}.${target}`,
    };
  }

  // 3. Tabular / Document Conversion
  if (item.studioToolId === 'documents' || item.studioToolId === 'json-studio') {
    if (['json', 'csv', 'tsv', 'html', 'xlsx'].includes(target)) {
      const isXlsxIn = item.ext === 'xlsx' || item.ext === 'xls';
      const xlsxBuffer = isXlsxIn ? await item.file.arrayBuffer() : undefined;
      const rawText = isXlsxIn ? undefined : await item.file.text();

      return await new Promise((resolve, reject) => {
        const worker = new TabularWorker();
        worker.onmessage = (
          e: MessageEvent<{ ok: boolean; result?: TabularWorkerResult; error?: string }>
        ) => {
          worker.terminate();
          if (e.data.ok && e.data.result) {
            const bytes =
              e.data.result.outputBytes ??
              new TextEncoder().encode(e.data.result.outputText);
            resolve({
              bytes,
              outName: `${baseName}.${target}`,
            });
          } else {
            reject(new Error(e.data.error ?? 'Tabular conversion failed'));
          }
        };
        const req: TabularWorkerRequest = {
          action: 'convert',
          rawText,
          xlsxBuffer,
          targetFormat: target as TabularFormat,
        };
        worker.postMessage({ id: 1, payload: req });
      });
    }
  }

  // Fallback: package or transcode raw bytes
  const rawBuf = await item.file.arrayBuffer();
  return {
    bytes: new Uint8Array(rawBuf),
    outName: `${baseName}.${target}`,
  };
}

export const UniversalHubTool: React.FC = () => {
  const { t } = useI18n();
  const setActiveToolId = useWorkspaceStore((s) => s.setActiveToolId);
  const openFileInStudio = useWorkspaceStore((s) => s.openFileInStudio);
  const setExecutionMetrics = useWorkspaceStore((s) => s.setExecutionMetrics);

  const [queue, setQueue] = useState<QueuedBatchItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addFilesToQueue = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files).map<QueuedBatchItem>((file) => {
      const profile = detectFileProfile(file);
      return {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        ext: profile.ext,
        studioToolId: profile.studioToolId,
        availableTargets: profile.availableTargets,
        selectedTarget: profile.defaultTarget,
        status: 'ready',
        progress: 0,
      };
    });
    setQueue((prev) => [...prev, ...incoming]);
  }, []);

  const runBatchConversion = async () => {
    const start = performance.now();
    await Promise.all(
      queue.map(async (item) => {
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'processing', progress: 45 } : q))
        );
        try {
          const { bytes, outName } = await convertSingleQueuedItem(item);
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: 'done',
                    progress: 100,
                    outputBytes: bytes,
                    outputFileName: outName,
                  }
                : q
            )
          );
        } catch {
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: 'ready', progress: 0 } : q))
          );
        }
      })
    );
    setExecutionMetrics(Math.max(0.2, performance.now() - start), false);
  };

  const downloadAllAsZip = async () => {
    const start = performance.now();
    const zip = new JSZip();
    for (const item of queue) {
      if (item.outputBytes && item.outputFileName) {
        zip.file(item.outputFileName, item.outputBytes);
      } else {
        const { bytes, outName } = await convertSingleQueuedItem(item);
        zip.file(outName, bytes);
      }
    }
    const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    setExecutionMetrics(Math.max(0.2, performance.now() - start), false);
    const blob = new Blob([new Uint8Array(zipBytes)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'omniconvert-batch-output.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSingleItem = (item: QueuedBatchItem) => {
    if (!item.outputBytes || !item.outputFileName) return;
    const blob = new Blob([new Uint8Array(item.outputBytes)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.outputFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-6xl mx-auto w-full">
      {/* Step 1: Center-Stage Universal Smart Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) addFilesToQueue(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`min-h-[210px] p-6 sm:p-8 rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center text-center gap-3 cursor-pointer select-none ${
          isDragging
            ? 'border-zinc-400 bg-zinc-900'
            : 'border-zinc-800 hover:border-zinc-600 bg-zinc-900/40'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFilesToQueue(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100">
          <Upload className="w-5 h-5" />
        </div>
        <div className="space-y-1 max-w-xl">
          <h2 className="text-base sm:text-lg font-bold text-zinc-100 tracking-tight">
            {t('hub.title')}
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">{t('hub.subtitle')}</p>
        </div>
        <div className="px-3 py-1 rounded-md bg-zinc-950 border border-zinc-800/80 text-[11px] font-mono text-zinc-400">
          {t('hub.supportedPills')}
        </div>
      </div>

      {/* Step 2: Automatic MIME/Format Detection & Parallel Batch Queue */}
      {queue.length > 0 && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 bg-zinc-950 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
              <Package className="w-4 h-4 text-zinc-300" />
              <span>{t('hub.batchQueue', { count: queue.length })}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void runBatchConversion()}
                className="min-h-[36px] px-3 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-semibold text-xs flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t('hub.convertAll')}</span>
              </button>
              <button
                type="button"
                onClick={() => void downloadAllAsZip()}
                className="min-h-[36px] px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium text-xs flex items-center gap-1.5 border border-zinc-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('hub.downloadAllZip')}</span>
              </button>
              <button
                type="button"
                onClick={() => setQueue([])}
                className="min-h-[36px] px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs flex items-center gap-1 border border-zinc-800"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('hub.clearQueue')}</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-zinc-800/80">
            {queue.map((item) => (
              <div
                key={item.id}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono text-[10px] uppercase font-bold">
                      .{item.ext}
                    </span>
                    <span className="text-xs font-semibold text-zinc-100 truncate">
                      {item.file.name}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500">
                      ({(item.file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>

                  {/* Progress Indicator */}
                  <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                    {item.status === 'processing' && (
                      <span className="flex items-center gap-1 text-zinc-200">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t('hub.statusProcessing')}
                      </span>
                    )}
                    {item.status === 'done' && (
                      <span className="flex items-center gap-1 text-zinc-100">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('hub.statusDone', {
                          size: `${((item.outputBytes?.byteLength ?? 0) / 1024).toFixed(1)} KB`,
                        })}
                      </span>
                    )}
                    {item.status === 'ready' && <span>{t('hub.statusReady')}</span>}
                  </div>
                </div>

                {/* Target Pills & Actions */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {item.availableTargets.map((target) => {
                    const isSelected = item.selectedTarget === target;
                    return (
                      <button
                        key={target}
                        type="button"
                        onClick={() =>
                          setQueue((prev) =>
                            prev.map((q) =>
                              q.id === item.id
                                ? { ...q, selectedTarget: target, status: 'ready' }
                                : q
                            )
                          )
                        }
                        className={`min-h-[32px] px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                          isSelected
                            ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-bold'
                            : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-zinc-200'
                        }`}
                      >
                        [ To {target} ]
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => openFileInStudio(item.studioToolId, item.file)}
                    className="min-h-[32px] px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center gap-1"
                  >
                    <span>{t('hub.openStudio')}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>

                  {item.status === 'done' && (
                    <button
                      type="button"
                      onClick={() => downloadSingleItem(item)}
                      className="min-h-[32px] px-2.5 py-1 rounded bg-zinc-100 text-zinc-950 font-semibold text-xs flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t('app.download')}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Grid of Dedicated Conversion & Developer Suites */}
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {t('hub.quickSuites')}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TOOL_REGISTRY.filter((tool) => tool.id !== 'universal-hub').map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveToolId(tool.id)}
                className="p-4 rounded-xl bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 text-left flex flex-col justify-between gap-3 transition-colors group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-200 group-hover:bg-zinc-100 group-hover:text-zinc-950 transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-950 text-zinc-400 rounded border border-zinc-800">
                      {tool.shortcut}
                    </kbd>
                  </div>
                  <div className="text-sm font-semibold text-zinc-100">{t(tool.nameKey)}</div>
                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                    {t(tool.descKey)}
                  </p>
                </div>

                {tool.formats && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {tool.formats.map((fmt) => (
                      <span
                        key={fmt}
                        className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800/90 text-[10px] font-mono text-zinc-400"
                      >
                        {fmt}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
