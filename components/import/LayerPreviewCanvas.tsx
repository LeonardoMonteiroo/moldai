"use client";

import { useTranslations } from "next-intl";
import { useImportStore } from "@/lib/importStore";
import {
  buildLayerPreview,
  buildPiecePreviewPath,
  colorForLayer,
} from "@/lib/import/preview";

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
 */
export function LayerPreviewCanvas() {
  const t = useTranslations("Import");
  const doc = useImportStore((s) => s.doc);
  const hoveredLayers = useImportStore((s) => s.hoveredLayers);
  const hoveredPieceKey = useImportStore((s) => s.hoveredPieceKey);

  if (!doc) return null;
  const preview = buildLayerPreview(doc);
  if (preview.segments.length === 0) return null;

  const hovered = hoveredLayers ? new Set(hoveredLayers) : null;

  return (
    <div className="border-border bg-surface rounded-lg border p-[18px]">
      <span className="text-meta text-muted tracking-eyebrow uppercase">
        {t("previewSectionLabel")}
      </span>
      <svg
        viewBox={preview.viewBox}
        aria-hidden="true"
        className="mt-[10px] h-[280px] w-full"
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
                isDimmed ? "var(--color-border)" : colorForLayer(segment.layer)
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
      </svg>
    </div>
  );
}
