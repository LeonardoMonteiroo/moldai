import type { ExPt, ExportModel } from "./model";
import type { Translate } from "@/lib/i18n/translate";
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

export function planTiles(
  sheetWcm: number,
  sheetHcm: number,
  mode: PdfMode,
): TilePlan {
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

const PT_POR_CM = 72 / 2.54; // PDF points per cm (physical 1:1)
const TOL_CM = 0.02; // curve flattening (same tolerance as the DXF)

export async function toPdf(
  model: ExportModel,
  mode: PdfMode,
  t: Translate,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const plan = planTiles(model.sheetWidthCm, model.sheetHeightCm, mode);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const INK = rgb(0, 0, 0);
  const OLIVE = rgb(0.29, 0.35, 0.23);
  const GRAY = rgb(0.6, 0.6, 0.6);
  const NET = rgb(0.4, 0.4, 0.4); // #123: distinct from GRAY (the fold's own color)
  const TXT = rgb(0.35, 0.34, 0.29);

  // flatten each outline once (reused across every page/tile)
  const outlines = model.pieces.map((pc) => ({
    pc,
    cutPts: flattenOutlineCm(pc.cutOutline, TOL_CM),
    netPts: flattenOutlineCm(pc.outline, TOL_CM),
  }));

  plan.pages.forEach((tile, pageIndex) => {
    const page = doc.addPage([
      plan.pageWcm * PT_POR_CM,
      plan.pageHcm * PT_POR_CM,
    ]);

    // sheet coord (cm, +Y down) -> page point (pt, +Y up), translated by the tile's window
    const map = (sx: number, sy: number) => ({
      x: (plan.marginCm + sx - tile.originCm.x) * PT_POR_CM,
      y: (plan.pageHcm - plan.marginCm - (sy - tile.originCm.y)) * PT_POR_CM,
    });

    for (const { pc, cutPts, netPts } of outlines) {
      const P = (lx: number, ly: number) =>
        map(pc.originCm.x + lx, pc.originCm.y + ly);

      // #123: the cut line (with seam allowance) is the primary solid
      // boundary -- what the a4 tiling/glue overlap is measured against.
      for (let i = 0; i < cutPts.length; i++) {
        const a = P(cutPts[i].x, cutPts[i].y);
        const b = P(
          cutPts[(i + 1) % cutPts.length].x,
          cutPts[(i + 1) % cutPts.length].y,
        );
        page.drawLine({ start: a, end: b, thickness: 0.75, color: INK });
      }
      // the net stitch line, dashed in its own gray so it doesn't blend
      // into the fold's own GRAY dashing.
      for (let i = 0; i < netPts.length; i++) {
        const a = P(netPts[i].x, netPts[i].y);
        const b = P(
          netPts[(i + 1) % netPts.length].x,
          netPts[(i + 1) % netPts.length].y,
        );
        page.drawLine({
          start: a,
          end: b,
          thickness: 0.4,
          color: NET,
          dashArray: [3, 2],
        });
      }
      // grainline (dashed)
      if (pc.grainline) {
        const [g1, g2] = pc.grainline;
        page.drawLine({
          start: P(g1.x, g1.y),
          end: P(g2.x, g2.y),
          thickness: 0.5,
          color: OLIVE,
          dashArray: [4, 3],
        });
      }
      // #87/#122: open, not closed -- a dart is two legs meeting at a
      // point; wrapping the last leg back to the first drew a fourth
      // segment along the base that isn't part of the dart, matching
      // neither the AAMA exporter's own layer-8 open polyline nor
      // pattern-making convention. A fitted panel carries two darts,
      // symmetric about its own centre line.
      for (const dart of pc.darts ?? []) {
        if (dart.length < 3) continue;
        for (let i = 0; i < dart.length - 1; i++) {
          const a = P(dart[i].x, dart[i].y);
          const b = P(dart[i + 1].x, dart[i + 1].y);
          page.drawLine({ start: a, end: b, thickness: 0.5, color: OLIVE });
        }
      }
      // #124: one solid tick per notch, single/double/triple told apart
      // purely by how far it reaches (NOTCH_DEPTH_CM) -- matching the cut
      // line's own ink rather than a second visual channel.
      for (const notch of pc.notches ?? []) {
        page.drawLine({
          start: P(notch.outer.x, notch.outer.y),
          end: P(notch.inner.x, notch.inner.y),
          thickness: 0.75,
          color: INK,
        });
      }
      // #126: cut-on-fold line (dashed, distinct from the grainline's dash)
      // plus the pt-BR "dobra" label at its midpoint.
      if (pc.fold) {
        const [f1, f2] = pc.fold;
        const fa = P(f1.x, f1.y);
        const fb = P(f2.x, f2.y);
        page.drawLine({
          start: fa,
          end: fb,
          thickness: 0.5,
          color: GRAY,
          dashArray: [8, 2, 2, 2],
        });
        page.drawText(model.foldLabel, {
          x: (fa.x + fb.x) / 2,
          y: (fa.y + fb.y) / 2,
          size: 6,
          font,
          color: GRAY,
        });
      }
      // label
      const lbl = P(0, pc.heightCm);
      page.drawText(`${pc.name.toUpperCase()} · ${pc.qty}x`, {
        x: lbl.x,
        y: lbl.y,
        size: 8,
        font,
        color: TXT,
      });
    }

    if (mode === "a4") {
      // usable-area rectangle (cut/glue line)
      page.drawRectangle({
        x: plan.marginCm * PT_POR_CM,
        y: plan.marginCm * PT_POR_CM,
        width: (plan.pageWcm - 2 * plan.marginCm) * PT_POR_CM,
        height: (plan.pageHcm - 2 * plan.marginCm) * PT_POR_CM,
        borderColor: GRAY,
        borderWidth: 0.5,
        borderDashArray: [3, 2],
      });
      page.drawText(
        t("pdf.pageLabel", {
          rowNumber: tile.row + 1,
          colNumber: tile.col + 1,
          totalRows: plan.rows,
          totalCols: plan.cols,
        }),
        {
          x: plan.marginCm * PT_POR_CM,
          y: plan.marginCm * 0.3 * PT_POR_CM,
          size: 7,
          font,
          color: TXT,
        },
      );
    }

    // 10 cm calibration ruler — 1st page (a4) or the single page (single)
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
      page.drawLine({
        start: { x: baseXcm * PT_POR_CM, y: y0 },
        end: { x: (baseXcm + 10) * PT_POR_CM, y: y0 },
        thickness: 0.75,
        color: INK,
      });
      for (const t of rulerTicksCm(10)) {
        const x = (baseXcm + t) * PT_POR_CM;
        page.drawLine({
          start: { x, y: y0 },
          end: { x, y: y0 + 0.35 * PT_POR_CM },
          thickness: 0.75,
          color: INK,
        });
      }
      page.drawText(t("pdf.rulerLabel"), {
        x: baseXcm * PT_POR_CM,
        y: (boxYcm + 0.7) * PT_POR_CM,
        size: 7,
        font,
        color: TXT,
      });
    }
  });

  return await doc.save();
}
