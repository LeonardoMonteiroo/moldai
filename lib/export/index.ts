import type { Pattern } from "@/lib/types";
import { buildExportModel } from "./model";
import { toSvg } from "./svg";
import { toDxf } from "./dxf";
import { toPdf } from "./pdf";
import { downloadFile, slug } from "./download";

export type ExportFormat = "svg" | "dxf" | "pdf-a4" | "pdf-single";

export function exportPattern(
  pattern: Pattern,
  format: ExportFormat,
  onError?: (message: string) => void,
): void {
  if (!pattern.spec || pattern.pieces.length === 0) return;
  const fail = () => onError?.("A exportação falhou. Tente novamente.");

  let model;
  try {
    model = buildExportModel(pattern);
  } catch {
    fail();
    return;
  }
  const base = `${slug(pattern.name)}-${model.size}`;
  switch (format) {
    case "svg":
      try {
        downloadFile(`${base}.svg`, "image/svg+xml", toSvg(model));
      } catch {
        fail();
      }
      return;
    case "dxf":
      try {
        downloadFile(`${base}.dxf`, "image/vnd.dxf", toDxf(model));
      } catch {
        fail();
      }
      return;
    case "pdf-a4":
      // toPdf é async (pdf-lib); fire-and-forget — não muda a assinatura void
      toPdf(model, "a4")
        .then((bytes) => downloadFile(`${base}-a4.pdf`, "application/pdf", bytes))
        .catch(fail);
      return;
    case "pdf-single":
      toPdf(model, "single")
        .then((bytes) => downloadFile(`${base}-folha.pdf`, "application/pdf", bytes))
        .catch(fail);
      return;
    default: {
      // exaustividade: formato sem case vira erro de compilação
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}
