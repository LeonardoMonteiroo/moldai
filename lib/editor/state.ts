import {
  ChatMessage,
  ConflictEntry,
  ConflictInfo,
  GarmentSpec,
  SizeChartData,
  PatternState,
  Pattern,
  Piece,
} from "@/lib/types";
import { draftGarment, seamCheck } from "@/lib/draft/garment";
import type { SeamMeasurement } from "@/lib/draft/garment";
import { buildSizeTable } from "@/lib/sizeCharts/compute";
import { buildSystemSizeChart } from "@/lib/sizeCharts/seed";
import type { Translate } from "@/lib/i18n/translate";

// Marker (dashed circle) over a piece's own right-edge region, from the bbox
// of its vertices in px. Illustrative — points near the conflicting seam on
// the canvas, generic enough for any mated pair (not only the armhole/cap
// pair it was originally written for).
function pieceMarker(
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

// Builds one ConflictEntry from a divergent SeamMeasurement, resolving its
// pre-baked pt-BR label/aLabel/bLabel from the `seamPairs.<labelKey>`
// catalog entries (PatternData namespace) — the same draft-time locale
// snapshot every other piece of drafted display text already follows.
function buildEntry(
  pieces: Piece[],
  m: SeamMeasurement,
  t: Translate,
): ConflictEntry {
  const a = pieces.find((p) => p.id === m.aPieceId);
  const b = pieces.find((p) => p.id === m.bPieceId);
  const markers = [pieceMarker(a), pieceMarker(b)].filter(
    (marker): marker is { cx: number; cy: number; r: number } =>
      marker !== null,
  );
  return {
    key: m.key,
    label: t(`seamPairs.${m.labelKey}.title`),
    aLabel: t(`seamPairs.${m.labelKey}.aLabel`),
    bLabel: t(`seamPairs.${m.labelKey}.bLabel`),
    aPieceId: m.aPieceId,
    bPieceId: m.bPieceId,
    diffCm: m.diffCm,
    fixable: m.fixable,
    markers,
  };
}

// #134: walks the FULL seam graph (every mated pair this garment declared)
// down to the pairs that actually diverge (seamCheck) and builds the
// ConflictInfo the same way the original armhole-cap-only version did, but
// generalised to a list. The top-level singular fields (title/description/
// diffCm/pieceAId/pieceBId/markers) still exist and are populated from the
// PRIMARY entry -- the armhole/cap one when present (the only divergence
// possible before this issue), else the first found -- so every consumer
// written before `entries` existed (a legacy persisted blob, and this
// function's own pre-#134 callers/tests) keeps reading exactly the values
// it always did. When the primary divergence is that single legacy
// armhole/cap case, the title/description text is ALSO byte-identical to
// before (same catalog keys, same `direction` semantics from the
// already-ease-adjusted armholeLenCm/sleeveArmholeCm); any other shape (a
// different pair alone, or more than one divergence) gets the new generic
// copy instead.
function detectConflict(
  pieces: Piece[],
  armholeLenCm: number | undefined,
  sleeveArmholeCm: number | undefined,
  seamGraph: SeamMeasurement[],
  t: Translate,
): ConflictInfo | null {
  const conflicts = seamCheck(seamGraph);
  if (conflicts.length === 0) return null;
  const entries = conflicts.map((m) => buildEntry(pieces, m, t));
  const armholeCap = conflicts.find((c) => c.key === "armhole-cap");
  const primary = armholeCap ?? conflicts[0];
  const primaryEntry = entries.find((e) => e.key === primary.key)!;
  const isLegacySingle =
    conflicts.length === 1 &&
    primary.key === "armhole-cap" &&
    armholeLenCm != null &&
    sleeveArmholeCm != null;

  let title: string;
  let description: string;
  if (isLegacySingle) {
    const maior = armholeLenCm! > sleeveArmholeCm!;
    title = t("conflict.title");
    description = t("conflict.description", {
      diffCm: primary.diffCm,
      direction: maior ? "larger" : "smaller",
    });
  } else if (conflicts.length === 1) {
    title = t("conflict.titleFor", { label: primaryEntry.label });
    description = t("conflict.descriptionSingle", { diffCm: primary.diffCm });
  } else {
    title = t("conflict.titleMultiple", { count: conflicts.length });
    description = t("conflict.descriptionMultiple");
  }
  // A conflict resolves through refitSleeve, which addresses only the
  // armhole/cap pair -- offer the "Corrigir manga" copy only while at least
  // one entry is actually fixable by it (#134 decision: report the two
  // lengths, no fix button, when nothing here can be auto-resolved).
  const anyFixable = conflicts.some((c) => c.fixable);
  const suggestion = anyFixable
    ? t("conflict.suggestion")
    : t("conflict.suggestionGeneric");

  return {
    id: `conf-${Date.now()}`,
    title,
    description,
    diffCm: primary.diffCm,
    suggestion,
    pieceAId: primary.aPieceId,
    pieceBId: primary.bPieceId,
    markers: primaryEntry.markers,
    entries,
  };
}

function seedPattern(t: Translate): Pattern {
  // #3: name-free -- `t` here is scoped to PatternData (newPatternName,
  // conflict.*), not SizeCharts, and this blank-pattern bootstrap never reads
  // the chart's name anyway.
  const sizeChart = buildSystemSizeChart("female");
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
    sizeChartName: sizeChart.name,
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
  const {
    pieces,
    viewBox,
    measurements,
    armholeLenCm,
    sleeveArmholeCm,
    seamGraph,
  } = draftGarment(spec, baseRow, t);
  state.pattern = {
    ...state.pattern,
    pieces,
    viewBox,
    spec,
    baseMeasurements: measurements,
  };
  state.conflict = detectConflict(
    pieces,
    armholeLenCm,
    sleeveArmholeCm,
    seamGraph,
    t,
  );
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
