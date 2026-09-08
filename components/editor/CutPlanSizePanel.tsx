"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  MAX_CUT_QUANTITY_PER_SIZE,
  type Pattern,
  type SizeLabel,
} from "@/lib/types";
import {
  FABRIC_WIDTHS_CM,
  NESTING_MODES,
  type NestingMode,
} from "@/lib/export/cutplan";
import { useEditorStore } from "@/lib/store";
import { meters } from "./CutPlanTab";

const MIN_FABRIC_WIDTH_CM = 90;
const MAX_FABRIC_WIDTH_CM = 200;
const FABRIC_WIDTH_STEP_CM = 5;

function clampQty(n: number): number {
  return Math.min(MAX_CUT_QUANTITY_PER_SIZE, Math.max(0, Math.round(n)));
}

function clampFabricWidth(n: number): number {
  return Math.min(
    MAX_FABRIC_WIDTH_CM,
    Math.max(MIN_FABRIC_WIDTH_CM, Math.round(n)),
  );
}

// #280: the mockup's right-side panel (docs/design/screens/Editor.dc.html:
// 373-436), rebuilt with the app's own components/tokens rather than its raw
// markup -- three sections (Tecido / Quantidade por tamanho / Encaixe)
// stacked in a 250px column. The mockup's own third section is an editable
// "Peças" list behind an "Otimizar corte" button; this repo has no arbitrary-
// rectangle or batch-optimize capability to back either (see
// docs/decisions/design-handoff.md), so the real auto/manual nesting toggle
// takes that slot instead -- a real control in the same position, not a
// decorative stand-in.
export function CutPlanSizePanel({
  pattern,
  nestingMode,
  onModeChange,
  onResetManual,
}: {
  pattern: Pattern;
  nestingMode: NestingMode;
  onModeChange: (mode: string) => void;
  onResetManual: () => void;
}) {
  const t = useTranslations("CutPlanTab");
  const setCutQuantity = useEditorStore((s) => s.setCutQuantity);
  const fabricWidthCm = useEditorStore((s) => s.cutFabricWidthCm);
  const setFabricWidthCm = useEditorStore((s) => s.setCutFabricWidth);

  const sizes: SizeLabel[] = Array.from(
    new Set([pattern.baseSize, ...pattern.sizesApplied]),
  );
  const quantities = pattern.cutQuantities;

  // #280: a pattern that has never touched this panel (`cutQuantities`
  // undefined) is, RIGHT NOW, nesting baseSize at quantity 1 -- the same
  // default planCutLayout's own cutInstancesForQuantities falls back to.
  // The rows have to show that, not all-zero, or the preview would show
  // real pieces while every stepper here reads 0. Once `cutQuantities` is
  // defined (the user touched any row), it's the sole source of truth -- a
  // size missing from it really is 0, baseSize included.
  function displayQty(size: SizeLabel): number {
    if (quantities) return quantities[size] ?? 0;
    return size === pattern.baseSize ? 1 : 0;
  }

  const garmentsProduced = sizes.reduce((sum, s) => sum + displayQty(s), 0);

  return (
    <aside className="border-border bg-surface flex w-[250px] shrink-0 flex-col gap-[14px] overflow-y-auto border p-[14px]">
      <section className="flex flex-col gap-2">
        <span className="text-muted text-tick tracking-eyebrow font-semibold uppercase">
          {t("fabricSectionLabel")}
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={String(fabricWidthCm)}
          aria-label={t("fabricWidthLabel")}
          onValueChange={(value) => {
            if (value) setFabricWidthCm(Number(value));
          }}
        >
          {FABRIC_WIDTHS_CM.map((w) => (
            <ToggleGroupItem key={w} value={String(w)} className="px-2">
              {meters(w)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="icon-xs"
            aria-label={t("decreaseFabricWidthAriaLabel")}
            title={t("decreaseFabricWidthAriaLabel")}
            onClick={() =>
              setFabricWidthCm(
                clampFabricWidth(fabricWidthCm - FABRIC_WIDTH_STEP_CM),
              )
            }
          >
            <MinusIcon />
          </Button>
          <span className="text-ui tabular-nums">
            {t("fabricWidthStepLabel", { cm: fabricWidthCm })}
          </span>
          <Button
            variant="outline"
            size="icon-xs"
            aria-label={t("increaseFabricWidthAriaLabel")}
            title={t("increaseFabricWidthAriaLabel")}
            onClick={() =>
              setFabricWidthCm(
                clampFabricWidth(fabricWidthCm + FABRIC_WIDTH_STEP_CM),
              )
            }
          >
            <PlusIcon />
          </Button>
        </div>
      </section>

      <div className="bg-line h-px" />

      <section className="flex flex-col gap-2">
        <span className="text-muted text-tick tracking-eyebrow font-semibold uppercase">
          {t("quantityPanelTitle")}
        </span>
        <div className="grid grid-cols-4 gap-1">
          {sizes.map((size) => (
            <SizeQuantityCell
              key={size}
              size={size}
              qty={displayQty(size)}
              onCommit={(qty) => setCutQuantity(size, qty)}
            />
          ))}
        </div>
        <span className="text-muted-2 text-tick">
          {t("garmentsProducedLabel", { count: garmentsProduced })}
        </span>
      </section>

      <div className="bg-line h-px" />

      <section className="flex flex-col gap-2">
        <span className="text-muted text-tick tracking-eyebrow font-semibold uppercase">
          {t("modeLabel")}
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={nestingMode}
          aria-label={t("modeLabel")}
          onValueChange={onModeChange}
        >
          {NESTING_MODES.map((m) => (
            <ToggleGroupItem key={m} value={m} className="flex-1 px-2">
              {t(`mode.${m}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {nestingMode === "manual" && (
          <div className="flex flex-col gap-2">
            <p className="text-muted text-tick leading-snug">
              {t("manualHint")}
            </p>
            <Button
              variant="outline"
              size="chrome"
              className="w-full"
              onClick={onResetManual}
            >
              {t("resetManual")}
            </Button>
          </div>
        )}
      </section>
    </aside>
  );
}

// Same commit-on-blur/Enter shape as SizeChartTable.tsx's editable numeric
// cell -- the `−`/`+` buttons commit immediately (a click IS the intended
// value, not a typed draft), while the number field buffers a local edit
// and only calls onCommit on blur/Enter, per the "a control must not
// rewrite what you typed" non-negotiable. Laid out as a compact column
// (size label over a mini stepper) instead of a full-width row, matching
// the mockup's 4-column grid (Editor.dc.html:392-403).
function SizeQuantityCell({
  size,
  qty,
  onCommit,
}: {
  size: SizeLabel;
  qty: number;
  onCommit: (qty: number) => void;
}) {
  const t = useTranslations("CutPlanTab");
  const [editing, setEditing] = useState<string | null>(null);

  function finish() {
    if (editing !== null) {
      const parsed = Number(editing);
      onCommit(Number.isFinite(parsed) ? clampQty(parsed) : qty);
    }
    setEditing(null);
  }

  return (
    <div className="border-border flex min-w-0 flex-col items-center gap-[3px] rounded-[6px] border py-[5px]">
      <span className="text-muted text-tick font-semibold">{size}</span>
      <div className="flex items-center gap-[2px]">
        <button
          type="button"
          aria-label={t("decreaseQuantityAriaLabel", { size })}
          title={t("decreaseQuantityAriaLabel", { size })}
          disabled={qty <= 0}
          onClick={() => onCommit(clampQty(qty - 1))}
          className="bg-surface-alt text-meta flex size-[15px] shrink-0 items-center justify-center rounded-[4px] leading-none disabled:opacity-50"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_CUT_QUANTITY_PER_SIZE}
          value={editing ?? String(qty)}
          aria-label={t("quantityForSizeAriaLabel", { size })}
          onChange={(e) => setEditing(e.target.value)}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === "Enter") finish();
            if (e.key === "Escape") setEditing(null);
          }}
          className="text-meta w-[20px] shrink-0 [appearance:textfield] border-0 bg-transparent p-0 text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label={t("increaseQuantityAriaLabel", { size })}
          title={t("increaseQuantityAriaLabel", { size })}
          disabled={qty >= MAX_CUT_QUANTITY_PER_SIZE}
          onClick={() => onCommit(clampQty(qty + 1))}
          className="bg-surface-alt text-meta flex size-[15px] shrink-0 items-center justify-center rounded-[4px] leading-none disabled:opacity-50"
        >
          +
        </button>
      </div>
    </div>
  );
}
