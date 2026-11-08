import React, { useEffect, useState, useCallback } from 'react';
import {
  Workflow,
  Plus,
  Trash2,
  Play,
  ArrowDown,
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import PipelineWorker from '../workers/pipeline.worker?worker';
import type {
  PipelineWorkerRequest,
  PipelineWorkerResult,
} from '../workers/pipeline.worker';
import { useWorker } from '../hooks/useWorker';
import { useI18n, type TranslationKey } from '../hooks/useI18n';
import { useWorkspaceStore, type PipelineStepConfig } from '../hooks/useWorkspaceStore';
import { useClipboard } from '../hooks/useClipboard';
import { TOOL_REGISTRY, type ToolId } from '../config/tools';

const STEP_OPERATIONS: Array<{
  op: PipelineStepConfig['operation'];
  labelKey: TranslationKey;
  hasArg?: boolean;
}> = [
  { op: 'base64Decode', labelKey: 'pipeline.step.base64Decode' },
  { op: 'base64Encode', labelKey: 'pipeline.step.base64Encode' },
  { op: 'urlDecode', labelKey: 'pipeline.step.urlDecode' },
  { op: 'urlEncode', labelKey: 'pipeline.step.urlEncode' },
  { op: 'jsonPrettify', labelKey: 'pipeline.step.jsonPrettify' },
  { op: 'jsonMinify', labelKey: 'pipeline.step.jsonMinify' },
  { op: 'jsonSortKeys', labelKey: 'pipeline.step.jsonSortKeys' },
  { op: 'jsonFilterKeys', labelKey: 'pipeline.step.jsonFilterKeys', hasArg: true },
  { op: 'jwtExtractPayload', labelKey: 'pipeline.step.jwtExtractPayload' },
  { op: 'sha256', labelKey: 'pipeline.step.sha256' },
  { op: 'md5', labelKey: 'pipeline.step.md5' },
  { op: 'trimLines', labelKey: 'pipeline.step.trimLines' },
  { op: 'dedupeLines', labelKey: 'pipeline.step.dedupeLines' },
  { op: 'sortLines', labelKey: 'pipeline.step.sortLines' },
  { op: 'upperCase', labelKey: 'pipeline.step.upperCase' },
  { op: 'lowerCase', labelKey: 'pipeline.step.lowerCase' },
];

export const PipelineModal: React.FC = () => {
  const { t } = useI18n();
  const isOpen = useWorkspaceStore((s) => s.isPipelineModalOpen);
  const setOpen = useWorkspaceStore((s) => s.setPipelineModalOpen);
  const steps = useWorkspaceStore((s) => s.pipelineSteps);
  const setSteps = useWorkspaceStore((s) => s.setPipelineSteps);
  const pipelineInput = useWorkspaceStore((s) => s.pipelineInput);
  const setPipelineInput = useWorkspaceStore((s) => s.setPipelineInput);
  const activeToolId = useWorkspaceStore((s) => s.activeToolId);
  const activeToolInput = useWorkspaceStore((s) => s.toolInputs[s.activeToolId]);
  const pipeOutputToTool = useWorkspaceStore((s) => s.pipeOutputToTool);

  const workerFactory = useCallback(() => new PipelineWorker(), []);
  const { run } = useWorker<PipelineWorkerRequest, PipelineWorkerResult>(workerFactory);
  const { copied, copy } = useClipboard();

  const [result, setResult] = useState<PipelineWorkerResult | null>(null);
  const [targetTool, setTargetTool] = useState<ToolId>('json-studio');

  const executePipeline = useCallback(async () => {
    try {
      const res = await run({ input: pipelineInput, steps });
      setResult(res);
    } catch {
      // Handled by worker state
    }
  }, [run, pipelineInput, steps]);

  useEffect(() => {
    if (isOpen) {
      void executePipeline();
    }
  }, [isOpen, executePipeline]);

  if (!isOpen) return null;

  const addStep = () => {
    setSteps([
      ...steps,
      {
        id: `step-${Date.now()}-${steps.length}`,
        operation: 'jsonPrettify',
      },
    ]);
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter((s) => s.id !== id));
  };

  const updateStep = (id: string, patch: Partial<PipelineStepConfig>) => {
    setSteps(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const loadPresetDemo = () => {
    const samplePayload = btoa(
      JSON.stringify({
        engine: 'OmniConvert Studio',
        zeroNetwork: true,
        role: 'security-architect',
        debugNoise: 'strip-me',
        telemetry: 'disabled',
      })
    );
    setPipelineInput(samplePayload);
    setSteps([
      { id: 'p-1', operation: 'base64Decode' },
      { id: 'p-2', operation: 'jsonPrettify' },
      { id: 'p-3', operation: 'jsonFilterKeys', arg: 'engine,zeroNetwork,role' },
    ]);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-5xl max-h-[90dvh] rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-zinc-800 text-zinc-100">
              <Workflow className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">{t('pipeline.title')}</h2>
              <p className="text-xs text-zinc-400">{t('pipeline.subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadPresetDemo}
              className="min-h-[36px] px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('pipeline.presetJwtFlow')}</span>
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-[36px] min-w-[36px] rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center border border-zinc-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Input Column */}
          <div className="lg:col-span-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                {t('pipeline.inputLabel')}
              </label>
              <button
                type="button"
                onClick={() => setPipelineInput(activeToolInput)}
                className="text-xs text-zinc-300 hover:text-zinc-100 underline"
              >
                {t('pipeline.useActiveInput')} ({activeToolId})
              </button>
            </div>
            <textarea
              value={pipelineInput}
              onChange={(e) => setPipelineInput(e.target.value)}
              spellCheck={false}
              className="flex-1 min-h-[220px] w-full rounded-lg bg-zinc-950 border border-zinc-800 p-3 font-mono text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 resize-none"
            />
          </div>

          {/* Steps Builder Column */}
          <div className="lg:col-span-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                {t('app.pipelineBuilder')} ({steps.length})
              </span>
              <button
                type="button"
                onClick={addStep}
                className="min-h-[32px] px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('pipeline.addStep')}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {steps.map((step, index) => {
                const meta = STEP_OPERATIONS.find((o) => o.op === step.operation);
                const trace = result?.traces[index];
                return (
                  <React.Fragment key={step.id}>
                    <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-200 text-[11px] font-mono flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <select
                          value={step.operation}
                          onChange={(e) =>
                            updateStep(step.id, {
                              operation: e.target.value as PipelineStepConfig['operation'],
                            })
                          }
                          className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                        >
                          {STEP_OPERATIONS.map((opItem) => (
                            <option key={opItem.op} value={opItem.op}>
                              {t(opItem.labelKey)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeStep(step.id)}
                          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {meta?.hasArg && (
                        <input
                          type="text"
                          value={step.arg ?? ''}
                          onChange={(e) => updateStep(step.id, { arg: e.target.value })}
                          placeholder={t('pipeline.argPlaceholder')}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
                        />
                      )}

                      {trace && (
                        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-zinc-200" />
                            {t('pipeline.stepSuccess', {
                              index: index + 1,
                              name: step.operation,
                              ms: trace.durationMs,
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                    {index < steps.length - 1 && (
                      <div className="flex justify-center">
                        <ArrowDown className="w-3.5 h-3.5 text-zinc-600" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => void executePipeline()}
              className="min-h-[40px] w-full rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {t('pipeline.run')}
            </button>
          </div>

          {/* Output Column */}
          <div className="lg:col-span-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                {t('pipeline.outputLabel')}
              </label>
              <button
                type="button"
                onClick={() => void copy(result?.finalOutput ?? '')}
                className="text-xs text-zinc-300 hover:text-zinc-100 flex items-center gap-1"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? t('app.copied') : t('app.copy')}
              </button>
            </div>

            {result && !result.success && (
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  {t('pipeline.stepError', {
                    index: result.failedStepIndex ?? 1,
                    error: result.error ?? 'Error',
                  })}
                </span>
              </div>
            )}

            <textarea
              readOnly
              value={result?.finalOutput ?? ''}
              spellCheck={false}
              className="flex-1 min-h-[220px] w-full rounded-lg bg-zinc-950 border border-zinc-800 p-3 font-mono text-xs text-zinc-100 focus:outline-none resize-none"
            />

            <div className="flex items-center gap-2">
              <select
                value={targetTool}
                onChange={(e) => setTargetTool(e.target.value as ToolId)}
                className="min-h-[38px] flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-200"
              >
                {TOOL_REGISTRY.filter((tItem) => tItem.id !== 'universal-hub').map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {t(tool.nameKey)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => pipeOutputToTool(targetTool, result?.finalOutput ?? '')}
                className="min-h-[38px] px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-xs font-semibold"
              >
                {t('pipeline.sendToTool')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
