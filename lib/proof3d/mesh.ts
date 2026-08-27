import type { Pattern } from "@/lib/types";
import { Measurements, resolveMeasurements } from "@/lib/measurements";
import { draftPiecesCm } from "@/lib/draft/garment";
import {
  bbox,
  catmullRomSegments,
  dartsOf,
  DraftedPiece,
  Pt,
} from "@/lib/draft/core";
import type { Translate } from "@/lib/i18n/translate";

// #10 (Prova 3D): a 2D-projected proxy of the drafted pattern hung on a
// parametric dress form -- NOT a cloth simulation. Everything here is
// derived, at call time, from `pattern.spec` + the frozen `sizeTable` + the
// pieces `draftPiecesCm` actually drafts -- nothing is persisted (the
// `savedAgo`/`planLabel` lesson from CLAUDE.md), and nothing here re-types a
// formula from lib/draft/body.ts|sleeve.ts|skirt.ts. Every landmark girth
// below is read off the piece's own drafted outline (a scanline at a known
// height, or the outline's own widest vertex) rather than recomputed from
// the drafters' internal constants -- this module never imports
// lib/draft/body.ts, sleeve.ts or skirt.ts directly, only the already-public
// draftPiecesCm/DraftedPiece surface every other consumer (lib/export,
// TechSheetTab, CutPlanTab) already uses.

// One cross-section of a shell, in the shell's own local (x, z) frame,
// centred on 0 -- `project.ts` positions it in the mesh's world space
// (translated by the owning Shell's centerXCm, stacked at `yCm`).
export interface Ring {
  yCm: number;
  girthCm: number;
  points: [number, number][];
}

export type ShellId = "form" | "body" | "sleeve" | "skirt";

export interface Shell {
  id: ShellId;
  // Horizontal offset of this shell's whole ring stack from the mesh's own
  // centre line -- 0 for the form/body/skirt, ± for a sleeve hanging beside
  // the body. Kept off Ring itself so a ring's own girth/perimeter math
  // never has to account for it.
  centerXCm: number;
  rings: Ring[];
}

export interface ProofFitRow {
  key: "bust" | "waist" | "hip";
  garmentCm: number;
  bodyCm: number;
  easeCm: number;
}

export interface ProofMesh {
  form: Shell;
  garment: Shell[];
  fit: ProofFitRow[];
}

// Elliptical ring cross-section: RING_SAMPLES points around an ellipse whose
// front-back depth is RING_DEPTH_RATIO of its side-to-side width -- a body
// is wider than it is deep, not circular. Anthropometric, not something
// lib/measurements.ts's Measurements captures.
export const RING_SAMPLES = 24;
export const RING_DEPTH_RATIO = 0.72;

// A flat radial skirt panel's own radial length (skirtLengthCm) equals its
// outer-minus-inner radius exactly (lib/draft/skirt.ts's `R = r + length`),
// which makes the true 3D vertical drop of a cone with that slant height
// and that girth spread work out to zero for every case the drafter
// produces -- projecting a flat disc. This fixed fraction of the flat
// panel's length is the floor used instead, purely for the drawing (the
// waist/hem girths themselves are unaffected).
const RADIAL_DROP_RATIO = 0.4;

const RADIAL_SILHOUETTES = new Set(["circle", "gore", "half-circle"]);

function polygonPerimeter(pts: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
}

// Samples a unit ellipse at RING_SAMPLES points, then scales the whole
// polygon so its own perimeter equals girthCm exactly (a numeric scale, not
// a closed-form circumference approximation) -- so a caller measuring the
// returned points' perimeter gets girthCm back to floating-point precision,
// regardless of RING_SAMPLES' coarseness.
function ring(yCm: number, girthCm: number): Ring {
  const g = Math.max(0, girthCm);
  const raw: [number, number][] = [];
  for (let i = 0; i < RING_SAMPLES; i++) {
    const a = (2 * Math.PI * i) / RING_SAMPLES;
    raw.push([Math.cos(a), Math.sin(a) * RING_DEPTH_RATIO]);
  }
  // RING_SAMPLES is a fixed, positive constant, so this unit ellipse's own
  // perimeter is always > 0 -- no guard needed for a divide-by-zero that
  // can't happen with a compile-time-fixed sample count.
  const scale = g / polygonPerimeter(raw);
  return {
    yCm,
    girthCm: g,
    points: raw.map(([x, z]) => [x * scale, z * scale]),
  };
}

