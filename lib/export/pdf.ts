import type { ExPt } from "./model";

export type PdfMode = "a4" | "single";

const A4 = { pageWcm: 21, pageHcm: 29.7, marginCm: 0.8 };
const OVERLAP_A4_CM = 1;

export interface TilePlan {
  pageWcm: number;
  pageHcm: number;
  marginCm: number;
  overlapCm: number;
  cols: number;
  rows: number;
  pages: { row: number; col: number; originCm: ExPt }[];
}

export function planTiles(sheetWcm: number, sheetHcm: number, mode: PdfMode): TilePlan {
  if (mode === "single") {
    const marginCm = A4.marginCm;
    return {
      pageWcm: sheetWcm + 2 * marginCm,
      pageHcm: sheetHcm + 2 * marginCm,
      marginCm,
      overlapCm: 0,
      cols: 1,
      rows: 1,
      pages: [{ row: 0, col: 0, originCm: { x: 0, y: 0 } }],
    };
  }
  const { pageWcm, pageHcm, marginCm } = A4;
  const overlapCm = OVERLAP_A4_CM;
  const stepW = pageWcm - 2 * marginCm - overlapCm;
  const stepH = pageHcm - 2 * marginCm - overlapCm;
  const cols = Math.max(1, Math.ceil((sheetWcm - overlapCm) / stepW));
  const rows = Math.max(1, Math.ceil((sheetHcm - overlapCm) / stepH));
  const pages: { row: number; col: number; originCm: ExPt }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      pages.push({ row, col, originCm: { x: col * stepW, y: row * stepH } });
    }
  }
  return { pageWcm, pageHcm, marginCm, overlapCm, cols, rows, pages };
}

export function rulerTicksCm(lengthCm: number): number[] {
  const ticks: number[] = [];
  for (let i = 0; i <= Math.round(lengthCm); i++) ticks.push(i);
  return ticks;
}
