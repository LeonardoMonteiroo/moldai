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
