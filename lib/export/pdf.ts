import type { ExPt, ExportModel, ExportPiece } from "./model";
import type { Translate } from "@/lib/i18n/translate";
import { flattenOutlineCm } from "./dxf";
import { estimateTextWidth } from "@/lib/canvas/pieceLabel";

export type PdfMode = "a4" | "single";

const A4 = { pageWcm: 21, pageHcm: 29.7, marginCm: 0.8 };
const OVERLAP_A4_CM = 1;
const PT_POR_CM = 72 / 2.54; // PDF points per cm (physical 1:1)
// Font sizes of the two text draws in toPdf below -- kept alongside
// pieceBBoxesCm so its label-extent estimate can't drift from what's
// actually rendered.
const LABEL_SIZE_PT = 8;
const FOLD_LABEL_SIZE_PT = 6;

export interface CmRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TilePlan {
  pageWcm: number;
  pageHcm: number;
  marginCm: number;
  overlapCm: number;
  // #84: a tile's own printable window (pageWcm/pageHcm minus the margin on
  // both sides) -- computed once here so planTiles' own page-level filter
  // and toPdf's per-piece draw skip can't answer "is this tile usable"
  // differently from one another.
  usableWcm: number;
  usableHcm: number;
  cols: number;
  rows: number;
  pages: { row: number; col: number; pageNumber: number; originCm: ExPt }[];
}

// #120: each piece's printed extent in absolute sheet cm -- cutOutline's own
// local points (shifted by the piece's own originCm) cover the cut line and,
// by construction, everything cutOutline always encloses (outline,
// grainline, darts, notches, fold -- see garment.test.ts's own containment
// suite plus the #124/#126 placement conventions). The two text draws in
// toPdf below are the exception: the piece-name/qty label and the fold
// label have no geometry of their own in cutOutline, and with a 0cm seam
// allowance (STYLE_LIMITS.seamAllowanceCm.min) a narrow piece's cutOutline
// is flush with its outline, leaving no slack for a label's rendered width
// to fall within. Grown here from the same estimateTextWidth fitPieceLabel
// already uses for the identical shrink-to-fit problem on the canvas, so a
// tile a label actually reaches into is never dropped as "blank".
export function pieceBBoxesCm(
  pieces: ExportPiece[],
  foldLabel: string,
): CmRect[] {
  return pieces.map((pc) => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const grow = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };

    for (const p of [
      pc.cutOutline.start,
      ...pc.cutOutline.segs.map((s) => s.to),
    ]) {
      grow(pc.originCm.x + p.x, pc.originCm.y + p.y);
    }

    // piece-name label: drawn at local (0, heightCm), baseline-left,
    // extending right by its rendered width and padded symmetrically
    // above/below the baseline to cover ascenders/descenders.
    const labelText = `${pc.name.toUpperCase()} · ${pc.qty}x`;
    const labelWCm = estimateTextWidth(labelText, LABEL_SIZE_PT) / PT_POR_CM;
    const labelHCm = LABEL_SIZE_PT / PT_POR_CM;
    grow(pc.originCm.x, pc.originCm.y + pc.heightCm - labelHCm);
    grow(pc.originCm.x + labelWCm, pc.originCm.y + pc.heightCm + labelHCm);

    // fold label: drawn baseline-left at the fold's own midpoint.
    if (pc.fold) {
      const [f1, f2] = pc.fold;
      const midXCm = pc.originCm.x + (f1.x + f2.x) / 2;
      const midYCm = pc.originCm.y + (f1.y + f2.y) / 2;
      const foldWCm =
        estimateTextWidth(foldLabel, FOLD_LABEL_SIZE_PT) / PT_POR_CM;
      const foldHCm = FOLD_LABEL_SIZE_PT / PT_POR_CM;
      grow(midXCm, midYCm - foldHCm);
      grow(midXCm + foldWCm, midYCm + foldHCm);
    }

    return { minX, minY, maxX, maxY };
  });
}

// #84: shared by planTiles' page-level filter (#120) and toPdf's per-piece
// draw skip -- both ask the identical question ("does this piece's absolute
// sheet-cm bbox reach into this tile's printable window?"), just at
// different granularities (which pages to emit vs. which pieces to draw on
// an emitted page).
function tileIntersectsBBox(
  originCm: ExPt,
  usableWcm: number,
  usableHcm: number,
  b: CmRect,
): boolean {
  const tx1 = originCm.x + usableWcm;
  const ty1 = originCm.y + usableHcm;
  return (
    b.minX <= tx1 &&
    b.maxX >= originCm.x &&
    b.minY <= ty1 &&
    b.maxY >= originCm.y
  );
}

