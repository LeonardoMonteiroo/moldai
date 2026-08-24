import type { NotchType, Pattern, SizeLabel } from "@/lib/types";
import { bbox, type DraftedPiece, type Pt } from "@/lib/draft/core";
import { draftPiecesCm } from "@/lib/draft/garment";
import { offsetOutlineCm } from "./offset";
import type { Translate } from "@/lib/i18n/translate";

export type ExPt = { x: number; y: number };
export type ExSeg =
  { kind: "line"; to: ExPt } | { kind: "cubic"; c1: ExPt; c2: ExPt; to: ExPt };

export interface ExportPiece {
  id: string;
  name: string;
  qty: number;
  widthCm: number;
  heightCm: number;
  outline: { start: ExPt; segs: ExSeg[] };
  // #123: the real cut line -- the net `outline` above offset outward by
  // the pattern's `seamAllowanceCm` (0 across a `fold`, see offsetOutlineCm)
  // and flattened to straight segments, the same way lib/export/dxf.ts
  // already flattens curves for DXF/PDF (there is no exact cubic offset of
  // a cubic, and a dense polyline is well within cutting tolerance). Always
  // present -- unlike `fold`, every piece has a seam allowance, even a
  // sleeve with no axis of symmetry.
  cutOutline: { start: ExPt; segs: ExSeg[] };
  // bbox of cutOutline, in the same local (shifted-to-net-bbox) frame as
  // widthCm/heightCm -- can run negative/exceed widthCm/heightCm since the
  // cut line extends past the net line on every non-fold side.
  cutWidthCm: number;
  cutHeightCm: number;
  grainline?: [ExPt, ExPt];
  // #122: one entry per dart -- a fitted front/back panel carries two,
  // symmetric about its own centre line.
  darts?: ExPt[][];
  // #126: the piece's cut-on-fold line, both endpoints already real outline
  // vertices (see DraftedPiece.foldEdge) -- absent on a piece with no fold
  // (e.g. a sleeve) or drafted before this existed.
  fold?: [ExPt, ExPt];
  // #124: one tick per notch -- outer (on the net outline) to inner (depth
  // toward the piece interior). Absent on a piece drafted before this
  // existed, or one no convention places a mark on.
  notches?: ExportNotch[];
  originCm: ExPt;
}

// #124: mirrors lib/draft/core.ts's NotchCm, in the same local (shifted-to-
// net-bbox) frame as outline/grainline/darts/fold.
export interface ExportNotch {
  type: NotchType;
  outer: ExPt;
  inner: ExPt;
}

export interface ExportModel {
  patternName: string;
  size: SizeLabel;
  unit: "cm";
  seamAllowanceCm: number | null;
  sheetWidthCm: number;
  sheetHeightCm: number;
  pieces: ExportPiece[];
  // #126: pt-BR "dobra" from the PatternData catalog -- resolved once here
  // (the same namespace every drafter row already reads `t` from) rather
  // than per-serializer, so svg/pdf print the same label the catalog owns.
  foldLabel: string;
}

const P = (p: Pt): ExPt => ({ x: p[0], y: p[1] });

const round2 = (n: number) => (Math.round(n * 100) / 100).toString();

// Builds the `d` attribute of a closed outline (start + segs) applying the
// tx/ty coordinate transforms. Shared by the SVG serializer
// (lib/export/svg.ts, mm scale) and the cut-plan preview (cm scale).
export function buildPathD(
  start: ExPt,
  segs: ExSeg[],
  tx: (x: number) => number,
  ty: (y: number) => number,
): string {
  let d = `M${round2(tx(start.x))} ${round2(ty(start.y))}`;
  for (const s of segs) {
    if (s.kind === "line") d += ` L${round2(tx(s.to.x))} ${round2(ty(s.to.y))}`;
    else
      d += ` C${round2(tx(s.c1.x))} ${round2(ty(s.c1.y))} ${round2(tx(s.c2.x))} ${round2(ty(s.c2.y))} ${round2(tx(s.to.x))} ${round2(ty(s.to.y))}`;
  }
  return d + " Z";
}

