"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Pattern } from "@/lib/types";
import { planCutLayout } from "@/lib/export/cutplan";
import { useEditorStore } from "@/lib/store";

// The one place the editor turns its cut-plan inputs (the store's fabric
// width, nesting mode and manual placements, plus the pattern's persisted
// cutQuantities) into a plan. CutPlanTab and ExportModal's corte variant
// both read it, so the modal's consumption line can't describe a different
// plan than the tab on screen (#355 -- it used to hardcode 150cm and the
// base size only).
//
// `autoPlan` is returned alongside `plan` because switching into manual
// seeds placements from the auto layout. Both are null when `pattern` is
// null (a caller that doesn't need a plan right now, e.g. the modal's
// non-corte variants -- hooks can't be called conditionally) or has no
// spec or pieces; `plan` falls back to `autoPlan` if the manual pass throws.
export function useCutPlan(pattern: Pattern | null) {
  const tData = useTranslations("PatternData");
  const fabricWidthCm = useEditorStore((s) => s.cutFabricWidthCm);
  const nestingMode = useEditorStore((s) => s.nestingMode);
  const cutPlacements = useEditorStore((s) => s.cutPlacements);
  const cutQuantities = pattern?.cutQuantities;

  const autoPlan = useMemo(() => {
    if (!pattern?.spec || pattern.pieces.length === 0) return null;
    try {
      return planCutLayout(pattern, fabricWidthCm, tData, {
        mode: "auto",
        cutQuantities,
      });
    } catch {
      return null;
    }
  }, [pattern, fabricWidthCm, tData, cutQuantities]);

  const plan = useMemo(() => {
    if (!pattern || !autoPlan) return null;
    if (nestingMode === "auto") return autoPlan;
    try {
      return planCutLayout(pattern, fabricWidthCm, tData, {
        mode: "manual",
        placements: cutPlacements,
        cutQuantities,
      });
    } catch {
      return autoPlan;
    }
  }, [
    autoPlan,
    nestingMode,
    pattern,
    fabricWidthCm,
    tData,
    cutPlacements,
    cutQuantities,
  ]);

  return { autoPlan, plan, fabricWidthCm, nestingMode };
}
