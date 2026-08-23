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

const CLOSED_PAYWALL: PaywallState = {
  open: false,
  required: 0,
  balance: 0,
  action: null,
  retry: null,
};

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

  paywall: CLOSED_PAYWALL,

  init: async (patternId: string) => {
    // #32: the store is a module-level singleton, and until this reset
    // `init` cleared nothing but patternId/error -- pattern, chat, conflict,
    // measurements, selectedPieceId, generationStatus and paywall all kept
    // the PREVIOUS pattern's values, and ready stayed true. Opening pattern
    // B after A therefore rendered A's pieces/chat/conflict card (and any
    // open paywall, complete with a retry thunk that still resent A's
    // prompt) on B's screen until B's own fetch resolved -- and clicking
    // "Corrigir manga" or buying credits in that window mutated pattern B
    // with data that belonged to A. Guarded on the id actually differing so
    // a remount for the SAME pattern (React strict-mode double-effect)
    // doesn't blank an already-loaded screen. generationRequestId is bumped
    // (not reset to 0) so sendMessage's existing requestId guards (below)
    // discard any in-flight generate for the pattern being left.
    // #32: the store is a module-level singleton, and until this reset
    // `init` cleared nothing but patternId/error -- pattern, chat, conflict,
    // measurements, selectedPieceId, generationStatus and paywall all kept
    // the PREVIOUS pattern's values, and ready stayed true. Opening pattern
    // B after A therefore rendered A's pieces/chat/conflict card (and any
    // open paywall, complete with a retry thunk that still resent A's
    // prompt) on B's screen until B's own fetch resolved -- and clicking
    // "Corrigir manga" or buying credits in that window mutated pattern B
    // with data that belonged to A. Guarded on the id actually differing so
    // a remount for the SAME pattern (React strict-mode double-effect)
    // doesn't blank an already-loaded screen. generationRequestId is bumped
    // (not reset to 0) so sendMessage's existing requestId guards (below)
    // discard any in-flight generate for the pattern being left.
    const switchingPattern = get().patternId !== patternId;
    set({
      patternId,
      error: null,
      ...(switchingPattern
        ? {
            pattern: null,
            chat: [],
            credits: null,
            conflict: null,
            selectedPieceId: null,
            detailsPanelOpen: true,
            measurements: [],
            generationStatus: "idle" as GenerationStatus,
            generationStepIndex: 0,
            generationRequestId: get().generationRequestId + 1,
            paywall: CLOSED_PAYWALL,
            ready: false,
          }
        : {}),
    });
    try {
      const state = await api.fetchPattern(patternId);
      // A slow fetch for a pattern the user has since navigated away from
      // (init() was called again for a different id before this resolved)
      // must not overwrite whatever that later init already loaded.
      if (get().patternId !== patternId) return;
      applyState(set, state);
      set({
        ready: true,
        selectedPieceId: state.pattern.pieces[0]?.id ?? null,
      });
    } catch (err) {
      if (get().patternId !== patternId) return;
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

  // #32: every mutating action here now verifies (after its own await) that
  // the store hasn't since moved on to a different pattern -- init() bumps
  // generationRequestId when switching (sendMessage's existing requestId
  // checks already cover it, below), but graduateSizes/resolveConflict/
  // purchase had no such guard at all, so a response for a pattern the user
  // had already navigated away from wrote its state onto whatever pattern
  // was current by the time it arrived.
  graduateSizes: async (sizes: string[]) => {
    const patternId = get().patternId;
    if (!patternId) return;
    let result: Awaited<ReturnType<typeof api.graduate>>;
    try {
      result = await api.graduate(patternId, sizes);
    } catch (err) {
      if (get().patternId === patternId) set({ error: errorCode(err) });
      return;
    }
    if (get().patternId !== patternId) return;
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
      if (get().patternId !== patternId) return;
      if ("state" in result) applyState(set, result.state);
    } catch (err) {
      if (get().patternId === patternId) set({ error: errorCode(err) });
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
      if (!patternId || get().patternId === patternId) {
        set({ error: errorCode(err) });
      }
      return;
    }
    if (patternId && get().patternId !== patternId) return;
    if ("state" in result) applyState(set, result.state);
    else if ("credits" in result) set({ credits: result.credits });
    const retry = get().paywall.retry;
    set({ paywall: CLOSED_PAYWALL });
    retry?.();
  },

  closePaywall: () => set({ paywall: CLOSED_PAYWALL }),

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
