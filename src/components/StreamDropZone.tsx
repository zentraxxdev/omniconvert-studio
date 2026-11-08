import React, { useState, useRef, useCallback } from 'react';
import { Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { useWorkspaceStore } from '../hooks/useWorkspaceStore';

interface StreamDropZoneProps {
  onTextStreamed: (content: string, byteLength: number) => void;
  accept?: string;
  maxPreviewChars?: number;
}

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB limit per specification

export const StreamDropZone: React.FC<StreamDropZoneProps> = ({
  onTextStreamed,
  accept = '.json,.txt,.log,.csv,.xml,.svg,.jwt,.md,.js,.ts',
  maxPreviewChars = 2_000_000,
}) => {
  const { t } = useI18n();
  const setExecutionMetrics = useWorkspaceStore((s) => s.setExecutionMetrics);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [streamProgress, setStreamProgress] = useState<{
    percent: number;
    mb: string;
  } | null>(null);
  const [streamStats, setStreamStats] = useState<{
    kb: string;
    ms: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const processFileViaWebStreams = useCallback(
    async (file: File) => {
      setErrorMsg(null);
      setStreamStats(null);

      if (file.size > MAX_FILE_BYTES) {
        setErrorMsg(t('app.fileTooLarge'));
        return;
      }

      const start = performance.now();
      const totalBytes = Math.max(1, file.size);
      let bytesRead = 0;
      const chunks: string[] = [];
      let accumulatedChars = 0;

      try {
        const readableStream = file.stream();
        const reader = readableStream.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value) {
            bytesRead += value.byteLength;
            const percent = Math.min(100, Math.round((bytesRead / totalBytes) * 100));
            setStreamProgress({
              percent,
              mb: (bytesRead / (1024 * 1024)).toFixed(2),
            });

            if (accumulatedChars < maxPreviewChars) {
              const decodedChunk = decoder.decode(value, { stream: true });
              const remaining = maxPreviewChars - accumulatedChars;
              const slice = decodedChunk.slice(0, remaining);
              chunks.push(slice);
              accumulatedChars += slice.length;
            }
          }
        }

        const tail = decoder.decode();
        if (tail && accumulatedChars < maxPreviewChars) {
          chunks.push(tail);
        }

        const elapsed = Math.max(0.2, performance.now() - start);
        setStreamProgress(null);
        setStreamStats({
          kb: (bytesRead / 1024).toFixed(1),
          ms: elapsed.toFixed(1),
        });
        setExecutionMetrics(elapsed, false);
        onTextStreamed(chunks.join(''), bytesRead);
      } catch (err) {
        setStreamProgress(null);
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    },
    [maxPreviewChars, onTextStreamed, setExecutionMetrics, t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        void processFileViaWebStreams(file);
      }
    },
    [processFileViaWebStreams]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
      className={`min-h-[44px] px-3 py-1.5 rounded-md border border-dashed text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors select-none ${
        isDragging
          ? 'border-zinc-400 bg-zinc-900 text-zinc-100'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 text-zinc-400'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void processFileViaWebStreams(f);
          e.target.value = '';
        }}
      />
      <div className="flex items-center gap-2 truncate">
        <Upload className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
        {streamProgress ? (
          <span className="text-zinc-200 font-mono">
            {t('app.streamingProgress', {
              percent: streamProgress.percent,
              bytes: streamProgress.mb,
            })}
          </span>
        ) : errorMsg ? (
          <span className="text-zinc-200 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {errorMsg}
          </span>
        ) : streamStats ? (
          <span className="text-zinc-200 flex items-center gap-1 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            {t('app.streamComplete', { bytes: streamStats.kb, ms: streamStats.ms })}
          </span>
        ) : (
          <span className="truncate">{t('app.dropFilePrompt')}</span>
        )}
      </div>
    </div>
  );
};
