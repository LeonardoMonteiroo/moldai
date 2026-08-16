import type { ExPt, ExportModel } from "./model";
import { flattenOutlineCm } from "./dxf";

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

const PT_POR_CM = 72 / 2.54; // pontos PDF por cm (1:1 físico)
const TOL_CM = 0.02; // achatamento de curvas (mesma tolerância do DXF)

export async function toPdf(model: ExportModel, mode: PdfMode): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const plan = planTiles(model.sheetWidthCm, model.sheetHeightCm, mode);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const INK = rgb(0, 0, 0);
  const OLIVE = rgb(0.29, 0.35, 0.23);
  const GRAY = rgb(0.6, 0.6, 0.6);
  const TXT = rgb(0.35, 0.34, 0.29);

  // achata cada contorno uma vez (reusado em todas as páginas/tiles)
  const outlines = model.pieces.map((pc) => ({ pc, pts: flattenOutlineCm(pc.outline, TOL_CM) }));

  plan.pages.forEach((tile, pageIndex) => {
    const page = doc.addPage([plan.pageWcm * PT_POR_CM, plan.pageHcm * PT_POR_CM]);

    // coord de sheet (cm, +Y p/ baixo) -> ponto de página (pt, +Y p/ cima), transladada pela janela do tile
    const map = (sx: number, sy: number) => ({
      x: (plan.marginCm + sx - tile.originCm.x) * PT_POR_CM,
      y: (plan.pageHcm - plan.marginCm - (sy - tile.originCm.y)) * PT_POR_CM,
    });

    for (const { pc, pts } of outlines) {
      const P = (lx: number, ly: number) => map(pc.originCm.x + lx, pc.originCm.y + ly);

      // contorno (polilinha fechada)
      for (let i = 0; i < pts.length; i++) {
        const a = P(pts[i].x, pts[i].y);
        const b = P(pts[(i + 1) % pts.length].x, pts[(i + 1) % pts.length].y);
        page.drawLine({ start: a, end: b, thickness: 0.75, color: INK });
      }
      // fio (tracejado)
      if (pc.grainline) {
        const [g1, g2] = pc.grainline;
        page.drawLine({ start: P(g1.x, g1.y), end: P(g2.x, g2.y), thickness: 0.5, color: OLIVE, dashArray: [4, 3] });
      }
      // dart (polilinha fechada)
      if (pc.dart && pc.dart.length >= 3) {
        for (let i = 0; i < pc.dart.length; i++) {
          const a = P(pc.dart[i].x, pc.dart[i].y);
          const b = P(pc.dart[(i + 1) % pc.dart.length].x, pc.dart[(i + 1) % pc.dart.length].y);
          page.drawLine({ start: a, end: b, thickness: 0.5, color: OLIVE });
        }
      }
      // rótulo
      const lbl = P(0, pc.heightCm);
      page.drawText(`${pc.name.toUpperCase()} · ${pc.qty}x`, { x: lbl.x, y: lbl.y, size: 8, font, color: TXT });
    }

    if (mode === "a4") {
      // retângulo da área útil (linha de corte/colagem)
      page.drawRectangle({
        x: plan.marginCm * PT_POR_CM,
        y: plan.marginCm * PT_POR_CM,
        width: (plan.pageWcm - 2 * plan.marginCm) * PT_POR_CM,
        height: (plan.pageHcm - 2 * plan.marginCm) * PT_POR_CM,
        borderColor: GRAY,
        borderWidth: 0.5,
        borderDashArray: [3, 2],
      });
      page.drawText(`Linha ${tile.row + 1} · Coluna ${tile.col + 1} de ${plan.rows}x${plan.cols}`, {
        x: plan.marginCm * PT_POR_CM,
        y: plan.marginCm * 0.3 * PT_POR_CM,
        size: 7,
        font,
        color: TXT,
      });
    }

    // régua de calibração de 10 cm — 1ª página (a4) ou a página única (single)
    if (pageIndex === 0) {
      const baseXcm = plan.marginCm + 0.3;
      const boxYcm = plan.pageHcm - plan.marginCm - 1.2;
      page.drawRectangle({
        x: (baseXcm - 0.2) * PT_POR_CM,
        y: boxYcm * PT_POR_CM,
        width: 10.6 * PT_POR_CM,
        height: 1.1 * PT_POR_CM,
        color: rgb(1, 1, 1),
        opacity: 0.85,
      });
      const y0 = (boxYcm + 0.2) * PT_POR_CM;
      page.drawLine({ start: { x: baseXcm * PT_POR_CM, y: y0 }, end: { x: (baseXcm + 10) * PT_POR_CM, y: y0 }, thickness: 0.75, color: INK });
      for (const t of rulerTicksCm(10)) {
        const x = (baseXcm + t) * PT_POR_CM;
        page.drawLine({ start: { x, y: y0 }, end: { x, y: y0 + 0.35 * PT_POR_CM }, thickness: 0.75, color: INK });
      }
      page.drawText("10 cm - confira a escala", { x: baseXcm * PT_POR_CM, y: (boxYcm + 0.7) * PT_POR_CM, size: 7, font, color: TXT });
    }
  });

  return await doc.save();
}
