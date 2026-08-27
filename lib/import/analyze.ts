import type { DxfDocument, DxfEntity } from "./dxf";
import type {
  DetectedLayer,
  ImportAnalysis,
  ImportCheck,
  ImportFormat,
  LayerRole,
} from "./types";

// The two vocabularies this app's own writers emit — recognising them is
// what makes an export→import round trip auto-map with no user input (the
// acceptance criterion this module's tests exist to prove).
const AAMA_LAYER_ROLES: Record<string, LayerRole> = {
  "1": "cut", // piece boundary — lib/export/dxf-aama.ts's cut line (#123)
  "14": "seam", // net sew line (#123)
  "7": "grain",
  "4": "notch", // #124
  "6": "ignore", // fold/mirror line — no first-class role this pass
  "8": "ignore", // internal/dart line
};

const MOLDAI_LAYER_ROLES: Record<string, LayerRole> = {
  CONTORNO: "cut",
  COSTURA: "seam",
  GRAINLINE: "grain",
  PIQUE: "notch", // #124
  INTERNO: "ignore", // dart
  DOBRA: "ignore", // fold
  TEXTO: "ignore",
};

/**
 * Requires at least TWO of a vocabulary's layer names, not one. A single hit
 * misclassifies real files: a generic DXF with its boundary on a plain
 * "OUTLINE" layer plus one construction line pen-numbered "7" (a common
 * non-AAMA convention) used to read as `dxf-aama` off that lone "7", which
 * then force-mapped it to `grain` and dropped the real boundary layer to
 * `ignore`. Both this app's own writers always emit at least two of their
 * own vocabulary's layers unconditionally (toDxf: CONTORNO + COSTURA;
 * toDxfAama: "1" + "14"), so the round trip this module exists to recognise
 * is unaffected.
 */
function detectFormat(layerNames: Set<string>): ImportFormat {
  const aamaHits = Object.keys(AAMA_LAYER_ROLES).filter((n) =>
    layerNames.has(n),
  ).length;
  if (aamaHits >= 2) return "dxf-aama";
  const moldaiHits = Object.keys(MOLDAI_LAYER_ROLES).filter((n) =>
    layerNames.has(n),
  ).length;
  if (moldaiHits >= 2) return "dxf-moldai";
  return "dxf-generic";
}

function suggestRoles(
  format: ImportFormat,
  layerNames: string[],
): Record<string, LayerRole> {
  const known =
    format === "dxf-aama"
      ? AAMA_LAYER_ROLES
      : format === "dxf-moldai"
        ? MOLDAI_LAYER_ROLES
        : {};
  const roles: Record<string, LayerRole> = {};
  for (const name of layerNames) {
    roles[name] = known[name] ?? "ignore";
  }
  return roles;
}

function unitScaleFor(insUnits: number | null): number | null {
  switch (insUnits) {
    case 1:
      return 2.54; // inch
    case 4:
      return 0.1; // mm
    case 5:
      return 1; // cm
    default:
      return null;
  }
}

function unitLabelFor(insUnits: number | null): string {
  switch (insUnits) {
    case 1:
      return "in";
    case 4:
      return "mm";
    case 5:
      return "cm";
    default:
      return "?";
  }
}

