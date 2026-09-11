import type { Pattern } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";
import { buildExportModel } from "./model";
import { buildEaseReport, GIRTHS } from "@/lib/draft/easeReport";
import { buildAssemblyOrder, type AssemblyStep } from "@/lib/draft/assembly";

const PT_POR_CM = 72 / 2.54;
const PAGE_W_CM = 21;
const PAGE_H_CM = 29.7;
const MARGIN_CM = 2;
const PAGE_W_PT = PAGE_W_CM * PT_POR_CM;
const PAGE_H_PT = PAGE_H_CM * PT_POR_CM;
const MARGIN_PT = MARGIN_CM * PT_POR_CM;

const TITLE_SIZE = 16;
const HEADING_SIZE = 11;
const BODY_SIZE = 9.5;
const LINE_GAP = 14;
const SECTION_GAP = 20;

export interface TechSheetPdfOptions {
  // "Tabela de medidas" (Editor.dc.html's FICHA_ITEMS) -- default true.
  includeMeasurements?: boolean;
  // "Instruções de montagem" -- default true.
  includeAssembly?: boolean;
}

/**
 * A document-style PDF (running text, not the geometry drawings toPdf/
 * toPdfLayered produce) rendering the same data TechSheetTab already shows
 * on screen: the pattern summary chips, buildEaseReport's girth table, each
 * piece's dimensions, and buildAssemblyOrder's sewing sequence. No new data
 * is invented here -- a section is simply omitted when its underlying
 * report returns null/empty, the same "honest gap, not a fabricated
 * placeholder" rule TechSheetTab itself follows.
 *
 * Editor.dc.html's other two FICHA_ITEMS ("Lista de materiais", "Ficha por
 * tamanho") have no backing data model anywhere in this app yet -- there is
 * no fabric/notions field on GarmentSpec, and a real per-size sheet would
 * need a redraft-per-size loop this pass doesn't add. Left for the modal to
 * offer disabled + "em breve" rather than fabricated here.
 *
 * Two translators, matching TechSheetTab.tsx's own split: `t` is
 * TechSheetTab-namespaced (garmentType/gender/easeReport.girth labels, plus
 * this module's own techSheetPdf.* strings); `tData` is PatternData-
 * namespaced, the one buildExportModel/buildEaseReport/buildAssemblyOrder
 * themselves expect for drafter-internal text.
 */
export async function toTechSheetPdf(
  pattern: Pattern,
  t: Translate,
  tData: Translate,
  opts: TechSheetPdfOptions = {},
): Promise<Uint8Array> {
  const { includeMeasurements = true, includeAssembly = true } = opts;
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.11, 0.1);
  const muted = rgb(0.43, 0.42, 0.38);

  let page = doc.addPage([PAGE_W_PT, PAGE_H_PT]);
  let y = PAGE_H_PT - MARGIN_PT;

  function newPage() {
    page = doc.addPage([PAGE_W_PT, PAGE_H_PT]);
    y = PAGE_H_PT - MARGIN_PT;
  }

  function ensureRoom(linesNeeded = 1) {
    if (y - linesNeeded * LINE_GAP < MARGIN_PT) newPage();
  }

  function drawLine(
    text: string,
    { size = BODY_SIZE, useFont = font, color = ink } = {},
  ) {
    ensureRoom();
    page.drawText(text, { x: MARGIN_PT, y, size, font: useFont, color });
    y -= LINE_GAP;
  }

  function drawHeading(text: string) {
    ensureRoom(2);
    y -= SECTION_GAP - LINE_GAP;
    page.drawText(text, {
      x: MARGIN_PT,
      y,
      size: HEADING_SIZE,
      font: bold,
      color: ink,
    });
    y -= LINE_GAP;
  }

  // Title
  page.drawText(t("techSheetPdf.title", { name: pattern.name }), {
    x: MARGIN_PT,
    y,
    size: TITLE_SIZE,
    font: bold,
    color: ink,
  });
  y -= TITLE_SIZE + 6;
  drawLine(
    t("techSheetPdf.subtitle", {
      baseSize: pattern.baseSize,
      unit: pattern.unit,
    }),
    { color: muted },
  );

  // Summary
  if (pattern.spec) {
    const folga = pattern.spec.style.seamAllowanceCm ?? 1;
    const totalCopies = pattern.pieces.reduce((s, p) => s + p.qty, 0);
    drawHeading(t("techSheetPdf.summaryHeading"));
    drawLine(
      t("techSheetPdf.summaryLine", {
        type: t("garmentType." + pattern.spec.type),
        gender: t("gender." + pattern.spec.gender),
        pieces: pattern.pieces.length,
        copies: totalCopies,
        seamAllowance: folga,
      }),
    );
    if (pattern.sizeChartName) {
      drawLine(
        t("techSheetPdf.sizeChartLine", { name: pattern.sizeChartName }),
        { color: muted },
      );
    }
  }

  // Measurements (ease report)
  if (includeMeasurements && pattern.spec) {
    const report = buildEaseReport(pattern, tData);
    if (report && report.girths.length > 0) {
      drawHeading(t("techSheetPdf.measurementsHeading"));
      for (const girth of GIRTHS) {
        const g = report.girths.find((e) => e.girth === girth);
        if (!g) continue;
        drawLine(
          t("techSheetPdf.measurementLine", {
            girth: t("easeReport.girth." + girth),
            finished: g.finishedCm.toFixed(1),
            body: g.bodyCm.toFixed(1),
          }),
        );
      }
    }
  }

  // Pieces
  if (pattern.spec && pattern.pieces.length > 0) {
    try {
      const model = buildExportModel(pattern, tData);
      drawHeading(t("techSheetPdf.piecesHeading"));
      for (const piece of model.pieces) {
        drawLine(
          t("techSheetPdf.pieceLine", {
            name: piece.name,
            qty: piece.qty,
            width: piece.widthCm.toFixed(1),
            height: piece.heightCm.toFixed(1),
          }),
          { useFont: bold },
        );
      }
    } catch {
      // No usable spec at export time -- section simply omitted, the same
      // TechSheetTab "no valid spec" fallback.
    }
  }

  // Assembly instructions
  if (includeAssembly && pattern.spec) {
    const order = buildAssemblyOrder(pattern, tData);
    if (order && order.steps.length > 0) {
      drawHeading(t("techSheetPdf.assemblyHeading"));
      order.steps.forEach((step, i) => {
        drawLine(`${i + 1}. ${assemblyStepLine(step, t)}`);
      });
      if (order.hasConflict) {
        drawLine(t("techSheetPdf.assemblyConflictNote"), { color: muted });
      }
    }
  }

  return doc.save();
}

function assemblyStepLine(step: AssemblyStep, t: Translate): string {
  switch (step.kind) {
    case "dart":
      return t("techSheetPdf.stepDart", {
        piece: step.pieceName,
        count: step.count,
      });
    case "pleat":
      return t("techSheetPdf.stepPleat", {
        piece: step.pieceName,
        count: step.count,
      });
    case "seam":
      return t("techSheetPdf.stepSeam", {
        a: step.aPieceName,
        b: step.bPieceName,
      });
    case "hem":
      return t("techSheetPdf.stepHem", {
        piece: step.pieceName,
        length: step.lengthCm.toFixed(1),
      });
  }
}
