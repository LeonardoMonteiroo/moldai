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

// Marca (círculo tracejado) na região da cava de uma peça, a partir da bbox
// dos seus vértices em px. Ilustrativa — aponta a costura em conflito no canvas.
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
    suggestion: '"Corrigir manga" refaz a copa para a cava ajustada, sem custo.',
    pieceAId: "corpo-frente",
    pieceBId: "manga",
    markers,
  };
}

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

function seedCredits(): Credits {
  return { plan: "atelier", planLabel: "Ateliê", balance: 320, total: 500, renewsInDays: 12 };
}

// O blank molde inicial de cada usuário.
export function seedState(): EditorState {
  return { pattern: seedPattern(), chat: [], credits: seedCredits(), conflict: null };
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
  state.pattern = { ...state.pattern, version: state.pattern.version + 1, savedAgo: "salvo agora" };
}

export function setConflict(state: EditorState, conflict: ConflictInfo | null): void {
  state.conflict = conflict;
}

export function getSpec(state: EditorState): GarmentSpec {
  return state.pattern.spec ?? { tipo: "blusa", sexo: "fem", measurementOverrides: {}, style: {} };
}

// Drafta o garment a partir de um spec validado e guarda pieces/viewBox/spec no
// pattern; anexa (ou limpa) o conflito de costura (apply-with-warning).
export function applyGarmentSpec(state: EditorState, spec: GarmentSpec): void {
  const size = state.pattern.baseSize;
  const { pieces, viewBox, measurements, armholeLenCm, mangaArmholeCm } = draftGarment(spec, size);
  state.pattern = { ...state.pattern, pieces, viewBox, spec, baseMeasurements: measurements };
  state.conflict = detectConflict(pieces, armholeLenCm, mangaArmholeCm);
}

// "Corrigir manga": marca mangaRefit e re-drafta — a copa passa a usar a cava
// ajustada, as costuras batem e detectConflict devolve null.
export function refitManga(state: EditorState): void {
  const spec = getSpec(state);
  applyGarmentSpec(state, { ...spec, style: { ...spec.style, mangaRefit: true } });
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

export function applyPurchase(state: EditorState, type: "topup" | "subscribe"): void {
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
