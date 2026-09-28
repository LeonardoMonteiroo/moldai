"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { EditorTab } from "@/lib/store";
import type { PatternRecord } from "@/lib/types";
import { exportPattern, type ExportFormat } from "@/lib/export";
import { EXPORT_FORMAT_LABELS } from "@/lib/export/formats";
import { toTechSheetPdf } from "@/lib/export/techSheetPdf";
import { downloadFile, slug } from "@/lib/export/download";
import { recordChecklistEvent } from "@/lib/api-client";
import { useCutPlan } from "./useCutPlan";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Editor.dc.html's FORMATS_2D/FORMATS_CORTE -- which real ExportFormat ids
// this modal's two geometry tabs offer, in the design's own order. Labels
// still resolve through EXPORT_FORMAT_LABELS (Footer namespace), the same
// single source ExportFormatList (the dedicated /export screen) already
// reads, so a format's label/beta caveat can't drift between the two UIs.
const FORMATS_2D: ExportFormat[] = ["svg", "dxf", "dxf-aama", "plt"];
const FORMATS_CORTE: ExportFormat[] = ["pdf-a4", "pdf-single", "pdf-layered"];

// The modal has no fabric-width picker of its own (Editor.dc.html's corte
// panel shows the consumption estimate as static text, not a control) --
// the estimate reads the same plan CutPlanTab shows (useCutPlan): the tab's
// fabric width, cut quantities, nesting mode and placements.

type ModalVariant = "2d" | "corte" | "ficha";

// Prova 3D exports nothing (Editor.dc.html: "a aba Prova 3D não exporta e
// esconde o botão") -- null tells the caller to hide the Exportar button
// entirely rather than opening a modal with no real content.
export function exportVariantForTab(tab: EditorTab): ModalVariant | null {
  switch (tab) {
    case "pattern2d":
      return "2d";
    case "cutplan":
      return "corte";
    case "techsheet":
      return "ficha";
    case "proof3d":
      return null;
  }
}

