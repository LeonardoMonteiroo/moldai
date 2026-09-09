import type { GarmentType, NotchType, Pattern, SizeLabel } from "@/lib/types";
import {
  bbox,
  catmullRomSegments,
  type DraftedPiece,
  type InternalCm,
  type InternalLoopCm,
  type Pt,
} from "@/lib/draft/core";
import { draftPiecesCm } from "@/lib/draft/engine/facade";
import { engineFor } from "@/lib/draft/engine/capability";
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
  // #127: one entry per dart -- the dart's own fold line (apex-to-apex for
  // a double-ended/fisheye dart, apex-to-seam-midpoint for a single-ended
  // one). Distinct from `fold` below, which is the piece's own cut-on-fold
  // axis of symmetry, a different concept.
  internalFoldLines?: [ExPt, ExPt][];
  // #127: one entry per free dart apex, 1.0-1.5cm short of the point (see
  // lib/draft/core.ts's DRILL_HOLE_SETBACK_CM) so the mark hides inside the
  // sewn dart.
  drillHoles?: { at: ExPt; rCm: number }[];
  // #244: one entry per pleat's own placement/stitch line -- where the
  // folded edge lays down once pressed, the same open-point-list shape
  // `darts` above uses (lib/draft/skirt.ts's pleatFoldPlacement always
  // emits a 2-point line, but this stays a list for the same "not assumed
  // exactly N points" reason darts does). Distinct from `internalFoldLines`
  // above: a pleat's own PRESS fold reuses that channel already (it is a
  // press line, same concept a dart's fold line already is); this is the
  // one new mark the reserved "pleat" InternalCm kind actually adds.
  pleats?: ExPt[][];
  // #126: the piece's cut-on-fold line, both endpoints already real outline
  // vertices (see DraftedPiece.foldEdge) -- absent on a piece with no fold
  // (e.g. a sleeve) or drafted before this existed.
  fold?: [ExPt, ExPt];
  // #124: one tick per notch -- outer (on the net outline) to inner (depth
  // toward the piece interior). Absent on a piece drafted before this
  // existed, or one no convention places a mark on.
  notches?: ExportNotch[];
  // #243: zero or more internal loops (holes) inside this piece's own outer
  // boundary, both outlines already in the SAME local (shifted-to-net-bbox)
  // frame as `outline`/`cutOutline` above -- a serializer draws a loop
  // exactly the way it already draws the outer boundary, just once per
  // entry here instead of once per piece.
  internalLoops?: ExportInternalLoop[];
  originCm: ExPt;
}

// #124: mirrors lib/draft/core.ts's NotchCm, in the same local (shifted-to-
// net-bbox) frame as outline/grainline/darts/fold.
export interface ExportNotch {
  type: NotchType;
  outer: ExPt;
  inner: ExPt;
}

// #243: one internal loop (hole), redrafted the same two-outline way as the
// piece itself -- `outline` is the net/finished edge, `cutOutline` is it
// offset via offsetOutlineCm's `direction: "inward"` (the loop SHRINKS, the
// opposite of the outer boundary's own outward growth -- see offset.ts).
export interface ExportInternalLoop {
  outline: { start: ExPt; segs: ExSeg[] };
  cutOutline: { start: ExPt; segs: ExSeg[] };
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
  // #2: the garment archetype, as the stable ENGLISH enum value rather than a
  // catalog label -- the AAMA/ASTM per-piece system text is read by CAD
  // software, not rendered as UI, so it wants an identifier that does not
  // move when the pt-BR copy is rewritten (the seam-pair `key` precedent).
  // Optional only so the hand-built ExportModel fixtures in the serializer
  // tests keep compiling; buildExportModel always sets it.
  garmentType?: GarmentType;
}

const P = (p: Pt): ExPt => ({ x: p[0], y: p[1] });

const round2 = (n: number) => (Math.round(n * 100) / 100).toString();

// #127: pulls one InternalCm kind's own payload out of a DraftedPiece's
// internalsCm -- kept here (not duplicated per call site) since InternalCm's
// discriminant lives in lib/draft/core.ts.
function dartEntries(internalsCm?: InternalCm[]): Pt[][] {
  return (internalsCm ?? [])
    .filter(
      (e): e is Extract<InternalCm, { kind: "dart" }> => e.kind === "dart",
    )
    .map((e) => e.ptsCm);
}
function foldLineEntries(internalsCm?: InternalCm[]): [Pt, Pt][] {
  return (internalsCm ?? [])
    .filter(
      (e): e is Extract<InternalCm, { kind: "foldLine" }> =>
        e.kind === "foldLine",
    )
    .map((e) => [e.aCm, e.bCm]);
}
function drillHoleEntries(
  internalsCm?: InternalCm[],
): { atCm: Pt; rCm: number }[] {
  return (internalsCm ?? []).filter(
    (e): e is Extract<InternalCm, { kind: "drillHole" }> =>
      e.kind === "drillHole",
  );
}
// #244: a pleat's own placement/stitch line(s) -- the reserved "pleat"
// InternalCm kind's first real emitter (lib/draft/skirt.ts).
function pleatEntries(internalsCm?: InternalCm[]): Pt[][] {
  return (internalsCm ?? [])
    .filter(
      (e): e is Extract<InternalCm, { kind: "pleat" }> => e.kind === "pleat",
    )
    .map((e) => e.ptsCm);
}

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

