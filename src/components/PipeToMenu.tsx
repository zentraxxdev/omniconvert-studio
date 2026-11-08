import React, { useState, useRef, useEffect } from 'react';
import { Workflow, ChevronDown, ArrowRight } from 'lucide-react';
import { TOOL_REGISTRY, type ToolId } from '../config/tools';
import { useI18n } from '../hooks/useI18n';
import { useWorkspaceStore } from '../hooks/useWorkspaceStore';

interface PipeToMenuProps {
  outputPayload: string;
}

export const PipeToMenu: React.FC<PipeToMenuProps> = ({ outputPayload }) => {
  const { t } = useI18n();
  const activeToolId = useWorkspaceStore((s) => s.activeToolId);
  const pipeOutputToTool = useWorkspaceStore((s) => s.pipeOutputToTool);
  const setPipelineInput = useWorkspaceStore((s) => s.setPipelineInput);
  const setPipelineModalOpen = useWorkspaceStore((s) => s.setPipelineModalOpen);

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const handlePipeToTool = (targetId: ToolId) => {
    pipeOutputToTool(targetId, outputPayload);
    setOpen(false);
  };

  const handlePipeToChainEngine = () => {
    setPipelineInput(outputPayload);
    setPipelineModalOpen(true);
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        disabled={!outputPayload}
        onClick={() => setOpen((v) => !v)}
        className="min-h-[36px] px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
      >
        <Workflow className="w-3.5 h-3.5" />
        <span>{t('app.pipeTo')}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-60 rounded-lg bg-zinc-900 border border-zinc-800 shadow-2xl py-1.5 z-40">
          <button
            type="button"
            onClick={handlePipeToChainEngine}
            className="w-full px-3 py-2 text-left text-xs text-zinc-100 hover:bg-zinc-800 flex items-center justify-between font-semibold border-b border-zinc-800"
          >
            <span className="flex items-center gap-2">
              <Workflow className="w-3.5 h-3.5 text-zinc-200" />
              {t('app.pipelineBuilder')}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {TOOL_REGISTRY.filter((tool) => tool.id !== activeToolId && tool.id !== 'universal-hub').map(
            (tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => handlePipeToTool(tool.id)}
                  className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Icon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">{t(tool.nameKey)}</span>
                  </span>
                  <ArrowRight className="w-3 h-3 text-zinc-500 shrink-0" />
                </button>
              );
            }
          )}
        </div>
      )}
    </div>
  );
};
