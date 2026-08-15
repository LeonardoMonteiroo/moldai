import { PieceDetails, PieceOutline, PieceParams } from "./types";

export interface ParamSpec {
  name: string;
  label: string;
  unit: "px";
  min: number;
  max: number;
}

// All params are DELTAS from the base shape, in SVG pixels. Default 0 => base shape.
export const PIECE_PARAM_SCHEMA: Record<string, ParamSpec[]> = {
  frente: [
    { name: "length", label: "comprimento (barra para baixo)", unit: "px", min: -120, max: 160 },
    { name: "hemWidth", label: "largura da barra", unit: "px", min: -40, max: 90 },
    { name: "shoulderWidth", label: "largura do ombro", unit: "px", min: -30, max: 50 },
    { name: "caseDepth", label: "profundidade da cava", unit: "px", min: -40, max: 70 },
    { name: "necklineDepth", label: "profundidade do decote em V", unit: "px", min: 0, max: 90 },
    { name: "dartSize", label: "tamanho da pence", unit: "px", min: -10, max: 30 },
    { name: "seamAllowance", label: "folga de costura", unit: "px", min: -3, max: 20 },
  ],
  costas: [
    { name: "length", label: "comprimento (barra para baixo)", unit: "px", min: -120, max: 160 },
    { name: "hemWidth", label: "largura da barra", unit: "px", min: -40, max: 90 },
    { name: "shoulderWidth", label: "largura do ombro", unit: "px", min: -30, max: 50 },
    { name: "caseDepth", label: "profundidade da cava", unit: "px", min: -40, max: 70 },
    { name: "seamAllowance", label: "folga de costura", unit: "px", min: -3, max: 20 },
  ],
  manga: [
    { name: "sleeveLength", label: "comprimento da manga", unit: "px", min: -80, max: 260 },
    { name: "sleeveWidth", label: "largura da manga", unit: "px", min: -40, max: 80 },
    { name: "caseDepth", label: "profundidade da copa/cava", unit: "px", min: -40, max: 70 },
    { name: "seamAllowance", label: "folga de costura", unit: "px", min: -3, max: 20 },
  ],
};

export function defaultParams(pieceId: string): PieceParams {
  const specs = PIECE_PARAM_SCHEMA[pieceId] ?? [];
  const p: PieceParams = {};
  for (const s of specs) p[s.name] = 0;
  return p;
}

export function clampParams(pieceId: string, params: PieceParams): PieceParams {
  const specs = PIECE_PARAM_SCHEMA[pieceId] ?? [];
  const out = defaultParams(pieceId);
  for (const s of specs) {
    const v = params[s.name];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[s.name] = Math.min(s.max, Math.max(s.min, v));
    }
  }
  return out;
}

