import { create } from "zustand";
import * as api from "./api-client";
import { ApiError } from "./api-client";
import {
  ChatMessage,
  Credits,
  EditorState,
  GenerationStatus,
  PatternRecord,
  ConflictInfo,
  COSTS,
  Measurement,
} from "./types";

export type EditorTab = "pattern2d" | "proof3d" | "techsheet" | "cutplan";
export type EditorTool = "cursor" | "measure";

const GENERATION_STEP_COUNT = 4;
// Gaps between steps 1→2→3→4, increasing so the fake progress doesn't blast
// through all steps in under a second and then sit frozen on the last one
// while the real AI call is still in flight.
const GENERATION_STEP_DELAYS_MS = [500, 1100, 2000];

interface PaywallState {
  open: boolean;
  required: number;
  balance: number;
  action: "adjust" | "graduate" | null;
  retry: (() => void) | null;
}

interface EditorStore {
  ready: boolean;
  /**
   * Wire error code of the last failed call, or null. Every action funnels its
   * failures here: before this existed the store had no try/catch at all, so a
   * rejected request left the editor on its loading screen (init) or spinning
   * the generating overlay forever (sendMessage), with nothing on screen.
   */
  error: string | null;
  patternId: string | null;
  pattern: PatternRecord | null;
  chat: ChatMessage[];
  credits: Credits | null;
  conflict: ConflictInfo | null;

  activeTab: EditorTab;
  selectedPieceId: string | null;
  detailsPanelOpen: boolean;
  activeTool: EditorTool;
  measurements: Measurement[];

  generationStatus: GenerationStatus;
  generationStepIndex: number;
  generationRequestId: number;

  paywall: PaywallState;

  init: (patternId: string) => Promise<void>;
  clearError: () => void;
  sendMessage: (
    message: string,
    opts?: { answering?: boolean },
  ) => Promise<void>;
  cancelGeneration: () => void;
  graduateSizes: (sizes: string[]) => Promise<void>;
  resolveConflict: (action: "fix" | "ignore") => Promise<void>;
  purchase: (type: "topup" | "subscribe") => Promise<void>;
  closePaywall: () => void;
  saveAsSloper: (name: string) => Promise<boolean>;

  setActiveTab: (tab: EditorTab) => void;
  selectPiece: (id: string | null) => void;
  toggleDetailsPanel: () => void;
  setActiveTool: (tool: EditorTool) => void;
  addMeasurement: (m: Measurement) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;
}

/** ApiError carries the wire code; anything else (offline, parse) is generic. */
function errorCode(err: unknown): string {
  return err instanceof ApiError ? err.code : "request_failed";
}

