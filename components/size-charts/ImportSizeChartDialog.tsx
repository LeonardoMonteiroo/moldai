"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";
import { parseSizeChartFile, type ImportResult } from "@/lib/sizeCharts/import";
import { resolveSizeChartSize } from "@/lib/sizeCharts/compute";
import { MAX_SIZE_CHART_NAME } from "@/lib/sizeCharts/validate";
import { MEASUREMENT_KEYS } from "@/lib/measurements";
import { formatCm } from "@/lib/format";
import {
  BODY_TYPES,
  type BodyType,
  type Gender,
  type SizeChartData,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

const GENDERS: Gender[] = ["female", "male"];
const FILE_ACCEPT = ".csv,.tsv,.tab,text/csv,text/tab-separated-values";

/**
 * #12: replaces the inert dashed "Importar planilha ou tabela de medidas do
 * Audaces" placeholder (SizeChartLibrary.tsx) with a real control. Parses a
 * .csv/.tsv file entirely client-side (lib/sizeCharts/import.ts), shows a
 * preview of exactly what will be created -- including every rejected cell
 * and its reason -- and only persists once the user confirms. The server
 * re-validates everything through validateSizeChartPatch regardless
 * (lib/db/sizeChart.ts's createSizeChartFromImport); this dialog is a review
 * step, not the trust boundary.
 *
 * Deliberately .csv/.tsv only -- no .xlsx. See lib/sizeCharts/import.ts's
 * header comment and the PR body for why, and `formatNote` below for how
 * that's surfaced on screen before a file is even picked, per CLAUDE.md's
 * "surface feature limitations on-screen, never silently" rule.
 */
export function ImportSizeChartDialog() {
  const t = useTranslations("SizeChartImport");
  const tMeasurement = useTranslations("SizeChartTable");
  const importChart = useSizeChartsStore((s) => s.importChart);

  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const [bodyType, setBodyType] = useState<BodyType>("straight");
  const [chartName, setChartName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setFileText(null);
    setFileName("");
    setGender("female");
    setBodyType("straight");
    setChartName("");
    setResult(null);
    setSubmitting(false);
  }

  async function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const text = await file.text();
    setFileText(text);
    setFileName(file.name);
    setBodyType("straight");
    const res = parseSizeChartFile(text, file.name, gender);
    setResult(res);
    setChartName(
      "chart" in res && res.chart.name ? res.chart.name : t("defaultName"),
    );
  }

  function onGenderChange(nextGender: Gender) {
    setGender(nextGender);
    if (!fileText) return;
    const baseSizeIndex =
      result && "chart" in result ? result.chart.baseSizeIndex : undefined;
    setResult(
      parseSizeChartFile(fileText, fileName, nextGender, baseSizeIndex),
    );
  }

  function onBaseSizeChange(baseSizeIndex: number) {
    if (!fileText) return;
    setResult(parseSizeChartFile(fileText, fileName, gender, baseSizeIndex));
  }

  async function handleCreate() {
    if (!result || "error" in result) return;
    const name =
      chartName.trim().slice(0, MAX_SIZE_CHART_NAME) || t("defaultName");
    const chart: SizeChartData = { ...result.chart, name, bodyType };
    setSubmitting(true);
    const created = await importChart(chart);
    setSubmitting(false);
    if (created) {
      setOpen(false);
      reset();
    }
  }

  const success = result && "chart" in result ? result : null;
  const errorCode = result && "error" in result ? result.error : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border rounded-card bg-paper text-muted text-ui hover:bg-surface-alt border border-dashed p-3 text-left leading-relaxed transition-colors"
      >
        {t("trigger")}
      </button>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <span className="text-muted text-meta">{t("formatNote")}</span>

          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT}
            className="hidden"
            onChange={onFileChosen}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="chrome"
              onClick={() => fileInputRef.current?.click()}
            >
              {fileName ? t("chooseAnotherFile") : t("chooseFileButton")}
            </Button>
            <span className="text-ui truncate">
              {fileName || t("noFileChosen")}
            </span>
          </div>

          {errorCode && (
            <span role="alert" className="text-alert text-ui">
              {t(`errors.${errorCode}`)}
            </span>
          )}

          {success && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <Field className="min-w-[180px] flex-1">
                  <FieldLabel htmlFor="import-chart-name">
                    {t("nameFieldLabel")}
                  </FieldLabel>
                  <Input
                    id="import-chart-name"
                    value={chartName}
                    maxLength={MAX_SIZE_CHART_NAME}
                    onChange={(event) => setChartName(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="import-gender">
                    {t("genderFieldLabel")}
                  </FieldLabel>
                  <Select
                    value={gender}
                    onValueChange={(v) => onGenderChange(v as Gender)}
                  >
                    <SelectTrigger
                      id="import-gender"
                      size="sm"
                      className="w-[130px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {GENDERS.map((g) => (
                          <SelectItem key={g} value={g}>
                            {t(`gender.${g}`)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="import-body-type">
                    {t("bodyTypeFieldLabel")}
                  </FieldLabel>
                  <Select
                    value={bodyType}
                    onValueChange={(v) => setBodyType(v as BodyType)}
                  >
                    <SelectTrigger
                      id="import-body-type"
                      size="sm"
                      className="w-[150px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {BODY_TYPES.map((bt) => (
                          <SelectItem key={bt} value={bt}>
                            {tMeasurement(`bodyType.${bt}`)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="import-base-size">
                    {t("baseSizeFieldLabel")}
                  </FieldLabel>
                  <Select
                    value={String(success.chart.baseSizeIndex)}
                    onValueChange={(v) => onBaseSizeChange(Number(v))}
                  >
                    <SelectTrigger
                      id="import-base-size"
                      size="sm"
                      className="w-[100px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {success.chart.sizes.map((size, idx) => (
                          <SelectItem key={size} value={String(idx)}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <span className="text-muted text-meta">
                {t("sizesFoundLabel")}: {success.chart.sizes.join(", ")}
              </span>

              <span className="text-muted-2 text-meta tracking-eyebrow font-semibold uppercase">
                {t("previewTitle")}
              </span>
              <ScrollArea className="border-border rounded-card max-h-[220px] border">
                <div className="min-w-[420px]">
                  <div className="bg-surface-alt border-border text-muted text-meta tracking-eyebrow flex border-b px-[10px] py-[6px] font-semibold uppercase">
                    <span className="flex-[2]">
                      {t("measurementColumnLabel")}
                    </span>
                    {success.chart.sizes.map((size) => (
                      <span key={size} className="flex-1 text-right">
                        {size}
                      </span>
                    ))}
                  </div>
                  {MEASUREMENT_KEYS.map((key, i) => (
                    <div
                      key={key}
                      className={[
                        "text-ui flex px-[10px] py-[6px]",
                        i < MEASUREMENT_KEYS.length - 1
                          ? "border-line border-b"
                          : "",
                      ].join(" ")}
                    >
                      <span className="text-muted flex-[2]">
                        {tMeasurement(`measurement.${key}`)}
                      </span>
                      {success.chart.sizes.map((size) => (
                        <span key={size} className="flex-1 text-right">
                          {formatCm(
                            resolveSizeChartSize(success.chart, size)[key],
                          )}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {success.warnings.length > 0 && (
                <>
                  <span className="text-muted-2 text-meta tracking-eyebrow font-semibold uppercase">
                    {t("warningsTitle")}
                  </span>
                  <ScrollArea className="max-h-[120px]">
                    <ul className="flex flex-col gap-1">
                      {success.warnings.map((w, idx) => (
                        <li key={idx} className="text-amber-text text-meta">
                          {t(`warnings.${w.code}`, {
                            detail:
                              w.code === "unmapped_column"
                                ? w.detail
                                : tMeasurement(`measurement.${w.detail}`),
                            size: w.size ?? "",
                          })}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
          >
            {t("cancelButton")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!success || submitting}
            onClick={handleCreate}
          >
            {submitting ? t("creatingButton") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
