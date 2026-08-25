"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Pattern } from "@/lib/types";
import { exportPattern, ExportFormat } from "@/lib/export";
import { buildExportModel } from "@/lib/export/model";
import { planTiles, pieceBBoxesCm } from "@/lib/export/pdf";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEditorStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";

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
  // #59: which size's measurements the export is redrafted from. Only shown
  // once something is actually graded -- an ungraded pattern always exports
  // the base size, unchanged from before this existed.
  const [exportSize, setExportSize] = useState(pattern.baseSize);

  useEffect(() => {
    if (!exportError) return;
    const timeout = setTimeout(() => setExportError(null), 6000);
    return () => clearTimeout(timeout);
  }, [exportError]);

  const saveAsSloper = useEditorStore((s) => s.saveAsSloper);
  const [savingBase, setSavingBase] = useState(false);
  const [baseName, setBaseName] = useState(pattern.name);
  const [baseNotice, setBaseNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!baseNotice) return;
    const timeout = setTimeout(() => setBaseNotice(null), 6000);
    return () => clearTimeout(timeout);
  }, [baseNotice]);

  const submitBase = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = baseName.trim();
    if (!name) return;
    setSavingBase(false);
    setBaseNotice(
      (await saveAsSloper(name))
        ? { tone: "ok", text: t("saveAsBaseSaved") }
        : { tone: "error", text: t("saveAsBaseError") },
    );
  };
  // #115: copies-to-cut (qty summed across pieces), not the piece count --
  // a blouse's front×1/back×1/sleeve×2 is 3 pieces but 4 copies, and this
  // status line used to call that 4 "peças" while the canvas shows 3 and
  // TechSheetTab lists 3 cards.
  const copyCount = pattern.pieces.reduce((sum, p) => sum + p.qty, 0);
  const exportDisabled =
    conflictActive ||
    generating ||
    pattern.pieces.length === 0 ||
    !pattern.spec;
  // #116: a reason per cause, mirroring saveAsBaseDisabledTitle below --
  // pattern.pieces.length === 0 and !pattern.spec always coincide (both are
  // set together by applyGarmentSpec), so they share one "nothing drafted"
  // message rather than needing a third, redundant string.
  const exportDisabledTitle = conflictActive
    ? t("exportDisabledConflictTitle")
    : generating
      ? t("exportDisabledGeneratingTitle")
      : pattern.pieces.length === 0 || !pattern.spec
        ? t("exportDisabledBlankTitle")
        : undefined;

  const statusText = conflictActive
    ? t("statusConflict", { version: pattern.version })
    : generating
      ? t("statusGenerating")
      : t("statusReady", {
          copyCount,
          baseSize: pattern.baseSize,
          unit: pattern.unit,
        });

  // Only re-draws the model when the menu opens (buildExportModel re-drafts in cm).
  // #120: passes the same piece bboxes toPdf itself filters blank tiles
  // against, so this estimate and the exported file always agree.
  const a4Pages = useMemo(() => {
    if (!menuOpen || exportDisabled) return 0;
    const model = buildExportModel(pattern, tData, exportSize);
    return planTiles(
      model.sheetWidthCm,
      model.sheetHeightCm,
      "a4",
      pieceBBoxesCm(model.pieces, model.foldLabel),
    ).pages.length;
  }, [menuOpen, exportDisabled, pattern, tData, exportSize]);

  const handleExport = (format: ExportFormat) => {
    setExportError(null);
    exportPattern(
      pattern,
      format,
      tData,
      (msg) => setExportError(msg),
      exportSize,
    );
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

      {baseNotice && (
        <span
          role={baseNotice.tone === "error" ? "alert" : "status"}
          className={
            baseNotice.tone === "error"
              ? "text-alert bg-amber-bg border-amber-border rounded-item text-meta border px-[10px] py-[5px]"
              : "text-olive bg-olive-tint rounded-item text-meta px-[10px] py-[5px]"
          }
        >
          {baseNotice.text}
        </span>
      )}

      {pattern.sizesApplied.length > 0 && (
        <Select
          value={exportSize}
          onValueChange={setExportSize}
          disabled={exportDisabled}
        >
          <SelectTrigger
            size="sm"
            className="w-[120px]"
            aria-label={t("exportSizeLabel")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={pattern.baseSize}>
                {t("exportSizeBaseOption", { size: pattern.baseSize })}
              </SelectItem>
              {pattern.sizesApplied.map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            disabled={exportDisabled}
            title={exportDisabledTitle}
          >
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
            {t("outlinesNote")}
          </DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        disabled={exportDisabled}
        title={exportDisabled ? t("saveAsBaseDisabledTitle") : undefined}
        onClick={() => {
          setBaseName(pattern.name);
          setSavingBase(true);
        }}
      >
        {t("saveAsBaseButton")}
      </Button>

      <Button
        disabled
        title={t("saveVersionTitle")}
        className="cursor-not-allowed"
      >
        {t("saveVersionButton")}
      </Button>

      <Dialog open={savingBase} onOpenChange={setSavingBase}>
        <DialogContent>
          <form onSubmit={submitBase}>
            <DialogHeader>
              <DialogTitle>{t("saveAsBaseTitle")}</DialogTitle>
            </DialogHeader>
            <Field className="py-4">
              <FieldLabel htmlFor="save-as-base-name">
                {t("saveAsBasePrompt")}
              </FieldLabel>
              <Input
                id="save-as-base-name"
                value={baseName}
                maxLength={MAX_PATTERN_NAME_LENGTH}
                onChange={(event) => setBaseName(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSavingBase(false)}
              >
                {t("saveAsBaseCancelButton")}
              </Button>
              <Button type="submit" size="sm" disabled={!baseName.trim()}>
                {t("saveAsBaseSaveButton")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
