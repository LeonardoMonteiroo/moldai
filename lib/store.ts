import { create } from "zustand";
import * as api from "./api-client";
import { errorCode } from "./api-client";
import {
  ChatMessage,
  Credits,
  EditorState,
  GenerationStatus,
  PatternRecord,
  ConflictInfo,
  Measurement,
} from "./types";
import type { PreparedAttachment } from "./editor/attachment";
import type { PaidPlanId } from "./billing/plans";
import type { NestingMode } from "./export/cutplan";

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

  // #8: the cut-plan tab's own UI state, lifted here because Radix
  // unmounts the inactive TabsContent (no forceMount), so a plain
  // component-local useState died on every tab switch -- including the
  // fabric-width choice that already existed before this. Clamping stays in
  // lib/export/cutplan.ts (clampOriginCm) and is applied by the caller: the
  // store itself doesn't know piece sizes.
  cutFabricWidthCm: number;
  nestingMode: NestingMode;
  cutPlacements: Record<string, { x: number; y: number }>;

  generationStatus: GenerationStatus;
  generationStepIndex: number;
  generationRequestId: number;

  // #31: in-flight flags for the two paid actions that have no other
  // "already running" signal in the UI (sendMessage has generationStatus,
  // which already disables its own input/button). Without these, a double
  // click sent two POSTs; the server's row lock serialized them but did
  // nothing to deduplicate, so both were treated as separate paid actions --
  // graduate debited twice (12 credits for one grading, the most expensive
  // action in the app) and a top-up granted double credits.
  graduating: boolean;
  purchasing: boolean;

  paywall: PaywallState;

  init: (patternId: string) => Promise<void>;
  clearError: () => void;
  sendMessage: (
    message: string,
    opts?: { answering?: boolean; image?: PreparedAttachment },
  ) => Promise<void>;
  cancelGeneration: () => void;
  graduateSizes: (sizes: string[]) => Promise<void>;
  resolveConflict: (action: "fix" | "ignore") => Promise<void>;
  purchase: (type: "topup" | "subscribe", plan?: PaidPlanId) => Promise<void>;
  closePaywall: () => void;
  saveAsSloper: (name: string) => Promise<boolean>;

  setActiveTab: (tab: EditorTab) => void;
  selectPiece: (id: string | null) => void;
  toggleDetailsPanel: () => void;
  setActiveTool: (tool: EditorTool) => void;
  addMeasurement: (m: Measurement) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;

  setCutFabricWidth: (widthCm: number) => void;
  setNestingMode: (mode: NestingMode) => void;
  setCutPlacement: (id: string, originCm: { x: number; y: number }) => void;
  seedCutPlacements: (record: Record<string, { x: number; y: number }>) => void;
  resetCutPlacements: () => void;
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

