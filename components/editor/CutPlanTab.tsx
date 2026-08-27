"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Pattern } from "@/lib/types";
import {
  planCutLayout,
  FABRIC_WIDTHS_CM,
  NESTING_MODES,
} from "@/lib/export/cutplan";
import { useEditorStore } from "@/lib/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { CutPlanPreview } from "./CutPlanPreview";
import { Metric } from "./Metric";

const meters = (cm: number) => (cm / 100).toFixed(2).replace(".", ",") + " m";
const cmFmt = (cm: number) => cm.toFixed(1).replace(".", ",");

export function CutPlanTab({ pattern }: { pattern: Pattern }) {
  const t = useTranslations("CutPlanTab");
  const tData = useTranslations("PatternData");
  const fabricWidthCm = useEditorStore((s) => s.cutFabricWidthCm);
  const setFabricWidthCm = useEditorStore((s) => s.setCutFabricWidth);
  const nestingMode = useEditorStore((s) => s.nestingMode);
  const setNestingMode = useEditorStore((s) => s.setNestingMode);
  const cutPlacements = useEditorStore((s) => s.cutPlacements);
  const setCutPlacement = useEditorStore((s) => s.setCutPlacement);
  const seedCutPlacements = useEditorStore((s) => s.seedCutPlacements);
  const resetCutPlacements = useEditorStore((s) => s.resetCutPlacements);

  const [announcement, setAnnouncement] = useState("");

  // Real nesting: only recalculates when the pattern, width, mode or manual
  // placements change. Auto mode is computed either way -- switching into
  // manual seeds it from the auto layout so the user nudges from a good
  // start rather than an empty sheet.
  const autoPlan = useMemo(() => {
    if (!pattern.spec || pattern.pieces.length === 0) return null;
    try {
      return planCutLayout(pattern, fabricWidthCm, tData, { mode: "auto" });
    } catch {
      return null;
    }
  }, [pattern, fabricWidthCm, tData]);

  const plan = useMemo(() => {
    if (!autoPlan) return null;
    if (nestingMode === "auto") return autoPlan;
    try {
      return planCutLayout(pattern, fabricWidthCm, tData, {
        mode: "manual",
        placements: cutPlacements,
      });
    } catch {
      return autoPlan;
    }
  }, [autoPlan, nestingMode, pattern, fabricWidthCm, tData, cutPlacements]);

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

  return (
    // `fill` + `min-h-full`: the empty state below is `flex-1`, so the column
    // has to keep the region's height for it to fill the tab.
    <ScrollArea fill className="min-h-0 flex-1">
      <div className="flex min-h-full flex-col gap-4 p-[22px]">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-title font-semibold">
            {t("title")}
          </span>
          <span className="text-muted text-ui">{pattern.name}</span>
        </div>

        {!plan ? (
          <div className="border-pattern-guide rounded-card bg-surface-alt flex min-h-[200px] flex-1 items-center justify-center border border-dashed">
            <span className="text-muted text-ui">{t("emptyState")}</span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-4">
              {/* seletor de largura de tecido */}
              <div className="flex flex-col gap-[6px]">
                <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
                  {t("fabricWidthLabel")}
                </span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={String(fabricWidthCm)}
                  aria-label={t("fabricWidthLabel")}
                  onValueChange={(value) => {
                    if (value) setFabricWidthCm(Number(value));
                  }}
                >
                  {FABRIC_WIDTHS_CM.map((w) => (
                    <ToggleGroupItem key={w} value={String(w)}>
                      {meters(w)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              {/* seletor de modo de encaixe */}
              <div className="flex flex-col gap-[6px]">
                <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
                  {t("modeLabel")}
                </span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={nestingMode}
                  aria-label={t("modeLabel")}
                  onValueChange={handleModeChange}
                >
                  {NESTING_MODES.map((m) => (
                    <ToggleGroupItem key={m} value={m}>
                      {t(`mode.${m}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>

            {/* metrics */}
            <div className="flex flex-wrap gap-3">
              <Metric
                label={t("metricConsumptionLabel")}
                value={meters(plan.lengthCm)}
                hint={t("metricConsumptionHint")}
              />
              <Metric
                label={t("metricEfficiencyLabel")}
                value={`${Math.round(plan.efficiency * 100)}%`}
                hint={t("metricEfficiencyHint")}
              />
              <Metric
                label={t("metricPieceCountLabel")}
                value={String(plan.instances.length)}
                hint={t("metricPieceCountHint")}
              />
            </div>

            {plan.overflow && (
              <span
                role="alert"
                className="text-alert bg-amber-bg border-amber-border rounded-item text-meta border px-[10px] py-[6px]"
              >
                {t("overflowWarning")}
              </span>
            )}

            {plan.overlaps.length > 0 && (
              <span
                role="alert"
                className="text-alert bg-amber-bg border-amber-border rounded-item text-meta border px-[10px] py-[6px]"
              >
                {t("overlapWarning")}
              </span>
            )}

            {nestingMode === "manual" && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted text-tick leading-snug">
                  {t("manualHint")}
                </p>
                <Button
                  variant="outline"
                  size="chrome"
                  onClick={handleResetManual}
                >
                  {t("resetManual")}
                </Button>
              </div>
            )}

            {/* live region: keyboard nudges only -- a drag must not feed it,
                or it fires every frame. */}
            <span role="status" className="sr-only">
              {announcement}
            </span>

            {/* nesting preview */}
            <div className="border-border rounded-card bg-surface-alt overflow-auto border p-3">
              <CutPlanPreview
                plan={plan}
                fabricWidthCm={fabricWidthCm}
                manual={nestingMode === "manual"}
                overlapIds={plan.overlaps}
                onMove={handleMove}
                onNudgeAnnounce={handleNudgeAnnounce}
                labelFor={labelFor}
              />
            </div>

            <p className="text-muted text-tick leading-snug">
              {nestingMode === "manual"
                ? t.rich("layoutNoteManual", {
                    em: (chunks) => (
                      <span className="text-olive font-semibold">{chunks}</span>
                    ),
                  })
                : t("layoutNoteAuto")}
            </p>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
