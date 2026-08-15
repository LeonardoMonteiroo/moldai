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

const frente = makePiece("frente", "Frente", 1, defaultParams("frente"));
const costas = makePiece("costas", "Costas", 1, defaultParams("costas"));
const manga = makePiece("manga", "Manga", 2, defaultParams("manga"));

function seedPattern(): Pattern {
  return {
    id: "demo",
    name: "Vestido evasê midi",
    version: 5,
    savedAgo: "salvo há 2 min",
    baseSize: "M",
    unit: "cm",
    sizesApplied: ["PP", "P", "M"],
    sizesPending: ["G", "GG"],
    pieces: [frente, costas, manga],
  };
}

function seedChat(): ChatMessage[] {
  return [
    {
      id: "m1",
      author: "user",
      text: "Vestido evasê, manga curta, decote V, comprimento midi. Tamanho base 40.",
      createdAt: Date.now() - 1000 * 60 * 5,
    },
    {
      id: "m2",
      author: "ai",
      text: "Gerei frente, costas e manga. Transferi a pence de busto para o ombro.",
      chips: [
        { label: "3 peças", tone: "neutral" },
        { label: "−4 créditos", tone: "credit" },
      ],
      createdAt: Date.now() - 1000 * 60 * 4,
    },
    {
      id: "m3",
      author: "user",
      text: "Aumenta 2 cm na cava",
      createdAt: Date.now() - 1000 * 60 * 2,
    },
    {
      id: "m4",
      author: "ai",
      text: "Cava da frente e da manga ajustadas juntas.",
      chips: [{ label: "−1 crédito", tone: "credit" }],
      createdAt: Date.now() - 1000 * 60 * 2,
    },
  ];
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
