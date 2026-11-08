import { useState, useCallback, useRef } from 'react';

export function useClipboard(resetDelayMs = 1800) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      if (!text) return false;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = window.setTimeout(() => {
          setCopied(false);
        }, resetDelayMs);
        return true;
      } catch {
        return false;
      }
    },
    [resetDelayMs]
  );

  const paste = useCallback(async (): Promise<string> => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  }, []);

  return { copied, copy, paste };
}
