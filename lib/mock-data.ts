import {
  ChatMessage,
  ConflictInfo,
  Credits,
  EditorState,
  GarmentSpec,
  Pattern,
} from "./types";
import { draftGarment } from "@/lib/draft/garment";
import { resolveMeasurements } from "@/lib/measurements";

// The editor opens on a blank molde: no pieces, no chat. The first generation
// creates the pieces the garment needs.
function seedPattern(): Pattern {
  const baseSize = "M" as const;
  const spec: GarmentSpec = { tipo: "blusa", sexo: "fem", measurementOverrides: {}, style: {} };
  return {
    id: "demo",
    name: "Novo molde",
    version: 0,
    savedAgo: "ainda não salvo",
    baseSize,
    unit: "cm",
    sizesApplied: [],
    sizesPending: ["PP", "P", "M", "G", "GG"],
    pieces: [],
    spec,
    baseMeasurements: resolveMeasurements(baseSize, {}, "fem"),
    viewBox: { w: 620, h: 380 },
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

// Drafts the garment from a validated spec and stores pieces/viewBox/spec on
// the pattern. Conflict detection is deliberately left out in this first cut:
// the manga's cabeça is dimensioned from the corpo's cava (see draftManga), so
// they always match by construction — there's nothing to flag yet.
export function applyGarmentSpec(spec: GarmentSpec): void {
  const size = state.pattern.baseSize;
  const { pieces, viewBox, measurements } = draftGarment(spec, size);
  state.pattern = { ...state.pattern, pieces, viewBox, spec, baseMeasurements: measurements };
  state.conflict = null;
}

export function getSpec(): GarmentSpec {
  return (
    state.pattern.spec ?? { tipo: "blusa", sexo: "fem", measurementOverrides: {}, style: {} }
  );
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
