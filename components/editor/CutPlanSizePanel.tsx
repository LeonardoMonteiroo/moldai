"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_CUT_QUANTITY_PER_SIZE,
  type Pattern,
  type SizeLabel,
} from "@/lib/types";
import { useEditorStore } from "@/lib/store";
import { meters } from "./CutPlanTab";

function clampQty(n: number): number {
  return Math.min(MAX_CUT_QUANTITY_PER_SIZE, Math.max(0, Math.round(n)));
}

// #280: the "Quantidade por tamanho" panel -- docked at a fixed 250px, the
// mockup's own width (docs/design/screens/Editor.dc.html:373), per
// design-system.md's "a new sidebar-bearing screen sets its own width"
// convention. Deliberately does NOT reproduce the mockup's "Peças" arbitrary-
// rectangle list or "Otimizar corte" button -- neither has a backing
// capability in lib/export/cutplan.ts, and the real auto/manual toggle
// already covers optimization; see docs/decisions/design-handoff.md.
export function CutPlanSizePanel({
  pattern,
  totalInstances,
  totalLengthCm,
}: {
  pattern: Pattern;
  totalInstances: number;
  totalLengthCm: number;
}) {
  const t = useTranslations("CutPlanTab");
  const setCutQuantity = useEditorStore((s) => s.setCutQuantity);

  const sizes: SizeLabel[] = Array.from(
    new Set([pattern.baseSize, ...pattern.sizesApplied]),
  );
  const quantities = pattern.cutQuantities;

  // #280: a pattern that has never touched this panel (`cutQuantities`
  // undefined) is, RIGHT NOW, nesting baseSize at quantity 1 -- the same
  // default planCutLayout's own cutInstancesForQuantities falls back to.
  // The rows have to show that, not all-zero, or the preview below would
  // show real pieces while every stepper here reads 0. Once `cutQuantities`
  // is defined (the user touched any row), it's the sole source of truth --
  // a size missing from it really is 0, baseSize included.
  function displayQty(size: SizeLabel): number {
    if (quantities) return quantities[size] ?? 0;
    return size === pattern.baseSize ? 1 : 0;
  }

  return (
    <aside className="border-border bg-surface flex w-[250px] shrink-0 flex-col gap-3 border-l p-[14px]">
      <span className="text-muted text-tick tracking-eyebrow font-semibold uppercase">
        {t("quantityPanelTitle")}
      </span>

      <div className="flex flex-col gap-2">
        {sizes.map((size) => (
          <SizeQuantityRow
            key={size}
            size={size}
            qty={displayQty(size)}
            onCommit={(qty) => setCutQuantity(size, qty)}
          />
        ))}
      </div>

      <div className="bg-line h-px" />

      <div className="text-ui flex flex-col gap-1">
        <div className="flex justify-between">
          <span className="text-muted">{t("quantityTotalPiecesLabel")}</span>
          <span className="font-medium">{totalInstances}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">{t("quantityTotalFabricLabel")}</span>
          <span className="font-medium">{meters(totalLengthCm)}</span>
        </div>
      </div>
    </aside>
  );
}

// Same commit-on-blur/Enter shape as SizeChartTable.tsx's editable numeric
// cell -- the `−`/`+` buttons commit immediately (a click IS the intended
// value, not a typed draft), while the number field buffers a local edit
// and only calls onCommit on blur/Enter, per the "a control must not
// rewrite what you typed" non-negotiable.
function SizeQuantityRow({
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
    <div className="flex items-center justify-between gap-2">
      <span className="text-ui font-medium">{size}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-xs"
          aria-label={t("decreaseQuantityAriaLabel", { size })}
          title={t("decreaseQuantityAriaLabel", { size })}
          disabled={qty <= 0}
          onClick={() => onCommit(clampQty(qty - 1))}
        >
          <MinusIcon />
        </Button>
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
          className="text-ui border-border w-[40px] rounded-[6px] border px-1 py-[3px] text-center"
        />
        <Button
          variant="outline"
          size="icon-xs"
          aria-label={t("increaseQuantityAriaLabel", { size })}
          title={t("increaseQuantityAriaLabel", { size })}
          disabled={qty >= MAX_CUT_QUANTITY_PER_SIZE}
          onClick={() => onCommit(clampQty(qty + 1))}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  );
}