// #35: was local to one sendMessage call, so cancelGeneration had no handle
// to clear it -- an orphaned chain kept ticking generationStepIndex forward
// for a generation the user had already canceled, and (if a new one was sent
// immediately after) for the WRONG generation. Module-scope is enough: the
// store is a singleton and only one generation is ever in flight per screen.
let stepTimer: ReturnType<typeof setTimeout> | undefined;

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

  cutFabricWidthCm: 150,
  nestingMode: "auto",
  cutPlacements: {},

  generationStatus: "idle",
  generationStepIndex: 0,
  generationRequestId: 0,

  graduating: false,
  purchasing: false,

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
            cutFabricWidthCm: 150,
            nestingMode: "auto" as NestingMode,
            cutPlacements: {},
            generationStatus: "idle" as GenerationStatus,
            generationStepIndex: 0,
            generationRequestId: get().generationRequestId + 1,
            // #31: a graduate/purchase in flight for the pattern being left
            // must not go on disabling the new pattern's own buttons --
            // graduateSizes/purchase deliberately leave this flag untouched
            // when their own patternId no longer matches current (below),
            // so this reset is what actually clears it for the new pattern.
            graduating: false,
            purchasing: false,
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

  sendMessage: async (
    message: string,
    opts?: { answering?: boolean; image?: PreparedAttachment },
  ) => {
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
          // #18: the bytes travel with the request only -- this is enough to
          // render the "imagem enviada" chip, never a thumbnail.
          ...(opts?.image ? { hasImage: true } : {}),
        },
      ],
    }));
    // #35: clears any orphan chain a re-entrant send (or a canceled-but-still
    // ticking previous call) might have left running, so this call is never
    // racing a stale one for the same module-scope handle.
    clearTimeout(stepTimer);
    const scheduleStep = (i: number) => {
      if (i >= GENERATION_STEP_DELAYS_MS.length) return;
      stepTimer = setTimeout(() => {
        // #35: bails instead of ticking if this generation was canceled (or
        // superseded) since the timer was armed -- the same requestId guard
        // idiom the two post-await response paths below already use.
        if (get().generationRequestId !== requestId) return;
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
      result = await api.generate(
        patternId,
        message,
        opts?.answering,
        opts?.image,
      );
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

    // #41: canceling never aborted the request server-side -- only its
    // result was discarded, while withPatternAndWallet's transaction still
    // committed the debit, the drafted pieces and the AI's chat turn. A
    // canceled request whose response has now arrived is reconciled below
    // instead of being silently dropped, so the editor doesn't diverge from
    // what actually persisted for the rest of the session (a fabricated
    // credit refund on screen, and the drafted pieces existing server-side
    // but invisible until the next full reload).
    const canceled = get().generationRequestId !== requestId;
    // The pattern itself changed (via init switching patterns, which also
    // bumps generationRequestId) -- applying old data onto the new
    // pattern's slot would be the #32 bug. Nothing to reconcile either way.
    if (canceled && get().patternId !== patternId) return;

    if (result.status === "insufficient_credits") {
      // Nothing was committed server-side for this outcome -- if canceled,
      // there is nothing to reconcile; if not, show the paywall as usual.
      if (canceled) return;
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
      // A canceled request is reconciled silently: cancelGeneration already
      // put generationStatus back to "idle", and touching it here would
      // resurface the overlay for a result the user already dismissed.
      ...(canceled
        ? {}
        : { generationStatus: result.status === "error" ? "error" : "idle" }),
      ...(shouldSelectFirst
        ? { selectedPieceId: result.state.pattern.pieces[0].id }
        : {}),
      // #8: a regeneration changes the copy set (piece count/quantities can
      // change), so placements keyed on `pieceId#n` become meaningless --
      // same reset trigger as measurements above.
      ...(result.state.pattern.version !== prevVersion
        ? {
            measurements: [],
            cutPlacements: {},
            nestingMode: "auto" as NestingMode,
          }
        : {}),
    });
  },

  cancelGeneration: () => {
    // #41: no longer fabricates a `+ COSTS.adjust` refund -- the server was
    // never actually told to cancel, so it may debit, refund, or leave the
    // balance untouched depending on how the in-flight request resolves.
    // sendMessage's own post-await handling above applies the real
    // `credits` from that response once it arrives, which is the only
    // place the true balance is known.
    // #35: without this, the orphaned timer chain kept ticking
    // generationStepIndex forward for a generation that no longer exists
    // (and, for the next generation sent right after, ticking the WRONG
    // one) -- the requestId bump below stops that tick from doing anything
    // once it fires, but clearing the handle here stops it firing at all.
    clearTimeout(stepTimer);
    set((s) => ({
      generationStatus: "idle",
      generationRequestId: s.generationRequestId + 1,
      chat: s.chat.filter((m) => !m.id.startsWith("optimistic-")),
    }));
  },

  // #32: every mutating action here now verifies (after its own await) that
  // the store hasn't since moved on to a different pattern -- init() bumps
  // generationRequestId when switching (sendMessage's existing requestId
  // checks already cover it, below), but graduateSizes/resolveConflict/
  // purchase had no such guard at all, so a response for a pattern the user
  // had already navigated away from wrote its state onto whatever pattern
  // was current by the time it arrived.
  // #31: no other in-flight signal exists on this action (no spinner, no
  // disable -- the panel isn't hidden the way it is during a generation,
  // since this never touched generationStatus), so a double click sent two
  // POSTs. The server's row lock serialized them but never deduplicated:
  // the route's own filter checks against the full size list, not against
  // what's already applied, so the second request debited again -- 12
  // credits for one grading, the most expensive action in the app.
  graduateSizes: async (sizes: string[]) => {
    if (get().graduating) return;
    const patternId = get().patternId;
    if (!patternId) return;
    set({ graduating: true });
    let result: Awaited<ReturnType<typeof api.graduate>>;
    try {
      result = await api.graduate(patternId, sizes);
    } catch (err) {
      if (get().patternId === patternId) {
        set({ error: errorCode(err), graduating: false });
      }
      return;
    }
    // A pattern switch since this call started means the flag no longer
    // belongs to this call (init's reset already cleared it, or the new
    // pattern has its own in-flight action tracked under it by now) --
    // leave it alone rather than risk clearing someone else's flag.
    if (get().patternId !== patternId) return;
    if (result.status === "insufficient_credits") {
      set({
        // Cleared before the paywall opens: purchase()'s retry thunk below
        // re-enters this same action, and if this were still true, the
        // retry would silently no-op against the guard at the top.
        graduating: false,
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
    set({ graduating: false });
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

  // #31: same double-submission hole as graduateSizes -- the paywall's
  // "Comprar 100 créditos" had nothing marking a purchase as already in
  // flight, so a double click sent two purchase requests and granted double
  // credits (lib/billing/wallet.ts's applyPurchase runs once per request,
  // with no idempotency key).
  purchase: async (type: "topup" | "subscribe", plan?: PaidPlanId) => {
    if (get().purchasing) return;
    const patternId = get().patternId ?? undefined;
    set({ purchasing: true });
    let result: Awaited<ReturnType<typeof api.purchase>>;
    try {
      result = await api.purchase(type, plan, patternId);
    } catch (err) {
      // The paywall stays open: the retry thunk is still valid, and closing it
      // on a failed purchase would look like the purchase worked.
      if (!patternId || get().patternId === patternId) {
        set({ error: errorCode(err), purchasing: false });
      }
      return;
    }
    // See graduateSizes's identical comment: leave the flag alone when it no
    // longer belongs to this call rather than clear someone else's.
    if (patternId && get().patternId !== patternId) return;
    set({ purchasing: false });
    if ("state" in result) applyState(set, result.state);
    else if ("credits" in result) set({ credits: result.credits });
    // Cleared (above) before retry runs: retry re-enters graduateSizes or
    // sendMessage, and a still-true purchasing flag has no bearing on
    // those, but leaving it true here would wrongly disable the paywall's
    // own buttons if it reopens from the retried action's own paywall check.
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

  setCutFabricWidth: (widthCm) => set({ cutFabricWidthCm: widthCm }),
  setNestingMode: (mode) => set({ nestingMode: mode }),
  setCutPlacement: (id, originCm) =>
    set((s) => ({ cutPlacements: { ...s.cutPlacements, [id]: originCm } })),
  seedCutPlacements: (record) => set({ cutPlacements: record }),
  resetCutPlacements: () => set({ cutPlacements: {} }),
}));

export { GENERATION_STEP_COUNT };