function applyState(
  set: (partial: Partial<EditorStore>) => void,
  state: EditorState,
) {
  set({
    pattern: state.pattern,
    chat: state.chat,
    credits: state.credits,
    conflict: state.conflict,
  });
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  ready: false,
  error: null,
  patternId: null,
  pattern: null,
  chat: [],
  credits: null,
  conflict: null,

  activeTab: "pattern2d",
  selectedPieceId: null,
  detailsPanelOpen: true,
  activeTool: "cursor",
  measurements: [],

  generationStatus: "idle",
  generationStepIndex: 0,
  generationRequestId: 0,

  paywall: {
    open: false,
    required: 0,
    balance: 0,
    action: null,
    retry: null,
  },

  init: async (patternId: string) => {
    set({ patternId, error: null });
    try {
      const state = await api.fetchPattern(patternId);
      applyState(set, state);
      set({
        ready: true,
        selectedPieceId: state.pattern.pieces[0]?.id ?? null,
      });
    } catch (err) {
      // ready:true on purpose -- EditorShell's loading early-return would
      // otherwise leave a permanent spinner with no way to know why.
      set({ ready: true, error: errorCode(err) });
    }
  },

  clearError: () => set({ error: null }),

  sendMessage: async (message: string, opts?: { answering?: boolean }) => {
    if (!message.trim()) return;
    const patternId = get().patternId;
    if (!patternId) return;
    const requestId = get().generationRequestId + 1;
    set((s) => ({
      generationStatus: "generating",
      generationStepIndex: 0,
      generationRequestId: requestId,
      chat: [
        ...s.chat,
        {
          id: `optimistic-${requestId}`,
          author: "user",
          text: message,
          createdAt: Date.now(),
        },
      ],
    }));
    let stepTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleStep = (i: number) => {
      if (i >= GENERATION_STEP_DELAYS_MS.length) return;
      stepTimer = setTimeout(() => {
        set((s) => ({
          generationStepIndex: Math.min(
            s.generationStepIndex + 1,
            GENERATION_STEP_COUNT - 1,
          ),
        }));
        scheduleStep(i + 1);
      }, GENERATION_STEP_DELAYS_MS[i]);
    };
    scheduleStep(0);

    let result: Awaited<ReturnType<typeof api.generate>>;
    try {
      result = await api.generate(patternId, message, opts?.answering);
    } catch (err) {
      clearTimeout(stepTimer);
      if (get().generationRequestId !== requestId) return; // canceled
      // Roll the optimistic message back and leave the pattern untouched --
      // applyState would have written undefined over it.
      set((s) => ({
        generationStatus: "error",
        error: errorCode(err),
        chat: s.chat.filter((m) => !m.id.startsWith("optimistic-")),
      }));
      return;
    }
    clearTimeout(stepTimer);

    if (get().generationRequestId !== requestId) return; // canceled

    if (result.status === "insufficient_credits") {
      set((s) => ({
        generationStatus: "idle",
        chat: s.chat.filter((m) => !m.id.startsWith("optimistic-")),
        paywall: {
          open: true,
          required: result.required,
          balance: result.balance,
          action: "adjust",
          retry: () => get().sendMessage(message, opts),
        },
      }));
      return;
    }

    const prevVersion = get().pattern?.version;
    applyState(set, result.state);
    const shouldSelectFirst =
      !get().selectedPieceId && result.state.pattern.pieces.length > 0;
    set({
      generationStatus: result.status === "error" ? "error" : "idle",
      ...(shouldSelectFirst
        ? { selectedPieceId: result.state.pattern.pieces[0].id }
        : {}),
      ...(result.state.pattern.version !== prevVersion
        ? { measurements: [] }
        : {}),
    });
  },

  cancelGeneration: () => {
    set((s) => ({
      generationStatus: "idle",
      generationRequestId: s.generationRequestId + 1,
      chat: s.chat.filter((m) => !m.id.startsWith("optimistic-")),
      credits: s.credits
        ? { ...s.credits, balance: s.credits.balance + COSTS.adjust }
        : s.credits,
    }));
  },

  graduateSizes: async (sizes: string[]) => {
    const patternId = get().patternId;
    if (!patternId) return;
    let result: Awaited<ReturnType<typeof api.graduate>>;
    try {
      result = await api.graduate(patternId, sizes);
    } catch (err) {
      set({ error: errorCode(err) });
      return;
    }
    if (result.status === "insufficient_credits") {
      set({
        paywall: {
          open: true,
          required: result.required,
          balance: result.balance,
          action: "graduate",
          retry: () => get().graduateSizes(sizes),
        },
      });
      return;
    }
    applyState(set, result.state);
  },

  resolveConflict: async (action: "fix" | "ignore") => {
    const patternId = get().patternId;
    if (!patternId) return;
    try {
      const result = await api.resolveConflict(patternId, action);
      if ("state" in result) applyState(set, result.state);
    } catch (err) {
      set({ error: errorCode(err) });
    }
  },

  purchase: async (type: "topup" | "subscribe") => {
    const patternId = get().patternId ?? undefined;
    let result: Awaited<ReturnType<typeof api.purchase>>;
    try {
      result = await api.purchase(type, patternId);
    } catch (err) {
      // The paywall stays open: the retry thunk is still valid, and closing it
      // on a failed purchase would look like the purchase worked.
      set({ error: errorCode(err) });
      return;
    }
    if ("state" in result) applyState(set, result.state);
    else if ("credits" in result) set({ credits: result.credits });
    const retry = get().paywall.retry;
    set({
      paywall: {
        open: false,
        required: 0,
        balance: 0,
        action: null,
        retry: null,
      },
    });
    retry?.();
  },

  closePaywall: () =>
    set({
      paywall: {
        open: false,
        required: 0,
        balance: 0,
        action: null,
        retry: null,
      },
    }),

  // Saving a base does not change the pattern, so this writes no state. It
  // returns a boolean rather than setting `error`, because a failed save
  // leaves a perfectly usable editor: the Footer shows an inline notice, the
  // same shape it already uses for an export failure.
  saveAsSloper: async (name: string) => {
    const patternId = get().patternId;
    if (!patternId) return false;
    try {
      await api.createSloper(patternId, name);
      return true;
    } catch {
      return false;
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  selectPiece: (id) =>
    set({ selectedPieceId: id, detailsPanelOpen: id !== null }),
  toggleDetailsPanel: () =>
    set((s) => ({ detailsPanelOpen: !s.detailsPanelOpen })),
  setActiveTool: (tool) => set({ activeTool: tool }),
  addMeasurement: (m) => set((s) => ({ measurements: [...s.measurements, m] })),
  removeMeasurement: (id) =>
    set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),
  clearMeasurements: () => set({ measurements: [] }),
}));

export { GENERATION_STEP_COUNT };
