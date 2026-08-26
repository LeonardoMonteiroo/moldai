"use client";

import { useTranslations } from "next-intl";
import type { Pattern } from "@/lib/types";
import { formatCm } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";

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
}: {
  pattern: Pattern;
  selectedSize: string;
  onSizeChange: (size: string) => void;
}) {
  const t = useTranslations("Export");
  const otherSizes = pattern.sizesApplied.filter((s) => s !== pattern.baseSize);
  const hasOtherSizes = otherSizes.length > 0;
  const seamAllowanceCm = pattern.spec?.style.seamAllowanceCm ?? 1;

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
