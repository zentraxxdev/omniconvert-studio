import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Upload,
  Download,
  RotateCcw,
  FlipHorizontal2,
  Grid,
  Cuboid,
} from 'lucide-react';
import CadWorker from '../../workers/cad.worker?worker';
import type {
  CadWorkerRequest,
  CadWorkerResult,
  CadFormat,
} from '../../workers/cad.worker';
import { useWorker } from '../../hooks/useWorker';
import { useI18n } from '../../hooks/useI18n';
import { useWorkspaceStore } from '../../hooks/useWorkspaceStore';
import { SplitPane } from '../../components/SplitPane';

const TARGET_FORMATS: Array<{ id: CadFormat; label: string }> = [
  { id: 'stl-binary', label: 'STL (Binary)' },
  { id: 'stl-ascii', label: 'STL (ASCII)' },
  { id: 'obj', label: 'OBJ (Wavefront)' },
  { id: '3mf', label: '3MF (Package)' },
  { id: 'ply', label: 'PLY (Polygon)' },
  { id: 'glb', label: 'GLB (Binary glTF)' },
  { id: 'gltf', label: 'GLTF (JSON)' },
];

const SCALE_PRESETS = [
  { label: '0.1×', value: 0.1 },
  { label: '1.0×', value: 1.0 },
  { label: '2.0×', value: 2.0 },
  { label: '10×', value: 10.0 },
  { label: 'in → mm (25.4×)', value: 25.4 },
];

