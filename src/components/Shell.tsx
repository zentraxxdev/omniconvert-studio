import React from 'react';
import { TOOL_CATEGORIES, TOOL_REGISTRY } from '../config/tools';
import { useI18n } from '../hooks/useI18n';
import { useWorkspaceStore } from '../hooks/useWorkspaceStore';
import { Navbar } from './Navbar';
import { PerformanceBadge } from './PerformanceBadge';
import { CommandPalette } from './CommandPalette';
import { PipelineModal } from './PipelineModal';

interface ShellProps {
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({ children }) => {
  const { t } = useI18n();
  const activeToolId = useWorkspaceStore((s) => s.activeToolId);
  const setActiveToolId = useWorkspaceStore((s) => s.setActiveToolId);

  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      <Navbar />

      {/* Main Content Area: Sidebar + Active Tool Workspace */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Desktop Matte Monochrome Sidebar Navigation (md+) */}
        <aside className="hidden md:flex w-56 lg:w-60 bg-zinc-950 border-r border-zinc-800/80 flex-col justify-between p-2.5 overflow-y-auto shrink-0 select-none">
          <div className="space-y-3.5">
            {TOOL_CATEGORIES.map((category) => {
              const toolsInCategory = TOOL_REGISTRY.filter(
                (tItem) => tItem.category === category.id
              );
              if (toolsInCategory.length === 0) return null;
              return (
                <div key={category.id} className="space-y-1">
                  <div className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {t(category.labelKey)}
                  </div>
                  {toolsInCategory.map((tool) => {
                    const Icon = tool.icon;
                    const isActive = tool.id === activeToolId;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => setActiveToolId(tool.id)}
                        className={`w-full min-h-[38px] px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center justify-between gap-2 transition-colors border ${
                          isActive
                            ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border-transparent'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Icon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-zinc-900' : 'text-zinc-500'
                            }`}
                          />
                          <span className="truncate">{t(tool.nameKey)}</span>
                        </span>
                        <kbd
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            isActive
                              ? 'bg-zinc-200 text-zinc-900 border-zinc-300'
                              : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                          }`}
                        >
                          {tool.shortcut.replace('Alt+', '⌥')}
                        </kbd>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 text-[11px] text-zinc-400 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-200">{t('app.offlineReady')}</span>
              <span className="w-2 h-2 rounded-full bg-zinc-200" />
            </div>
            <div className="font-mono text-[10px] text-zinc-500 truncate">
              CSP: connect-src &apos;none&apos;
            </div>
          </div>
        </aside>

        {/* Active Tool Viewport */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-zinc-950">
          {children}
        </main>
      </div>

      <PerformanceBadge />
      <CommandPalette />
      <PipelineModal />
    </div>
  );
};
