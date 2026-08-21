"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Pattern } from "@/lib/types";
import { exportPattern, ExportFormat } from "@/lib/export";
import { buildExportModel } from "@/lib/export/model";
import { planTiles } from "@/lib/export/pdf";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  };

  return (
    <div className="bg-surface border-border flex items-center gap-[10px] border-t px-4 py-3">
      <span className="text-muted text-ui">{statusText}</span>
      <div className="flex-1" />

      {exportError && (
        <span
          role="alert"
          className="text-alert bg-amber-bg border-amber-border rounded-item text-meta border px-[10px] py-[5px]"
        >
          {exportError}
        </span>
      )}

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={exportDisabled}>
            {t("exportButton")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-[230px]">
          <DropdownMenuGroup>
            {FORMATS.map((fmt) => (
              <DropdownMenuItem
                key={fmt.id}
                onSelect={() => handleExport(fmt.id)}
                className="flex-col items-start gap-0"
              >
                <span className="text-ui">{t(fmt.labelKey)}</span>
                {fmt.id === "pdf-a4" && a4Pages > 0 && (
                  <span className="text-muted text-meta">
                    {t("a4PageCount", { count: a4Pages })}
                  </span>
                )}
                {fmt.noteKey && (
                  <span className="text-muted text-meta leading-snug">
                    {t(fmt.noteKey)}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted text-tick leading-snug font-normal">
            {t("netLineNote")}
          </DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        disabled
        title={t("saveVersionTitle")}
        className="cursor-not-allowed"
      >
        {t("saveVersionButton")}
      </Button>
    </div>
  );
}
