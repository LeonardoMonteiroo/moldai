import type { Pattern } from "@/lib/types";
import { buildExportModel } from "./model";
import { toSvg } from "./svg";
import { downloadFile, slug } from "./download";

export type ExportFormat = "svg"; // "dxf" | "pdf" chegam nas Fases 2 e 3

export function exportPattern(pattern: Pattern, format: ExportFormat): void {
  if (!pattern.spec || pattern.pieces.length === 0) return;
  const model = buildExportModel(pattern);
  const filename = `${slug(pattern.name)}-${model.size}.${format}`;
  if (format === "svg") {
    downloadFile(filename, "image/svg+xml", toSvg(model));
  }
}
