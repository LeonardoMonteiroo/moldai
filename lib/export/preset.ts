import { EXPORT_FORMATS, type ExportFormat } from "./formats";
import { FABRIC_WIDTHS_CM } from "./cutplan";
import type { PdfPageSize } from "./pdf";

// #17: the "O que vai no arquivo" panel's remembered choices. Most of these
// fields are inert today — Margem de costura/Piques e fio/Nome das peças
// each render disabled on the export screen because turning them off would
// require threading a new option into the serializers (lib/export/svg.ts,
// dxf.ts, dxf-aama.ts, pdf.ts), which this unit does not own. They are still
// part of the persisted shape so a working toggle is a pure UI change later,
// not a new preset field. `sizes` is deliberately NOT part of this shape:
// which sizes are gradeable is per-pattern (Pattern.sizesApplied), so an
// account-wide preset has nothing honest to remember there.
export type SeamAllowanceMode = "included" | "none";
export type MarksMode = "include" | "omit";
export type PieceNamingMode = "moldai" | "short";

export interface ExportPreset {
  format: ExportFormat;
  seamAllowance: SeamAllowanceMode;
  marks: MarksMode;
  pieceNaming: PieceNamingMode;
  fabricWidthCm: number;
  // #136: which named page format the tiled pdf-a4 mode tiles onto.
  pageSize: PdfPageSize;
  // #135/#136: roll width in cm for the pdf-single/plt copyshop-plotter
  // split -- null means "no split" (a plain single sheet / one HPGL page),
  // the pre-existing behavior for both formats.
  rollWidthCm: number | null;
}

export const DEFAULT_EXPORT_PRESET: ExportPreset = {
  format: "dxf-aama",
  seamAllowance: "included",
  marks: "include",
  pieceNaming: "moldai",
  fabricWidthCm: 150,
  pageSize: "a4",
  rollWidthCm: null,
};

function isExportFormat(value: unknown): value is ExportFormat {
  return (
    typeof value === "string" &&
    (EXPORT_FORMATS as readonly string[]).includes(value)
  );
}

function isFabricWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    (FABRIC_WIDTHS_CM as readonly number[]).includes(value)
  );
}

const PAGE_SIZES: readonly PdfPageSize[] = ["a4", "a0", "letter"];

function isPageSize(value: unknown): value is PdfPageSize {
  return (
    typeof value === "string" &&
    (PAGE_SIZES as readonly string[]).includes(value)
  );
}

// A free numeric input (issue #135's decision), not just the three presets
// -- clamped to a sane physical range rather than restricted to the preset
// list, the same "drop or clamp, never throw" trust-boundary shape
// validateSizeChartPatch uses.
const MIN_ROLL_WIDTH_CM = 20;
const MAX_ROLL_WIDTH_CM = 500;

function isRollWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_ROLL_WIDTH_CM &&
    value <= MAX_ROLL_WIDTH_CM
  );
}

/**
 * The size-chart-patch precedent (lib/sizeCharts/validate.ts): whatever
 * reaches this — today a browser's localStorage, read back on a later visit
 * — is untrusted the same way a wire body is. Drops or falls back to the
 * default on anything unusable rather than throwing, so a corrupted or
 * hand-edited stored value can never break the export screen; it just resets
 * that one field.
 */
export function validateExportPreset(input: unknown): ExportPreset {
  const obj =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  return {
    format: isExportFormat(obj.format)
      ? obj.format
      : DEFAULT_EXPORT_PRESET.format,
    seamAllowance: obj.seamAllowance === "none" ? "none" : "included",
    marks: obj.marks === "omit" ? "omit" : "include",
    pieceNaming: obj.pieceNaming === "short" ? "short" : "moldai",
    fabricWidthCm: isFabricWidth(obj.fabricWidthCm)
      ? obj.fabricWidthCm
      : DEFAULT_EXPORT_PRESET.fabricWidthCm,
    pageSize: isPageSize(obj.pageSize)
      ? obj.pageSize
      : DEFAULT_EXPORT_PRESET.pageSize,
    rollWidthCm: isRollWidth(obj.rollWidthCm) ? obj.rollWidthCm : null,
  };
}
