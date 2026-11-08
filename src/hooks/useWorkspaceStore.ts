import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { getToolById, type ToolId, type TopNavCategoryId } from '../config/tools';

export interface PipelineStepConfig {
  id: string;
  operation:
    | 'base64Decode'
    | 'base64Encode'
    | 'urlDecode'
    | 'urlEncode'
    | 'jsonPrettify'
    | 'jsonMinify'
    | 'jsonSortKeys'
    | 'jsonFilterKeys'
    | 'jwtExtractPayload'
    | 'sha256'
    | 'md5'
    | 'trimLines'
    | 'dedupeLines'
    | 'sortLines'
    | 'upperCase'
    | 'lowerCase';
  arg?: string;
}

interface WorkspacePayload {
  activeToolId: ToolId;
  activeTopNav: TopNavCategoryId;
  toolInputs: Record<ToolId, string>;
  diffSecondaryInput: string;
  pipelineSteps: PipelineStepConfig[];
  pipelineInput: string;
}

const IDB_WORKSPACE_KEY = 'omniconvert_workspace_v2';

const DEFAULT_TOOL_INPUTS: Record<ToolId, string> = {
  'universal-hub': '',
  'cad-3d': '',
  'media-images': '',
  documents: `id,component,material,mass_grams,qa_passed
101,BevelGear_M2,Ti-6Al-4V,42.8,true
102,StatorHousing_B,Al-7075-T6,184.5,true
103,LinearRail_Carrier,Steel-440C,95.0,true
104,OpticalMount_V3,Invar-36,61.2,false
105,ThermalPlate_Hex,Cu-C110,210.4,true`,
  'audio-video': '',
  'archives-fonts': '',
  'json-studio': JSON.stringify(
    {
      engine: 'OmniConvert Studio',
      version: '2.0.0',
      designPolicy: 'Matte Monochrome (Zero-Neon)',
      zeroNetwork: true,
      csp: "connect-src 'none'; default-src 'self'",
      modules: ['cad-3d', 'media-images', 'documents', 'audio-video', 'archives-fonts', 'dev-tools'],
      benchmarks: {
        startupMs: 3.8,
        memoryFootprintMb: 11.2,
        targetFps: 60,
      },
    },
    null,
    2
  ),
  'jwt-inspector':
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfOTg3NjU0MzIxIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsInJvbGUiOiJzeXN0ZW1fYXJjaGl0ZWN0IiwiaWF0IjoxNzMwMDAwMDAwLCJleHAiOjE5OTk5OTk5OTl9.7yH0tLw1dM8X9l7x2v5B4qR3sK9pW6nJ1mF5cZ8gY2A',
  'diff-checker': `function verifyZeroNetworkPolicy(headers) {
  const csp = headers['content-security-policy'];
  if (!csp) {
    return { valid: false, reason: 'Missing CSP header' };
  }
  return {
    valid: csp.includes("connect-src 'none'"),
    timestamp: Date.now()
  };
}`,
  'crypto-hasher': 'OmniConvert Studio — Zero-Network Local Execution Suite',
  'regex-lab': `Contact security@omniconvert.local or ops-team@engine.internal for audit logs.
Node 192.168.1.42 processed request 550e8400-e29b-41d4-a716-446655440000 at 2026-11-08T20:15:30Z.
Backup support@omniconvert.local verified on 10.0.0.128 at 2026-11-08T21:00:00Z.`,
  'image-optimizer': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <!-- Generator: Inkscape 1.3.2 (metadata to be stripped) -->
  <metadata id="mid-01">OmniConvert Vector Sample</metadata>
  <g id="layer-main">
    <rect x="16.12345" y="16.98765" width="167.7531" height="167.0123" rx="24.4444" fill="#18181b" stroke="#e4e4e7" stroke-width="5" />
    <path d="M 60.111 72.889 L 94.555 100.222 L 60.111 127.555" fill="none" stroke="#f4f4f5" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
    <line x1="106.333" y1="128.001" x2="142.888" y2="128.001" stroke="#a1a1aa" stroke-width="10" stroke-linecap="round" />
  </g>
</svg>`,
};

const DEFAULT_DIFF_SECONDARY = `function verifyZeroNetworkPolicy(headers, strictMode = true) {
  const csp = headers['content-security-policy'] ?? '';
  if (!csp) {
    throw new Error('Missing strict CSP header');
  }
  const isLocked = csp.includes("connect-src 'none'") && csp.includes("default-src 'self'");
  return {
    valid: strictMode ? isLocked : true,
    enforcedAt: performance.now()
  };
}`;

const DEFAULT_PIPELINE_STEPS: PipelineStepConfig[] = [
  { id: 'step-1', operation: 'base64Decode' },
  { id: 'step-2', operation: 'jsonPrettify' },
  { id: 'step-3', operation: 'jsonFilterKeys', arg: 'engine,zeroNetwork,role' },
];

const DEFAULT_PIPELINE_INPUT = btoa(
  JSON.stringify({
    engine: 'OmniConvert Studio',
    zeroNetwork: true,
    role: 'chained-pipeline-demo',
    ignoredField: 'will-be-filtered-out',
    secretToken: 42,
  })
);

interface WorkspaceState extends WorkspacePayload {
  isHydrated: boolean;
  lastSavedAt: number | null;
  lastExecutionMs: number | null;
  isWorkerBusy: boolean;
  isCommandPaletteOpen: boolean;
  isPipelineModalOpen: boolean;
  mobilePaneTab: 'input' | 'output';
  pendingDroppedFile: File | null;
  setActiveToolId: (id: ToolId) => void;
  setActiveTopNav: (nav: TopNavCategoryId, defaultToolId: ToolId) => void;
  setToolInput: (id: ToolId, value: string) => void;
  setDiffSecondaryInput: (value: string) => void;
  setPipelineSteps: (steps: PipelineStepConfig[]) => void;
  setPipelineInput: (input: string) => void;
  setExecutionMetrics: (ms: number, busy?: boolean) => void;
  setWorkerBusy: (busy: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setPipelineModalOpen: (open: boolean) => void;
  setMobilePaneTab: (tab: 'input' | 'output') => void;
  setPendingDroppedFile: (file: File | null) => void;
  openFileInStudio: (targetToolId: ToolId, file: File) => void;
  pipeOutputToTool: (targetToolId: ToolId, outputPayload: string) => void;
  resetCurrentTool: () => void;
  hydrateFromIndexedDB: () => Promise<void>;
}

let saveDebounceTimer: number | null = null;

function persistToIndexedDB(state: WorkspacePayload, onSaved: () => void) {
  if (saveDebounceTimer) {
    window.clearTimeout(saveDebounceTimer);
  }
  saveDebounceTimer = window.setTimeout(() => {
    void idbSet(IDB_WORKSPACE_KEY, {
      activeToolId: state.activeToolId,
      activeTopNav: state.activeTopNav,
      toolInputs: state.toolInputs,
      diffSecondaryInput: state.diffSecondaryInput,
      pipelineSteps: state.pipelineSteps,
      pipelineInput: state.pipelineInput,
    })
      .then(onSaved)
      .catch(() => {
        // IndexedDB unavailable in private mode
      });
  }, 250);
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activeToolId: 'universal-hub',
  activeTopNav: 'all',
  toolInputs: { ...DEFAULT_TOOL_INPUTS },
  diffSecondaryInput: DEFAULT_DIFF_SECONDARY,
  pipelineSteps: DEFAULT_PIPELINE_STEPS,
  pipelineInput: DEFAULT_PIPELINE_INPUT,
  isHydrated: false,
  lastSavedAt: null,
  lastExecutionMs: 0.8,
  isWorkerBusy: false,
  isCommandPaletteOpen: false,
  isPipelineModalOpen: false,
  mobilePaneTab: 'input',
  pendingDroppedFile: null,

  setActiveToolId: (id) => {
    const entry = getToolById(id);
    set({ activeToolId: id, activeTopNav: entry.topNav });
    const s = get();
    persistToIndexedDB(s, () => set({ lastSavedAt: Date.now() }));
  },

  setActiveTopNav: (nav, defaultToolId) => {
    set({ activeTopNav: nav, activeToolId: defaultToolId });
    const s = get();
    persistToIndexedDB(s, () => set({ lastSavedAt: Date.now() }));
  },

  setToolInput: (id, value) => {
    set((prev) => ({
      toolInputs: { ...prev.toolInputs, [id]: value },
    }));
    const s = get();
    persistToIndexedDB(s, () => set({ lastSavedAt: Date.now() }));
  },

  setDiffSecondaryInput: (value) => {
    set({ diffSecondaryInput: value });
    const s = get();
    persistToIndexedDB(s, () => set({ lastSavedAt: Date.now() }));
  },

  setPipelineSteps: (steps) => {
    set({ pipelineSteps: steps });
    const s = get();
    persistToIndexedDB(s, () => set({ lastSavedAt: Date.now() }));
  },

  setPipelineInput: (input) => {
    set({ pipelineInput: input });
    const s = get();
    persistToIndexedDB(s, () => set({ lastSavedAt: Date.now() }));
  },

  setExecutionMetrics: (ms, busy = false) => {
    set({ lastExecutionMs: Number(ms.toFixed(2)), isWorkerBusy: busy });
  },

  setWorkerBusy: (busy) => {
    set({ isWorkerBusy: busy });
  },

  setCommandPaletteOpen: (open) => {
    set({ isCommandPaletteOpen: open });
  },

  setPipelineModalOpen: (open) => {
    set({ isPipelineModalOpen: open });
  },

  setMobilePaneTab: (tab) => {
    set({ mobilePaneTab: tab });
  },

  setPendingDroppedFile: (file) => {
    set({ pendingDroppedFile: file });
  },

  openFileInStudio: (targetToolId, file) => {
    const entry = getToolById(targetToolId);
    set({
      activeToolId: targetToolId,
      activeTopNav: entry.topNav,
      pendingDroppedFile: file,
    });
  },

  pipeOutputToTool: (targetToolId, outputPayload) => {
    const entry = getToolById(targetToolId);
    set((prev) => ({
      activeToolId: targetToolId,
      activeTopNav: entry.topNav,
      toolInputs: { ...prev.toolInputs, [targetToolId]: outputPayload },
      mobilePaneTab: 'input',
      isPipelineModalOpen: false,
    }));
    const s = get();
    persistToIndexedDB(s, () => set({ lastSavedAt: Date.now() }));
  },

  resetCurrentTool: () => {
    const active = get().activeToolId;
    set((prev) => ({
      toolInputs: {
        ...prev.toolInputs,
        [active]: DEFAULT_TOOL_INPUTS[active],
      },
      diffSecondaryInput:
        active === 'diff-checker' ? DEFAULT_DIFF_SECONDARY : prev.diffSecondaryInput,
      pendingDroppedFile: null,
    }));
    const s = get();
    void idbDel(IDB_WORKSPACE_KEY).finally(() => {
      persistToIndexedDB(s, () => set({ lastSavedAt: Date.now() }));
    });
  },

  hydrateFromIndexedDB: async () => {
    try {
      const saved = await idbGet<Partial<WorkspacePayload>>(IDB_WORKSPACE_KEY);
      if (saved) {
        set((prev) => ({
          activeToolId: saved.activeToolId ?? prev.activeToolId,
          activeTopNav: saved.activeTopNav ?? prev.activeTopNav,
          toolInputs: { ...DEFAULT_TOOL_INPUTS, ...(saved.toolInputs ?? {}) },
          diffSecondaryInput: saved.diffSecondaryInput ?? prev.diffSecondaryInput,
          pipelineSteps: saved.pipelineSteps ?? prev.pipelineSteps,
          pipelineInput: saved.pipelineInput ?? prev.pipelineInput,
          isHydrated: true,
          lastSavedAt: Date.now(),
        }));
      } else {
        set({ isHydrated: true });
      }
    } catch {
      set({ isHydrated: true });
    }
  },
}));
