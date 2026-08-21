"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";
import { resolveSizeChartSize } from "@/lib/sizeCharts/compute";
import type { Measurements } from "@/lib/measurements";
import type { BodyType } from "@/lib/types";
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

const MEASUREMENT_KEYS: (keyof Measurements)[] = [
  "bust",
  "waist",
  "hip",
  "hipHeight",
  "backLength",
  "shoulder",
  "skirtLength",
  "shortSleeveLength",
  "longSleeveLength",
];

const BODY_TYPES: BodyType[] = ["straight", "hourglass", "pear", "apple"];

export function SizeChartTable() {
  const t = useTranslations("SizeChartTable");
  const draft = useSizeChartsStore((s) => s.draft);
  const editingRule = useSizeChartsStore((s) => s.editingRule);
  const dirty = useSizeChartsStore((s) => s.dirty);
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

  const addSize = () => {
    const label = newSize.trim();
    setAddingSize(false);
    if (!label || draft.sizes.includes(label)) return;
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
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-[10px]">
        {readOnly ? (
          <span className="font-display text-[16px] font-semibold">
            {draft.name}
          </span>
        ) : (
          <Input
            value={draft.name}
            onChange={(event) => updateDraft({ name: event.target.value })}
            className="font-display text-body h-auto w-auto py-1 font-semibold"
          />
        )}
        <Select
          value={draft.bodyType}
          disabled={readOnly}
          onValueChange={(value) =>
            updateDraft({ bodyType: value as BodyType })
          }
        >
          <SelectTrigger size="sm" className="w-[170px]">
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
      </div>

      {readOnly && (
        <span className="text-muted text-[11.5px]">
          {t("systemReadOnlyNote")}
        </span>
      )}

      <div className="border-border rounded-card bg-surface overflow-x-auto border">
        <div className="bg-surface-alt border-border text-muted flex border-b px-[14px] py-[10px] text-[11px] font-semibold tracking-[.6px] uppercase">
          <span className="flex-[2]">{t("measurementColumnLabel")}</span>
          {draft.sizes.map((size) => (
            <span
              key={size}
              className="flex flex-1 items-center justify-end gap-1"
            >
              {size}
              {!readOnly && draft.sizes.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("removeSizeTitle")}
                  onClick={() => removeSize(size)}
                  className="text-placeholder hover:text-alert"
                >
                  <XIcon />
                </Button>
              )}
            </span>
          ))}
        </div>
        {MEASUREMENT_KEYS.map((key, i) => (
          <div
            key={key}
            className={[
              "flex items-center px-[14px] py-[9px] text-[12.5px]",
              i < MEASUREMENT_KEYS.length - 1 ? "border-line border-b" : "",
            ].join(" ")}
          >
            <span className="text-muted flex-[2]">
              {t(`measurement.${key}`)}
            </span>
            {editingRule ? (
              <input
                type="number"
                step="0.1"
                value={draft.progressionRule[key] ?? 0}
                onChange={(e) => setRule(key, Number(e.target.value))}
                className="border-border rounded-btn ml-auto w-[70px] border px-2 py-1 text-right text-[12px]"
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
                    <input
                      type="number"
                      step="0.1"
                      value={value}
                      disabled={readOnly}
                      onChange={(e) =>
                        setCell(size, key, Number(e.target.value))
                      }
                      className={[
                        "w-[56px] rounded-[6px] border px-1 py-[3px] text-right text-[12px]",
                        isBase
                          ? "border-olive-border bg-olive-tint font-semibold"
                          : "border-transparent bg-transparent",
                      ].join(" ")}
                    />
                  </span>
                );
              })
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <Button
          variant="outline"
          size="chrome"
          onClick={() => {
            setNewSize("");
            setAddingSize(true);
          }}
          className="self-start"
        >
          {t("addSizeButton")}
        </Button>
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

      <div className="flex gap-3">
        <div className="border-border rounded-card bg-surface flex-1 border p-[14px]">
          <span className="text-muted text-[11px] font-semibold tracking-[.8px] uppercase">
            {t("progressionTitle")}
          </span>
          <div className="mt-2 flex flex-col gap-[6px]">
            {MEASUREMENT_KEYS.filter((k) => draft.progressionRule[k]).map(
              (key) => (
                <div key={key} className="flex justify-between text-[12.5px]">
                  <span className="text-muted">{t(`measurement.${key}`)}</span>
                  <span className="font-semibold">
                    {draft.progressionRule[key]} cm
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
        <div className="flex w-[220px] flex-col justify-end gap-2">
          {dirty && !readOnly && (
            <Button variant="accent" onClick={() => save()}>
              {t("saveButton")}
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
