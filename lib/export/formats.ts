// The runtime list behind ExportFormat. It is a value, not just a union, so
// lib/ai/prompt.ts can render the formats MoldAI actually writes without
// importing lib/export/index.ts — which pulls in every serializer plus
// download.ts's DOM access.
export const EXPORT_FORMATS = [
  "svg",
  "dxf",
  "dxf-aama",
  "pdf-a4",
  "pdf-single",
  // #136: a single-page PDF layering every graded size (base + sizesApplied)
  // as real Optional Content Groups, one per size, plus a legend.
  "pdf-layered",
  // #135: HPGL/2 plotter output.
  "plt",
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

// The catalog key each format's label and optional caveat live under, in the
// Footer namespace. It sits here, beside EXPORT_FORMATS, because more than
// one screen renders this list: the editor's export menu and the public
// landing page's "Formatos de exportacao" strip. FormatsSection used to keep
// its own hardcoded copy of five ids, whose comment claimed they were "the
// same five formats the editor's export menu offers" -- true when #13
// shipped, false the moment #135/#136 added plt and pdf-layered, so the
// landing page silently under-advertised two shipped formats. Same drift
// shape as the deleted Wallet.planLabel and the deleted landing
// FREE_PLAN_CREDITS: a second copy of a fact that already had an owner.
export const EXPORT_FORMAT_LABELS: Record<
  ExportFormat,
  { labelKey: string; noteKey?: string }
> = {
  svg: { labelKey: "formatSvg" },
  dxf: { labelKey: "formatDxf" },
  "dxf-aama": { labelKey: "formatDxfAama", noteKey: "formatDxfAamaNote" },
  "pdf-a4": { labelKey: "formatPdfA4" },
  "pdf-single": { labelKey: "formatPdfSingle" },
  "pdf-layered": {
    labelKey: "formatPdfLayered",
    noteKey: "formatPdfLayeredNote",
  },
  plt: { labelKey: "formatPlt", noteKey: "formatPltNote" },
};
