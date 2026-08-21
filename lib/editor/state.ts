import {
  ChatMessage,
  ConflictInfo,
  GarmentSpec,
  SizeChartData,
  PatternState,
  Pattern,
  Piece,
} from "@/lib/types";
import { draftGarment, seamCheck } from "@/lib/draft/garment";
import { buildSizeTable } from "@/lib/sizeCharts/compute";
import { buildSystemSizeChartData } from "@/lib/sizeCharts/seed";
import type { Translate } from "@/lib/i18n/translate";

// Marker (dashed circle) over a piece's armhole region, from the bbox
// of its vertices in px. Illustrative — points at the conflicting seam on the canvas.
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

// Detects a seam mismatch between the body's armhole and the sleeve cap
// (deterministic seamCheck) and builds the ConflictInfo with canvas markers.
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

function seedPattern(t: Translate): Pattern {
  const sizeChart = buildSystemSizeChartData("female");
  const sizeTable = buildSizeTable(sizeChart);
  const baseSize = sizeChart.sizes[sizeChart.baseSizeIndex];
  const spec: GarmentSpec = {
    type: "blouse",
    gender: "female",
    measurementOverrides: {},
    style: {},
  };
  return {
    id: "demo",
    name: t("newPatternName"),
    version: 0,
    baseSize,
    unit: "cm",
    sizes: sizeChart.sizes,
    sizesApplied: [],
    sizesPending: sizeChart.sizes,
    sizeTable,
    pieces: [],
    spec,
    baseMeasurements: sizeTable[baseSize],
    viewBox: { w: 620, h: 380 },
  };
}

// Every user's initial blank pattern (pattern/chat/conflict — wallet is seeded
// separately, lib/billing/wallet.ts's seedWallet).
export function seedPatternState(t: Translate): PatternState {
  return {
    pattern: seedPattern(t),
    chat: [],
    conflict: null,
  };
}

// Overwrites the pattern's size snapshot from a real (account or system
// fallback) size chart — called once, by the generate route, right before
// the FIRST-EVER applyGarmentSpec for a pattern (state.pattern.pieces.length
// === 0). Every later regeneration reuses the snapshot already on the
// pattern; editing the account's active size chart afterward never
// retroactively changes an in-progress pattern (same precedent as the i18n
// locale-snapshot limitation).
export function seedPatternSizeSnapshot(
  state: PatternState,
  sizeChart: SizeChartData,
): void {
  const sizeTable = buildSizeTable(sizeChart);
  const baseSize = sizeChart.sizes[sizeChart.baseSizeIndex];
  state.pattern = {
    ...state.pattern,
    sizes: sizeChart.sizes,
    baseSize,
    sizeTable,
    sizesApplied: [],
    sizesPending: sizeChart.sizes,
  };
}

export function addMessage(state: PatternState, message: ChatMessage): void {
  state.chat = [...state.chat, message];
}

export function bumpVersion(state: PatternState): void {
  state.pattern = {
    ...state.pattern,
    version: state.pattern.version + 1,
  };
}

export function setConflict(
  state: PatternState,
  conflict: ConflictInfo | null,
): void {
  state.conflict = conflict;
}

export function getSpec(state: PatternState): GarmentSpec {
  return (
    state.pattern.spec ?? {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {},
    }
  );
}

// Drafts the garment from a validated spec and stores pieces/viewBox/spec on
// the pattern; attaches (or clears) the seam conflict (apply-with-warning).
export function applyGarmentSpec(
  state: PatternState,
  spec: GarmentSpec,
  t: Translate,
): void {
  const baseRow = state.pattern.sizeTable[state.pattern.baseSize];
  const { pieces, viewBox, measurements, armholeLenCm, sleeveArmholeCm } =
    draftGarment(spec, baseRow, t);
  state.pattern = {
    ...state.pattern,
    pieces,
    viewBox,
    spec,
    baseMeasurements: measurements,
  };
  state.conflict = detectConflict(pieces, armholeLenCm, sleeveArmholeCm, t);
}

// "Corrigir manga" (sleeve fix): sets sleeveRefit and re-drafts — the cap now
// uses the adjusted armhole, the seams match, and detectConflict returns null.
export function refitSleeve(state: PatternState, t: Translate): void {
  const spec = getSpec(state);
  applyGarmentSpec(
    state,
    { ...spec, style: { ...spec.style, sleeveRefit: true } },
    t,
  );
}

export function applySizes(state: PatternState, sizes: string[]): void {
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
