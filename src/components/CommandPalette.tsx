import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Workflow, RotateCcw, Globe, CornerDownLeft } from 'lucide-react';
import { TOOL_REGISTRY, type ToolId } from '../config/tools';
import { SUPPORTED_LOCALES, useI18n, type SupportedLocale } from '../hooks/useI18n';
import { useWorkspaceStore } from '../hooks/useWorkspaceStore';

interface CommandActionItem {
  id: string;
  section: 'tools' | 'pipeline' | 'language';
  title: string;
  subtitle: string;
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const t = target.toLowerCase();
  if (t.includes(q)) return true;

  let qIdx = 0;
  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) qIdx++;
  }
  return qIdx === q.length;
}

export const CommandPalette: React.FC = () => {
  const { t, setLocale } = useI18n();
  const isOpen = useWorkspaceStore((s) => s.isCommandPaletteOpen);
  const setOpen = useWorkspaceStore((s) => s.setCommandPaletteOpen);
  const setActiveToolId = useWorkspaceStore((s) => s.setActiveToolId);
  const setPipelineModalOpen = useWorkspaceStore((s) => s.setPipelineModalOpen);
  const resetCurrentTool = useWorkspaceStore((s) => s.resetCurrentTool);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!isOpen);
      } else if (e.altKey && e.key >= '0' && e.key <= '9') {
        const idx = parseInt(e.key, 10);
        const entry = TOOL_REGISTRY[idx];
        if (entry) {
          e.preventDefault();
          setActiveToolId(entry.id);
          setOpen(false);
        }
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setOpen, setActiveToolId]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  const actions = useMemo<CommandActionItem[]>(() => {
    const toolItems: CommandActionItem[] = TOOL_REGISTRY.map((tool) => ({
      id: `tool-${tool.id}`,
      section: 'tools',
      title: t(tool.nameKey),
      subtitle: `${t(tool.descKey)} (${tool.keywords.join(' ')})`,
      shortcut: tool.shortcut,
      icon: tool.icon,
      onSelect: () => {
        setActiveToolId(tool.id as ToolId);
        setOpen(false);
      },
    }));

    const pipelineItems: CommandActionItem[] = [
      {
        id: 'act-pipeline',
        section: 'pipeline',
        title: t('cmd.openPipeline'),
        subtitle: t('pipeline.subtitle'),
        icon: Workflow,
        onSelect: () => {
          setOpen(false);
          setPipelineModalOpen(true);
        },
      },
      {
        id: 'act-reset',
        section: 'pipeline',
        title: t('cmd.resetCurrentTool'),
        subtitle: t('app.clearWorkspace'),
        icon: RotateCcw,
        onSelect: () => {
          resetCurrentTool();
          setOpen(false);
        },
      },
    ];

    const langItems: CommandActionItem[] = SUPPORTED_LOCALES.map((loc) => ({
      id: `lang-${loc.code}`,
      section: 'language',
      title: `${loc.nativeName} (${loc.label})`,
      subtitle: `i18n locale: ${loc.code}`,
      shortcut: loc.flag,
      icon: Globe,
      onSelect: () => {
        void setLocale(loc.code as SupportedLocale);
        setOpen(false);
      },
    }));

    return [...toolItems, ...pipelineItems, ...langItems].filter(
      (item) => fuzzyMatch(query, item.title) || fuzzyMatch(query, item.subtitle)
    );
  }, [query, t, setActiveToolId, setOpen, setPipelineModalOpen, resetCurrentTool, setLocale]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (actions.length > 0 ? (prev + 1) % actions.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        actions.length > 0 ? (prev - 1 + actions.length) % actions.length : 0
      );
    } else if (e.key === 'Enter' && actions[selectedIndex]) {
      e.preventDefault();
      actions[selectedIndex].onSelect();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-start justify-center pt-16 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleListKeyDown}
      >
        <div className="flex items-center px-4 py-3 border-b border-zinc-800 gap-3 bg-zinc-950">
          <Search className="w-4 h-4 text-zinc-300 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('cmd.placeholder')}
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-900 text-zinc-400 rounded border border-zinc-800">
            ESC
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {actions.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">{t('cmd.noResults')}</div>
          ) : (
            actions.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={item.onSelect}
                  className={`w-full px-3 py-2.5 rounded-lg flex items-center justify-between gap-3 text-left transition-colors ${
                    isSelected
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'hover:bg-zinc-800/60 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-md shrink-0 ${
                        isSelected ? 'bg-zinc-900 text-zinc-100' : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{item.title}</div>
                      <div
                        className={`text-[11px] truncate ${
                          isSelected ? 'text-zinc-700' : 'text-zinc-400'
                        }`}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.shortcut && (
                      <kbd
                        className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                          isSelected
                            ? 'bg-zinc-200 text-zinc-900 border-zinc-300'
                            : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                        }`}
                      >
                        {item.shortcut}
                      </kbd>
                    )}
                    {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-zinc-900" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800 text-[11px] text-zinc-500 flex items-center justify-between">
          <span>{t('cmd.navHint')}</span>
          <span className="font-mono text-zinc-300">{t('app.zeroNetworkBadge')}</span>
        </div>
      </div>
    </div>
  );
};
