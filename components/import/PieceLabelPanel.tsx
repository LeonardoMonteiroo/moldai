"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useImportStore } from "@/lib/importStore";
import { PIECE_LABELS, type PieceLabel } from "@/lib/import/types";

/**
 * One row per lib/import/pieces.ts-detected piece: a Select over the fixed
 * PieceLabel vocabulary (catalog lookup, t("pieceLabel." + value)), so the
 * AI reconstruction context (lib/import/reconstructMeta.ts) gets a trusted
 * identity instead of guessing purely from the image (#238 follow-up).
 * Marking a piece is optional. Hovering/focusing a row highlights that exact
 * piece in LayerPreviewCanvas via hoveredPieceKey.
 */
export function PieceLabelPanel() {
  const t = useTranslations("Import");
  const pieces = useImportStore((s) => s.pieces);
  const pieceLabels = useImportStore((s) => s.pieceLabels);
  const setPieceLabel = useImportStore((s) => s.setPieceLabel);
  const setHoveredPieceKey = useImportStore((s) => s.setHoveredPieceKey);
  const [customNames, setCustomNames] = useState<Record<string, string>>({});

  if (pieces.length === 0) return null;

  return (
    <div className="border-border bg-surface flex min-h-0 flex-col gap-[10px] rounded-lg border p-[18px]">
      <span className="text-meta text-muted tracking-eyebrow uppercase">
        {t("piecesSectionLabel")}
      </span>
      <ul className="flex flex-col gap-[8px]">
        {pieces.map((piece, index) => {
          const assigned = pieceLabels[piece.key];
          const value: PieceLabel | "" =
            assigned?.label ?? piece.suggestedLabel ?? "";
          const dims =
            piece.widthCm !== null && piece.heightCm !== null
              ? `${piece.widthCm.toFixed(1)} x ${piece.heightCm.toFixed(1)} cm`
              : "";
          const rowLabel = t("pieceRowLabel", { index: index + 1 });
          return (
            // Pointer-only highlight of this piece in LayerPreviewCanvas —
            // there is no interactive ARIA role for "hover region," and the
            // row's real interactive control (the Select below) carries its
            // own onFocus/onBlur for keyboard users.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <li
              key={piece.key}
              className="flex items-center justify-between gap-[10px]"
              onMouseEnter={() => setHoveredPieceKey(piece.key)}
              onMouseLeave={() => setHoveredPieceKey(null)}
            >
              <span className="text-control flex min-w-0 flex-col">
                <span className="truncate">{rowLabel}</span>
                {dims && <span className="text-meta text-muted">{dims}</span>}
              </span>
              <div className="flex items-center gap-[8px]">
                <Select
                  value={value}
                  onValueChange={(next) =>
                    setPieceLabel(
                      piece.key,
                      next as PieceLabel,
                      customNames[piece.key],
                    )
                  }
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={rowLabel}
                    onFocus={() => setHoveredPieceKey(piece.key)}
                    onBlur={() => setHoveredPieceKey(null)}
                  >
                    <SelectValue placeholder={t("pieceLabel.other")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PIECE_LABELS.map((label) => (
                      <SelectItem key={label} value={label}>
                        {t("pieceLabel." + label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {value === "other" && (
                  <Input
                    placeholder={t("pieceCustomNamePlaceholder")}
                    value={customNames[piece.key] ?? ""}
                    onChange={(e) => {
                      const name = e.target.value;
                      setCustomNames((prev) => ({
                        ...prev,
                        [piece.key]: name,
                      }));
                      setPieceLabel(piece.key, "other", name);
                    }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
