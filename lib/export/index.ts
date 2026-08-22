import type { Pattern } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";
import { buildExportModel } from "./model";
import { toSvg } from "./svg";
import { toDxf } from "./dxf";
import { toDxfAama } from "./dxf-aama";
import { toPdf } from "./pdf";
import { downloadFile, slug } from "./download";

import type { ExportFormat } from "./formats";

export { EXPORT_FORMATS, type ExportFormat } from "./formats";

export function exportPattern(
  pattern: Pattern,
  format: ExportFormat,
  t: Translate,
  onError?: (message: string) => void,
): void {
  if (!pattern.spec || pattern.pieces.length === 0) return;
  const fail = () => onError?.(t("exportFailed"));

  let model;
  try {
    model = buildExportModel(pattern, t);
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
    case "dxf-aama":
      try {
        downloadFile(`${base}-aama.dxf`, "image/vnd.dxf", toDxfAama(model));
      } catch {
        fail();
      }
      return;
    case "pdf-a4":
      // toPdf is async (pdf-lib); fire-and-forget — doesn't change the void signature
      toPdf(model, "a4", t)
        .then((bytes) =>
          downloadFile(`${base}-a4.pdf`, "application/pdf", bytes),
        )
        .catch(fail);
      return;
    case "pdf-single":
      toPdf(model, "single", t)
        .then((bytes) =>
          downloadFile(`${base}-folha.pdf`, "application/pdf", bytes),
        )
        .catch(fail);
      return;
    default: {
      // exhaustiveness: a format with no case becomes a compile error
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}
