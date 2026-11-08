import { useEffect, useRef, useState, useCallback } from 'react';
import { useWorkspaceStore } from './useWorkspaceStore';

export interface WorkerResponseEnvelope<TResult> {
  id: number;
  ok: boolean;
  result?: TResult;
  error?: string;
  durationMs: number;
}

export function useWorker<TPayload, TResult>(workerFactory: () => Worker) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef<
    Map<
      number,
      {
        resolve: (res: TResult) => void;
        reject: (err: Error) => void;
        startedAt: number;
      }
    >
  >(new Map());

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setExecutionMetrics = useWorkspaceStore((s) => s.setExecutionMetrics);
  const setWorkerBusy = useWorkspaceStore((s) => s.setWorkerBusy);

  useEffect(() => {
    const worker = workerFactory();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponseEnvelope<TResult>>) => {
      const { id, ok, result, error: workerError, durationMs } = event.data;
      const entry = pendingRef.current.get(id);
      if (!entry) return;
      pendingRef.current.delete(id);

      const elapsed = durationMs > 0 ? durationMs : performance.now() - entry.startedAt;
      setExecutionMetrics(Math.max(0.1, elapsed), pendingRef.current.size > 0);
      setIsRunning(pendingRef.current.size > 0);

      if (ok && result !== undefined) {
        setError(null);
        entry.resolve(result);
      } else {
        const msg = workerError || 'Worker operation failed';
        setError(msg);
        entry.reject(new Error(msg));
      }
    };

    worker.onerror = (err) => {
      const msg = err.message || 'Unhandled Web Worker error';
      setError(msg);
      setIsRunning(false);
      setWorkerBusy(false);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRef.current.clear();
    };
  }, [workerFactory, setExecutionMetrics, setWorkerBusy]);

  const run = useCallback(
    (payload: TPayload): Promise<TResult> => {
      return new Promise<TResult>((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error('Worker not initialized'));
          return;
        }
        const id = ++requestIdRef.current;
        const startedAt = performance.now();
        pendingRef.current.set(id, { resolve, reject, startedAt });
        setIsRunning(true);
        setWorkerBusy(true);
        worker.postMessage({ id, payload });
      });
    },
    [setWorkerBusy]
  );

  return { run, isRunning, error };
}
