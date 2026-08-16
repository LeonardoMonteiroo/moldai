import {
  ChatMessage,
  ConflictInfo,
  Credits,
  EditorState,
  GarmentSpec,
  Pattern,
  Piece,
} from "./types";
import { draftGarment, seamCheck } from "@/lib/draft/garment";
import { resolveMeasurements } from "@/lib/measurements";

// Marca (círculo tracejado) na região da cava de uma peça, a partir da bbox dos
// seus vértices em px. Ilustrativa — aponta a costura em conflito no canvas.
function cavaMarker(piece: Piece | undefined): { cx: number; cy: number; r: number } | null {
  const vs = piece?.vertices;
  if (!vs || vs.length === 0) return null;
  const xs = vs.map((v) => v.x);
  const ys = vs.map((v) => v.y);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { cx: maxX - 6, cy: minY + (maxY - minY) * 0.28, r: 14 };
}

// Detecta divergência de costura entre a cava do corpo e a copa da manga
// (seamCheck determinístico) e monta o ConflictInfo com marcas no canvas.
function detectConflict(
  pieces: Piece[],
  armholeLenCm?: number,
  mangaArmholeCm?: number,
): ConflictInfo | null {
  const seam = seamCheck(armholeLenCm, mangaArmholeCm);
  if (!seam) return null;
  const frente = pieces.find((p) => p.id === "corpo-frente");
  const manga = pieces.find((p) => p.id === "manga");
  const markers = [cavaMarker(frente), cavaMarker(manga)].filter(
    (m): m is { cx: number; cy: number; r: number } => m !== null,
  );
  const maior = (armholeLenCm ?? 0) > (mangaArmholeCm ?? 0);
  return {
    id: `conf-${Date.now()}`,
    title: "Cava e manga não batem",
    description: `A cava do corpo ficou ${seam.diffCm} cm ${maior ? "maior" : "menor"} que a copa da manga — as costuras não vão fechar.`,
    diffCm: seam.diffCm,
    suggestion: "“Corrigir manga” refaz a copa para a cava ajustada, sem custo.",
    pieceAId: "corpo-frente",
    pieceBId: "manga",
    markers,
  };
}

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
  const { pieces, viewBox, measurements, armholeLenCm, mangaArmholeCm } = draftGarment(spec, size);
  state.pattern = { ...state.pattern, pieces, viewBox, spec, baseMeasurements: measurements };
  // Apply-with-warning: a geração aplica normalmente; se as costuras divergirem,
  // o conflito é anexado (Export bloqueia até resolver). Sem impacto no crédito.
  state.conflict = detectConflict(pieces, armholeLenCm, mangaArmholeCm);
}

// "Corrigir manga": marca mangaRefit e re-drafta — a copa passa a usar a cava
// ajustada, as costuras batem e detectConflict devolve null (conflito some).
export function refitManga(): void {
  const spec = getSpec();
  applyGarmentSpec({ ...spec, style: { ...spec.style, mangaRefit: true } });
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