export function planTiles(
  sheetWcm: number,
  sheetHcm: number,
  mode: PdfMode,
  // #120: a tile is only emitted if its printed rectangle intersects at
  // least one piece -- `autoLayout`'s shelf-packing leaves real gaps, so the
  // naive rows x cols grid tiled several blank sheets. Required (not
  // optional) so every call site has to make an explicit choice: pass
  // `null` to keep the unfiltered grid (the two grid-shape unit tests
  // below, which exercise the layout math on its own) rather than silently
  // getting that behavior by forgetting the argument.
  pieceBBoxes: CmRect[] | null,
): TilePlan {
  if (mode === "single") {
    const marginCm = A4.marginCm;
    return {
      pageWcm: sheetWcm + 2 * marginCm,
      pageHcm: sheetHcm + 2 * marginCm,
      marginCm,
      overlapCm: 0,
      usableWcm: sheetWcm,
      usableHcm: sheetHcm,
      cols: 1,
      rows: 1,
      pages: [{ row: 0, col: 0, pageNumber: 1, originCm: { x: 0, y: 0 } }],
    };
  }
  const { pageWcm, pageHcm, marginCm } = A4;
  const overlapCm = OVERLAP_A4_CM;
  const stepW = pageWcm - 2 * marginCm - overlapCm;
  const stepH = pageHcm - 2 * marginCm - overlapCm;
  const usableWcm = pageWcm - 2 * marginCm;
  const usableHcm = pageHcm - 2 * marginCm;
  const cols = Math.max(1, Math.ceil((sheetWcm - overlapCm) / stepW));
  const rows = Math.max(1, Math.ceil((sheetHcm - overlapCm) / stepH));

  const hasGeometry = (originCm: ExPt) => {
    if (!pieceBBoxes) return true;
    return pieceBBoxes.some((b) =>
      tileIntersectsBBox(originCm, usableWcm, usableHcm, b),
    );
  };

  const pages: TilePlan["pages"] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const originCm = { x: col * stepW, y: row * stepH };
      if (!hasGeometry(originCm)) continue;
      pages.push({ row, col, pageNumber: pages.length + 1, originCm });
    }
  }
  return {
    pageWcm,
    pageHcm,
    marginCm,
    overlapCm,
    usableWcm,
    usableHcm,
    cols,
    rows,
    pages,
  };
}

export function rulerTicksCm(lengthCm: number): number[] {
  const ticks: number[] = [];
  for (let i = 0; i <= Math.round(lengthCm); i++) ticks.push(i);
  return ticks;
}

const TOL_CM = 0.02; // curve flattening (same tolerance as the DXF)

export async function toPdf(
  model: ExportModel,
  mode: PdfMode,
  t: Translate,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const bboxes = pieceBBoxesCm(model.pieces, model.foldLabel);
  const plan = planTiles(model.sheetWidthCm, model.sheetHeightCm, mode, bboxes);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const INK = rgb(0, 0, 0);
  const OLIVE = rgb(0.29, 0.35, 0.23);
  const GRAY = rgb(0.6, 0.6, 0.6);
  const NET = rgb(0.4, 0.4, 0.4); // #123: distinct from GRAY (the fold's own color)
  const TXT = rgb(0.35, 0.34, 0.29);

  // flatten each outline once (reused across every page/tile), paired with
  // the same per-piece bbox planTiles already computed above -- #84: reused
  // per page below so a piece whose bbox can't reach a given tile is never
  // drawn on it, instead of relying on the page's own bounds to discard it.
  const outlines = model.pieces.map((pc, i) => ({
    pc,
    bbox: bboxes[i],
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

    for (const { pc, bbox, cutPts, netPts } of outlines) {
      // #84: this tile's printable window can't reach the piece's own
      // absolute bbox -- nothing of it (outline, grainline, dart, notch,
      // fold, or either label) can land on this page, so skip the piece
      // entirely rather than emitting geometry the page bounds would have
      // discarded anyway.
      if (
        !tileIntersectsBBox(tile.originCm, plan.usableWcm, plan.usableHcm, bbox)
      ) {
        continue;
      }

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
          size: FOLD_LABEL_SIZE_PT,
          font,
          color: GRAY,
        });
      }
      // label
      const lbl = P(0, pc.heightCm);
      page.drawText(`${pc.name.toUpperCase()} · ${pc.qty}x`, {
        x: lbl.x,
        y: lbl.y,
        size: LABEL_SIZE_PT,
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
          pageNumber: tile.pageNumber,
          totalPages: plan.pages.length,
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
      for (const tick of rulerTicksCm(10)) {
        const x = (baseXcm + tick) * PT_POR_CM;
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