export function outlineSegments(
  ptsCm: Pt[],
  curvedSpans: [number, number][] = [],
): { start: ExPt; segs: ExSeg[] } {
  const p = ptsCm;
  const n = p.length;
  if (n < 3) {
    const segs: ExSeg[] = [];
    for (let i = 1; i < n; i++) segs.push({ kind: "line", to: P(p[i]) });
    return { start: P(p[0] ?? [0, 0]), segs };
  }
  const at = (i: number) => p[((i % n) + n) % n];
  const spanFor = (i: number) =>
    curvedSpans.find(([a, b]) => i >= a && i + 1 <= b);
  const segs: ExSeg[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = at(i),
      p2 = at(i + 1);
    const span = spanFor(i);
    if (!span) {
      segs.push({ kind: "line", to: P(p2) });
      continue;
    }
    const [a, b] = span;
    const p0 = i === a ? p1 : at(i - 1);
    const p3 = i + 1 === b ? p2 : at(i + 2);
    const c1: ExPt = {
      x: p1[0] + (p2[0] - p0[0]) / 6,
      y: p1[1] + (p2[1] - p0[1]) / 6,
    };
    const c2: ExPt = {
      x: p2[0] - (p3[0] - p1[0]) / 6,
      y: p2[1] - (p3[1] - p1[1]) / 6,
    };
    segs.push({ kind: "cubic", c1, c2, to: P(p2) });
  }
  return { start: P(at(0)), segs };
}

// #123: wraps an already-flat, already-closed point loop (offsetOutlineCm's
// output) into the same { start, segs } shape outlineSegments produces, one
// line-kind seg per edge including the wraparound back to `start` --
// matching outlineSegments's own edge count (n segs for n points) so
// flattenOutlineCm's first/last-vertex dedup behaves identically for a cut
// line as it does for a net line that happens to have no curves.
function flatLoopToSegments(pts: ExPt[]): { start: ExPt; segs: ExSeg[] } {
  const n = pts.length;
  const at = (i: number) => pts[((i % n) + n) % n];
  const segs: ExSeg[] = [];
  for (let i = 0; i < n; i++) segs.push({ kind: "line", to: at(i + 1) });
  return { start: at(0), segs };
}

