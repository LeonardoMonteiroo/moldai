"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useImportStore } from "@/lib/importStore";
import {
  buildLayerPreview,
  buildPiecePreviewPath,
  colorForLayer,
} from "@/lib/import/preview";

/** Identity view -- also what "restaurar zoom" returns to. */
const RESET_VIEW = { scale: 1, tx: 0, ty: 0 };
const ZOOM_STEP = 1.1;
const MIN_SCALE = 0.2;
const MAX_SCALE = 40;

/**
 * A single SVG overlay of every detected layer's real geometry — the ground
 * truth a user needs to identify which of an unrecognised-vocabulary file's
 * layers is the actual cut line, since no name-based heuristic can do that
 * for a file whose layers are named by RGB color + linetype (#238).
 *
 * Purely a visual aid: it renders `useImportStore`'s `doc` (already parsed,
 * never re-read from disk) through the pure `buildLayerPreview`, and
 * highlights whichever group `LayerMappingPanel` is currently
 * hovering/focusing via `hoveredLayers` — every other layer dims to the
 * border token. Decorative (`aria-hidden`): the same layer names are already
 * in the accessible list this panel sits beside.
 *
 * It pans and zooms, per the design: without that, a dense real-world CAD
 * file renders as an unreadable thumbnail, and inspecting the geometry is
 * the entire reason this panel exists.
 */
export function LayerPreviewCanvas() {
  const t = useTranslations("Import");
  const doc = useImportStore((s) => s.doc);
  const roles = useImportStore((s) => s.roles);
  const hoveredLayers = useImportStore((s) => s.hoveredLayers);
  const hoveredPieceKey = useImportStore((s) => s.hoveredPieceKey);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  // Purely this panel's own view state -- no store entry, per "don't add
  // abstractions beyond what's needed": nothing outside this canvas reads it,
  // and it is meaningless once the file changes.
  const [view, setView] = useState(RESET_VIEW);

  /** Screen px -> viewBox user units, so pan tracks the pointer exactly. */
  const toUser = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM?.();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  // Ctrl/⌘ + wheel zooms at the cursor; a plain wheel pans. Deliberately the
  // same convention the editor canvas settled on rather than the design's
  // literal "role para dar zoom": a bare-wheel zoom here would both rocket
  // the scale on one trackpad gesture AND fight the page scroll this panel
  // sits inside. A trackpad pinch still arrives with ctrlKey set, so
  // pinch-to-zoom keeps working. Non-passive, for preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const point = toUser(e.clientX, e.clientY);
        if (!point) return;
        setView((v) => {
          const next = Math.min(
            MAX_SCALE,
            Math.max(
              MIN_SCALE,
              v.scale * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
            ),
          );
          // Keep whatever sits under the cursor pinned there.
          return {
            scale: next,
            tx: v.tx + (v.scale - next) * point.x,
            ty: v.ty + (v.scale - next) * point.y,
          };
        });
        return;
      }
      const scale = svg.getScreenCTM?.()?.a ?? 1;
      setView((v) => ({
        ...v,
        tx: v.tx - e.deltaX / scale,
        ty: v.ty - e.deltaY / scale,
      }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [doc]);

  if (!doc) return null;
  const preview = buildLayerPreview(doc);
  if (preview.segments.length === 0) return null;

  const hovered = hoveredLayers ? new Set(hoveredLayers) : null;
  const hasNoCutMapped = !Object.values(roles).includes("cut");

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const scale = svgRef.current?.getScreenCTM?.()?.a ?? 1;
    const dx = (e.clientX - drag.current.x) / scale;
    const dy = (e.clientY - drag.current.y) / scale;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
  };

  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="border-border bg-surface rounded-lg border p-[18px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-meta text-muted tracking-eyebrow uppercase">
          {t("previewSectionLabel")}
        </span>
        <button
          type="button"
          onClick={() => setView(RESET_VIEW)}
          className="text-olive hover:text-olive-dark text-meta"
        >
          {t("previewResetZoom")}
        </button>
      </div>
      <p className="text-muted text-tick mt-1">{t("previewViewHint")}</p>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={preview.viewBox}
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="mt-[6px] h-[280px] w-full [cursor:grab] touch-none active:[cursor:grabbing] lg:h-[calc(100vh-240px)] lg:min-h-[260px]"
        >
          <g
            transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}
          >
            {preview.segments.map((segment) => {
              const isHighlighted = hovered?.has(segment.layer) ?? false;
              const isDimmed = hovered !== null && !isHighlighted;
              return (
                <path
                  key={segment.layer}
                  d={segment.d}
                  fill="none"
                  stroke={
                    isDimmed
                      ? "var(--color-border)"
                      : colorForLayer(segment.layer)
                  }
                  strokeWidth={isHighlighted ? 2 : 1}
                  opacity={isDimmed ? 0.4 : 1}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {hoveredPieceKey &&
              (() => {
                const d = buildPiecePreviewPath(doc, hoveredPieceKey);
                if (!d) return null;
                return (
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth={3}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })()}
          </g>
        </svg>
        {hasNoCutMapped && (
          <div className="pointer-events-none absolute inset-x-0 top-[6px] flex items-center justify-center">
            <span className="text-muted text-ui max-w-[220px] text-center">
              {t("noCutLineMapped")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
