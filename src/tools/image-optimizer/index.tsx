import React, { useState, useMemo, useEffect } from 'react';
import {
  FileCode2,
  Copy,
  Check,
} from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import { useWorkspaceStore } from '../../hooks/useWorkspaceStore';
import { useClipboard } from '../../hooks/useClipboard';
import { SplitPane } from '../../components/SplitPane';
import { StreamDropZone } from '../../components/StreamDropZone';
import { PipeToMenu } from '../../components/PipeToMenu';

function optimizeSvgMarkup(
  raw: string,
  options: {
    stripComments: boolean;
    collapseWhitespace: boolean;
    roundNumbers: boolean;
    toJsx: boolean;
  }
): { output: string; cleanSvgForPreview: string; origBytes: number; optBytes: number } {
  const encoder = new TextEncoder();
  const origBytes = encoder.encode(raw).byteLength;
  let s = raw.trim();

  if (options.stripComments) {
    s = s
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
      .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
      .replace(/<desc[\s\S]*?<\/desc>/gi, '')
      .replace(
        /\s+(?:xmlns:sodipodi|xmlns:inkscape|sodipodi:[a-z-]+|inkscape:[a-z-]+)="[^"]*"/gi,
        ''
      );
  }

  if (options.roundNumbers) {
    s = s.replace(/(\d+\.\d{3,})/g, (match) => {
      const n = parseFloat(match);
      return Number.isFinite(n) ? Number(n.toFixed(2)).toString() : match;
    });
  }

  if (options.collapseWhitespace) {
    s = s
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  const cleanSvgForPreview = s;

  if (options.toJsx) {
    const jsxBody = s
      .replace(/stroke-width=/g, 'strokeWidth=')
      .replace(/stroke-linecap=/g, 'strokeLinecap=')
      .replace(/stroke-linejoin=/g, 'strokeLinejoin=')
      .replace(/stroke-dasharray=/g, 'strokeDasharray=')
      .replace(/stroke-dashoffset=/g, 'strokeDashoffset=')
      .replace(/stroke-miterlimit=/g, 'strokeMiterlimit=')
      .replace(/stroke-opacity=/g, 'strokeOpacity=')
      .replace(/fill-opacity=/g, 'fillOpacity=')
      .replace(/fill-rule=/g, 'fillRule=')
      .replace(/clip-path=/g, 'clipPath=')
      .replace(/clip-rule=/g, 'clipRule=')
      .replace(/stop-color=/g, 'stopColor=')
      .replace(/stop-opacity=/g, 'stopOpacity=')
      .replace(/class=/g, 'className=');

    s = `import React from 'react';\n\nexport const OptimizedIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (\n  ${jsxBody.replace(
      /<svg/,
      '<svg {...props}'
    )}\n);\n`;
  }

  const optBytes = encoder.encode(s).byteLength;
  return { output: s, cleanSvgForPreview, origBytes, optBytes };
}

export const ImageOptimizerTool: React.FC = () => {
  const { t } = useI18n();
  const svgInput = useWorkspaceStore((s) => s.toolInputs['image-optimizer']);
  const setToolInput = useWorkspaceStore((s) => s.setToolInput);
  const setExecutionMetrics = useWorkspaceStore((s) => s.setExecutionMetrics);

  const [stripComments, setStripComments] = useState(true);
  const [collapseWhitespace, setCollapseWhitespace] = useState(true);
  const [roundNumbers, setRoundNumbers] = useState(true);
  const [toJsx, setToJsx] = useState(false);

  const { copied, copy } = useClipboard();

  const svgResult = useMemo(() => {
    const start = performance.now();
    const res = optimizeSvgMarkup(svgInput, {
      stripComments,
      collapseWhitespace,
      roundNumbers,
      toJsx,
    });
    return {
      ...res,
      elapsedMs: Math.max(0.1, performance.now() - start),
    };
  }, [svgInput, stripComments, collapseWhitespace, roundNumbers, toJsx]);

  useEffect(() => {
    setExecutionMetrics(svgResult.elapsedMs, false);
  }, [svgResult.elapsedMs, setExecutionMetrics]);

  const savingsPercent =
    svgResult.origBytes > 0
      ? Math.max(
          0,
          Math.round(((svgResult.origBytes - svgResult.optBytes) / svgResult.origBytes) * 100)
        )
      : 0;

  const svgDataUri = useMemo(() => {
    if (!svgResult.cleanSvgForPreview.startsWith('<svg')) return null;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svgResult.cleanSvgForPreview)}`;
  }, [svgResult.cleanSvgForPreview]);

  const leftPane = (
    <div className="flex flex-col h-full min-h-0 gap-2.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200 shrink-0">
        <FileCode2 className="w-4 h-4 text-zinc-300" />
        <span>{t('tools.imageOptimizer.modeSvg')}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setStripComments((v) => !v)}
          className={`min-h-[34px] px-2.5 py-1 rounded text-xs border ${
            stripComments
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          }`}
        >
          {t('tools.imageOptimizer.stripComments')}
        </button>
        <button
          type="button"
          onClick={() => setCollapseWhitespace((v) => !v)}
          className={`min-h-[34px] px-2.5 py-1 rounded text-xs border ${
            collapseWhitespace
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          }`}
        >
          {t('tools.imageOptimizer.collapseWhitespace')}
        </button>
        <button
          type="button"
          onClick={() => setRoundNumbers((v) => !v)}
          className={`min-h-[34px] px-2.5 py-1 rounded text-xs border ${
            roundNumbers
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          }`}
        >
          {t('tools.imageOptimizer.roundNumbers')}
        </button>
        <button
          type="button"
          onClick={() => setToJsx((v) => !v)}
          className={`min-h-[34px] px-2.5 py-1 rounded text-xs border ${
            toJsx
              ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          }`}
        >
          {t('tools.imageOptimizer.jsxOutput')}
        </button>
      </div>

      <StreamDropZone
        accept=".svg,.xml"
        onTextStreamed={(txt) => setToolInput('image-optimizer', txt)}
      />

      <textarea
        value={svgInput}
        onChange={(e) => setToolInput('image-optimizer', e.target.value)}
        placeholder={t('tools.imageOptimizer.svgInputPlaceholder')}
        spellCheck={false}
        className="flex-1 min-h-0 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 resize-none"
      />
    </div>
  );

  const rightPane = (
    <div className="flex flex-col h-full min-h-0 gap-2.5">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-200">
          {t('tools.imageOptimizer.savings', {
            orig: svgResult.origBytes,
            opt: svgResult.optBytes,
            percent: savingsPercent,
          })}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copy(svgResult.output)}
            className="min-h-[36px] px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? t('app.copied') : t('app.copy')}</span>
          </button>
          <PipeToMenu outputPayload={svgResult.output} />
        </div>
      </div>

      {svgDataUri && (
        <div className="h-44 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center p-3 shrink-0">
          <img
            src={svgDataUri}
            alt="Optimized SVG Preview"
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}

      <textarea
        readOnly
        value={svgResult.output}
        spellCheck={false}
        className="flex-1 min-h-0 w-full rounded-lg bg-zinc-900 border border-zinc-800 p-3 font-mono text-xs text-zinc-200 focus:outline-none resize-none"
      />
    </div>
  );

  return <SplitPane leftPane={leftPane} rightPane={rightPane} />;
};
