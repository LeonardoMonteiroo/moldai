"use client";

import { useState } from "react";
import { InfoIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";
import { resolveSizeChartSize } from "@/lib/sizeCharts/compute";
import { MAX_SIZE_CHART_SIZES } from "@/lib/sizeCharts/validate";
import {
  MEASUREMENT_KEYS,
  MEASUREMENT_RANGES,
  type Measurements,
} from "@/lib/measurements";
import { BODY_TYPES, type BodyType } from "@/lib/types";
import { formatCm } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RANGE_HINT_ID = "size-chart-range-hint";
const BODY_TYPE_NOTE_ID = "size-chart-body-type-note";

export function SizeChartTable() {
  const t = useTranslations("SizeChartTable");
  const draft = useSizeChartsStore((s) => s.draft);
  const editingRule = useSizeChartsStore((s) => s.editingRule);
  const dirty = useSizeChartsStore((s) => s.dirty);
  const saving = useSizeChartsStore((s) => s.saving);
  const selectedId = useSizeChartsStore((s) => s.selectedId);
  const charts = useSizeChartsStore((s) => s.charts);
  const updateDraft = useSizeChartsStore((s) => s.updateDraft);
  const setEditingRule = useSizeChartsStore((s) => s.setEditingRule);
  const save = useSizeChartsStore((s) => s.save);
  const duplicate = useSizeChartsStore((s) => s.duplicate);
  const remove = useSizeChartsStore((s) => s.remove);
  const activate = useSizeChartsStore((s) => s.activate);
  const [addingSize, setAddingSize] = useState(false);
  const [newSize, setNewSize] = useState("");
  // Lifted out of the cells so the message can sit under the table rather than
  // being squeezed into a 56px column.
  const [invalidHint, setInvalidHint] = useState<{
    min: number;
    max: number;
  } | null>(null);

  if (!draft || !selectedId) return null;
  const isActive = charts.find((c) => c.id === selectedId)?.isActive ?? false;
  const readOnly = draft.isSystem;

  const setCell = (size: string, key: keyof Measurements, value: number) => {
    if (size === draft.sizes[draft.baseSizeIndex]) {
      updateDraft({
        baseMeasurements: { ...draft.baseMeasurements, [key]: value },
      });
      return;
    }
    const overrides = { ...draft.overrides };
    overrides[size] = { ...overrides[size], [key]: value };
    updateDraft({ overrides });
  };

  const clearOverride = (size: string, key: keyof Measurements) => {
    const overrides = { ...draft.overrides };
    const row = { ...overrides[size] };
    delete row[key];
    if (Object.keys(row).length === 0) delete overrides[size];
    else overrides[size] = row;
    updateDraft({ overrides });
  };

  const setRule = (key: keyof Measurements, value: number) => {
    updateDraft({
      progressionRule: { ...draft.progressionRule, [key]: value },
    });
  };

  const atSizeCap = draft.sizes.length >= MAX_SIZE_CHART_SIZES;

  const addSize = () => {
    const label = newSize.trim();
    setAddingSize(false);
    if (!label || draft.sizes.includes(label) || atSizeCap) return;
    updateDraft({ sizes: [...draft.sizes, label] });
  };

  const removeSize = (size: string) => {
    if (draft.sizes.length <= 1) return;
    const idx = draft.sizes.indexOf(size);
    const sizes = draft.sizes.filter((s) => s !== size);
    const overrides = { ...draft.overrides };
    delete overrides[size];
    const baseSizeIndex =
      idx < draft.baseSizeIndex
        ? draft.baseSizeIndex - 1
        : Math.min(draft.baseSizeIndex, sizes.length - 1);
    updateDraft({ sizes, overrides, baseSizeIndex });
  };

  return (
    // min-w-0: this sits in a flex row (at `lg` and up) beside
    // SizeChartLibrary -- without it, the flex item refuses to shrink below
    // the table's own min-content width, and the *row* overflows horizontally
    // instead of the table's own overflow-x-auto container ever engaging.
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-[10px]">
        {readOnly ? (
          <span className="font-display text-body font-semibold">
            {draft.name}
          </span>
        ) : (
          <Input
            value={draft.name}
            onChange={(event) => updateDraft({ name: event.target.value })}
            className="font-display text-body h-auto w-auto py-1 font-semibold"
          />
        )}
        {/* State badge: only the two cases the design shows a label for --
            never claims "grade ativa" for every editable chart the way the
            design's own single-editable-chart demo data does. */}
        {readOnly ? (
          <Badge variant="muted">{t("systemChartBadge")}</Badge>
        ) : (
          isActive && <Badge variant="olive">{t("activeSizeChartNote")}</Badge>
        )}
        <div className="flex-1" />
        {!readOnly && (
          <Button
            variant={editingRule ? "soft" : "outline"}
            size="chrome"
            onClick={() => setEditingRule(!editingRule)}
          >
            {editingRule ? t("doneEditingRuleButton") : t("editRuleButton")}
          </Button>
        )}
        <Button
          variant="outline"
          size="chrome"
          onClick={() => duplicate(selectedId)}
        >
          {t("duplicateButton")}
        </Button>
        {!readOnly && (
          <Button
            variant="destructiveOutline"
            size="chrome"
            onClick={() => remove(selectedId)}
          >
            {t("deleteButton")}
          </Button>
        )}
        {readOnly && !isActive && (
          <Button size="chrome" onClick={() => activate(selectedId)}>
            {t("useSizeChartButton")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 gap-y-[8px]">
        <Select
          value={draft.bodyType}
          disabled={readOnly}
          onValueChange={(value) =>
            updateDraft({ bodyType: value as BodyType })
          }
        >
          {/* #133: bodyType is documented (CLAUDE.md) as descriptive metadata
              that never affects the drafted geometry -- the control has to
              say so on screen, not just document it, or a user reasonably
              assumes changing "reto"/"ampulheta" reshapes the pattern. */}
          <SelectTrigger
            size="sm"
            className="w-[170px]"
            title={t("bodyTypeNote")}
            aria-describedby={BODY_TYPE_NOTE_ID}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {BODY_TYPES.map((bt) => (
                <SelectItem key={bt} value={bt}>
                  {t(`bodyType.${bt}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span id={BODY_TYPE_NOTE_ID} className="text-muted text-meta">
          {t("bodyTypeNote")}
        </span>
        <div className="flex-1" />
        {readOnly && (
          <span className="text-muted text-meta">
            {t("systemReadOnlyNote")}
          </span>
        )}
        {!readOnly && (
          <span className="text-muted text-meta flex items-center gap-[6px]">
            <span className="bg-olive size-[5px] rounded-full" />
            {t("overrideLegend")}
          </span>
        )}
      </div>

      <div className="border-border rounded-card bg-surface overflow-x-auto border">
        <div className="bg-surface-alt border-border text-muted text-meta tracking-eyebrow flex border-b px-[14px] py-[10px] font-semibold uppercase">
          <span className="flex-[2]">{t("measurementColumnLabel")}</span>
          {editingRule ? (
            // #49: the body swaps every size column for a single rule input
            // per row -- the header has to follow, or the columns it still
            // shows (with live remove buttons) no longer match the cells
            // underneath them.
            <span className="text-muted flex-1 text-right font-normal tracking-normal normal-case">
              {t("ruleHint")}
            </span>
          ) : (
            draft.sizes.map((size, idx) => {
              const isBaseColumn = idx === draft.baseSizeIndex;
              return (
                <span
                  key={size}
                  className="flex flex-1 items-center justify-end gap-1"
                >
                  {size}
                  {!readOnly &&
                    draft.sizes.length > 1 &&
                    (isBaseColumn ? (
                      // #47: the base column is what baseMeasurements describes
                      // -- removing it has nowhere to re-anchor to without an
                      // explicit base reassignment, which this table doesn't
                      // offer, so it stays visible but disabled rather than
                      // silently shifting the base onto a neighbouring column.
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("removeBaseSizeTitle")}
                        title={t("removeBaseSizeTitle")}
                        disabled
                        className="text-placeholder"
                      >
                        <XIcon />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("removeSizeTitle")}
                        onClick={() => removeSize(size)}
                        className="text-placeholder hover:text-alert"
                      >
                        <XIcon />
                      </Button>
                    ))}
                </span>
              );
            })
          )}
        </div>
        {MEASUREMENT_KEYS.map((key, i) => (
          <div
            key={key}
            className={[
              "text-ui flex items-center px-[14px] py-[9px]",
              i < MEASUREMENT_KEYS.length - 1 ? "border-line border-b" : "",
            ].join(" ")}
          >
            <span className="text-muted flex flex-[2] items-center gap-1">
              {t(`measurement.${key}`)}
              {/* #132: a guided definition — where to put the tape — for
                  every measurement row, reachable right where the row lives
                  rather than only documented elsewhere. Popover (not a
                  hover-only `title`) so it's reachable by keyboard/touch
                  too, not just a mouse hover. */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("measurementGuideLabel", {
                      name: t(`measurement.${key}`),
                    })}
                    className="text-placeholder hover:text-muted"
                  >
                    <InfoIcon />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="right" className="text-ui w-64">
                  {t(`measurementGuide.${key}`)}
                </PopoverContent>
              </Popover>
            </span>
            {editingRule ? (
              <input
                type="number"
                step="0.1"
                value={draft.progressionRule[key] ?? 0}
                onChange={(e) => setRule(key, Number(e.target.value))}
                aria-label={t(`measurement.${key}`)}
                className="border-border rounded-btn text-ui ml-auto w-[70px] border px-2 py-1 text-right"
              />
            ) : (
              draft.sizes.map((size, idx) => {
                const isBase = idx === draft.baseSizeIndex;
                const overridden = draft.overrides[size]?.[key] !== undefined;
                const value = resolveSizeChartSize(draft, size)[key];
                return (
                  <span
                    key={size}
                    className="flex flex-1 items-center justify-end gap-1"
                  >
                    {overridden && !isBase && !readOnly && (
                      // The dot stays 5px, but a 5x5 hit target fails WCAG 2.2
                      // AA 2.5.8 (24x24 minimum), so the button around it is
                      // full size and the dot is what you see.
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("resetOverrideTitle")}
                        onClick={() => clearOverride(size, key)}
                        className="hover:bg-transparent"
                      >
                        <span className="bg-olive size-[5px] rounded-full" />
                      </Button>
                    )}
                    <MeasurementCell
                      value={value}
                      min={MEASUREMENT_RANGES[key].min}
                      max={MEASUREMENT_RANGES[key].max}
                      disabled={readOnly}
                      onCommit={(next) => setCell(size, key, next)}
                      onInvalid={setInvalidHint}
                      ariaLabel={`${t(`measurement.${key}`)} · ${size}`}
                      describedBy={RANGE_HINT_ID}
                      className={
                        isBase
                          ? "border-olive-border bg-olive-tint font-semibold"
                          : "border-transparent bg-transparent"
                      }
                    />
                  </span>
                );
              })
            )}
          </div>
        ))}
      </div>

      {/* Says what the allowed range is, at the moment a value leaves it —
          the old behaviour was to clamp silently and show a different number
          than the one that was typed. Stable id so the invalid cell's
          aria-describedby can point at it -- aria-invalid alone told a
          screen-reader user "invalid" with no way to reach the accepted
          range, which lives in this separate, unlinked region. */}
      {invalidHint && (
        <span id={RANGE_HINT_ID} role="status" className="text-alert text-meta">
          {t("rangeHint", { min: invalidHint.min, max: invalidHint.max })}
        </span>
      )}

      {!readOnly && (
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="outline"
            size="chrome"
            onClick={() => {
              setNewSize("");
              setAddingSize(true);
            }}
            disabled={atSizeCap}
            className="self-start"
          >
            {t("addSizeButton")}
          </Button>
          {atSizeCap && (
            <span className="text-muted text-meta">
              {t("maxSizesReachedHint", { max: MAX_SIZE_CHART_SIZES })}
            </span>
          )}
        </div>
      )}

      <Dialog open={addingSize} onOpenChange={setAddingSize}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              addSize();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("addSizePrompt")}</DialogTitle>
            </DialogHeader>
            <Field className="py-4">
              <FieldLabel htmlFor="new-size">
                {t("addSizeFieldLabel")}
              </FieldLabel>
              <Input
                id="new-size"
                value={newSize}
                onChange={(event) => setNewSize(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddingSize(false)}
              >
                {t("addSizeCancelButton")}
              </Button>
              <Button type="submit" size="sm" disabled={!newSize.trim()}>
                {t("addSizeSaveButton")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="border-border rounded-card bg-surface flex-1 border p-[14px]">
          <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
            {t("progressionTitle")}
          </span>
          <div className="mt-2 flex flex-col gap-[6px]">
            {MEASUREMENT_KEYS.filter((k) => draft.progressionRule[k]).map(
              (key) => (
                <div key={key} className="text-ui flex justify-between">
                  <span className="text-muted">{t(`measurement.${key}`)}</span>
                  <span className="font-semibold">
                    {formatCm(draft.progressionRule[key] ?? 0)} cm
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
        <div className="flex flex-col justify-end gap-2 sm:w-[220px]">
          {dirty && !readOnly && (
            <Button variant="accent" disabled={saving} onClick={() => save()}>
              {saving ? t("saveButtonSaving") : t("saveButton")}
            </Button>
          )}
          <Button disabled={isActive} onClick={() => activate(selectedId)}>
            {isActive ? t("activeSizeChartNote") : t("useSizeChartButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * One measurement cell.
 *
 * It holds the text you are typing in local state instead of writing every
 * keystroke into the chart. That indirection is the whole point: the displayed
 * value used to come from resolveSizeChartSize, which clamps to
 * MEASUREMENT_RANGES, so each keystroke was written, clamped, and fed back into
 * the input — clearing the bust cell and typing "96" actually produced 1406,
 * and `Number("")` being 0 meant clearing a cell silently rewrote it to the
 * range minimum.
 *
 * So: what you type is what you see; an out-of-range or empty value is flagged
 * rather than substituted; and nothing reaches the chart until the edit is
 * both finished and valid.
 */
function MeasurementCell({
  value,
  min,
  max,
  disabled,
  onCommit,
  onInvalid,
  className,
  ariaLabel,
  describedBy,
}: {
  // #132: undefined for an EXTENDED field a chart never set -- a legacy
  // custom chart, or a system chart from before this shipped. Shown as a
  // blank cell (the drafter's own fallback proportion still applies at
  // draft time; this cell is just silent about the exact number), not
  // substituted with 0 or a stale value.
  value: number | undefined;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
  onInvalid: (hint: { min: number; max: number } | null) => void;
  className?: string;
  ariaLabel: string;
  describedBy?: string;
}) {
  // null means "not editing" — show the stored value.
  const [editing, setEditing] = useState<string | null>(null);
  // While editing, Number(editing) is always a `number` (never undefined) --
  // only the not-editing branch can be undefined (an EXTENDED field the
  // chart never set). `invalid` only ever evaluates the editing branch (it's
  // gated on `editing !== null`), so the `parsed === undefined` arm below is
  // unreachable in practice; it exists to satisfy that at the type level too.
  const parsed = editing === null ? value : Number(editing);
  const invalid =
    editing !== null &&
    (editing.trim() === "" ||
      parsed === undefined ||
      !Number.isFinite(parsed) ||
      parsed < min ||
      parsed > max);

  const finish = () => {
    if (editing !== null && !invalid && parsed !== undefined) onCommit(parsed);
    setEditing(null);
    onInvalid(null);
  };

  return (
    <input
      type="number"
      step="0.1"
      min={min}
      max={max}
      value={editing ?? value ?? ""}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      aria-label={ariaLabel}
      aria-describedby={invalid ? describedBy : undefined}
      onChange={(e) => {
        setEditing(e.target.value);
        const next = Number(e.target.value);
        const bad =
          e.target.value.trim() === "" ||
          !Number.isFinite(next) ||
          next < min ||
          next > max;
        onInvalid(bad ? { min, max } : null);
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish();
        if (e.key === "Escape") {
          setEditing(null);
          onInvalid(null);
        }
      }}
      className={[
        "text-ui w-[56px] rounded-[6px] border px-1 py-[3px] text-right",
        "aria-invalid:border-alert aria-invalid:text-alert",
        className ?? "",
      ].join(" ")}
    />
  );
}
