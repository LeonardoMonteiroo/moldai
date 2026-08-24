import { DetailRow, NotchType, Piece, PieceOutline } from "@/lib/types";

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
  // #122: one entry per dart, each an open point list (>=3 points, first
  // point repeated at the end for a double-ended/fisheye dart so it reads as
  // closed without a synthetic straight-line base). Two mirrored darts on a
  // fitted front/back panel, never a single one on the centre line.
  dartsCm?: Pt[][];
  // #126: the two `outlineCm` indices bounding this piece's cut-on-fold line
  // (its own axis of symmetry) -- both indices must already exist in
  // outlineCm (additive metadata; drafters that need a fold endpoint with no
  // existing vertex there insert one exactly on a straight edge it already
  // walks, so the outline's rendered shape is unchanged).
  foldEdge?: [number, number];
  // #124: derived, never persisted -- see NotchCm below.
  notches?: NotchCm[];
  detailRows: DetailRow[];
  armholeLenCm?: number;
}

// #124: depth is the only thing that tells the three NotchTypes apart --
// see lib/types.ts's PieceNotch doc for why that's also the AC's own
// "printable size" (3mm/6mm), not a separate number to keep in sync.
export const NOTCH_DEPTH_CM: Record<NotchType, number> = {
  single: 0.3,
  double: 0.6,
  triple: 0.9,
};

// A notch, in the drafter's own cm space -- outerCm on the net outline,
// innerCm nudged inward by NOTCH_DEPTH_CM[type]. core.ts's place() turns
// this into a Piece's PieceNotch (px, translated into the packed layout).
export interface NotchCm {
  type: NotchType;
  outerCm: Pt;
  innerCm: Pt;
}

// A notch tick at `point`, oriented perpendicular to `tangent` and biased
// toward `insideRef` -- a point the caller knows lies inside the piece --
// so the tick always points into the fabric regardless of which winding
// direction that particular outline happens to walk (drafters mix clockwise
// and counter-clockwise; see lib/export/offset.ts's own self-calibration
// for the same underlying problem on a whole outline rather than one point).
export function notchAt(
  point: Pt,
  tangent: Pt,
  insideRef: Pt,
  type: NotchType,
): NotchCm {
  const len = Math.hypot(tangent[0], tangent[1]) || 1;
  let nx = -tangent[1] / len;
  let ny = tangent[0] / len;
  const dx = insideRef[0] - point[0];
  const dy = insideRef[1] - point[1];
  if (nx * dx + ny * dy < 0) {
    nx = -nx;
    ny = -ny;
  }
  const depth = NOTCH_DEPTH_CM[type];
  return {
    type,
    outerCm: point,
    innerCm: [point[0] + nx * depth, point[1] + ny * depth],
  };
}

// A notch exactly at outline vertex `idx`, whose tangent is approximated
// from its immediate neighbours -- exact when `idx` is (as #126's foldEdge
// vertices already are) a midpoint inserted on a straight edge, since the
// neighbours are then collinear with it, and a good approximation at a
// smooth symmetric peak (a sleeve cap apex), where the true curve tangent
// is horizontal by symmetry and so is next-minus-prev.
export function notchAtVertex(
  ptsCm: Pt[],
  idx: number,
  insideRef: Pt,
  type: NotchType,
): NotchCm {
  const n = ptsCm.length;
  const prev = ptsCm[(idx - 1 + n) % n];
  const next = ptsCm[(idx + 1) % n];
  return notchAt(
    ptsCm[idx],
    [next[0] - prev[0], next[1] - prev[1]],
    insideRef,
    type,
  );
}

// Point + local tangent walking `distCm` from vertex `from` toward `to`
// (`from < to`, following outline order), along the same Catmull-Rom/Bézier
// geometry curveArcLengthCm measures -- so a notch placed here on one piece
// and another placed at the same distCm on a mated piece land at truly
// corresponding positions, "generated as pairs from the same computation"
// (#124). distCm is clamped to the segment's own arc length in both
// directions (never lands before `from` or past `to`).
export function pointAndTangentAtCm(
  ptsCm: Pt[],
  curvedSpans: [number, number][],
  from: number,
  to: number,
  distCm: number,
): { point: Pt; tangent: Pt } {
  const n = ptsCm.length;
  const at = (i: number) => ptsCm[(i + n) % n];
  const spanFor = (i: number) =>
    curvedSpans.find(([a, b]) => i >= a && i + 1 <= b);
  const samplesPerEdge = 32;
  let remaining = Math.max(0, distCm);
  for (let i = from; i < to; i++) {
    const p1 = at(i);
    const p2 = at(i + 1);
    const span = spanFor(i);
    const isLastEdge = i === to - 1;
    if (!span) {
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      if (remaining <= segLen || isLastEdge) {
        const u = segLen === 0 ? 0 : Math.min(1, remaining / segLen);
        return {
          point: [p1[0] + (p2[0] - p1[0]) * u, p1[1] + (p2[1] - p1[1]) * u],
          tangent: [p2[0] - p1[0], p2[1] - p1[1]],
        };
      }
      remaining -= segLen;
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
      const segLen = Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
      if (remaining <= segLen || (isLastEdge && s === samplesPerEdge)) {
        const u = segLen === 0 ? 0 : Math.min(1, remaining / segLen);
        return {
          point: [
            prev[0] + (pt[0] - prev[0]) * u,
            prev[1] + (pt[1] - prev[1]) * u,
          ],
          tangent: [pt[0] - prev[0], pt[1] - prev[1]],
        };
      }
      remaining -= segLen;
      prev = pt;
    }
  }
  // from === to: nothing to walk -- land exactly on `from`.
  const p1 = at(from);
  const p2 = at(from + 1);
  return { point: p1, tangent: [p2[0] - p1[0], p2[1] - p1[1]] };
}

// notchAt + pointAndTangentAtCm combined -- the common case a drafter
// actually calls.
export function notchAtArcLengthCm(
  ptsCm: Pt[],
  curvedSpans: [number, number][],
  from: number,
  to: number,
  distCm: number,
  insideRef: Pt,
  type: NotchType,
): NotchCm {
  const { point, tangent } = pointAndTangentAtCm(
    ptsCm,
    curvedSpans,
    from,
    to,
    distCm,
  );
  return notchAt(point, tangent, insideRef, type);
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

export function translateOutline(
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
  if (dp.foldEdge) piece.foldEdge = dp.foldEdge;
  if (dp.notches?.length) {
    piece.notches = dp.notches.map((n) => ({
      type: n.type,
      x1: PX(n.outerCm[0]) + dxPx,
      y1: PX(n.outerCm[1]) + dyPx,
      x2: PX(n.innerCm[0]) + dxPx,
      y2: PX(n.innerCm[1]) + dyPx,
    }));
  }
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
  const darts = (dp.dartsCm ?? []).filter((pts) => pts.length >= 3);
  if (darts.length) {
    // #87: open, not closed -- a dart is two legs meeting at a point, and a
    // trailing Z would draw a segment straight back along the base that
    // isn't part of the dart. A double-ended (fisheye) dart repeats its
    // first point at the end of its own list instead, so it reads as closed
    // without that synthetic base line.
    piece.darts = darts.map((pts) => ({
      d: pts
        .map(
          ([x, y], i) =>
            `${i === 0 ? "M" : "L"}${PX(x) + dxPx} ${PX(y) + dyPx}`,
        )
        .join(" "),
    }));
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