// Samples per curved edge when flattening -- coarser than the drafters' own
// arc-length walkers (32/edge), which is fine here: a scanned girth only
// needs to land within the same sub-millimetre tolerance the projected SVG
// itself renders at, not the export path's cutting tolerance.
const CURVE_SAMPLES_PER_EDGE = 20;

function cubicPoint(p0: Pt, c1: Pt, c2: Pt, p3: Pt, u: number): Pt {
  const mt = 1 - u;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * u;
  const c = 3 * mt * u * u;
  const d = u * u * u;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
  ];
}

// Flattens a piece's outline -- straight on every edge outside a
// curvedSpan, densely sampled Catmull-Rom-derived Bézier inside one (the
// exact same tangent construction outlinePath/outlineSegments render with,
// via the shared lib/draft/core.ts helper) -- into a plain dense point
// list. `scanHalfWidthAtY`/`widestVertexInRange` below read the piece's own
// rendered silhouette this way rather than its sparse control polygon, so a
// scan that lands inside a curved span (a shaped waist seam, a curved hem)
// measures the real boundary instead of a chord across it.
export function flattenOutline(
  outlineCm: Pt[],
  curvedSpans: [number, number][],
): Pt[] {
  if (outlineCm.length < 3 || curvedSpans.length === 0) return outlineCm;
  const { start, segs } = catmullRomSegments(outlineCm, curvedSpans);
  const flat: Pt[] = [start];
  let prev = start;
  for (const seg of segs) {
    if (seg.kind === "line") {
      flat.push(seg.to);
      prev = seg.to;
    } else {
      for (let s = 1; s <= CURVE_SAMPLES_PER_EDGE; s++) {
        flat.push(
          cubicPoint(prev, seg.c1, seg.c2, seg.to, s / CURVE_SAMPLES_PER_EDGE),
        );
      }
      prev = seg.to;
    }
  }
  return flat;
}

function pieceCx(outlineCm: Pt[]): number {
  const b = bbox(outlineCm);
  return (b.minX + b.maxX) / 2;
}

// Full width of a piece's own drafted (and, if curved, flattened) outline at
// height yCm, found by intersecting every edge (and vertex) of the closed
// boundary with the line y=yCm and taking the crossing farthest from the
// piece's own centre line -- works for any silhouette because it reads the
// actual rendered geometry, never an internal drafter formula.
function scanHalfWidthAtY(outlineCm: Pt[], cx: number, yCm: number): number {
  const EPS = 1e-6;
  let max = 0;
  for (const [x, y] of outlineCm) {
    if (Math.abs(y - yCm) < EPS) max = Math.max(max, Math.abs(x - cx));
  }
  const n = outlineCm.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = outlineCm[i];
    const [x2, y2] = outlineCm[(i + 1) % n];
    if (Math.abs(y1 - yCm) < EPS || Math.abs(y2 - yCm) < EPS) continue;
    if ((y1 < yCm && y2 > yCm) || (y2 < yCm && y1 > yCm)) {
      const u = (yCm - y1) / (y2 - y1);
      max = Math.max(max, Math.abs(x1 + (x2 - x1) * u - cx));
    }
  }
  return max;
}

// The outline vertex farthest from the piece's own centre line within
// [yMin, yMax] -- locates the underarm (body) or bicep (sleeve) level
// without assuming its height, since it is always a real vertex (only the
// neckline and armhole/cap are curved, and the underarm/bicep point sits
// where the curve ends and the straight side seam begins).
function widestVertexInRange(
  outlineCm: Pt[],
  cx: number,
  yMin: number,
  yMax: number,
): { yCm: number; halfWidthCm: number } {
  let best = { yCm: yMin, halfWidthCm: 0 };
  const EPS = 1e-6;
  for (const [x, y] of outlineCm) {
    if (y < yMin - EPS || y > yMax + EPS) continue;
    const w = Math.abs(x - cx);
    if (w > best.halfWidthCm) best = { yCm: y, halfWidthCm: w };
  }
  return best;
}

function findPiece(
  pieces: DraftedPiece[],
  id: string,
): DraftedPiece | undefined {
  return pieces.find((p) => p.id === id);
}

