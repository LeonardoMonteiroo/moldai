"use client";

import { useTranslations } from "next-intl";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";
import { resolveSizeChartSize } from "@/lib/sizeCharts/compute";
import type { Measurements } from "@/lib/measurements";
import type { BodyType } from "@/lib/types";

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
    const label = window.prompt(t("addSizePrompt"))?.trim();
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
          <input
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            className="font-display border-border rounded-btn border px-2 py-1 text-[16px] font-semibold"
          />
        )}
        <select
          value={draft.bodyType}
          disabled={readOnly}
          onChange={(e) =>
            updateDraft({ bodyType: e.target.value as BodyType })
          }
          className="border-border rounded-pill bg-surface border px-[10px] py-[5px] text-[11.5px] disabled:opacity-60"
        >
          {BODY_TYPES.map((bt) => (
            <option key={bt} value={bt}>
              {t(`bodyType.${bt}`)}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        {!readOnly && (
          <button
            type="button"
            onClick={() => setEditingRule(!editingRule)}
            className="border-border rounded-btn bg-surface hover:bg-surface-alt border px-[11px] py-[6px] text-[12px]"
          >
            {editingRule ? t("doneEditingRuleButton") : t("editRuleButton")}
          </button>
        )}
        <button
          type="button"
          onClick={() => duplicate(selectedId)}
          className="border-border rounded-btn bg-surface hover:bg-surface-alt border px-[11px] py-[6px] text-[12px]"
        >
          {t("duplicateButton")}
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={() => remove(selectedId)}
            className="border-border rounded-btn bg-surface hover:bg-surface-alt text-alert border px-[11px] py-[6px] text-[12px]"
          >
            {t("deleteButton")}
          </button>
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
                <button
                  type="button"
                  title={t("removeSizeTitle")}
                  onClick={() => removeSize(size)}
                  className="text-placeholder hover:text-alert text-[10px]"
                >
                  ✕
                </button>
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
                      <button
                        type="button"
                        title={t("resetOverrideTitle")}
                        onClick={() => clearOverride(size, key)}
                        className="bg-olive h-[5px] w-[5px] rounded-full"
                      />
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
        <button
          type="button"
          onClick={addSize}
          className="border-border rounded-btn bg-surface hover:bg-surface-alt self-start border px-[11px] py-[6px] text-[12px]"
        >
          {t("addSizeButton")}
        </button>
      )}

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
            <button
              type="button"
              onClick={() => save()}
              className="border-olive text-olive bg-olive-tint rounded-btn border py-[9px] text-center text-[12.5px] font-semibold"
            >
              {t("saveButton")}
            </button>
          )}
          <button
            type="button"
            disabled={isActive}
            onClick={() => activate(selectedId)}
            className="bg-olive rounded-btn py-[9px] text-center text-[12.5px] font-semibold text-white transition-[filter] hover:brightness-[0.95] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isActive ? t("activeSizeChartNote") : t("useSizeChartButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
