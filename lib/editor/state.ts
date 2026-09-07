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
import { seamCheck } from "@/lib/draft/garment";
import type { SeamMeasurement } from "@/lib/draft/garment";
import { SEAM_TOLERANCE_CM } from "@/lib/draft/seams";
import { draftGarment, measureSeamGraph } from "@/lib/draft/engine/facade";
import { engineFor } from "@/lib/draft/engine/capability";
import type { EngineId } from "@/lib/draft/engine/capability";
import { buildSizeTable } from "@/lib/sizeCharts/compute";
import { buildSystemSizeChart } from "@/lib/sizeCharts/seed";
import type { Translate } from "@/lib/i18n/translate";
import type { Measurements } from "@/lib/measurements";

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

// #253: a pair can be flagged by seamCheck purely on subSegmentDiffCm (the
// front/back split projects onto the wrong point of the mate's arc) while
// its own diffCm (the two sides' summed totals) stays near 0 -- reporting
// THAT near-0 number as "the divergence" would show a real, unfixable
// conflict as if it were barely there. Whichever of the two actually
// crossed SEAM_TOLERANCE_CM (or the larger, if somehow both did) is what a
// user-facing number should cite.
function displayDiffCm(m: SeamMeasurement): number {
  return Math.max(m.diffCm, m.subSegmentDiffCm);
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
    diffCm: displayDiffCm(m),
    fixable: m.fixable,
    markers,
  };
}

// #241: one divergent pair's own worst offender, plus every OTHER (never
// base) size where it also missed SEAM_TOLERANCE_CM -- the return shape
// measureGradedDivergences below builds up, keyed by the pair's own stable
// `key` the same way every other seam-pair lookup in this codebase is.
interface GradedDivergence {
  sizes: string[];
  measurement: SeamMeasurement;
}

