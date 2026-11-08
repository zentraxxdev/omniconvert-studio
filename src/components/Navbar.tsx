import React from 'react';
import { Search, Workflow, RotateCcw, Terminal } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { useWorkspaceStore } from '../hooks/useWorkspaceStore';
import { TOP_NAV_CATEGORIES } from '../config/tools';
import { I18nSelector } from './i18nSelector';

export const Navbar: React.FC = () => {
  const { t } = useI18n();
  const activeTopNav = useWorkspaceStore((s) => s.activeTopNav);
  const setActiveTopNav = useWorkspaceStore((s) => s.setActiveTopNav);
  const setCommandPaletteOpen = useWorkspaceStore((s) => s.setCommandPaletteOpen);
  const setPipelineModalOpen = useWorkspaceStore((s) => s.setPipelineModalOpen);
  const resetCurrentTool = useWorkspaceStore((s) => s.resetCurrentTool);

  return (
    <header className="bg-zinc-950 border-b border-zinc-800/80 flex flex-col shrink-0 select-none">
      {/* Top Row: Brand, Command Palette Trigger, Pipeline, Reset, Language */}
      <div className="min-h-[52px] px-3 sm:px-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setActiveTopNav('all', 'universal-hub')}
            className="flex items-center gap-2.5 text-left group shrink-0"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-950 flex items-center justify-center font-bold">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xs font-bold tracking-wider uppercase text-zinc-100 leading-tight">
                {t('app.title')}
              </h1>
              <p className="hidden sm:block text-[10px] text-zinc-400 leading-tight">
                {t('app.subtitle')}
              </p>
            </div>
          </button>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="min-h-[36px] px-2.5 sm:px-3 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-2 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden md:inline text-zinc-400">{t('app.commandPaletteHint')}</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-950 text-zinc-200 rounded border border-zinc-800">
              {t('app.shortcutCmdK')}
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setPipelineModalOpen(true)}
            className="min-h-[36px] px-2.5 sm:px-3 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-colors"
          >
            <Workflow className="w-3.5 h-3.5 text-zinc-300" />
            <span className="hidden sm:inline">{t('app.pipelineBuilder')}</span>
          </button>

          <button
            type="button"
            onClick={resetCurrentTool}
            title={t('app.clearWorkspace')}
            className="min-h-[36px] min-w-[36px] px-2 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <I18nSelector />
        </div>
      </div>

      {/* Quiet Top Navigation: Matte Category Selector */}
      <nav
        aria-label="Primary Categories"
        className="px-3 sm:px-4 py-1.5 bg-zinc-900/60 border-t border-zinc-800/60 flex items-center gap-1.5 overflow-x-auto"
      >
        {TOP_NAV_CATEGORIES.map((cat) => {
          const isActive = activeTopNav === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveTopNav(cat.id, cat.defaultToolId)}
              className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-mono transition-colors shrink-0 border ${
                isActive
                  ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                  : 'bg-zinc-950/60 text-zinc-400 border-zinc-800/80 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              [ {t(cat.labelKey)} ]
            </button>
          );
        })}
      </nav>
    </header>
  );
};
