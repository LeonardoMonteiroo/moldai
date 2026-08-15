import { DetailRow, Piece, PieceOutline } from "@/lib/types";

export const SCALE = 4; // px por cm
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
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function polyPath(ptsCm: Pt[]): PieceOutline {
  const points = ptsCm.map(([x, y]) => `${PX(x)},${PX(y)}`).join(" ");
  return { kind: "polygon", points };
}

// Desenha um contorno fechado: reta (L) em cada aresta, exceto nas arestas
// cobertas por um curvedSpan, onde emite Catmull-Rom->Bézier com as tangentes
// travadas nas bordas do span (não puxa para os pontos retos vizinhos).
export function outlinePath(ptsCm: Pt[], curvedSpans: [number, number][] = []): PieceOutline {
  const p = ptsCm.map(([x, y]) => [PX(x), PX(y)] as Pt);
  const n = p.length;
  if (n < 3) return polyPath(ptsCm);
  const at = (i: number) => p[(i + n) % n];
  const spanFor = (i: number) => curvedSpans.find(([a, b]) => i >= a && i + 1 <= b);
  let d = `M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)} `;
  for (let i = 0; i < n; i++) {
    const p1 = at(i), p2 = at(i + 1);
    const span = spanFor(i);
    if (!span) {
      d += `L${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
      continue;
    }
    const [a, b] = span;
    const p0 = i === a ? p1 : at(i - 1);
    const p3 = i + 1 === b ? p2 : at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
  }
  d += "Z";
  return { kind: "path", d: d.trim() };
}

function translateOutline(o: PieceOutline, dx: number, dy: number): PieceOutline {
  if (o.kind === "polygon") {
    const points = o.points.split(" ").map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return `${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`;
    }).join(" ");
    return { kind: "polygon", points };
  }
  // path: só temos comandos absolutos M/C/L/Z gerados aqui; transladamos números em pares após M/C/L.
  const d = o.d.replace(/([MCL])([^MCLZ]*)/g, (_, cmd, nums) => {
    const parts = nums.trim().split(/\s+/).map(Number);
    const shifted = parts.map((v: number, i: number) => (i % 2 === 0 ? v + dx : v + dy).toFixed(1));
    return `${cmd}${shifted.join(" ")} `;
  });
  return { kind: "path", d: d.trim() };
}

// Constrói a Piece final aplicando outline/guia/grainline/dart com deslocamento (dx,dy) em px.
function place(dp: DraftedPiece, dxPx: number, dyPx: number): Piece {
  const spans = dp.curvedSpans ?? [];
  const outline = spans.length ? outlinePath(dp.outlineCm, spans) : polyPath(dp.outlineCm);
  const piece: Piece = {
    id: dp.id,
    name: dp.name,
    qty: dp.qty,
    outline: translateOutline(outline, dxPx, dyPx),
    detailRows: dp.detailRows,
    label: { x: dxPx + 6, y: dyPx + PX(bbox(dp.outlineCm).h) - 6 },
  };
  if (dp.guideCm) piece.guideOutline = translateOutline(polyPath(dp.guideCm), dxPx, dyPx);
  if (dp.grainlineCm) {
    const [[x1, y1], [x2, y2]] = dp.grainlineCm;
    piece.grainline = { x1: PX(x1) + dxPx, y1: PX(y1) + dyPx, x2: PX(x2) + dxPx, y2: PX(y2) + dyPx };
  }
  if (dp.dartCm && dp.dartCm.length >= 3) {
    const dd = (polyPath(dp.dartCm) as { points: string }).points
      .split(" ").map((p) => p.split(",").map(Number));
    const [a, b, c] = dd;
    piece.dart = { d: `M${a[0] + dxPx} ${a[1] + dyPx} L${b[0] + dxPx} ${b[1] + dyPx} L${c[0] + dxPx} ${c[1] + dyPx} Z` };
  }
  return piece;
}

export function autoLayout(
  drafted: DraftedPiece[],
  gapCm = 8,
): { pieces: Piece[]; viewBox: { w: number; h: number } } {
  const pad = PX(6);
  const gap = PX(gapCm);
  let cursorX = pad;
  let maxH = 0;
  const pieces: Piece[] = [];
  for (const dp of drafted) {
    const b = bbox(dp.outlineCm);
    const dx = cursorX - PX(b.minX);
    const dy = pad - PX(b.minY);
    pieces.push(place(dp, dx, dy));
    cursorX += PX(b.w) + gap;
    maxH = Math.max(maxH, PX(b.h));
  }
  return { pieces, viewBox: { w: Math.round(cursorX - gap + pad), h: Math.round(maxH + pad * 2) } };
}
