"use client";

import { useTranslations } from "next-intl";
import type { Pattern } from "@/lib/types";
import { formatCm } from "@/lib/format";
import type { ExportFormat } from "@/lib/export";
import type { PdfPageSize } from "@/lib/export/pdf";
import { ROLL_WIDTH_PRESETS_CM } from "@/lib/export/strips";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";

const PAGE_SIZES: PdfPageSize[] = ["a4", "a0", "letter"];

// #135 decision: 841mm / 24in / 36in, each with its own real-world origin
// label rather than a generically-derived one (84,1cm isn't "33 inches" to
// anyone buying paper by the roll).
const ROLL_WIDTH_LABELS: Record<number, string> = {
  84.1: "841 mm",
  60.96: '24"',
  91.44: '36"',
};

/**
 * The design's four "O que vai no arquivo" selects (screen 5h). Three are
 * disabled today, each with the control's `title` plus an
 * `aria-describedby` caption stating why — the same pattern
 * SizeChartTable's bodyType control uses (CLAUDE.md) — because turning any
 * of them off would mean threading a new option into a serializer this unit
 * does not own (lib/export/svg.ts, dxf.ts, dxf-aama.ts, pdf.ts). Only
 * "Tamanhos" is real: exportPattern already accepts a size, redrafting the
 * file from that size's frozen measurements (#59).
 */
export function ExportOptions({
  pattern,
  selectedSize,
  onSizeChange,
  format,
  pageSize,
  onPageSizeChange,
  rollWidthCm,
  onRollWidthChange,
}: {
  pattern: Pattern;
  selectedSize: string;
  onSizeChange: (size: string) => void;
  format: ExportFormat;
  pageSize: PdfPageSize;
  onPageSizeChange: (size: PdfPageSize) => void;
  rollWidthCm: number | null;
  onRollWidthChange: (widthCm: number | null) => void;
}) {
  const t = useTranslations("Export");
  const otherSizes = pattern.sizesApplied.filter((s) => s !== pattern.baseSize);
  const hasOtherSizes = otherSizes.length > 0;
  const seamAllowanceCm = pattern.spec?.style.seamAllowanceCm ?? 1;
  // #136: page size only matters for the tiled A4/A0/Letter mode.
  const showPageSize = format === "pdf-a4";
  // #135/#136: a roll width (with a "no split" default) only matters for
  // the two large-format outputs that can genuinely exceed a roll.
  const showRollWidth = format === "pdf-single" || format === "plt";

  return (
    <div className="border-border bg-surface rounded-card flex flex-col gap-4 border p-[16px]">
      <span className="text-control font-semibold">{t("optionsHeading")}</span>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="export-size">{t("sizeLabel")}</FieldLabel>
          <FieldContent>
            <Select
              value={selectedSize}
              onValueChange={onSizeChange}
              disabled={!hasOtherSizes}
            >
              <SelectTrigger
                id="export-size"
                size="sm"
                className="w-full"
                title={hasOtherSizes ? undefined : t("sizeNoOtherSizesTitle")}
                aria-describedby="export-size-note"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={pattern.baseSize}>
                    {t("sizeBaseOption", { size: pattern.baseSize })}
                  </SelectItem>
                  {otherSizes.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription id="export-size-note">
              {hasOtherSizes
                ? t("sizeSingleOnlyNote")
                : t("sizeNoOtherSizesTitle")}
            </FieldDescription>
          </FieldContent>
        </Field>

        {showPageSize && (
          <Field>
            <FieldLabel htmlFor="export-page-size">
              {t("pageSizeLabel")}
            </FieldLabel>
            <FieldContent>
              <Select
                value={pageSize}
                onValueChange={(v) => onPageSizeChange(v as PdfPageSize)}
              >
                <SelectTrigger
                  id="export-page-size"
                  size="sm"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PAGE_SIZES.map((size) => (
                      <SelectItem key={size} value={size}>
                        {t(`pageSize.${size}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription id="export-page-size-note">
                {t("pageSizeNote")}
              </FieldDescription>
            </FieldContent>
          </Field>
        )}

        {showRollWidth && (
          <Field>
            <FieldLabel htmlFor="export-roll-width">
              {t("rollWidthLabel")}
            </FieldLabel>
            <FieldContent>
              <Select
                value={rollWidthCm === null ? "none" : String(rollWidthCm)}
                onValueChange={(v) =>
                  onRollWidthChange(v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger
                  id="export-roll-width"
                  size="sm"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">
                      {t("rollWidthNoneOption")}
                    </SelectItem>
                    {ROLL_WIDTH_PRESETS_CM.map((w) => (
                      <SelectItem key={w} value={String(w)}>
                        {ROLL_WIDTH_LABELS[w] ?? `${formatCm(w)} cm`}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                id="export-roll-width-custom"
                type="number"
                min={20}
                max={500}
                className="mt-2"
                placeholder={t("rollWidthCustomPlaceholder")}
                aria-label={t("rollWidthCustomLabel")}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (e.target.value !== "" && Number.isFinite(n) && n > 0) {
                    onRollWidthChange(n);
                  }
                }}
              />
              <FieldDescription id="export-roll-width-note">
                {t("rollWidthNote")}
              </FieldDescription>
            </FieldContent>
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="export-seam">
            {t("seamAllowanceLabel")}
          </FieldLabel>
          <FieldContent>
            <Select value="included" disabled>
              <SelectTrigger
                id="export-seam"
                size="sm"
                className="w-full"
                title={t("seamAllowanceDisabledTitle")}
                aria-describedby="export-seam-note"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="included">
                  {t("seamAllowanceIncludedOption", {
                    cm: formatCm(seamAllowanceCm),
                  })}
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription id="export-seam-note">
              {t("seamAllowanceDisabledTitle")}
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="export-marks">{t("marksLabel")}</FieldLabel>
          <FieldContent>
            <Select value="include" disabled>
              <SelectTrigger
                id="export-marks"
                size="sm"
                className="w-full"
                title={t("marksDisabledTitle")}
                aria-describedby="export-marks-note"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="include">
                  {t("marksIncludeOption")}
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription id="export-marks-note">
              {t("marksDisabledTitle")}
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="export-naming">{t("namingLabel")}</FieldLabel>
          <FieldContent>
            <Select value="moldai" disabled>
              <SelectTrigger
                id="export-naming"
                size="sm"
                className="w-full"
                title={t("namingDisabledTitle")}
                aria-describedby="export-naming-note"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="moldai">
                  {t("namingMoldaiOption")}
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription id="export-naming-note">
              {t("namingDisabledTitle")}
            </FieldDescription>
          </FieldContent>
        </Field>
      </div>
    </div>
  );
}