// #59: `size` defaults to the base size (unchanged behavior for a pattern
// with nothing graded); passing an applied size re-drafts the export in that
// size's own measurements instead of always the base. There is no separate
// "graded geometry" to export -- it's the same draftPiecesCm call the base
// export already made, given a different row of the frozen sizeTable.
export function buildExportModel(
  pattern: Pattern,
  t: Translate,
  size: SizeLabel = pattern.baseSize,
): ExportModel {
  const spec = pattern.spec;
  if (!spec) throw new Error("buildExportModel: pattern has no spec");
  const resolvedSize = pattern.sizeTable[size] ? size : pattern.baseSize;
  const baseMeasurements = pattern.sizeTable[resolvedSize];
  const drafted: DraftedPiece[] = draftPiecesCm(spec, baseMeasurements, t);
  const allowanceCm = spec.style.seamAllowanceCm ?? 1;

  const padCm = 6;
  const gapCm = 8;

  // 1) Normalize each piece to its own bbox (local geometry) and store w/h.
  const built = drafted.map((dp) => {
    const b = bbox(dp.outlineCm);
    const shift = (pt: Pt): Pt => [pt[0] - b.minX, pt[1] - b.minY];
    const local = dp.outlineCm.map(shift);
    // #123: offset computed on the pre-shift outline (translation commutes
    // with offsetting), then shifted by the same (minX,minY) as the net
    // outline above so both share one local coordinate frame -- the cut
    // line legitimately runs negative/past widthCm-heightCm on the sides
    // that grew, since the net outline's own bbox is what the frame is
    // anchored to.
    const cutPts = offsetOutlineCm(
      dp.outlineCm,
      dp.curvedSpans ?? [],
      dp.foldEdge,
      allowanceCm,
    ).map((pt) => P(shift([pt.x, pt.y])));
    const cutB = bbox(cutPts.map((pt) => [pt.x, pt.y] as Pt));
    const ep: ExportPiece = {
      id: dp.id,
      name: dp.name,
      qty: dp.qty,
      widthCm: b.w,
      heightCm: b.h,
      outline: outlineSegments(local, dp.curvedSpans ?? []),
      cutOutline: flatLoopToSegments(cutPts),
      cutWidthCm: cutB.w,
      cutHeightCm: cutB.h,
      originCm: { x: padCm, y: padCm }, // position set by the packing below
    };
    if (dp.grainlineCm) {
      const [g1, g2] = dp.grainlineCm;
      ep.grainline = [P(shift(g1)), P(shift(g2))];
    }
    const darts = (dp.dartsCm ?? []).filter((pts) => pts.length >= 3);
    if (darts.length)
      ep.darts = darts.map((pts) => pts.map((pt) => P(shift(pt))));
    if (dp.foldEdge) {
      const [a, b2] = dp.foldEdge;
      ep.fold = [P(shift(dp.outlineCm[a])), P(shift(dp.outlineCm[b2]))];
    }
    if (dp.notches?.length) {
      ep.notches = dp.notches.map((n) => ({
        type: n.type,
        outer: P(shift(n.outerCm)),
        inner: P(shift(n.innerCm)),
      }));
    }
    // #123: how far the cut line's own bbox reaches past the net outline's
    // on each side -- a mitred convex corner can grow further than a plain
    // edge offset (unbounded as the corner gets sharper), so the packing
    // below has to reserve exactly this much extra room per piece or two
    // neighbours' solid cut lines can touch/overlap on the printed sheet.
    const growLeft = Math.max(0, -cutB.minX);
    const growTop = Math.max(0, -cutB.minY);
    const growRight = Math.max(0, cutB.maxX - b.w);
    const growBottom = Math.max(0, cutB.maxY - b.h);
    return {
      ep,
      growLeft,
      growTop,
      effWidthCm: growLeft + b.w + growRight,
      effHeightCm: growTop + b.h + growBottom,
    };
  });

  // 2) Shelf-packing: instead of a single horizontal row — which produced
  // sheets several meters wide and many A4 pages — it wraps the pieces into
  // rows with a near-square target width. Shrinks the bounding box (fewer
  // A4 pages when printing) without overlapping pieces. Sorts by height desc
  // for tighter shelves; the returned array's order is preserved. Packs by
  // each piece's EFFECTIVE footprint (net outline padded out to the cut
  // line's own reach, see growLeft/Top/Right/Bottom above) rather than the
  // net outline's bbox alone, and offsets `originCm` by (growLeft, growTop)
  // so the cut line's own bbox -- not the net one -- lands on the cursor:
  // the actual gap between two neighbours' cut lines is exactly `gapCm`
  // regardless of how unevenly each one grew.
  const widest = built.reduce((m, p) => Math.max(m, p.effWidthCm), 0);
  const totalArea = built.reduce((s, p) => s + p.effWidthCm * p.effHeightCm, 0);
  const targetW = Math.max(widest, Math.sqrt(totalArea * 1.4));

  const order = [...built].sort((a, b) => b.effHeightCm - a.effHeightCm);
  let cursorX = padCm;
  let cursorY = padCm;
  let rowH = 0;
  let sheetRight = padCm;
  for (const p of order) {
    if (cursorX > padCm && cursorX - padCm + p.effWidthCm > targetW) {
      cursorY += rowH + gapCm; // new shelf
      cursorX = padCm;
      rowH = 0;
    }
    p.ep.originCm = { x: cursorX + p.growLeft, y: cursorY + p.growTop };
    cursorX += p.effWidthCm + gapCm;
    rowH = Math.max(rowH, p.effHeightCm);
    sheetRight = Math.max(sheetRight, cursorX - gapCm);
  }

  const pieces = built.map((p) => p.ep);

  return {
    patternName: pattern.name,
    size: resolvedSize,
    unit: "cm",
    seamAllowanceCm: spec.style.seamAllowanceCm ?? 1,
    sheetWidthCm: sheetRight + padCm,
    sheetHeightCm: cursorY + rowH + padCm,
    pieces,
    foldLabel: t("foldLabel"),
  };
}
