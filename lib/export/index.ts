import type { Pattern, SizeLabel } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";
import { buildExportModel } from "./model";
import { toSvg } from "./svg";
import { toDxf } from "./dxf";
import { toDxfAama } from "./dxf-aama";
import { toPdf, toPdfLayered, type PdfPageSize } from "./pdf";
import { toPlt } from "./plt";
import { downloadFile, slug } from "./download";
import { recordChecklistEvent } from "@/lib/api-client";

import type { ExportFormat } from "./formats";

export { EXPORT_FORMATS, type ExportFormat } from "./formats";

// #232: the one new server touchpoint the export flow gets -- a best-effort
// "this happened" ping for the dashboard onboarding checklist. Swallowed on
// failure: a network hiccup here must never surface as an export failure.
function finishDownload(
  filename: string,
  mime: string,
  data: string | Uint8Array,
): void {
  downloadFile(filename, mime, data);
  void recordChecklistEvent("exported").catch(() => {});
}

// #135/#136: extra render-time options beyond the single `size` param --
// none of the five original formats needed one, so this stays optional and
// every existing call site is unaffected.
export interface ExportRenderOptions {
  // pdf-a4: which named page format to tile onto ("a4" default).
  pageSize?: PdfPageSize;
  // pdf-single and plt: roll width in cm -- when the pattern is wider than
  // this, both split into numbered strips instead of one oversized sheet.
  rollWidthCm?: number;
}

export function exportPattern(
  pattern: Pattern,
  format: ExportFormat,
  t: Translate,
  onError?: (message: string) => void,
  // #59: which size's measurements to redraft the export from; defaults to
  // the base size, so a pattern with nothing graded exports exactly as before.
  size?: SizeLabel,
  opts: ExportRenderOptions = {},
): void {
  if (!pattern.spec || pattern.pieces.length === 0) return;
  const fail = () => onError?.(t("exportFailed"));

  // #136: pdf-layered redrafts one model PER graded size (base +
  // sizesApplied) rather than the single `size`-selected model every other
  // format uses -- built separately so a plain single-model export never
  // pays for sizes it isn't exporting.
  if (format === "pdf-layered") {
    const sizes = Array.from(
      new Set<SizeLabel>([pattern.baseSize, ...pattern.sizesApplied]),
    );
    try {
      const sizedModels = sizes.map((s) => ({
        size: s,
        model: buildExportModel(pattern, t, s),
      }));
      toPdfLayered(sizedModels, t)
        .then((bytes) =>
          finishDownload(
            `${slug(pattern.name)}-graduado.pdf`,
            "application/pdf",
            bytes,
          ),
        )
        .catch(fail);
    } catch {
      fail();
    }
    return;
  }

  let model;
  try {
    model = buildExportModel(pattern, t, size);
  } catch {
    fail();
    return;
  }
  // #88: model.size used to be interpolated raw -- a combined size label
  // like "38/40" (routine in Brazilian charts) put a path separator straight
  // into a.download, which the browser silently rewrites rather than
  // rejecting. slug() is the one filename-normalisation point; nothing
  // upstream bounds a custom chart's size label, so both halves go through it.
  const base = `${slug(pattern.name)}-${slug(model.size)}`;
  switch (format) {
    case "svg":
      try {
        finishDownload(`${base}.svg`, "image/svg+xml", toSvg(model));
      } catch {
        fail();
      }
      return;
    case "dxf":
      try {
        finishDownload(`${base}.dxf`, "image/vnd.dxf", toDxf(model));
      } catch {
        fail();
      }
      return;
    case "dxf-aama":
      try {
        finishDownload(`${base}-aama.dxf`, "image/vnd.dxf", toDxfAama(model));
      } catch {
        fail();
      }
      return;
    case "pdf-a4":
      // toPdf is async (pdf-lib); fire-and-forget — doesn't change the void signature
      toPdf(model, "a4", t, { pageSize: opts.pageSize })
        .then((bytes) =>
          finishDownload(`${base}-a4.pdf`, "application/pdf", bytes),
        )
        .catch(fail);
      return;
    case "pdf-single":
      // #135/#136: a roll width splits the single sheet into numbered
      // strips (the copyshop/plotter mode); omitted, it's one full-size
      // page exactly as before.
      toPdf(
        model,
        opts.rollWidthCm ? "roll" : "single",
        t,
        opts.rollWidthCm ? { rollWidthCm: opts.rollWidthCm } : {},
      )
        .then((bytes) =>
          finishDownload(`${base}-folha.pdf`, "application/pdf", bytes),
        )
        .catch(fail);
      return;
    case "plt":
      try {
        finishDownload(
          `${base}.plt`,
          "application/vnd.hp-hpgl",
          toPlt(model, { rollWidthCm: opts.rollWidthCm }),
        );
      } catch {
        fail();
      }
      return;
    default: {
      // exhaustiveness: a format with no case becomes a compile error
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}