export const Cad3dTool: React.FC = () => {
  const { t } = useI18n();
  const pendingDroppedFile = useWorkspaceStore((s) => s.pendingDroppedFile);
  const setPendingDroppedFile = useWorkspaceStore((s) => s.setPendingDroppedFile);

  const [sourceFile, setSourceFile] = useState<{ name: string; buffer: ArrayBuffer } | null>(null);
  const [targetFormat, setTargetFormat] = useState<CadFormat>('stl-binary');
  const [invertNormals, setInvertNormals] = useState(false);
  const [scaleMultiplier, setScaleMultiplier] = useState(1.0);
  const [renderMode, setRenderMode] = useState<'wireframe' | 'solid'>('solid');
  const [meshResult, setMeshResult] = useState<CadWorkerResult | null>(null);

  // Orbit Camera State for 3D Preview Canvas
  const [rotation, setRotation] = useState({ yaw: 0.65, pitch: 0.45 });
  const [zoom, setZoom] = useState(1.0);
  const isOrbitingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const workerFactory = useCallback(() => new CadWorker(), []);
  const { run } = useWorker<CadWorkerRequest, CadWorkerResult>(workerFactory);

  const loadMeshFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    setSourceFile({ name: file.name, buffer });
  }, []);

  useEffect(() => {
    if (pendingDroppedFile) {
      const ext = pendingDroppedFile.name.split('.').pop()?.toLowerCase() ?? '';
      if (['3mf', 'stl', 'obj', 'ply', 'gltf', 'glb'].includes(ext)) {
        void loadMeshFile(pendingDroppedFile);
        setPendingDroppedFile(null);
      }
    }
  }, [pendingDroppedFile, loadMeshFile, setPendingDroppedFile]);

  useEffect(() => {
    void run({
      action: sourceFile ? 'parseAndConvert' : 'generateSample',
      fileName: sourceFile?.name ?? 'calibration-gear.stl',
      buffer: sourceFile?.buffer,
      targetFormat,
      invertNormals,
      scale: scaleMultiplier,
    })
      .then(setMeshResult)
      .catch(() => {
        // Handled by worker hook
      });
  }, [sourceFile, targetFormat, invertNormals, scaleMultiplier, run]);

  // Software 3D Projection & Flat/Wireframe Matte Monochrome Rasterizer on HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !meshResult) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    // Draw subtle matte reference grid
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const pos = meshResult.previewPositions;
    const norm = meshResult.previewNormals;
    const triCount = Math.floor(pos.length / 9);
    if (triCount === 0) return;

    const maxDim = Math.max(
      meshResult.boundingBox.width,
      meshResult.boundingBox.height,
      meshResult.boundingBox.depth,
      1
    );
    const fitScale = (Math.min(width, height) * 0.62 * zoom) / maxDim;

    const cosY = Math.cos(rotation.yaw);
    const sinY = Math.sin(rotation.yaw);
    const cosP = Math.cos(rotation.pitch);
    const sinP = Math.sin(rotation.pitch);

    const project = (x: number, y: number, z: number): [number, number, number] => {
      const rx = x * cosY - z * sinY;
      const rz = x * sinY + z * cosY;
      const ry = y * cosP - rz * sinP;
      const fz = y * sinP + rz * cosP;
      const sx = width / 2 + rx * fitScale;
      const sy = height / 2 - ry * fitScale;
      return [sx, sy, fz];
    };

    if (renderMode === 'wireframe') {
      ctx.strokeStyle = '#d4d4d8';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      const step = triCount > 4000 ? 2 : 1;
      for (let i = 0; i < triCount; i += step) {
        const b = i * 9;
        const [x1, y1] = project(pos[b], pos[b + 1], pos[b + 2]);
        const [x2, y2] = project(pos[b + 3], pos[b + 4], pos[b + 5]);
        const [x3, y3] = project(pos[b + 6], pos[b + 7], pos[b + 8]);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.closePath();
      }
      ctx.stroke();
    } else {
      // Painter's depth-sorted flat monochrome shading
      const projectedTris: Array<{
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        x3: number;
        y3: number;
        depth: number;
        lum: number;
      }> = [];

      for (let i = 0; i < triCount; i++) {
        const b = i * 9;
        const nb = i * 3;
        const [x1, y1, z1] = project(pos[b], pos[b + 1], pos[b + 2]);
        const [x2, y2, z2] = project(pos[b + 3], pos[b + 4], pos[b + 5]);
        const [x3, y3, z3] = project(pos[b + 6], pos[b + 7], pos[b + 8]);

        // Rotate normal for directional matte studio lighting
        const nx = norm[nb] * cosY - norm[nb + 2] * sinY;
        const nz = norm[nb] * sinY + norm[nb + 2] * cosY;
        const ny = norm[nb + 1] * cosP - nz * sinP;
        const fnz = norm[nb + 1] * sinP + nz * cosP;

        const dot = Math.max(0.18, Math.min(1, nx * 0.35 + ny * 0.55 + Math.abs(fnz) * 0.65));
        const lum = Math.round(45 + dot * 175);

        projectedTris.push({
          x1,
          y1,
          x2,
          y2,
          x3,
          y3,
          depth: (z1 + z2 + z3) / 3,
          lum,
        });
      }

      projectedTris.sort((a, b) => a.depth - b.depth);

      for (const tri of projectedTris) {
        const c = `rgb(${tri.lum}, ${tri.lum}, ${tri.lum + 4})`;
        ctx.fillStyle = c;
        ctx.strokeStyle = '#27272a';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(tri.x1, tri.y1);
        ctx.lineTo(tri.x2, tri.y2);
        ctx.lineTo(tri.x3, tri.y3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }, [meshResult, rotation, zoom, renderMode]);

  const handleExportMesh = () => {
    if (!meshResult) return;
    const blob = new Blob([new Uint8Array(meshResult.outputBytes)], { type: meshResult.outputMime });
    const url = URL.createObjectURL(blob);
    const baseName = (sourceFile?.name ?? 'calibration-gear').replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.${meshResult.outputExtension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const leftPane = (
    <div className="flex flex-col h-full min-h-0 gap-3 overflow-y-auto pr-1">
      {/* Matte Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void loadMeshFile(f);
        }}
        onClick={() => fileInputRef.current?.click()}
        className="min-h-[96px] p-4 rounded-lg border border-dashed border-zinc-800 hover:border-zinc-600 bg-zinc-900/50 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".3mf,.stl,.obj,.ply,.gltf,.glb"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadMeshFile(f);
          }}
        />
        <Upload className="w-5 h-5 text-zinc-300" />
        <div className="text-xs font-medium text-zinc-200 text-center">
          {sourceFile ? sourceFile.name : t('tools.cad3d.dropPrompt')}
        </div>
        <div className="text-[11px] font-mono text-zinc-500">
          3MF ↔ STL (ASCII / Binary) ↔ OBJ ↔ PLY ↔ GLTF / GLB
        </div>
      </div>

      {/* Target Format Selector */}
      <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
            {t('tools.cad3d.targetFormat')}
          </span>
          <button
            type="button"
            onClick={() => setSourceFile(null)}
            className="text-[11px] text-zinc-400 hover:text-zinc-100 underline"
          >
            {t('tools.cad3d.loadSampleGear')}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {TARGET_FORMATS.map((fmt) => {
            const active = targetFormat === fmt.id;
            return (
              <button
                key={fmt.id}
                type="button"
                onClick={() => setTargetFormat(fmt.id)}
                className={`min-h-[38px] px-2.5 py-1.5 rounded text-xs font-mono font-medium border transition-colors ${
                  active
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                {fmt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Normals & Mesh Scale Multiplier */}
      <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
            {t('tools.cad3d.scaleMultiplier')}
          </span>
          <button
            type="button"
            onClick={() => setInvertNormals((v) => !v)}
            className={`min-h-[34px] px-3 py-1 rounded text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              invertNormals
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <FlipHorizontal2 className="w-3.5 h-3.5" />
            <span>{t('tools.cad3d.invertNormals')}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SCALE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setScaleMultiplier(preset.value)}
              className={`min-h-[34px] px-2.5 py-1 rounded text-xs font-mono border ${
                scaleMultiplier === preset.value
                  ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mesh Telemetry & Bounding Box */}
      {meshResult && (
        <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
            <div className="text-[10px] uppercase text-zinc-500">{t('tools.cad3d.vertices')}</div>
            <div className="text-sm font-mono font-bold text-zinc-100 mt-0.5">
              {meshResult.vertexCount.toLocaleString()}
            </div>
          </div>
          <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
            <div className="text-[10px] uppercase text-zinc-500">{t('tools.cad3d.triangles')}</div>
            <div className="text-sm font-mono font-bold text-zinc-100 mt-0.5">
              {meshResult.triangleCount.toLocaleString()}
            </div>
          </div>
          <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
            <div className="text-[10px] uppercase text-zinc-500">{t('tools.cad3d.boundingBox')}</div>
            <div className="text-xs font-mono font-semibold text-zinc-200 mt-1">
              {meshResult.boundingBox.width} × {meshResult.boundingBox.height} ×{' '}
              {meshResult.boundingBox.depth}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!meshResult}
        onClick={handleExportMesh}
        className="min-h-[44px] w-full rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
      >
        <Download className="w-4 h-4" />
        <span>
          {t('tools.cad3d.exportBtn')}{' '}
          {meshResult ? `(.${meshResult.outputExtension.toUpperCase()} • ${(meshResult.outputBytes.byteLength / 1024).toFixed(1)} KB)` : ''}
        </span>
      </button>
    </div>
  );

  const rightPane = (
    <div className="flex flex-col h-full min-h-0 gap-2.5">
      {/* 3D Viewport Controls */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRenderMode('solid')}
            className={`min-h-[36px] px-3 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
              renderMode === 'solid'
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
          >
            <Cuboid className="w-3.5 h-3.5" />
            <span>{t('tools.cad3d.solid')}</span>
          </button>
          <button
            type="button"
            onClick={() => setRenderMode('wireframe')}
            className={`min-h-[36px] px-3 py-1 rounded text-xs font-medium border flex items-center gap-1.5 ${
              renderMode === 'wireframe'
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>{t('tools.cad3d.wireframe')}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setRotation({ yaw: 0.65, pitch: 0.45 });
            setZoom(1.0);
          }}
          className="min-h-[36px] px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t('tools.cad3d.resetCamera')}</span>
        </button>
      </div>

      {/* Interactive Orbit 3D Canvas */}
      <div className="flex-1 min-h-0 rounded-lg bg-zinc-950 border border-zinc-800 relative overflow-hidden flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={680}
          height={520}
          onPointerDown={(e) => {
            isOrbitingRef.current = true;
            lastPointerRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (!isOrbitingRef.current) return;
            const dx = e.clientX - lastPointerRef.current.x;
            const dy = e.clientY - lastPointerRef.current.y;
            lastPointerRef.current = { x: e.clientX, y: e.clientY };
            setRotation((prev) => ({
              yaw: prev.yaw + dx * 0.01,
              pitch: Math.max(-1.4, Math.min(1.4, prev.pitch + dy * 0.01)),
            }));
          }}
          onPointerUp={() => {
            isOrbitingRef.current = false;
          }}
          onPointerLeave={() => {
            isOrbitingRef.current = false;
          }}
          onWheel={(e) => {
            e.preventDefault();
            setZoom((z) => Math.max(0.3, Math.min(3.5, z - e.deltaY * 0.001)));
          }}
          className="w-full h-full object-contain cursor-grab active:cursor-grabbing"
        />
        <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded bg-zinc-900/90 border border-zinc-800 text-[11px] font-mono text-zinc-400 flex items-center gap-2 pointer-events-none">
          <Box className="w-3.5 h-3.5 text-zinc-300" />
          <span>Drag to Orbit • Scroll to Zoom ({zoom.toFixed(1)}×)</span>
        </div>
      </div>
    </div>
  );

  return <SplitPane leftPane={leftPane} rightPane={rightPane} />;
};