function bboxOf(points: [number, number][]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function within(
  pt: [number, number],
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return (
    pt[0] >= b.minX && pt[0] <= b.maxX && pt[1] >= b.minY && pt[1] <= b.maxY
  );
}

function midpoint(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export interface LayerAnalysis {
  format: ImportFormat;
  layers: DetectedLayer[];
  suggestedRoles: Record<string, LayerRole>;
  unitScaleToCm: number | null;
}

/**
 * Whether the document has ANY closed polyline at all, on any layer —
 * the "is there plausibly a piece boundary somewhere in this file" gate a
 * caller uses to decide whether to show the layer-mapping screen at all,
 * as opposed to `computeVerification`'s `pieceCount`, which only counts
 * closed polylines on the CURRENT role map's "cut" layer(s). A generic
 * (unrecognised-vocabulary) file's `pieceCount` is legitimately 0 until the
 * user maps a layer to "cut" — that must not be confused with "this file
 * has no usable geometry at all".
 */
export function hasClosedPolyline(doc: DxfDocument): boolean {
  return doc.entities.some((e) => e.kind === "polyline" && e.closed);
}

/**
 * The format/layer/unit facts about a document — independent of which role
 * map is in effect. Split out from `computeVerification` below so the
 * screen can recompute pieceCount/checks live as the user corrects the
 * layer mapping (step 2's entire purpose) without re-detecting the format.
 */
export function analyzeLayers(doc: DxfDocument): LayerAnalysis {
  const layerCounts = new Map<string, number>();
  for (const e of doc.entities) {
    layerCounts.set(e.layer, (layerCounts.get(e.layer) ?? 0) + 1);
  }
  const layers: DetectedLayer[] = Array.from(
    layerCounts,
    ([name, entityCount]) => ({
      name,
      entityCount,
    }),
  );

  const layerNames = new Set(layers.map((l) => l.name));
  const format = detectFormat(layerNames);
  const suggestedRoles = suggestRoles(
    format,
    layers.map((l) => l.name),
  );
  const unitScaleToCm = unitScaleFor(doc.insUnits);

  return { format, layers, suggestedRoles, unitScaleToCm };
}

/**
 * pieceCount + every check that depends on the CURRENT role map — recomputed
 * whenever the user edits a layer's role, not just once from `suggestedRoles`.
 *
 * When no layer is mapped to "cut" yet, `pieceCandidates` is empty rather
 * than falling back to "every polyline in the file": the earlier fallback
 * counted sew lines, darts and internal outlines as pieces the moment the
 * vocabulary wasn't recognised — exactly the unrecognised-vocabulary case
 * the manual mapping step exists to resolve. Reporting 0 until the user
 * assigns a "cut" layer is the honest number, not a guess.
 */
export function computeVerification(
  doc: DxfDocument,
  roles: Record<string, LayerRole>,
): { pieceCount: number; checks: ImportCheck[] } {
  const cutLayers = new Set(
    Object.entries(roles)
      .filter(([, role]) => role === "cut")
      .map(([name]) => name),
  );
  const grainLayers = new Set(
    Object.entries(roles)
      .filter(([, role]) => role === "grain")
      .map(([name]) => name),
  );

  const polylines = doc.entities.filter(
    (e): e is Extract<DxfEntity, { kind: "polyline" }> => e.kind === "polyline",
  );
  const pieceCandidates =
    cutLayers.size > 0 ? polylines.filter((p) => cutLayers.has(p.layer)) : [];
  const closedCount = pieceCandidates.filter((p) => p.closed).length;
  const pieceCount = closedCount;

  const checks: ImportCheck[] = [];
  const unitScaleToCm = unitScaleFor(doc.insUnits);
  checks.push(
    unitScaleToCm !== null
      ? {
          code: "unitCm",
          level: "ok",
          values: { unit: unitLabelFor(doc.insUnits) },
        }
      : { code: "unitUnknown", level: "warning" },
  );

  checks.push({
    code: "piecesClosed",
    level:
      pieceCandidates.length > 0 && closedCount === pieceCandidates.length
        ? "ok"
        : "warning",
    values: { closed: closedCount, total: pieceCandidates.length },
  });

  if (pieceCount > 0) {
    checks.push({ code: "sizesUnknown", level: "warning" });
  }

  const grainLines = doc.entities.filter(
    (e): e is Extract<DxfEntity, { kind: "line" }> =>
      e.kind === "line" && grainLayers.has(e.layer),
  );
  const closedPieces = pieceCandidates.filter((p) => p.closed);
  const piecesMissingGrain = closedPieces.filter((piece) => {
    const b = bboxOf(piece.vertices);
    return !grainLines.some((line) => within(midpoint(line.a, line.b), b));
  });
  if (closedPieces.length > 0 && piecesMissingGrain.length > 0) {
    checks.push({
      code: "missingGrain",
      level: "warning",
      values: { pieces: piecesMissingGrain.length },
    });
  }

  if (doc.unsupported.length > 0) {
    checks.push({
      code: "unsupportedEntities",
      level: "warning",
      values: { types: doc.unsupported.join(", ") },
    });
  }

  // #5: doc.truncated was computed by parseDxf and never read here — a
  // partially-parsed file (an oversized upload, a vertex/entity cap hit)
  // presented as complete, the exact "pretending completeness" CLAUDE.md's
  // surface-limitations rule forbids. Every other drop (unsupported entity
  // types) was already surfaced; this was the one silent exception.
  if (doc.truncated) {
    checks.push({ code: "fileTruncated", level: "warning" });
  }

  return { pieceCount, checks };
}

/**
 * document → analysis, pure and DB/DOM-free (lib/'s framework-free rule).
 * Every check carries a code, never prose — analyzeDxf never imports
 * next-intl, and the screen resolves each one as
 * `t("checks." + check.code, check.values)`.
 *
 * This is `analyzeLayers` + `computeVerification(doc, suggestedRoles)` — the
 * initial analysis, before the user has corrected anything. The store
 * recomputes `computeVerification` on its own whenever the role map changes.
 */
export function analyzeDxf(
  doc: DxfDocument,
  fileName: string,
  fileSizeBytes: number,
): ImportAnalysis {
  const { format, layers, suggestedRoles, unitScaleToCm } = analyzeLayers(doc);
  const { pieceCount, checks } = computeVerification(doc, suggestedRoles);

  return {
    format,
    fileName,
    fileSizeBytes,
    unitScaleToCm,
    layers,
    suggestedRoles,
    pieceCount,
    checks,
  };
}
