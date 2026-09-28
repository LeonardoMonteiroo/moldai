"use client";

import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Pattern } from "@/lib/types";
import { useEditorStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CutPlanPreview } from "./CutPlanPreview";
import { CutPlanSizePanel } from "./CutPlanSizePanel";
import { FLOAT_CHROME } from "./floatChrome";
import { useCutPlan } from "./useCutPlan";

export const meters = (cm: number) =>
  (cm / 100).toFixed(2).replace(".", ",") + " m";
const cmFmt = (cm: number) => cm.toFixed(1).replace(".", ",");

// #280: rebuilt against docs/design/screens/Editor.dc.html:336-436 --
// legend row, then a two-column area (the preview card scrolls on its own;
// the 250px CutPlanSizePanel sits beside it, not below a shared scroller),
// then the mockup's own bottom-left "N peças · consumo estimado X m" pill.
// The 3 metric cards (Consumo/Aproveitamento/Peças no corte) and the
// repeated "Plano de corte" title this tab used to render are gone: the
// design has neither -- the tab bar already names the tab, and its own
// summary is that one pill, which folds consumption and piece count
// together but has no analog for efficiency %.
export function CutPlanTab({ pattern }: { pattern: Pattern }) {
  const t = useTranslations("CutPlanTab");
  const { autoPlan, plan, fabricWidthCm, nestingMode } = useCutPlan(pattern);
  const setNestingMode = useEditorStore((s) => s.setNestingMode);
  const setCutPlacement = useEditorStore((s) => s.setCutPlacement);
  const seedCutPlacements = useEditorStore((s) => s.seedCutPlacements);
  const resetCutPlacements = useEditorStore((s) => s.resetCutPlacements);

  const [announcement, setAnnouncement] = useState("");

  function labelFor(it: { name: string; widthCm: number; heightCm: number }) {
    return t("instanceLabel", {
      name: it.name,
      x: cmFmt(it.widthCm),
      y: cmFmt(it.heightCm),
    });
  }

  function handleModeChange(value: string) {
    if (!value) return;
    if (value === "manual" && autoPlan) {
      const seed: Record<string, { x: number; y: number }> = {};
      for (const it of autoPlan.instances) seed[it.id] = it.originCm;
      seedCutPlacements(seed);
    }
    setNestingMode(value as "auto" | "manual");
  }

  function handleResetManual() {
    resetCutPlacements();
    if (autoPlan) {
      const seed: Record<string, { x: number; y: number }> = {};
      for (const it of autoPlan.instances) seed[it.id] = it.originCm;
      seedCutPlacements(seed);
    }
  }

  function handleMove(id: string, originCm: { x: number; y: number }) {
    setCutPlacement(id, originCm);
  }

  function handleNudgeAnnounce(id: string) {
    const it = plan?.instances.find((i) => i.id === id);
    if (!it) return;
    setAnnouncement(
      t("movedAnnouncement", {
        name: it.name,
        x: cmFmt(it.originCm.x),
        y: cmFmt(it.originCm.y),
      }),
    );
  }

  // #280: `plan` is non-null but has zero instances whenever cutQuantities
  // is DEFINED and every size in it is 0 -- an explicit "nest nothing",
  // distinct from `!plan` (no drafted pieces at all, checked below). The
  // legend and the size panel stay visible either way (the user needs the
  // panel to bring a quantity back up); only the preview card's content
  // swaps for the same empty-state message style as `!plan`.
  const hasInstances = !!plan && plan.instances.length > 0;

  if (!plan) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-[10px] p-[22px]">
        <div className="border-pattern-guide rounded-card bg-surface-alt flex min-h-[200px] flex-1 items-center justify-center border border-dashed">
          <span className="text-muted text-ui">{t("emptyState")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[10px] p-[22px]">
      {/* legenda das cores do plano -- Editor.dc.html's own three swatches
        (Fundo / Tecido / Peça do molde), reusing the exact tokens the
        preview below paints with. */}
      <div className="flex flex-none flex-wrap items-center gap-4">
        <LegendItem
          swatchClassName="border-border bg-surface"
          label={t("legendBackground")}
        />
        <LegendItem
          swatchStyle={{
            background:
              "repeating-linear-gradient(45deg, var(--color-surface), var(--color-surface) 2px, var(--color-border) 2px, var(--color-border) 2.6px)",
          }}
          swatchClassName="border-border"
          label={t("legendFabric")}
        />
        <LegendItem
          swatchClassName="border-olive bg-olive-tint"
          label={t("legendPiece")}
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-[14px]">
        <div className="border-border rounded-card bg-surface relative flex min-w-0 flex-1 flex-col gap-2 overflow-auto border p-[18px]">
          {plan.overflow && (
            <span
              role="alert"
              className="text-alert bg-amber-bg border-amber-border rounded-item text-meta w-fit shrink-0 border px-[10px] py-[6px]"
            >
              {t("overflowWarning")}
            </span>
          )}

          {plan.overlaps.length > 0 && (
            <span
              role="alert"
              className="text-alert bg-amber-bg border-amber-border rounded-item text-meta w-fit shrink-0 border px-[10px] py-[6px]"
            >
              {t("overlapWarning")}
            </span>
          )}

          {/* live region: keyboard nudges only -- a drag must not feed it,
            or it fires every frame. */}
          <span role="status" className="sr-only">
            {announcement}
          </span>

          {hasInstances ? (
            <CutPlanPreview
              plan={plan}
              fabricWidthCm={fabricWidthCm}
              manual={nestingMode === "manual"}
              overlapIds={plan.overlaps}
              onMove={handleMove}
              onNudgeAnnounce={handleNudgeAnnounce}
              labelFor={labelFor}
            />
          ) : (
            <div className="border-pattern-guide rounded-card bg-surface-alt flex min-h-[200px] flex-1 items-center justify-center border border-dashed">
              <span className="text-muted text-ui">
                {t("emptyQuantitiesState")}
              </span>
            </div>
          )}
        </div>

        <CutPlanSizePanel
          pattern={pattern}
          nestingMode={nestingMode}
          onModeChange={handleModeChange}
          onResetManual={handleResetManual}
        />
      </div>

      {hasInstances && (
        <div
          className={cn(
            FLOAT_CHROME,
            "rounded-pill text-meta text-muted flex h-[30px] w-fit flex-none items-center gap-2 px-3",
          )}
        >
          {t("summaryLine", {
            count: plan.instances.length,
            length: meters(plan.lengthCm),
          })}
        </div>
      )}
    </div>
  );
}

// A small color-key row item -- the preview's fill/stroke choices spelled
// out for the person reading the plan, not a new capability. `swatchStyle`
// exists only for the "Tecido" swatch's diagonal weave, which isn't
// expressible as a utility class; every other swatch is plain tokens.
function LegendItem({
  label,
  swatchClassName,
  swatchStyle,
}: {
  label: string;
  swatchClassName: string;
  swatchStyle?: CSSProperties;
}) {
  return (
    <div className="flex items-center gap-[6px]">
      <span
        aria-hidden="true"
        className={`size-[14px] shrink-0 rounded-[3px] border ${swatchClassName}`}
        style={swatchStyle}
      />
      <span className="text-muted text-tick">{label}</span>
    </div>
  );
}
