import type { ExPt, ExportModel, ExportPiece } from "./model";
import type { Translate } from "@/lib/i18n/translate";
import { flattenOutlineCm } from "./dxf";
import { estimateTextWidth } from "@/lib/canvas/pieceLabel";
import { planRollStrips, STRIP_OVERLAP_CM } from "./strips";

// #136: "a4" here means the *tiled* mode (the original name, kept for
// backward compatibility with every existing call site/test that already
// passes the literal string) -- which named page format it tiles onto is
// now a separate `pageSize` option (below), not implied by this value.
// "roll" is the new copyshop/plotter mode: a single continuous strip per
// column, split at `rollWidthCm` when the pattern is wider than the roll
// (shared math with the PLT writer's own strip splitting, lib/export/strips.ts).
export type PdfMode = "a4" | "single" | "roll";

// #136: the tiled mode's page format -- A4 (unchanged default), A0 (the
// copyshop plotter format), and Letter (US paper, ~nothing extra to support
// once the size is a parameter). Each has its own margin: A0's is widened a
// little for handling/binding at that size, matching common printshop
// convention; Letter keeps A4's.
export type PdfPageSize = "a4" | "a0" | "letter";

export const PDF_PAGE_SIZES: Record<
  PdfPageSize,
  { pageWcm: number; pageHcm: number; marginCm: number }
> = {
  a4: { pageWcm: 21, pageHcm: 29.7, marginCm: 0.8 },
  a0: { pageWcm: 84.1, pageHcm: 118.9, marginCm: 1.5 },
  letter: { pageWcm: 21.59, pageHcm: 27.94, marginCm: 0.8 },
};

// "single" mode (no tiling) has always used A4's own margin regardless of
// the tiled pageSize choice -- kept exactly as before so every existing
// pdf-single caller/test is unaffected by pageSize being introduced.
const SINGLE_MARGIN_CM = PDF_PAGE_SIZES.a4.marginCm;
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
// grainline, darts, notches, fold, and #127's own dart fold lines/drill
// holes -- see garment.test.ts's own containment suite plus the #124/#126
// placement conventions). The two text draws in
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

