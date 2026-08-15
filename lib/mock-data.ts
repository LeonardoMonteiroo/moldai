import {
  ChatMessage,
  ConflictInfo,
  Credits,
  EditorState,
  Pattern,
  Piece,
  PieceParams,
} from "./types";
import { clampParams, computeGeometry, defaultParams, deriveDetails } from "./geometry";

function makePiece(id: string, name: string, qty: number, params: PieceParams): Piece {
  const g = computeGeometry(id, params);
  return {
    id,
    name,
    qty,
    params,
    outline: g.outline,
    guideOutline: g.guideOutline,
    grainline: g.grainline,
    dart: g.dart,
    label: g.label,
    details: deriveDetails(id, params),
  };
}

// The parametric model only knows these three pieces. `updatePieceParams`
// creates any referenced piece that doesn't exist yet using this metadata,
// so the AI can generate a molde from scratch on the first request.
const PIECE_META: Record<string, { name: string; qty: number }> = {
  frente: { name: "Frente", qty: 1 },
  costas: { name: "Costas", qty: 1 },
  manga: { name: "Manga", qty: 2 },
};

// Canonical left-to-right order on the canvas (also keeps LANDMARKS aligned).
const PIECE_ORDER = ["frente", "costas", "manga"];

// The editor opens on a blank molde: no pieces, no chat. The first generation
// creates the pieces the garment needs.
function seedPattern(): Pattern {
  return {
    id: "demo",
    name: "Novo molde",
    version: 0,
    savedAgo: "ainda não salvo",
    baseSize: "M",
    unit: "cm",
    sizesApplied: [],
    sizesPending: ["PP", "P", "M", "G", "GG"],
    pieces: [],
  };
}

function seedChat(): ChatMessage[] {
  return [];
}

function seedCredits(): Credits {
  return {
    plan: "atelier",
    planLabel: "Ateliê",
    balance: 320,
    total: 500,
    renewsInDays: 12,
  };
}

let state: EditorState = {
  pattern: seedPattern(),
  chat: seedChat(),
  credits: seedCredits(),
  conflict: null,
};

export function getState(): EditorState {
  return state;
}

export function resetState(): EditorState {
  state = {
    pattern: seedPattern(),
    chat: seedChat(),
    credits: seedCredits(),
    conflict: null,
  };
  return state;
}

export function addMessage(message: ChatMessage) {
  state.chat = [...state.chat, message];
}

export function debitCredits(amount: number) {
  state.credits = { ...state.credits, balance: state.credits.balance - amount };
}

export function refundCredits(amount: number) {
  state.credits = { ...state.credits, balance: state.credits.balance + amount };
}

export function bumpVersion() {
  state.pattern = {
    ...state.pattern,
    version: state.pattern.version + 1,
    savedAgo: "salvo agora",
  };
}

export function setConflict(conflict: ConflictInfo | null) {
  state.conflict = conflict;
}

export function updatePieceParams(pieceId: string, partial: PieceParams) {
  const exists = state.pattern.pieces.some((pc) => pc.id === pieceId);

  // Create-on-first-reference: if the piece doesn't exist yet (blank molde),
  // instantiate it from default params + the proposed deltas. The AI's params
  // are always deltas relative to the current value, which for a new piece is
  // the base shape (all zeros).
  if (!exists) {
    const meta = PIECE_META[pieceId];
    if (!meta) return; // unknown piece id — ignore
    const merged = clampParams(pieceId, { ...defaultParams(pieceId), ...partial });
    const created = makePiece(pieceId, meta.name, meta.qty, merged);
    const pieces = [...state.pattern.pieces, created].sort(
      (a, b) => PIECE_ORDER.indexOf(a.id) - PIECE_ORDER.indexOf(b.id),
    );
    state.pattern = { ...state.pattern, pieces };
    return;
  }

  state.pattern = {
    ...state.pattern,
    pieces: state.pattern.pieces.map((pc) => {
      if (pc.id !== pieceId) return pc;
      const merged = clampParams(pieceId, { ...pc.params, ...partial });
      const g = computeGeometry(pieceId, merged);
      return {
        ...pc,
        params: merged,
        outline: g.outline,
        guideOutline: g.guideOutline,
        grainline: g.grainline,
        dart: g.dart,
        label: g.label,
        details: deriveDetails(pieceId, merged),
      };
    }),
  };
}

export function applySizes(sizes: string[]) {
  const applied = new Set(state.pattern.sizesApplied);
  const pending = state.pattern.sizesPending.filter((s) => {
    if (sizes.includes(s)) {
      applied.add(s);
      return false;
    }
    return true;
  });
  state.pattern = {
    ...state.pattern,
    sizesApplied: Array.from(applied),
    sizesPending: pending,
  };
}

export function applyPurchase(type: "topup" | "subscribe") {
  if (type === "topup") {
    state.credits = { ...state.credits, balance: state.credits.balance + 100 };
  } else {
    state.credits = {
      plan: "atelier",
      planLabel: "Ateliê",
      balance: state.credits.balance + 500,
      total: 500,
      renewsInDays: 30,
    };
  }
}

const LANDMARKS: Record<string, { cx: number; cy: number }> = {
  frente: { cx: 110, cy: 60 },
  costas: { cx: 270, cy: 60 },
  manga: { cx: 430, cy: 78 },
};

export interface ConflictInput {
  pieceAId: string;
  pieceBId: string;
  diffCm: number;
  title: string;
  description: string;
  suggestion: string;
}

export function buildConflict(input: ConflictInput): ConflictInfo {
  const a = LANDMARKS[input.pieceAId] ?? { cx: 110, cy: 60 };
  const b = LANDMARKS[input.pieceBId] ?? { cx: 430, cy: 78 };
  return {
    id: `conflict-${Date.now()}`,
    title: input.title,
    description: input.description,
    diffCm: input.diffCm,
    suggestion: input.suggestion,
    pieceAId: input.pieceAId,
    pieceBId: input.pieceBId,
    markers: [
      { cx: a.cx, cy: a.cy, r: 20 },
      { cx: b.cx, cy: b.cy, r: 20 },
    ],
  };
}