// Mirrors buildExportModel (lib/export/model.ts:93-97) / planCutLayout: it
// re-drafts the pattern's base size through draftPiecesCm rather than
// reading anything already-placed on the canvas, so the preview always
// follows the pattern's current spec/measurements.
export function buildProofMesh(pattern: Pattern, t: Translate): ProofMesh {
  const spec = pattern.spec;
  if (!spec) throw new Error("buildProofMesh: pattern has no spec");
  const baseMeasurements: Measurements = pattern.sizeTable[pattern.baseSize];
  const resolved = resolveMeasurements(
    baseMeasurements,
    spec.measurementOverrides,
  );
  const pieces = draftPiecesCm(spec, baseMeasurements, t);

  const front = findPiece(pieces, "body-front");
  const back = findPiece(pieces, "body-back");
  const sleevePiece = findPiece(pieces, "sleeve");
  const skirtPiece = findPiece(pieces, "skirt");

  const fit: ProofFitRow[] = [];
  const garment: Shell[] = [];

  const waistYCm = resolved.backLength;
  let bustYCm = waistYCm * 0.45; // fallback anchor when there is no body piece
  let bustGirthCm = 0;

  if (front && back) {
    // Flattened once per piece (straight edges pass through unchanged,
    // curved spans become a dense polyline) so every scan below reads the
    // piece's real rendered silhouette, not its sparse control polygon.
    const ptsF = flattenOutline(front.outlineCm, front.curvedSpans ?? []);
    const ptsB = flattenOutline(back.outlineCm, back.curvedSpans ?? []);
    const cxF = pieceCx(ptsF);
    const cxB = pieceCx(ptsB);
    const bF = bbox(ptsF);
    const bB = bbox(ptsB);

    const bustF = widestVertexInRange(ptsF, cxF, 0, waistYCm);
    const bustB = widestVertexInRange(ptsB, cxB, 0, waistYCm);
    bustYCm = (bustF.yCm + bustB.yCm) / 2;
    bustGirthCm = 2 * bustF.halfWidthCm + 2 * bustB.halfWidthCm;

    const waistWidthF = scanHalfWidthAtY(ptsF, cxF, waistYCm);
    const waistWidthB = scanHalfWidthAtY(ptsB, cxB, waistYCm);
    const waistGirthCm = 2 * waistWidthF + 2 * waistWidthB;

    const bottomYCm = Math.min(bF.maxY, bB.maxY);
    const hipYCm = Math.min(
      bottomYCm,
      resolved.backLength + resolved.hipHeight,
    );
    const hipWidthF = scanHalfWidthAtY(ptsF, cxF, hipYCm);
    const hipWidthB = scanHalfWidthAtY(ptsB, cxB, hipYCm);
    const hipGirthCm = 2 * hipWidthF + 2 * hipWidthB;

    const rings: Ring[] = [
      ring(bustYCm, bustGirthCm),
      ring(waistYCm, waistGirthCm),
    ];
    if (hipYCm > waistYCm + 0.01) rings.push(ring(hipYCm, hipGirthCm));
    garment.push({ id: "body", centerXCm: 0, rings });

    fit.push({
      key: "bust",
      garmentCm: bustGirthCm,
      bodyCm: resolved.bust,
      easeCm: bustGirthCm - resolved.bust,
    });

    // Derived from the drafted output itself (real darts on the front
    // panel), not from re-checking spec.style.darts/spec.type the way
    // lib/draft/body.ts's own `fitted` flag does -- so this can never drift
    // from what was actually drafted (e.g. a t-shirt's forced darts:false).
    const fitted = dartsOf(front.internalsCm).length > 0;
    if (fitted) {
      fit.push({
        key: "waist",
        garmentCm: waistGirthCm,
        bodyCm: resolved.waist,
        easeCm: waistGirthCm - resolved.waist,
      });
    }

    if (!skirtPiece) {
      fit.push({
        key: "hip",
        garmentCm: hipGirthCm,
        bodyCm: resolved.hip,
        easeCm: hipGirthCm - resolved.hip,
      });
    }
  }

  if (skirtPiece) {
    const silhouette = spec.style.skirt ?? "straight";
    const skirtLengthCm = spec.style.skirtLengthCm ?? resolved.skirtLength;
    // Always anchored at the dress form's own waist height (m.backLength
    // down from HPS) -- a dress's skirt panel continues exactly there,
    // where the bodice hem sits (lib/draft/garment.ts's dress length), and a
    // standalone skirt hangs at the same mannequin waist rather than at an
    // arbitrary y=0 that would float it up at the form's neck.
    const yOffsetCm = resolved.backLength;

    let waistGirthCm: number;
    let hemGirthCm: number;
    let dropCm: number;
    if (RADIAL_SILHOUETTES.has(silhouette)) {
      const fullSweepRad = silhouette === "half-circle" ? Math.PI : 2 * Math.PI;
      // lib/draft/skirt.ts sizes the inner radius so the assembled panels'
      // waist arc equals the waist measurement exactly (r * sweep * panels
      // === waist); the hem arc is the outer radius (r + skirtLengthCm)
      // swept the same total angle, i.e. waist + skirtLengthCm * fullSweep.
      waistGirthCm = resolved.waist;
      hemGirthCm = resolved.waist + skirtLengthCm * fullSweepRad;
      dropCm = skirtLengthCm * RADIAL_DROP_RATIO;
    } else {
      const pts = flattenOutline(
        skirtPiece.outlineCm,
        skirtPiece.curvedSpans ?? [],
      );
      const cx = pieceCx(pts);
      const b = bbox(pts);
      const qty = skirtPiece.qty;
      waistGirthCm = qty * 2 * scanHalfWidthAtY(pts, cx, b.minY);
      hemGirthCm = qty * 2 * scanHalfWidthAtY(pts, cx, b.maxY);
      dropCm = skirtLengthCm;
    }

    garment.push({
      id: "skirt",
      centerXCm: 0,
      rings: [
        ring(yOffsetCm, waistGirthCm),
        ring(yOffsetCm + dropCm, hemGirthCm),
      ],
    });

    // A straight/a-line panel's own waist edge is sized off the hip
    // measurement plus a fixed ease (lib/draft/skirt.ts's
    // skirtWaistHalfCm) -- so this is the garment's real "hip" comparison,
    // matching the seam a dress bodice actually joins to. A radial panel
    // (circle/gore/half-circle) instead sizes its inner radius directly off
    // the true waist measurement (r = waist / fullSweep), which fits it
    // exactly by construction -- not a hip comparison, and not a
    // meaningful ease number, so no fit row is emitted for it.
    if (!RADIAL_SILHOUETTES.has(silhouette)) {
      fit.push({
        key: "hip",
        garmentCm: waistGirthCm,
        bodyCm: resolved.hip,
        easeCm: waistGirthCm - resolved.hip,
      });
    }
  }

  if (sleevePiece && front) {
    const pts = flattenOutline(
      sleevePiece.outlineCm,
      sleevePiece.curvedSpans ?? [],
    );
    const cx = pieceCx(pts);
    const b = bbox(pts);
    const cap = widestVertexInRange(pts, cx, b.minY, b.maxY);
    const bicepGirthCm = 2 * cap.halfWidthCm;
    const hemGirthCm = 2 * scanHalfWidthAtY(pts, cx, b.maxY);
    const anchorYCm = Math.max(0, bustYCm - 6); // shoulder sits a little above the bust line
    // `front` is only ever drafted alongside `back` (lib/draft/garment.ts's
    // draftBody call), so entering this block means the `if (front && back)`
    // branch above already ran and set a real, positive bustGirthCm.
    const sideOffsetCm = bustGirthCm / 4;
    const lengthBelowCapCm = b.maxY - cap.yCm;
    for (const side of [-1, 1] as const) {
      garment.push({
        id: "sleeve",
        centerXCm: side * sideOffsetCm,
        rings: [
          ring(anchorYCm, bicepGirthCm),
          ring(anchorYCm + lengthBelowCapCm, hemGirthCm),
        ],
      });
    }
  }

  // The dress form: HPS to hip, built only from the resolved Measurements
  // row (no drafter internals) -- landmark heights are shared with the
  // garment's own where one was derived above (bustYCm/waistYCm), so the
  // two visually line up; neck/shoulder are a fixed small fraction purely
  // for the drawing (no fit row reads them).
  const hipYCm = resolved.backLength + resolved.hipHeight;
  const shoulderYCm = Math.max(2, bustYCm * 0.4);
  const form: Shell = {
    id: "form",
    centerXCm: 0,
    rings: [
      ring(0, Math.max(resolved.bust * 0.18, 6)),
      ring(shoulderYCm, resolved.shoulder * 2 + 6),
      ring(bustYCm, resolved.bust),
      ring(waistYCm, resolved.waist),
      ring(hipYCm, resolved.hip),
    ],
  };

  return { form, garment, fit };
}
