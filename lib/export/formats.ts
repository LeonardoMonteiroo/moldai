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
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];