export interface ComputedGeometry {
  outline: PieceOutline;
  guideOutline?: PieceOutline;
  grainline?: { x1: number; y1: number; x2: number; y2: number };
  dart?: { d: string };
  label: { x: number; y: number };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function poly(points: number[][]): PieceOutline {
  return {
    kind: "polygon",
    points: points.map(([x, y]) => `${round(x)},${round(y)}`).join(" "),
  };
}

function frenteGeometry(p: PieceParams): ComputedGeometry {
  const cx = 110;
  const shoulderL = [55 - p.shoulderWidth, 30];
  const shoulderR = [165 + p.shoulderWidth, 30];
  const waistR = [182, 180 + p.caseDepth];
  const hemR = [150 + p.hemWidth, 350 + p.length];
  const hemL = [48 - p.hemWidth, 350 + p.length];
  const waistL = [34, 180 + p.caseDepth];

  const top: number[][] = [shoulderL];
  if (p.necklineDepth > 0) {
    top.push([cx - 22, 30], [cx, 30 + p.necklineDepth], [cx + 22, 30]);
  }
  top.push(shoulderR);

  const outline = poly([...top, waistR, hemR, hemL, waistL]);
  const guideOutline = poly([
    [46 - p.shoulderWidth, 22],
    [174 + p.shoulderWidth, 22],
    [191, 182 + p.caseDepth],
    [158 + p.hemWidth, 360 + p.length],
    [39 - p.hemWidth, 360 + p.length],
    [24, 182 + p.caseDepth],
  ]);
  const grainline = { x1: 105, y1: 34, x2: 97, y2: 346 + p.length };
  const halfDart = 18 + p.dartSize;
  const dart = { d: `M110 30 L${round(110 + halfDart)} 96 L${round(110 - halfDart)} 96 Z` };
  const label = { x: 55, y: 368 + p.length };
  return { outline, guideOutline, grainline, dart, label };
}

function costasGeometry(p: PieceParams): ComputedGeometry {
  const shoulderL = [215 - p.shoulderWidth, 30];
  const shoulderR = [325 + p.shoulderWidth, 30];
  const waistR = [342, 180 + p.caseDepth];
  const hemR = [310 + p.hemWidth, 350 + p.length];
  const hemL = [208 - p.hemWidth, 350 + p.length];
  const waistL = [194, 180 + p.caseDepth];

  const outline = poly([shoulderL, shoulderR, waistR, hemR, hemL, waistL]);
  const guideOutline = poly([
    [206 - p.shoulderWidth, 22],
    [334 + p.shoulderWidth, 22],
    [351, 182 + p.caseDepth],
    [318 + p.hemWidth, 360 + p.length],
    [199 - p.hemWidth, 360 + p.length],
    [184, 182 + p.caseDepth],
  ]);
  const grainline = { x1: 265, y1: 34, x2: 257, y2: 346 + p.length };
  const label = { x: 215, y: 368 + p.length };
  return { outline, guideOutline, grainline, label };
}

function mangaGeometry(p: PieceParams): ComputedGeometry {
  const capW = 82;
  const capH = 72 + p.caseDepth;
  const sideDrop = 186 + p.sleeveLength;
  const hemW = 108 + p.sleeveWidth;

  const A = [395, 42];
  const B = [A[0] + capW, A[1] + capH];
  const C = [B[0] - 18, B[1] + sideDrop];
  const D = [C[0] - hemW, C[1]];
  const E = [D[0] - 18, D[1] - sideDrop];

  const d =
    `M${round(A[0])} ${round(A[1])} ` +
    `Q${round(A[0] + 72)} ${round(A[1] + 12)} ${round(B[0])} ${round(B[1])} ` +
    `L${round(C[0])} ${round(C[1])} ` +
    `L${round(D[0])} ${round(D[1])} ` +
    `L${round(E[0])} ${round(E[1])} ` +
    `Q${round(E[0] + 12)} ${round(E[1] - (capH - 12))} ${round(A[0])} ${round(A[1])} Z`;

  const label = { x: 368, y: 368 + p.sleeveLength };
  return { outline: { kind: "path", d }, label };
}

export function computeGeometry(pieceId: string, raw: PieceParams): ComputedGeometry {
  const p = clampParams(pieceId, raw);
  if (pieceId === "frente") return frenteGeometry(p);
  if (pieceId === "costas") return costasGeometry(p);
  if (pieceId === "manga") return mangaGeometry(p);
  throw new Error(`Unknown piece: ${pieceId}`);
}

const PX_PER_CM = 5;
const cm = (v: number) => v.toFixed(1).replace(".", ",");
const meters = (v: number) => v.toFixed(2).replace(".", ",");

export function deriveDetails(pieceId: string, raw: PieceParams): PieceDetails {
  const p = clampParams(pieceId, raw);
  if (pieceId === "frente") {
    return {
      folgaCostura: `${cm(1.0 + p.seamAllowance / PX_PER_CM)} cm`,
      penceBusto: `${cm(2.5 + p.dartSize / PX_PER_CM)} cm`,
      cava: `${cm(21.4 + p.caseDepth / PX_PER_CM)} cm`,
      fio: "reto",
      consumo: `${meters(1.85 + Math.max(0, p.length) * 0.004 + Math.max(0, p.hemWidth) * 0.002)} m`,
    };
  }
  if (pieceId === "costas") {
    return {
      folgaCostura: `${cm(1.0 + p.seamAllowance / PX_PER_CM)} cm`,
      penceBusto: "—",
      cava: `${cm(20.1 + p.caseDepth / PX_PER_CM)} cm`,
      fio: "reto",
      consumo: `${meters(1.6 + Math.max(0, p.length) * 0.004 + Math.max(0, p.hemWidth) * 0.002)} m`,
    };
  }
  if (pieceId === "manga") {
    return {
      folgaCostura: `${cm(1.0 + p.seamAllowance / PX_PER_CM)} cm`,
      penceBusto: "—",
      cava: `${cm(19.6 + p.caseDepth / PX_PER_CM)} cm`,
      fio: "reto",
      consumo: `${meters(0.45 + Math.max(0, p.sleeveLength) * 0.004 + Math.max(0, p.sleeveWidth) * 0.002)} m`,
    };
  }
  throw new Error(`Unknown piece: ${pieceId}`);
}
