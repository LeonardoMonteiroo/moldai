"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useEditorStore } from "@/lib/store";
import { buildProofMesh, type ProofMesh } from "@/lib/proof3d/mesh";
import { projectMesh } from "@/lib/proof3d/project";
import { formatCm } from "@/lib/format";
import { reportError } from "@/lib/observability/report";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Metric } from "./Metric";

type ProofView = "front" | "side" | "back";
const VIEWS: ProofView[] = ["front", "side", "back"];
// Three fixed camera angles rather than freeform dragging -- the mesh is a
// static parametric proxy, not something a user needs to spin continuously
// to inspect; lib/proof3d/project.ts's YAW_STEP_DEG is exported for a future
// drag control to quantize against, but this tab doesn't add one yet.
const VIEW_YAW_DEG: Record<ProofView, number> = {
  front: 0,
  side: 90,
  back: 180,
};

// A unit suffix, not catalog copy -- the same local-formatter precedent as
// PatternCanvas.tsx (which imports formatCm and wraps it with " cm"),
// reusing lib/format.ts's single formatCm rather than re-deriving the
// toFixed(1)/comma-swap logic a second time (#107 already found six drifted
// copies of that exact formula).
const cm = (n: number) => `${formatCm(n)} cm`;

interface MeshResult {
  mesh: ProofMesh | null;
  // Distinguishes "nothing to draft yet" (the ordinary empty state) from "a
  // real build failure" -- a bare catch-and-return-null collapsed both into
  // the same empty state, so a genuinely broken pattern (e.g. a legacy/
  // corrupted sizeTable) silently looked identical to a blank one instead of
  // surfacing on screen, contradicting CLAUDE.md's "surface limitations on
  // screen, never silently" rule.
  failed: boolean;
  error: unknown;
}

export function Proof3DTab() {
  const t = useTranslations("Proof3DTab");
  // Drafter-produced strings (piece names/detailRows draftPiecesCm still
  // resolves internally even though this tab never renders them) live in
  // PatternData, the same namespace CutPlanTab/TechSheetTab already pass
  // through to their own re-draft calls.
  const tData = useTranslations("PatternData");
  const pattern = useEditorStore((s) => s.pattern);
  const [view, setView] = useState<ProofView>("front");

  // Re-derived from the pattern's own spec/measurements every time the
  // pattern object changes (a new version after a regeneration included) --
  // never persisted, mirroring buildExportModel/planCutLayout's own
  // client-side, credit-less re-draft.
  const { mesh, failed, error } = useMemo<MeshResult>(() => {
    if (!pattern?.spec || pattern.pieces.length === 0) {
      return { mesh: null, failed: false, error: null };
    }
    try {
      return {
        mesh: buildProofMesh(pattern, tData),
        failed: false,
        error: null,
      };
    } catch (err) {
      return { mesh: null, failed: true, error: err };
    }
  }, [pattern, tData]);

  // Logged as a side effect (not inline in the useMemo above, which must
  // stay pure) -- the one seam CLAUDE.md documents for wiring in a real
  // error-reporting service later.
  useEffect(() => {
    if (failed) {
      reportError("Proof3DTab", error, { patternId: pattern?.id });
    }
  }, [failed, error, pattern?.id]);

  const projection = useMemo(() => {
    if (!mesh) return null;
    return projectMesh(mesh, VIEW_YAW_DEG[view]);
  }, [mesh, view]);

  return (
    // `fill` + `min-h-full`: the empty state below is `flex-1`, so the
    // column has to keep the region's height for it to fill the tab (the
    // same CutPlanTab.tsx precedent).
    <ScrollArea fill className="min-h-0 flex-1">
      <div className="flex min-h-full flex-col gap-4 p-[22px]">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-title font-semibold">
            {t("title")}
          </span>
          <span className="text-muted text-ui">{pattern?.name}</span>
          <Badge variant="notice">{t("betaBadge")}</Badge>
        </div>

        {failed ? (
          <div
            role="alert"
            className="border-pattern-guide rounded-card bg-surface-alt flex min-h-[200px] flex-1 items-center justify-center border border-dashed"
          >
            <span className="text-alert text-ui">{t("buildError")}</span>
          </div>
        ) : !mesh || !projection ? (
          <div className="border-pattern-guide rounded-card bg-surface-alt flex min-h-[200px] flex-1 items-center justify-center border border-dashed">
            <span className="text-muted text-ui">{t("emptyState")}</span>
          </div>
        ) : (
          <>
            <ToggleGroup
              type="single"
              variant="outline"
              value={view}
              aria-label={t("viewLabel")}
              onValueChange={(value) => {
                if (value) setView(value as ProofView);
              }}
            >
              {VIEWS.map((v) => (
                <ToggleGroupItem key={v} value={v}>
                  {t("view." + v)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="border-border rounded-card bg-surface-alt overflow-auto border p-3">
              <svg
                role="img"
                aria-label={t("canvasAriaLabel", {
                  name: pattern?.name ?? "",
                  view: t("view." + view),
                })}
                viewBox={`${projection.viewBox.x} ${projection.viewBox.y} ${projection.viewBox.w} ${projection.viewBox.h}`}
                className="h-auto w-full"
                style={{ maxHeight: 460 }}
                preserveAspectRatio="xMidYMid meet"
              >
                {projection.faces.map((face, i) => (
                  <path
                    // Faces are static and re-drawn wholesale on every view/
                    // mesh change (no reordering within one render) -- index
                    // is a stable-enough key for this list.
                    key={i}
                    d={face.d}
                    fill={
                      face.part === "form"
                        ? "var(--color-pattern-guide)"
                        : "var(--color-olive)"
                    }
                    fillOpacity={0.35 + 0.65 * face.shade}
                    stroke="none"
                  />
                ))}
              </svg>
            </div>

            <div className="flex flex-wrap gap-3">
              {mesh.fit.map((row) => (
                <Metric
                  key={row.key}
                  label={t("ease." + row.key)}
                  value={cm(row.easeCm)}
                  hint={t("easeHint")}
                />
              ))}
            </div>

            <p className="text-muted text-tick leading-snug">
              {t.rich("approximationNote", {
                em: (chunks) => (
                  <span className="text-olive font-semibold">{chunks}</span>
                ),
              })}
            </p>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