export interface PlanTilesOptions {
  // #136: which named page format the tiled ("a4") mode tiles onto.
  // Defaults to "a4", preserving every pre-existing call's behavior.
  pageSize?: PdfPageSize;
  // #135/#136: the roll's physical width, only used in "roll" mode. When
  // omitted (or when the sheet already fits), "roll" degenerates to a
  // single full-length strip.
  rollWidthCm?: number;
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
  opts: PlanTilesOptions = {},
): TilePlan {
  if (mode === "single") {
    const marginCm = SINGLE_MARGIN_CM;
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

  // #135/#136: the copyshop/plotter roll mode -- a single row of numbered
  // strips, each up to `rollWidthCm` wide and the sheet's FULL height (roll
  // length is unconstrained, unlike the tiled mode's page height), overlapping
  // by STRIP_OVERLAP_CM so neighbouring strips can be taped/aligned in
  // register. Shares its splitting math with the PLT writer
  // (lib/export/strips.ts) so the two formats report the same strip count
  // for the same roll width.
  if (mode === "roll") {
    const marginCm = SINGLE_MARGIN_CM;
    const rollWidthCm =
      opts.rollWidthCm && opts.rollWidthCm > 0 ? opts.rollWidthCm : sheetWcm;
    const usableWcm = Math.max(1, rollWidthCm - 2 * marginCm);
    const usableHcm = sheetHcm;
    const { strips } = planRollStrips(sheetWcm, usableWcm, STRIP_OVERLAP_CM);

    const hasGeometry = (originCm: ExPt) => {
      if (!pieceBBoxes) return true;
      return pieceBBoxes.some((b) =>
        tileIntersectsBBox(originCm, usableWcm, usableHcm, b),
      );
    };

    const pages: TilePlan["pages"] = [];
    for (const strip of strips) {
      const originCm = { x: strip.originCm.x, y: 0 };
      if (!hasGeometry(originCm)) continue;
      pages.push({
        row: 0,
        col: strip.stripNumber - 1,
        pageNumber: pages.length + 1,
        originCm,
      });
    }
    return {
      pageWcm: rollWidthCm,
      pageHcm: sheetHcm + 2 * marginCm,
      marginCm,
      overlapCm: STRIP_OVERLAP_CM,
      usableWcm,
      usableHcm,
      cols: strips.length,
      rows: 1,
      pages,
    };
  }

  const { pageWcm, pageHcm, marginCm } = PDF_PAGE_SIZES[opts.pageSize ?? "a4"];
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
  opts: PlanTilesOptions = {},
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const bboxes = pieceBBoxesCm(model.pieces, model.foldLabel);
  const plan = planTiles(
    model.sheetWidthCm,
    model.sheetHeightCm,
    mode,
    bboxes,
    opts,
  );
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
      // #127: the dart's own fold line -- thin dotted olive, distinct from
      // the dart's own solid legs above and from the piece's cut-on-fold
      // axis below (pc.fold, a different concept, its own dashed gray).
      for (const [fa1, fa2] of pc.internalFoldLines ?? []) {
        page.drawLine({
          start: P(fa1.x, fa1.y),
          end: P(fa2.x, fa2.y),
          thickness: 0.25,
          color: OLIVE,
          dashArray: [1, 1.5],
        });
      }
      // #127: a drill hole -- a small open circle, 1.0-1.5cm short of the
      // dart apex it marks.
      for (const hole of pc.drillHoles ?? []) {
        const c = P(hole.at.x, hole.at.y);
        page.drawCircle({
          x: c.x,
          y: c.y,
          size: hole.rCm * PT_POR_CM,
          borderColor: INK,
          borderWidth: 0.5,
        });
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

    if (mode === "a4" || (mode === "roll" && plan.pages.length > 1)) {
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
      // #136: "roll" is one row of numbered strips (no vertical tiling, the
      // roll's length is unconstrained) -- its own label key rather than
      // reusing pdf.pageLabel's row/col phrasing, which describes a grid
      // this mode doesn't have. Only drawn once the sheet actually needed
      // splitting (pages.length > 1); a single-strip roll export stays as
      // unmarked as a plain "single" sheet always has been.
      const labelKey = mode === "roll" ? "pdf.stripLabel" : "pdf.pageLabel";
      const labelValues: Record<string, string | number> =
        mode === "roll"
          ? { stripNumber: tile.pageNumber, totalStrips: plan.pages.length }
          : {
              pageNumber: tile.pageNumber,
              totalPages: plan.pages.length,
              rowNumber: tile.row + 1,
              colNumber: tile.col + 1,
              totalRows: plan.rows,
              totalCols: plan.cols,
            };
      page.drawText(t(labelKey, labelValues), {
        x: plan.marginCm * PT_POR_CM,
        y: plan.marginCm * 0.3 * PT_POR_CM,
        size: 7,
        font,
        color: TXT,
      });
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

// #136: distinguishable per-size line colors -- pdf-lib has no native dash
// "style" concept beyond dashArray, and every size needs to stay legible
// overlaid on the same page, so color is the "distinct line style" this
// legend/layer feature promises. Cycles if there are more sizes than colors.
const LAYER_PALETTE: readonly [number, number, number][] = [
  [0, 0, 0], // base/first size: plain ink
  [0.72, 0.18, 0.18], // red
  [0.16, 0.35, 0.68], // blue
  [0.2, 0.55, 0.28], // green
  [0.58, 0.32, 0.68], // purple
];

// Cycles rather than indexing out of bounds for a 6th+ size.
function paletteColor(i: number): [number, number, number] {
  return LAYER_PALETTE[i % LAYER_PALETTE.length] ?? LAYER_PALETTE[0]!;
}

const LEGEND_ROW_H_CM = 0.6;
const LEGEND_MARGIN_CM = 1;

export interface SizedExportModel {
  size: string;
  model: ExportModel;
}

/**
 * #136: a single-page, multi-size PDF -- each size's cut line + grainline +
 * notches drawn in its own color, wrapped in a real PDF Optional Content
 * Group (OCG) so a PDF viewer with a layers panel can toggle sizes on/off,
 * plus an always-visible legend (color swatch + size label) and the same
 * 10cm calibration ruler every other mode carries. Requires at least one
 * size; a single size still produces a valid (if trivial) one-layer PDF.
 *
 * This is deliberately NOT layered onto the tiled/roll modes above -- a
 * layered comparison is inherently a single-page "everything overlaid"
 * artifact, the same way a real cutting room's graded-nest reference sheet
 * works, and grading is scoped down at #59 to real per-size geometry via
 * buildExportModel's own `size` parameter (each entry here is redrafted
 * from the pattern's frozen sizeTable, not guessed).
 */
export async function toPdfLayered(
  sizedModels: SizedExportModel[],
  t: Translate,
): Promise<Uint8Array> {
  if (sizedModels.length === 0) {
    throw new Error("toPdfLayered: at least one size is required");
  }
  const {
    PDFDocument,
    StandardFonts,
    rgb,
    PDFName,
    PDFString,
    PDFOperator,
    PDFOperatorNames,
  } = await import("pdf-lib");

  const marginCm = SINGLE_MARGIN_CM;
  const sheetWcm = Math.max(...sizedModels.map((s) => s.model.sheetWidthCm));
  const sheetHcm = Math.max(...sizedModels.map((s) => s.model.sheetHeightCm));
  const legendHcm = LEGEND_MARGIN_CM + sizedModels.length * LEGEND_ROW_H_CM;
  const pageWcm = sheetWcm + 2 * marginCm;
  const pageHcm = sheetHcm + 2 * marginCm + legendHcm;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([pageWcm * PT_POR_CM, pageHcm * PT_POR_CM]);

  // sheet coord (cm, +Y down) -> page point (pt, +Y up); the legend strip
  // sits below the drafted geometry, so the sheet origin is pushed up by it.
  const map = (sx: number, sy: number) => ({
    x: (marginCm + sx) * PT_POR_CM,
    y: (pageHcm - marginCm - legendHcm - sy) * PT_POR_CM,
  });

  // One real OCG per size, registered in the document catalog's
  // /OCProperties with a /D (default) configuration naming an /Order and
  // an /ON list -- every size visible by default, matching how the page
  // renders before any viewer toggles a layer off.
  const ocgRefs = sizedModels.map((s) =>
    doc.context.register(
      doc.context.obj({ Type: "OCG", Name: PDFString.of(s.size) }),
    ),
  );
  doc.catalog.set(
    PDFName.of("OCProperties"),
    doc.context.obj({
      OCGs: ocgRefs,
      D: {
        Name: PDFString.of(t("pdf.layerConfigName")),
        Order: ocgRefs,
        ON: ocgRefs,
      },
    }),
  );
  const propsDict = doc.context.obj({});
  const localNames = sizedModels.map((_, i) => `OC${i}`);
  localNames.forEach((name, i) => propsDict.set(PDFName.of(name), ocgRefs[i]!));
  const resources = page.node.Resources();
  if (resources) resources.set(PDFName.of("Properties"), propsDict);

  sizedModels.forEach(({ model }, i) => {
    const [r, g, b] = paletteColor(i);
    const color = rgb(r, g, b);

    page.pushOperators(
      PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
        PDFName.of("OC"),
        PDFName.of(localNames[i]!),
      ]),
    );

    for (const pc of model.pieces) {
      const P = (lx: number, ly: number) =>
        map(pc.originCm.x + lx, pc.originCm.y + ly);
      const cutPts = flattenOutlineCm(pc.cutOutline, TOL_CM);
      for (let k = 0; k < cutPts.length; k++) {
        const a = P(cutPts[k].x, cutPts[k].y);
        const bpt = P(
          cutPts[(k + 1) % cutPts.length].x,
          cutPts[(k + 1) % cutPts.length].y,
        );
        page.drawLine({ start: a, end: bpt, thickness: 0.6, color });
      }
      if (pc.grainline) {
        const [g1, g2] = pc.grainline;
        page.drawLine({
          start: P(g1.x, g1.y),
          end: P(g2.x, g2.y),
          thickness: 0.4,
          color,
          dashArray: [4, 3],
        });
      }
      for (const notch of pc.notches ?? []) {
        page.drawLine({
          start: P(notch.outer.x, notch.outer.y),
          end: P(notch.inner.x, notch.inner.y),
          thickness: 0.6,
          color,
        });
      }
    }

    page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent, []));
  });

  // Legend -- always visible (outside any OC block), so a size stays
  // identifiable even after its own layer is hidden in a viewer.
  const legendTopCm = pageHcm - legendHcm + LEGEND_MARGIN_CM * 0.4;
  sizedModels.forEach(({ size }, i) => {
    const [r, g, b] = paletteColor(i);
    const rowYcm = legendTopCm + i * LEGEND_ROW_H_CM;
    const yPt = (pageHcm - rowYcm) * PT_POR_CM;
    page.drawLine({
      start: { x: marginCm * PT_POR_CM, y: yPt },
      end: { x: (marginCm + 1.2) * PT_POR_CM, y: yPt },
      thickness: 1.5,
      color: rgb(r, g, b),
    });
    page.drawText(size, {
      x: (marginCm + 1.6) * PT_POR_CM,
      y: yPt - 3,
      size: 8,
      font,
      color: rgb(0.35, 0.34, 0.29),
    });
  });

  // 10cm calibration ruler, same convention as every other mode -- placed
  // near the top of the drafted-geometry area (above the legend strip).
  const baseXcm = marginCm + 0.3;
  const boxYcm = pageHcm - marginCm - legendHcm - 1.2;
  const y0 = (boxYcm + 0.2) * PT_POR_CM;
  page.drawLine({
    start: { x: baseXcm * PT_POR_CM, y: y0 },
    end: { x: (baseXcm + 10) * PT_POR_CM, y: y0 },
    thickness: 0.75,
    color: rgb(0, 0, 0),
  });
  for (const tick of rulerTicksCm(10)) {
    const x = (baseXcm + tick) * PT_POR_CM;
    page.drawLine({
      start: { x, y: y0 },
      end: { x, y: y0 + 0.35 * PT_POR_CM },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });
  }
  page.drawText(t("pdf.rulerLabel"), {
    x: baseXcm * PT_POR_CM,
    y: (boxYcm + 0.7) * PT_POR_CM,
    size: 7,
    font,
    color: rgb(0.35, 0.34, 0.29),
  });

  return await doc.save();
}
