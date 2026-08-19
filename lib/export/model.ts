import type { Pattern, SizeLabel } from "@/lib/types";
import { bbox, type DraftedPiece, type Pt } from "@/lib/draft/core";
import { draftPiecesCm } from "@/lib/draft/garment";
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
  grainline?: [ExPt, ExPt];
  dart?: ExPt[];
  originCm: ExPt;
}

export interface ExportModel {
  patternName: string;
  size: SizeLabel;
  unit: "cm";
  seamAllowanceCm: number | null;
  sheetWidthCm: number;
  sheetHeightCm: number;
  pieces: ExportPiece[];
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

export function buildExportModel(pattern: Pattern, t: Translate): ExportModel {
  const spec = pattern.spec;
  if (!spec) throw new Error("buildExportModel: pattern has no spec");
  const baseMeasurements = pattern.sizeTable[pattern.baseSize];
  const drafted: DraftedPiece[] = draftPiecesCm(spec, baseMeasurements, t);

  const padCm = 6;
  const gapCm = 8;

  // 1) Normalize each piece to its own bbox (local geometry) and store w/h.
  const pieces: ExportPiece[] = drafted.map((dp) => {
    const b = bbox(dp.outlineCm);
    const shift = (pt: Pt): Pt => [pt[0] - b.minX, pt[1] - b.minY];
    const local = dp.outlineCm.map(shift);
    const ep: ExportPiece = {
      id: dp.id,
      name: dp.name,
      qty: dp.qty,
      widthCm: b.w,
      heightCm: b.h,
      outline: outlineSegments(local, dp.curvedSpans ?? []),
      originCm: { x: padCm, y: padCm }, // position set by the packing below
    };
    if (dp.grainlineCm) {
      const [g1, g2] = dp.grainlineCm;
      ep.grainline = [P(shift(g1)), P(shift(g2))];
    }
    if (dp.dartCm && dp.dartCm.length >= 3)
      ep.dart = dp.dartCm.map((pt) => P(shift(pt)));
    return ep;
  });

  // 2) Shelf-packing: instead of a single horizontal row — which produced
  // sheets several meters wide and many A4 pages — it wraps the pieces into
  // rows with a near-square target width. Shrinks the bounding box (fewer
  // A4 pages when printing) without overlapping pieces. Sorts by height desc
  // for tighter shelves; the returned array's order is preserved.
  const widest = pieces.reduce((m, p) => Math.max(m, p.widthCm), 0);
  const totalArea = pieces.reduce((s, p) => s + p.widthCm * p.heightCm, 0);
  const targetW = Math.max(widest, Math.sqrt(totalArea * 1.4));

  const order = [...pieces].sort((a, b) => b.heightCm - a.heightCm);
  let cursorX = padCm;
  let cursorY = padCm;
  let rowH = 0;
  let sheetRight = padCm;
  for (const p of order) {
    if (cursorX > padCm && cursorX - padCm + p.widthCm > targetW) {
      cursorY += rowH + gapCm; // new shelf
      cursorX = padCm;
      rowH = 0;
    }
    p.originCm = { x: cursorX, y: cursorY };
    cursorX += p.widthCm + gapCm;
    rowH = Math.max(rowH, p.heightCm);
    sheetRight = Math.max(sheetRight, cursorX - gapCm);
  }

  return {
    patternName: pattern.name,
    size: pattern.baseSize,
    unit: "cm",
    seamAllowanceCm: spec.style.seamAllowanceCm ?? 1,
    sheetWidthCm: sheetRight + padCm,
    sheetHeightCm: cursorY + rowH + padCm,
    pieces,
  };
}
