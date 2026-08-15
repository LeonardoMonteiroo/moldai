import { create } from "zustand";
import * as api from "./api-client";
import { ChatMessage, Credits, EditorState, GenerationStatus, Pattern, ConflictInfo, COSTS } from "./types";

export type EditorTab = "molde2d" | "prova3d" | "ficha" | "corte";
export type EditorTool = "medir" | "cortar" | "girar" | "marcar";

const GENERATION_STEPS = [
  { label: "passo 1/4 · silhueta", pieceProgress: "1 de 3 peças" },
  { label: "passo 2/4 · pences", pieceProgress: "1 de 3 peças" },
  { label: "passo 3/4 · costuras", pieceProgress: "2 de 3 peças" },
  { label: "passo 4/4 · consumo", pieceProgress: "3 de 3 peças" },
];

interface PaywallState {
  open: boolean;
  required: number;
  balance: number;
  actionLabel: string;
  retry: (() => void) | null;
}

interface EditorStore {
  ready: boolean;
  pattern: Pattern | null;
  chat: ChatMessage[];
  credits: Credits | null;
  conflict: ConflictInfo | null;

  activeTab: EditorTab;
  selectedPieceId: string | null;
  detailsPanelOpen: boolean;
  activeTool: EditorTool;

  generationStatus: GenerationStatus;
  generationStepIndex: number;
  generationRequestId: number;

  paywall: PaywallState;

  init: () => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  cancelGeneration: () => void;
  graduateSizes: (sizes: string[]) => Promise<void>;
  resolveConflict: (action: "fix" | "ignore") => Promise<void>;
  purchase: (type: "topup" | "subscribe") => Promise<void>;
  closePaywall: () => void;

  setActiveTab: (tab: EditorTab) => void;
  selectPiece: (id: string | null) => void;
  toggleDetailsPanel: () => void;
  setActiveTool: (tool: EditorTool) => void;
}

function applyState(set: (partial: Partial<EditorStore>) => void, state: EditorState) {
  set({
    pattern: state.pattern,
    chat: state.chat,
    credits: state.credits,
    conflict: state.conflict,
  });
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  ready: false,
  pattern: null,
  chat: [],
  credits: null,
  conflict: null,

  activeTab: "molde2d",
  selectedPieceId: null,
  detailsPanelOpen: true,
  activeTool: "medir",

  generationStatus: "idle",
  generationStepIndex: 0,
  generationRequestId: 0,

  paywall: { open: false, required: 0, balance: 0, actionLabel: "", retry: null },

  init: async () => {
    const state = await api.fetchPattern();
    applyState(set, state);
    set({ ready: true, selectedPieceId: state.pattern.pieces[0]?.id ?? null });
  },

  sendMessage: async (message: string) => {
    if (!message.trim()) return;
    const requestId = get().generationRequestId + 1;
    set((s) => ({
      generationStatus: "generating",
      generationStepIndex: 0,
      generationRequestId: requestId,
      chat: [
        ...s.chat,
        { id: `optimistic-${requestId}`, author: "user", text: message, createdAt: Date.now() },
      ],
    }));
    const stepTimer = setInterval(() => {
      set((s) => ({ generationStepIndex: Math.min(s.generationStepIndex + 1, GENERATION_STEPS.length - 1) }));
    }, 320);

    const result = await api.generate(message);
    clearInterval(stepTimer);

    if (get().generationRequestId !== requestId) return; // canceled

    if (result.status === "insufficient_credits") {
      set((s) => ({
        generationStatus: "idle",
        chat: s.chat.filter((m) => !m.id.startsWith("optimistic-")),
        paywall: {
          open: true,
          required: result.required,
          balance: result.balance,
          actionLabel: "esse ajuste",
          retry: () => get().sendMessage(message),
        },
      }));
      return;
    }

    applyState(set, result.state);
    const shouldSelectFirst = !get().selectedPieceId && result.state.pattern.pieces.length > 0;
    set({
      generationStatus: result.status === "error" ? "error" : "idle",
      ...(shouldSelectFirst ? { selectedPieceId: result.state.pattern.pieces[0].id } : {}),
    });
  },

  cancelGeneration: () => {
    set((s) => ({
      generationStatus: "idle",
      generationRequestId: s.generationRequestId + 1,
      chat: s.chat.filter((m) => !m.id.startsWith("optimistic-")),
      credits: s.credits ? { ...s.credits, balance: s.credits.balance + COSTS.adjust } : s.credits,
    }));
  },

  graduateSizes: async (sizes: string[]) => {
    const result = await api.graduate(sizes);
    if (result.status === "insufficient_credits") {
      set({
        paywall: {
          open: true,
          required: result.required,
          balance: result.balance,
          actionLabel: "essa graduação",
          retry: () => get().graduateSizes(sizes),
        },
      });
      return;
    }
    applyState(set, result.state);
  },

  resolveConflict: async (action: "fix" | "ignore") => {
    const result = await api.resolveConflict(action);
    if ("state" in result) applyState(set, result.state);
  },

  purchase: async (type: "topup" | "subscribe") => {
    const result = await api.purchase(type);
    if ("state" in result) applyState(set, result.state);
    const retry = get().paywall.retry;
    set({ paywall: { open: false, required: 0, balance: 0, actionLabel: "", retry: null } });
    retry?.();
  },

  closePaywall: () =>
    set({ paywall: { open: false, required: 0, balance: 0, actionLabel: "", retry: null } }),

  setActiveTab: (tab) => set({ activeTab: tab }),
  selectPiece: (id) => set({ selectedPieceId: id, detailsPanelOpen: id !== null }),
  toggleDetailsPanel: () => set((s) => ({ detailsPanelOpen: !s.detailsPanelOpen })),
  setActiveTool: (tool) => set({ activeTool: tool }),
}));

export { GENERATION_STEPS };
