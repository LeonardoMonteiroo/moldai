import {
  ChatMessage,
  ConflictInfo,
  Credits,
  EditorState,
  Pattern,
  Piece,
} from "./types";
import { defaultParams } from "./geometry";

const frente: Piece = {
  id: "frente",
  name: "Frente",
  qty: 1,
  params: defaultParams("frente"),
  outline: { kind: "polygon", points: "55,30 165,30 182,180 150,350 48,350 34,180" },
  guideOutline: { kind: "polygon", points: "46,22 174,22 191,182 158,360 39,360 24,182" },
  grainline: { x1: 105, y1: 34, x2: 97, y2: 346 },
  dart: { d: "M110 30 L128 96 L92 96 Z" },
  label: { x: 55, y: 368 },
  details: {
    folgaCostura: "1,0 cm",
    penceBusto: "2,5 cm",
    cava: "21,4 cm",
    fio: "reto",
    consumo: "1,85 m",
  },
};

const costas: Piece = {
  id: "costas",
  name: "Costas",
  qty: 1,
  params: defaultParams("costas"),
  outline: { kind: "polygon", points: "215,30 325,30 342,180 310,350 208,350 194,180" },
  guideOutline: { kind: "polygon", points: "206,22 334,22 351,182 318,360 199,360 184,182" },
  grainline: { x1: 265, y1: 34, x2: 257, y2: 346 },
  label: { x: 215, y: 368 },
  details: {
    folgaCostura: "1,0 cm",
    penceBusto: "—",
    cava: "20,1 cm",
    fio: "reto",
    consumo: "1,60 m",
  },
};

const manga: Piece = {
  id: "manga",
  name: "Manga",
  qty: 2,
  params: defaultParams("manga"),
  outline: { kind: "path", d: "M395 42 q72 12 82 72 l-18 186 h-108 l-18 -186 q12 -60 62 -72z" },
  label: { x: 368, y: 368 },
  details: {
    folgaCostura: "1,0 cm",
    penceBusto: "—",
    cava: "19,6 cm",
    fio: "reto",
    consumo: "0,45 m",
  },
};

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

export function buildConflict(): ConflictInfo {
  return {
    id: `conflict-${Date.now()}`,
    title: "Cava frente ↔ manga",
    description:
      "A cava da frente ficou 1,8 cm maior que a da manga. As costuras não fecham.",
    diffCm: 1.8,
    suggestion: "Sugestão: abrir 1,8 cm na copa da manga.",
    pieceAId: "frente",
    pieceBId: "manga",
    markers: [
      { cx: 110, cy: 60, r: 20 },
      { cx: 430, cy: 78, r: 20 },
    ],
  };
}