// #86: thin adapter over lib/draft/core.ts's shared catmullRomSegments --
// the same tangent math outlinePath uses, here fed exact cm (never PX()
// px-rounded, unlike outlinePath's canvas points) and mapped to ExPt/ExSeg.
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
  const { start, segs: cSegs } = catmullRomSegments(p, curvedSpans);
  const segs: ExSeg[] = cSegs.map((s) =>
    s.kind === "line"
      ? { kind: "line", to: P(s.to) }
      : { kind: "cubic", c1: P(s.c1), c2: P(s.c2), to: P(s.to) },
  );
  return { start: P(start), segs };
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

// #243: one internal loop (hole), redrafted into the same net/cut pair as
// the piece it lives inside -- `shift` is the SAME (minX,minY) translation
// buildExportModel already applied to the piece's own outer outline, so a
// loop lands in the identical local frame. Its cut line goes through
// offsetOutlineCm's `direction: "inward"` -- a hole's seam allowance folds
// INTO the opening, the opposite of the outer boundary's own outward
// growth just below this call in buildExportModel.
export function buildInternalLoop(
  loop: InternalLoopCm,
  shift: (pt: Pt) => Pt,
  allowanceCm: number,
): ExportInternalLoop {
  const spans = loop.curvedSpans ?? [];
  const local = loop.outlineCm.map(shift);
  const cutPts = offsetOutlineCm(
    loop.outlineCm,
    spans,
    undefined,
    allowanceCm,
    undefined,
    "inward",
  ).map((pt) => P(shift([pt.x, pt.y])));
  return {
    outline: outlineSegments(local, spans),
    cutOutline: flatLoopToSegments(cutPts),
  };
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
  // #249: the pattern's own frozen base-size row, so an explicit
  // style.skirtLengthCm grades across sizes the same ratio the chart's own
  // skirtLength already does instead of printing every graded size at one
  // identical hem (lib/draft/core.ts's gradedSkirtLengthCm) -- this is the
  // "graded layered PDF" money path #249 reported. Falls back to
  // baseMeasurements itself (ratio 1, current behavior) if the pattern's own
  // baseSize has somehow drifted out of its own sizeTable.
  const referenceMeasurements =
    pattern.sizeTable[pattern.baseSize] ?? baseMeasurements;
  // #267: the pattern's own FROZEN engine, never a fresh default -- see
  // lib/draft/easeReport.ts's identical comment.
  const drafted: DraftedPiece[] = draftPiecesCm(
    engineFor(pattern.engine),
    spec,
    baseMeasurements,
    t,
    referenceMeasurements,
  );
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
    const darts = dartEntries(dp.internalsCm).filter((pts) => pts.length >= 3);
    if (darts.length)
      ep.darts = darts.map((pts) => pts.map((pt) => P(shift(pt))));
    // #127: the dart's own fold line and drill hole(s), through the same
    // local (shifted-to-net-bbox) frame as darts/grainline/fold above.
    const foldLines = foldLineEntries(dp.internalsCm).map(
      ([a, b]) => [P(shift(a)), P(shift(b))] as [ExPt, ExPt],
    );
    if (foldLines.length) ep.internalFoldLines = foldLines;
    const drillHoles = drillHoleEntries(dp.internalsCm).map((h) => ({
      at: P(shift(h.atCm)),
      rCm: h.rCm,
    }));
    if (drillHoles.length) ep.drillHoles = drillHoles;
    const pleats = pleatEntries(dp.internalsCm).filter(
      (pts) => pts.length >= 2,
    );
    if (pleats.length)
      ep.pleats = pleats.map((pts) => pts.map((pt) => P(shift(pt))));
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
    // #243: each internal loop (hole), through the same shifted local frame
    // as everything else above -- its own cut line is offset "inward" (see
    // offset.ts's own comment), the mirror of the outer boundary's outward
    // growth just below.
    if (dp.internalLoopsCm?.length) {
      ep.internalLoops = dp.internalLoopsCm.map((loop) =>
        buildInternalLoop(loop, shift, allowanceCm),
      );
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
    garmentType: spec.type,
  };
}
