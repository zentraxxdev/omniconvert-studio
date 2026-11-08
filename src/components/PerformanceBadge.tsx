import React from 'react';
import { Zap, Shield, Database, Loader2 } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { useWorkspaceStore } from '../hooks/useWorkspaceStore';

export const PerformanceBadge: React.FC = () => {
  const { t } = useI18n();
  const lastExecutionMs = useWorkspaceStore((s) => s.lastExecutionMs);
  const isWorkerBusy = useWorkspaceStore((s) => s.isWorkerBusy);
  const lastSavedAt = useWorkspaceStore((s) => s.lastSavedAt);

  return (
    <footer className="h-8 px-3 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400 shrink-0 select-none">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="flex items-center gap-1.5 text-zinc-300 font-mono truncate">
          {isWorkerBusy ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-200 shrink-0" />
              <span className="text-zinc-200">{t('app.processing')}</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5 text-zinc-200 shrink-0" />
              <span>
                {lastExecutionMs !== null
                  ? t('perf.badge', { ms: lastExecutionMs })
                  : t('perf.idle')}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {lastSavedAt && (
          <span className="hidden sm:flex items-center gap-1 text-zinc-400">
            <Database className="w-3 h-3 text-zinc-300" />
            <span>{t('app.workspaceSaved')}</span>
          </span>
        )}
        <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono">
          <Shield className="w-3 h-3" />
          <span>{t('app.zeroNetworkBadge')}</span>
        </span>
      </div>
    </footer>
  );
};
