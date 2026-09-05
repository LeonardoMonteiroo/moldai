"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useEditorStore } from "@/lib/store";
import { buildProofMesh, type ProofMesh } from "@/lib/proof3d/mesh";
import { projectMesh, quantizeYaw, YAW_STEP_DEG } from "@/lib/proof3d/project";
import { formatCm } from "@/lib/format";
import { reportError } from "@/lib/observability/report";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Metric } from "./Metric";

type ProofView = "front" | "side" | "back";
const VIEWS: ProofView[] = ["front", "side", "back"];
// Front/side/back stay as one-click presets, but the camera itself rotates
// continuously (#10 follow-up) -- projectMesh already accepted any yawDeg,
// so drag/keyboard rotation only needed a quantize step (lib/proof3d/
// project.ts's quantizeYaw, snapping to YAW_STEP_DEG multiples), never a
// change to the projection math.
const VIEW_YAW_DEG: Record<ProofView, number> = {
  front: 0,
  side: 90,
  back: 180,
};

// Degrees of yaw per pixel of horizontal drag -- tuned so a full 360°
// rotation is a comfortable few drags across the preview, not a hair
// trigger (the preview itself is a few hundred px wide at most).
const YAW_DRAG_DEG_PER_PX = 0.5;
// Keyboard nudge steps, the same ratio CutPlanPreview's NUDGE_CM/
// COARSE_NUDGE_CM (1cm/5cm) already uses for a drag-plus-keyboard control.
const YAW_NUDGE_DEG = YAW_STEP_DEG;
const YAW_COARSE_NUDGE_DEG = YAW_STEP_DEG * 5;

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
  const [yawDeg, setYawDeg] = useState(VIEW_YAW_DEG.front);
  // Non-null only mid-drag -- a ref (not state) since it's read/written on
  // every pointermove and must never itself trigger a re-render.
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startYaw: number;
  } | null>(null);
  // The preset toggle group highlights a button only when the current yaw
  // sits exactly on one of the three named angles -- a mid-drag angle
  // legitimately highlights none of them, rather than guessing a "nearest"
  // preset that could mislead (e.g. 270° is equidistant from front and back
  // by simple degree difference, but visually neither).
  const namedView = VIEWS.find((v) => VIEW_YAW_DEG[v] === yawDeg);

  // #128: buildProofMesh only knows the body/sleeve/skirt piece ids -- a
  // trousers pattern's pieces ("trouser-front"/"trouser-back") match none of
  // them, so it would silently return a bare mannequin with zero garment
  // shells instead of failing. Rather than let that render as an unlabeled
  // empty preview (indistinguishable from a real bug), this tab treats
  // trousers/hoodie/coat/shirt as an honest, named gap -- the same "surface the
  // limitation where the user meets it" rule the DXF import screen's own
  // createDisabledNote and this tab's existing beta badge already follow.
  // A catalog lookup (t(`notSupportedFor.${type}`)) keyed by the real
  // GarmentType, never a hand-written label map -- the same convention
  // `garmentType.<type>` already uses elsewhere.
  const unsupportedGarmentType =
    pattern?.spec?.type === "trousers" ||
    pattern?.spec?.type === "hoodie" ||
    pattern?.spec?.type === "coat" ||
    pattern?.spec?.type === "shirt"
      ? pattern.spec.type
      : undefined;
  const unsupportedType = unsupportedGarmentType !== undefined;

  // Re-derived from the pattern's own spec/measurements every time the
  // pattern object changes (a new version after a regeneration included) --
  // never persisted, mirroring buildExportModel/planCutLayout's own
  // client-side, credit-less re-draft.
  const { mesh, failed, error } = useMemo<MeshResult>(() => {
    if (!pattern?.spec || pattern.pieces.length === 0 || unsupportedType) {
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
  }, [pattern, tData, unsupportedType]);

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
    return projectMesh(mesh, yawDeg);
  }, [mesh, yawDeg]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!projection) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startYaw: yawDeg,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    setYawDeg(quantizeYaw(drag.startYaw + dx * YAW_DRAG_DEG_PER_PX));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!projection) return;
    let delta = 0;
    if (e.key === "ArrowLeft")
      delta = -(e.shiftKey ? YAW_COARSE_NUDGE_DEG : YAW_NUDGE_DEG);
    else if (e.key === "ArrowRight")
      delta = e.shiftKey ? YAW_COARSE_NUDGE_DEG : YAW_NUDGE_DEG;
    else return;
    e.preventDefault();
    setYawDeg((prev) => quantizeYaw(prev + delta));
  }

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
            <span className="text-muted text-ui">
              {unsupportedGarmentType
                ? t(`notSupportedFor.${unsupportedGarmentType}`)
                : t("emptyState")}
            </span>
          </div>
        ) : (
          <>
            <ToggleGroup
              type="single"
              variant="outline"
              value={namedView ?? ""}
              aria-label={t("viewLabel")}
              onValueChange={(value) => {
                if (value) setYawDeg(VIEW_YAW_DEG[value as ProofView]);
              }}
            >
              {VIEWS.map((v) => (
                <ToggleGroupItem key={v} value={v}>
                  {t("view." + v)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            {/* #10 follow-up: drag or ArrowLeft/ArrowRight (Shift for a
                coarser step) rotate the camera continuously; the toggle
                group above stays as one-click presets for the three named
                angles. role="slider" + aria-valuenow/valuetext give a
                keyboard/AT user the same continuous control a mouse drag
                gets, per this app's own drag-plus-keyboard precedent
                (CutPlanPreview). touchAction:none matches PatternCanvas's
                own pointer-drag surface, so a touch drag rotates instead of
                scrolling the page. */}
            <div
              role="slider"
              tabIndex={0}
              aria-label={t("rotateLabel")}
              aria-valuemin={0}
              aria-valuemax={360 - YAW_STEP_DEG}
              aria-valuenow={yawDeg}
              aria-valuetext={namedView ? t("view." + namedView) : `${yawDeg}°`}
              className="border-border rounded-card bg-surface-alt cursor-grab overflow-auto border p-3 active:cursor-grabbing"
              style={{ touchAction: "none" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={handleKeyDown}
            >
              <svg
                role="img"
                aria-label={
                  namedView
                    ? t("canvasAriaLabel", {
                        name: pattern?.name ?? "",
                        view: t("view." + namedView),
                      })
                    : t("canvasAriaLabelDeg", {
                        name: pattern?.name ?? "",
                        deg: yawDeg,
                      })
                }
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