export function ExportModal({
  pattern,
  variant,
  conflictActive,
  open,
  onOpenChange,
}: {
  pattern: PatternRecord;
  variant: ModalVariant;
  conflictActive: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("ExportModal");
  const tFooter = useTranslations("Footer");
  const tExport = useTranslations("Export");
  const tData = useTranslations("PatternData");
  const tTechSheet = useTranslations("TechSheetTab");

  const [format2d, setFormat2d] = useState<ExportFormat>("svg");
  const [formatCorte, setFormatCorte] = useState<ExportFormat>("pdf-a4");
  const [includeMeasurements, setIncludeMeasurements] = useState(true);
  const [includeAssembly, setIncludeAssembly] = useState(true);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { plan: cutPlan, fabricWidthCm } = useCutPlan(
    variant === "corte" ? pattern : null,
  );

  function handleDownload() {
    setDownloadError(null);
    if (variant === "ficha") {
      setDownloading(true);
      toTechSheetPdf(pattern, tTechSheet, tData, {
        includeMeasurements,
        includeAssembly,
      })
        .then((bytes) => {
          downloadFile(
            `${slug(pattern.name)}-ficha-tecnica.pdf`,
            "application/pdf",
            bytes,
          );
          void recordChecklistEvent("exported").catch(() => {});
        })
        .catch(() => setDownloadError(tData("exportFailed")))
        .finally(() => setDownloading(false));
      return;
    }
    const format = variant === "corte" ? formatCorte : format2d;
    exportPattern(pattern, format, tData, setDownloadError, pattern.baseSize);
  }

  const titleKey =
    variant === "corte"
      ? "titleCorte"
      : variant === "ficha"
        ? "titleFicha"
        : "title2d";
  const subtitleKey =
    variant === "corte"
      ? "subtitleCorte"
      : variant === "ficha"
        ? "subtitleFicha"
        : "subtitle2d";
  const downloadLabel =
    variant === "ficha" ? t("downloadFicha") : t("downloadDefault");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(subtitleKey)}</DialogDescription>
        </DialogHeader>

        {conflictActive && (
          <span
            role="alert"
            className="text-alert bg-amber-bg border-amber-border rounded-item text-ui border px-3 py-2"
          >
            {t("conflictNote")}
          </span>
        )}
        {downloadError && (
          <span
            role="alert"
            className="text-alert bg-amber-bg border-amber-border rounded-item text-ui border px-3 py-2"
          >
            {downloadError}
          </span>
        )}

        {variant === "2d" && (
          <div className="flex flex-col gap-2">
            <span className="text-muted text-tick tracking-eyebrow font-semibold uppercase">
              {t("formatVectorHeading")}
            </span>
            <RadioGroup
              value={format2d}
              onValueChange={(v) => setFormat2d(v as ExportFormat)}
              aria-label={tExport("formatsHeading")}
            >
              {FORMATS_2D.map((id) => (
                <FormatRow
                  key={id}
                  id={id}
                  selected={format2d === id}
                  labelText={tFooter(EXPORT_FORMAT_LABELS[id].labelKey)}
                />
              ))}
            </RadioGroup>
            <span className="text-muted text-meta leading-snug">
              {t("vectorAlwaysIncludedNote")}
            </span>
          </div>
        )}

        {variant === "corte" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <span className="text-muted text-tick tracking-eyebrow font-semibold uppercase">
                {t("formatPdfHeading")}
              </span>
              <RadioGroup
                value={formatCorte}
                onValueChange={(v) => setFormatCorte(v as ExportFormat)}
                aria-label={tExport("formatsHeading")}
              >
                {FORMATS_CORTE.map((id) => (
                  <FormatRow
                    key={id}
                    id={id}
                    selected={formatCorte === id}
                    labelText={tFooter(EXPORT_FORMAT_LABELS[id].labelKey)}
                  />
                ))}
              </RadioGroup>
            </div>
            <div className="border-border flex items-center gap-2 border-t pt-3">
              <span aria-hidden="true" className="text-olive text-control">
                ✓
              </span>
              <span className="text-ui">
                {cutPlan && cutPlan.instances.length > 0
                  ? t("consumptionValue", {
                      length: (cutPlan.lengthCm / 100)
                        .toFixed(2)
                        .replace(".", ","),
                      width: (fabricWidthCm / 100).toFixed(2).replace(".", ","),
                    })
                  : t("consumptionUnavailable")}
              </span>
            </div>
          </div>
        )}

        {variant === "ficha" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-muted text-tick tracking-eyebrow font-semibold uppercase">
                {t("formatHeading")}
              </span>
              <div className="flex gap-[6px]">
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  className="flex-1"
                  disabled
                >
                  {t("formatPdf")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled
                  title={tExport("comingSoonTitle")}
                >
                  {t("formatXlsx")}
                  <Badge variant="soon">{tExport("comingSoonBadge")}</Badge>
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-muted text-tick tracking-eyebrow font-semibold uppercase">
                {t("includeHeading")}
              </span>
              <div className="flex flex-col gap-1">
                <IncludeRow
                  id="ficha-medidas"
                  label={t("includeMeasurements")}
                  checked={includeMeasurements}
                  onCheckedChange={setIncludeMeasurements}
                />
                <IncludeRow
                  id="ficha-materiais"
                  label={t("includeMaterials")}
                  checked={false}
                  disabled
                />
                <IncludeRow
                  id="ficha-por-tamanho"
                  label={t("includePerSize")}
                  checked={false}
                  disabled
                />
                <IncludeRow
                  id="ficha-instrucoes"
                  label={t("includeAssembly")}
                  checked={includeAssembly}
                  onCheckedChange={setIncludeAssembly}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t("cancelButton")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleDownload}
            disabled={conflictActive || downloading}
          >
            {downloadLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormatRow({
  id,
  selected,
  labelText,
}: {
  id: ExportFormat;
  selected: boolean;
  labelText: string;
}) {
  return (
    <label
      htmlFor={`export-format-${id}`}
      className={
        selected
          ? "border-olive bg-olive-tint rounded-btn flex items-center gap-[10px] border px-3 py-[10px] text-left"
          : "border-border rounded-btn flex items-center gap-[10px] border px-3 py-[10px] text-left"
      }
    >
      <RadioGroupItem value={id} id={`export-format-${id}`} />
      <span className="text-control font-semibold">{labelText}</span>
    </label>
  );
}

function IncludeRow({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-[9px] px-[2px] py-[6px]"
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange?.(v === true)}
      />
      <span className="text-ui">{label}</span>
    </label>
  );
}