// #241: measures the FULL seam graph at every size in the pattern's own
// frozen sizeTable EXCEPT the base row (already covered by seamGraph/
// seamCheck at the call site) and narrows each to its own divergent pairs.
// A 2020 measurement study (Islam et al., Tekstilec 63(3):166-184) found
// conventional X/Y-increment grading with diagonal points of measure drives
// a mated pair's own gap from +0.51cm at one extreme size to -0.51cm at the
// other against a stated tolerance -- zero only at the base size, because a
// diagonal's length isn't a linear function of independent X/Y increments.
// Redrafting per size (rather than interpolating) is the same "measure the
// real geometry" rule seamCheck's own base-size check already follows.
// Keeps the WORST (largest diffCm) SeamMeasurement per key so a caller has
// one representative pair of lengths to render, and every size (not just
// the worst one) that missed tolerance for that key.
function measureGradedDivergences(
  engine: EngineId,
  spec: GarmentSpec,
  sizeTable: Record<string, Measurements>,
  baseSize: string,
  t: Translate,
): Map<string, GradedDivergence> {
  const out = new Map<string, GradedDivergence>();
  for (const [size, measurements] of Object.entries(sizeTable)) {
    if (size === baseSize) continue;
    const graph = measureSeamGraph(engine, spec, measurements, t);
    for (const m of seamCheck(graph)) {
      const existing = out.get(m.key);
      if (!existing) {
        out.set(m.key, { sizes: [size], measurement: m });
      } else {
        existing.sizes.push(size);
        if (m.diffCm > existing.measurement.diffCm) existing.measurement = m;
      }
    }
  }
  return out;
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
//
// #241: `gradedDivergences` adds entries for a pair whose gap misses
// tolerance ONLY at a size other than base -- invisible to the base-only
// check above. These never fold into the legacy singular-field branch
// (armholeLenCm/sleeveArmholeCm describe the BASE draft, which this pair
// does NOT diverge at) and never touch a base-origin entry's own fields --
// the existing base-size behaviour stays byte-identical. Each such entry
// carries its own `sizes`, naming exactly which graded size(s) it was
// caught at, per CLAUDE.md's "surface feature limitations on-screen, never
// silently."
function detectConflict(
  pieces: Piece[],
  armholeLenCm: number | undefined,
  sleeveArmholeCm: number | undefined,
  seamGraph: SeamMeasurement[],
  gradedDivergences: Map<string, GradedDivergence>,
  // #241: the chart's own declared order (Pattern.sizes) -- a plain
  // alphabetical sort would read "GG, PP" for a chart ordered small to
  // large, backwards from how every other size list in this app (the size
  // picker, sizesApplied/sizesPending) already reads.
  sizeOrder: string[],
  t: Translate,
): ConflictInfo | null {
  const baseConflicts = seamCheck(seamGraph);
  const baseKeys = new Set(baseConflicts.map((m) => m.key));
  const sizeOnly = Array.from(gradedDivergences.entries()).filter(
    ([key]) => !baseKeys.has(key),
  );
  if (baseConflicts.length === 0 && sizeOnly.length === 0) return null;

  const bySizeOrder = (a: string, b: string) => {
    const ia = sizeOrder.indexOf(a);
    const ib = sizeOrder.indexOf(b);
    if (ia === -1 || ib === -1) return a.localeCompare(b);
    return ia - ib;
  };
  const sizeOnlySizes = new Map(sizeOnly.map(([key, g]) => [key, g.sizes]));
  const conflicts = [
    ...baseConflicts,
    ...sizeOnly.map(([, g]) => g.measurement),
  ];
  const entries = [
    ...baseConflicts.map((m) => buildEntry(pieces, m, t)),
    ...sizeOnly.map(([, g]) => ({
      ...buildEntry(pieces, g.measurement, t),
      sizes: [...g.sizes].sort(bySizeOrder),
    })),
  ];
  const baseArmholeCap = baseConflicts.find((c) => c.key === "armhole-cap");
  const primary = baseArmholeCap ?? conflicts[0];
  const primaryEntry = entries.find((e) => e.key === primary.key)!;
  const primarySizes = sizeOnlySizes.get(primary.key);
  // #253: the legacy armhole/cap phrasing below asserts "the cap is N cm
  // larger/smaller than the armhole" -- true only when the TOTAL (diffCm)
  // is what's actually wrong. A pair flagged purely on subSegmentDiffCm
  // (the total closes fine; only the front/back split is off) would make
  // that sentence describe a divergence that isn't there, so it's excluded
  // from the legacy path and falls through to the generic (still-accurate,
  // magnitude-only) copy below.
  const isLegacySingle =
    conflicts.length === 1 &&
    primary.key === "armhole-cap" &&
    baseArmholeCap != null &&
    primary.diffCm > SEAM_TOLERANCE_CM &&
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
  } else if (conflicts.length === 1 && primarySizes) {
    title = t("conflict.titleForSizeOnly", { label: primaryEntry.label });
    description = t("conflict.descriptionSizeOnly", {
      diffCm: primary.diffCm,
      sizes: primarySizes.join(", "),
    });
  } else if (conflicts.length === 1) {
    title = t("conflict.titleFor", { label: primaryEntry.label });
    description = t("conflict.descriptionSingle", {
      diffCm: primaryEntry.diffCm,
    });
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
    diffCm: primaryEntry.diffCm,
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
//
// #267: `engine` is frozen in this SAME assignment, alongside sizeTable/
// sizeChartName -- one function, one moment, so "the engine is frozen
// alongside the size snapshot" is structurally true rather than a
// convention two separate call sites could drift apart on. A required
// parameter (not an optional one defaulting to DEFAULT_ENGINE_ID inside
// this function) so a future caller can't forget to pass the pattern's
// actual choice -- the same "compiler forces every caller" reasoning the
// facade's EngineId parameter already uses.
export function seedPatternSizeSnapshot(
  state: PatternState,
  sizeChart: SizeChartData,
  engine: EngineId,
): void {
  const sizeTable = buildSizeTable(sizeChart);
  const baseSize = sizeChart.sizes[sizeChart.baseSizeIndex];
  state.pattern = {
    ...state.pattern,
    sizes: sizeChart.sizes,
    baseSize,
    sizeTable,
    sizeChartName: sizeChart.name,
    engine,
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
  // #267: reads the pattern's own FROZEN engine -- never a fresh default --
  // so the one route-reachable draft path can never disagree with the
  // choice seedPatternSizeSnapshot already made for this pattern.
  const engine = engineFor(state.pattern.engine);
  const {
    pieces,
    viewBox,
    measurements,
    armholeLenCm,
    sleeveArmholeCm,
    seamGraph,
  } = draftGarment(engine, spec, baseRow, t);
  state.pattern = {
    ...state.pattern,
    pieces,
    viewBox,
    spec,
    baseMeasurements: measurements,
  };
  // #241: every OTHER size this pattern's own frozen sizeTable already
  // carries -- not just the base row seamGraph above measured.
  const gradedDivergences = measureGradedDivergences(
    engine,
    spec,
    state.pattern.sizeTable,
    state.pattern.baseSize,
    t,
  );
  state.conflict = detectConflict(
    pieces,
    armholeLenCm,
    sleeveArmholeCm,
    seamGraph,
    gradedDivergences,
    state.pattern.sizes,
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
