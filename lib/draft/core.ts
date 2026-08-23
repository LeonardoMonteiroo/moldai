import { DetailRow, Piece, PieceOutline } from "@/lib/types";

export const SCALE = 4; // px per cm
export const PX = (cm: number) => Math.round(cm * SCALE * 10) / 10;

export type Pt = [number, number];

export interface DraftedPiece {
  id: string;
  name: string;
  qty: number;
  outlineCm: Pt[];
  curvedSpans?: [number, number][];
  guideCm?: Pt[];
  grainlineCm?: [Pt, Pt];
  dartCm?: Pt[];
  detailRows: DetailRow[];
  armholeLenCm?: number;
}

export function bbox(pts: Pt[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function polyPath(ptsCm: Pt[]): PieceOutline {
  const points = ptsCm.map(([x, y]) => `${PX(x)},${PX(y)}`).join(" ");
  return { kind: "polygon", points };
}

// Draws a closed outline: straight (L) on every edge, except edges
// covered by a curvedSpan, where it emits Catmull-Rom->Bézier with the
// tangents locked at the span's edges (doesn't pull toward the neighboring straight points).
export function outlinePath(
  ptsCm: Pt[],
  curvedSpans: [number, number][] = [],
): PieceOutline {
  const p = ptsCm.map(([x, y]) => [PX(x), PX(y)] as Pt);
  const n = p.length;
  if (n < 3) return polyPath(ptsCm);
  const at = (i: number) => p[(i + n) % n];
  const spanFor = (i: number) =>
    curvedSpans.find(([a, b]) => i >= a && i + 1 <= b);
  let d = `M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)} `;
  for (let i = 0; i < n; i++) {
    const p1 = at(i),
      p2 = at(i + 1);
    const span = spanFor(i);
    if (!span) {
      d += `L${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
      continue;
    }
    const [a, b] = span;
    const p0 = i === a ? p1 : at(i - 1);
    const p3 = i + 1 === b ? p2 : at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6,
      c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6,
      c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
  }
  d += "Z";
  return { kind: "path", d: d.trim() };
}

// Cubic Bézier point at parameter u in [0,1].
function bezierPoint(p0: Pt, c1: Pt, c2: Pt, p3: Pt, u: number): Pt {
  const mt = 1 - u;
  const a = mt * mt * mt,
    b = 3 * mt * mt * u,
    c = 3 * mt * u * u,
    d = u * u * u;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
  ];
}

// Measures the real length, in cm, of the outline between edge indices
// `from` and `to`, using the same Catmull-Rom-derived tangents as
// outlinePath (straight edges outside a curvedSpan, tangent-locked cubic
// Bézier inside one) — so a caller can assert on the geometry actually
// emitted (an armhole, a sleeve cap) instead of on the numbers that were
// fed in to build it. See #139/#78.
export function curveArcLengthCm(
  ptsCm: Pt[],
  curvedSpans: [number, number][],
  from: number,
  to: number,
  samplesPerEdge = 32,
): number {
  const n = ptsCm.length;
  const at = (i: number) => ptsCm[(i + n) % n];
  const spanFor = (i: number) =>
    curvedSpans.find(([a, b]) => i >= a && i + 1 <= b);
  let len = 0;
  for (let i = from; i < to; i++) {
    const p1 = at(i),
      p2 = at(i + 1);
    const span = spanFor(i);
    if (!span) {
      len += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      continue;
    }
    const [a, b] = span;
    const p0 = i === a ? p1 : at(i - 1);
    const p3 = i + 1 === b ? p2 : at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    let prev = p1;
    for (let s = 1; s <= samplesPerEdge; s++) {
      const pt = bezierPoint(p1, c1, c2, p2, s / samplesPerEdge);
      len += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
      prev = pt;
    }
  }
  return len;
}

function translateOutline(
  o: PieceOutline,
  dx: number,
  dy: number,
): PieceOutline {
  if (o.kind === "polygon") {
    const points = o.points
      .split(" ")
      .map((pair) => {
        const [x, y] = pair.split(",").map(Number);
        return `${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`;
      })
      .join(" ");
    return { kind: "polygon", points };
  }
  // path: we only have absolute M/C/L/Z commands generated here; we translate numbers in pairs after M/C/L.
  const d = o.d.replace(/([MCL])([^MCLZ]*)/g, (_, cmd, nums) => {
    const parts = nums.trim().split(/\s+/).map(Number);
    const shifted = parts.map((v: number, i: number) =>
      (i % 2 === 0 ? v + dx : v + dy).toFixed(1),
    );
    return `${cmd}${shifted.join(" ")} `;
  });
  return { kind: "path", d: d.trim() };
}

// Builds the final Piece by applying outline/guide/grainline/dart with an (dx,dy) offset in px.
function place(dp: DraftedPiece, dxPx: number, dyPx: number): Piece {
  const spans = dp.curvedSpans ?? [];
  const outline = spans.length
    ? outlinePath(dp.outlineCm, spans)
    : polyPath(dp.outlineCm);
  const piece: Piece = {
    id: dp.id,
    name: dp.name,
    qty: dp.qty,
    outline: translateOutline(outline, dxPx, dyPx),
    detailRows: dp.detailRows,
    label: { x: dxPx + 6, y: dyPx + PX(bbox(dp.outlineCm).h) - 6 },
  };
  piece.vertices = dp.outlineCm.map(([x, y]) => ({
    x: PX(x) + dxPx,
    y: PX(y) + dyPx,
  }));
  if (dp.guideCm)
    piece.guideOutline = translateOutline(polyPath(dp.guideCm), dxPx, dyPx);
  if (dp.grainlineCm) {
    const [[x1, y1], [x2, y2]] = dp.grainlineCm;
    piece.grainline = {
      x1: PX(x1) + dxPx,
      y1: PX(y1) + dyPx,
      x2: PX(x2) + dxPx,
      y2: PX(y2) + dyPx,
    };
  }
  if (dp.dartCm && dp.dartCm.length >= 3) {
    const dd = (polyPath(dp.dartCm) as { points: string }).points
      .split(" ")
      .map((p) => p.split(",").map(Number));
    const [a, b, c] = dd;
    // #87: open, not closed -- a dart is two legs meeting at a point, and
    // the trailing Z drew a fourth segment straight back along the base
    // that isn't part of the dart, mismatching the generic .dxf/svg/pdf
    // exports (now also fixed) against the AAMA exporter, which was always
    // open on layer 8.
    piece.dart = {
      d: `M${a[0] + dxPx} ${a[1] + dyPx} L${b[0] + dxPx} ${b[1] + dyPx} L${c[0] + dxPx} ${c[1] + dyPx}`,
    };
  }
  return piece;
}

export function autoLayout(
  drafted: DraftedPiece[],
  gapCm = 8,
): { pieces: Piece[]; viewBox: { w: number; h: number } } {
  const pad = PX(6);
  const gap = PX(gapCm);

  // bbox + px dimensions of each piece, preserving `drafted`'s original order.
  const items = drafted.map((dp) => {
    const b = bbox(dp.outlineCm);
    return { dp, b, w: PX(b.w), h: PX(b.h), ox: pad, oy: pad };
  });

  // Shelf packing (same technique as the export in lib/export/model.ts):
  // instead of a single horizontal row — which spread the pieces out and left
  // them small inside a wide, short viewBox — it wraps the pieces into rows
  // with a near-square target width. The bounding box ends up more compact, so
  // the canvas scales the pieces bigger. Sorts by height desc for tight
  // shelves; the output array's order follows `drafted`'s original order.
  const widest = items.reduce((m, it) => Math.max(m, it.w), 0);
  const totalArea = items.reduce((s, it) => s + it.w * it.h, 0);
  const targetW = Math.max(widest, Math.sqrt(totalArea * 1.4));

  const order = [...items].sort((a, b) => b.h - a.h);
  let cursorX = pad;
  let cursorY = pad;
  let rowH = 0;
  let sheetRight = pad;
  for (const it of order) {
    if (cursorX > pad && cursorX - pad + it.w > targetW) {
      cursorY += rowH + gap; // new shelf
      cursorX = pad;
      rowH = 0;
    }
    it.ox = cursorX;
    it.oy = cursorY;
    cursorX += it.w + gap;
    rowH = Math.max(rowH, it.h);
    sheetRight = Math.max(sheetRight, cursorX - gap);
  }

  const pieces: Piece[] = items.map((it) =>
    place(it.dp, it.ox - PX(it.b.minX), it.oy - PX(it.b.minY)),
  );

  return {
    pieces,
    viewBox: {
      w: Math.round(sheetRight + pad),
      h: Math.round(cursorY + rowH + pad),
    },
  };
}
