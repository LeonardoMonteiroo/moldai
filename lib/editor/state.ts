import {
  ChatMessage,
  ConflictInfo,
  Credits,
  EditorState,
  GarmentSpec,
  Pattern,
  Piece,
} from "@/lib/types";
import { draftGarment, seamCheck } from "@/lib/draft/garment";
import { resolveMeasurements } from "@/lib/measurements";
import type { Translate } from "@/lib/i18n/translate";

// Marca (círculo tracejado) na região da cava de uma peça, a partir da bbox
// dos seus vértices em px. Ilustrativa — aponta a costura em conflito no canvas.
function armholeMarker(
  piece: Piece | undefined,
): { cx: number; cy: number; r: number } | null {
  const vs = piece?.vertices;
  if (!vs || vs.length === 0) return null;
  const xs = vs.map((v) => v.x);
  const ys = vs.map((v) => v.y);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return { cx: maxX - 6, cy: minY + (maxY - minY) * 0.28, r: 14 };
}

// Detecta divergência de costura entre a cava do corpo e a copa da manga
// (seamCheck determinístico) e monta o ConflictInfo com marcas no canvas.
function detectConflict(
  pieces: Piece[],
  armholeLenCm: number | undefined,
  sleeveArmholeCm: number | undefined,
  t: Translate,
): ConflictInfo | null {
  const seam = seamCheck(armholeLenCm, sleeveArmholeCm);
  if (!seam) return null;
  const front = pieces.find((p) => p.id === "body-front");
  const sleeve = pieces.find((p) => p.id === "sleeve");
  const markers = [armholeMarker(front), armholeMarker(sleeve)].filter(
    (m): m is { cx: number; cy: number; r: number } => m !== null,
  );
  const maior = (armholeLenCm ?? 0) > (sleeveArmholeCm ?? 0);
  return {
    id: `conf-${Date.now()}`,
    title: t("conflict.title"),
    description: t("conflict.description", {
      diffCm: seam.diffCm,
      direction: maior ? "larger" : "smaller",
    }),
    diffCm: seam.diffCm,
    suggestion: t("conflict.suggestion"),
    pieceAId: "body-front",
    pieceBId: "sleeve",
    markers,
  };
}

function seedPattern(): Pattern {
  const baseSize = "M" as const;
  const spec: GarmentSpec = {
    type: "blouse",
    gender: "female",
    measurementOverrides: {},
    style: {},
  };
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
    baseMeasurements: resolveMeasurements(baseSize, {}, "female"),
    viewBox: { w: 620, h: 380 },
  };
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

// O blank molde inicial de cada usuário.
export function seedState(): EditorState {
  return {
    pattern: seedPattern(),
    chat: [],
    credits: seedCredits(),
    conflict: null,
  };
}

export function addMessage(state: EditorState, message: ChatMessage): void {
  state.chat = [...state.chat, message];
}

export function debitCredits(state: EditorState, amount: number): void {
  state.credits = { ...state.credits, balance: state.credits.balance - amount };
}

export function refundCredits(state: EditorState, amount: number): void {
  state.credits = { ...state.credits, balance: state.credits.balance + amount };
}

export function bumpVersion(state: EditorState): void {
  state.pattern = {
    ...state.pattern,
    version: state.pattern.version + 1,
    savedAgo: "salvo agora",
  };
}

export function setConflict(
  state: EditorState,
  conflict: ConflictInfo | null,
): void {
  state.conflict = conflict;
}

export function getSpec(state: EditorState): GarmentSpec {
  return (
    state.pattern.spec ?? {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {},
    }
  );
}

// Drafta o garment a partir de um spec validado e guarda pieces/viewBox/spec no
// pattern; anexa (ou limpa) o conflito de costura (apply-with-warning).
export function applyGarmentSpec(
  state: EditorState,
  spec: GarmentSpec,
  t: Translate,
): void {
  const size = state.pattern.baseSize;
  const { pieces, viewBox, measurements, armholeLenCm, sleeveArmholeCm } =
    draftGarment(spec, size, t);
  state.pattern = {
    ...state.pattern,
    pieces,
    viewBox,
    spec,
    baseMeasurements: measurements,
  };
  state.conflict = detectConflict(pieces, armholeLenCm, sleeveArmholeCm, t);
}

// "Corrigir manga": marca sleeveRefit e re-drafta — a copa passa a usar a cava
// ajustada, as costuras batem e detectConflict devolve null.
export function refitSleeve(state: EditorState, t: Translate): void {
  const spec = getSpec(state);
  applyGarmentSpec(
    state,
    { ...spec, style: { ...spec.style, sleeveRefit: true } },
    t,
  );
}

export function applySizes(state: EditorState, sizes: string[]): void {
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

export function applyPurchase(
  state: EditorState,
  type: "topup" | "subscribe",
): void {
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
