import type { Pattern } from "@/lib/types";
import { buildExportModel } from "./model";
import { toSvg } from "./svg";
import { toDxf } from "./dxf";
import { downloadFile, slug } from "./download";

export type ExportFormat = "svg" | "dxf"; // "pdf" chega na Fase 3

export function exportPattern(pattern: Pattern, format: ExportFormat): void {
  if (!pattern.spec || pattern.pieces.length === 0) return;
  const model = buildExportModel(pattern);
  const filename = `${slug(pattern.name)}-${model.size}.${format}`;
  switch (format) {
    case "svg":
      downloadFile(filename, "image/svg+xml", toSvg(model));
      return;
    case "dxf":
      downloadFile(filename, "image/vnd.dxf", toDxf(model));
      return;
    default: {
      // exaustividade: um novo formato sem case vira erro de compilação, não no-op silencioso
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}
