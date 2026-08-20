"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Pattern } from "@/lib/types";
import { exportPattern, ExportFormat } from "@/lib/export";
import { buildExportModel } from "@/lib/export/model";
import { planTiles } from "@/lib/export/pdf";

const FORMATS: {
  id: ExportFormat;
  labelKey: string;
  noteKey?: string;
}[] = [
  { id: "svg", labelKey: "formatSvg" },
  { id: "dxf", labelKey: "formatDxf" },
  {
    id: "dxf-aama",
    labelKey: "formatDxfAama",
    noteKey: "formatDxfAamaNote",
  },
  { id: "pdf-a4", labelKey: "formatPdfA4" },
  { id: "pdf-single", labelKey: "formatPdfSingle" },
];

export function Footer({
  pattern,
  conflictActive,
  generating,
}: {
  pattern: Pattern;
  conflictActive: boolean;
  generating: boolean;
}) {
  const t = useTranslations("Footer");
  const tData = useTranslations("PatternData");
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!exportError) return;
    const timeout = setTimeout(() => setExportError(null), 6000);
    return () => clearTimeout(timeout);
  }, [exportError]);
  const pieceCount = pattern.pieces.reduce((sum, p) => sum + p.qty, 0);
  const exportDisabled =
    conflictActive ||
    generating ||
    pattern.pieces.length === 0 ||
    !pattern.spec;

  const statusText = conflictActive
    ? t("statusConflict", { version: pattern.version })
    : generating
      ? t("statusGenerating")
      : t("statusReady", {
          pieceCount,
          baseSize: pattern.baseSize,
          unit: pattern.unit,
        });

  // Only re-draws the model when the menu opens (buildExportModel re-drafts in cm).
  const a4Pages = useMemo(() => {
    if (!menuOpen || exportDisabled) return 0;
    const model = buildExportModel(pattern, tData);
    return planTiles(model.sheetWidthCm, model.sheetHeightCm, "a4").pages
      .length;
  }, [menuOpen, exportDisabled, pattern, tData]);

  const handleExport = (format: ExportFormat) => {
    setExportError(null);
    exportPattern(pattern, format, tData, (msg) => setExportError(msg));
    setMenuOpen(false);
  };

  return (
    <div className="bg-surface border-border flex items-center gap-[10px] border-t px-4 py-3">
      <span className="text-muted text-[12px]">{statusText}</span>
      <div className="flex-1" />

      {exportError && (
        <span
          role="alert"
          className="text-alert bg-amber-bg border-amber-border rounded-item border px-[10px] py-[5px] text-[11.5px]"
        >
          {exportError}
        </span>
      )}

      <div className="relative">
        <button
          type="button"
          disabled={exportDisabled}
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-btn disabled:text-disabled disabled:border-disabled-border enabled:border-border enabled:hover:bg-surface-alt border px-[14px] py-2 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed"
        >
          {t("exportButton")}
        </button>
        {menuOpen && !exportDisabled && (
          <>
            <button
              type="button"
              aria-label={t("closeMenuAriaLabel")}
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div className="bg-surface border-border rounded-item shadow-card absolute right-0 bottom-full z-20 mb-1 min-w-[210px] border py-1">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => handleExport(fmt.id)}
                  className="hover:bg-surface-alt block w-full px-3 py-2 text-left transition-colors"
                >
                  <span className="block text-[12.5px]">{t(fmt.labelKey)}</span>
                  {fmt.id === "pdf-a4" && a4Pages > 0 && (
                    <span className="text-muted block text-[11px]">
                      {t("a4PageCount", { count: a4Pages })}
                    </span>
                  )}
                  {fmt.noteKey && (
                    <span className="text-muted block text-[11px] leading-snug">
                      {t(fmt.noteKey)}
                    </span>
                  )}
                </button>
              ))}
              <div className="border-line text-muted mt-1 border-t px-3 pt-[6px] pb-1 text-[10.5px] leading-snug">
                {t("netLineNote")}
              </div>
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        disabled
        title={t("saveVersionTitle")}
        className="rounded-btn bg-olive text-olive-foreground cursor-not-allowed px-4 py-2 text-[12.5px] font-semibold opacity-50"
      >
        {t("saveVersionButton")}
      </button>
    </div>
  );
}
