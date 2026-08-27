"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useImportStore } from "@/lib/importStore";

// Only DXF is actually parsed this pass (see lib/import/dxf.ts's module doc)
// — the accept attribute names exactly what the parser reads, never more.
const ACCEPT = ".dxf";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Step 1: a plain file chooser behind a real <input type="file">. Step 2:
 * the parsed summary (format / piece count / file size) plus "Trocar",
 * which clears the analysis and returns to step 1.
 */
export function FileSummaryCard() {
  const t = useTranslations("Import");
  const inputRef = useRef<HTMLInputElement>(null);
  const step = useImportStore((s) => s.step);
  const analysis = useImportStore((s) => s.analysis);
  const fileName = useImportStore((s) => s.fileName);
  const fileSizeBytes = useImportStore((s) => s.fileSizeBytes);
  const loading = useImportStore((s) => s.loading);
  const actionError = useImportStore((s) => s.actionError);
  const pick = useImportStore((s) => s.pick);
  const reset = useImportStore((s) => s.reset);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void pick(file);
  }

  return (
    <div className="border-border bg-surface rounded-lg border p-[18px]">
      {step === 1 || !analysis ? (
        <div className="flex flex-col items-start gap-[10px]">
          <p className="text-ui text-muted max-w-[520px]">{t("dropHint")}</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={onChange}
            aria-label={t("chooseFileButton")}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={loading}>
            {t("chooseFileButton")}
          </Button>
          {loading && (
            <span role="status" className="text-meta text-muted">
              {t("loading")}
            </span>
          )}
          {actionError && (
            <p role="status" className="text-alert text-ui">
              {t("pickError." + actionError)}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-[14px]">
          <div className="flex flex-wrap items-center gap-[22px]">
            <div>
              <div className="text-meta text-muted tracking-eyebrow uppercase">
                {t("fileSummaryFile")}
              </div>
              <div
                className="text-control max-w-[220px] truncate"
                title={fileName ?? ""}
              >
                {fileName}
              </div>
            </div>
            <div>
              <div className="text-meta text-muted tracking-eyebrow uppercase">
                {t("fileSummaryFormat")}
              </div>
              <div className="text-control">
                {t("format." + analysis.format)}
              </div>
            </div>
            <div>
              <div className="text-meta text-muted tracking-eyebrow uppercase">
                {t("fileSummaryPieces")}
              </div>
              <div className="text-control">{analysis.pieceCount}</div>
            </div>
            <div>
              <div className="text-meta text-muted tracking-eyebrow uppercase">
                {t("fileSummarySize")}
              </div>
              <div className="text-control">{formatBytes(fileSizeBytes)}</div>
            </div>
          </div>
          <Button variant="outline" onClick={reset}>
            {t("changeFileButton")}
          </Button>
        </div>
      )}
    </div>
  );
}
