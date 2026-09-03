"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PatternVersionEntry } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";
import { draftGarment } from "@/lib/draft/garment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { OutlineShape } from "./OutlineShape";

// Reason codes are machine-readable (see lib/db/patternVersion.ts) -- labels
// resolve by catalog lookup keyed on the EN enum value, never a hand-written
// Record<Reason, string> map.
function reasonLabel(
  t: ReturnType<typeof useTranslations<"VersionList">>,
  reason: PatternVersionEntry["reason"],
): string {
  return t(`reason.${reason}`);
}

// The design's card art is a real drafted-geometry thumbnail, not a fake
// icon -- redrafts client-side from the version's own frozen spec+sizeTable,
// the same draftGarment call VersionCompare already makes for its overlay.
// A version whose frozen base size is somehow missing from its own sizeTable
// renders no thumbnail rather than fabricating one.
function VersionThumbnail({
  version,
  t,
}: {
  version: PatternVersionEntry;
  t: ReturnType<typeof useTranslations<"PatternData">>;
}) {
  const base = version.sizeTable[version.baseSize];
  if (!base) return null;
  const drafted = draftGarment(version.spec, base, t);
  const { w, h } = drafted.viewBox;
  if (!w || !h) return null;
  return (
    // absolute inset-0, per the design: `h-full` alone is a percentage
    // against a parent whose height comes from `aspect-[4/3]` rather than
    // from a resolved length, so it fell back to the SVG's own intrinsic
    // ratio -- a portrait pattern then made every card ~330px tall instead
    // of the design's ~210px, turning a compact filmstrip into a third of
    // the screen. Taking the SVG out of flow lets the ratio decide the box.
    <svg
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
    >
      {drafted.pieces.map((piece) => (
        <OutlineShape
          key={piece.id}
          outline={piece.outline}
          className="stroke-muted-2 fill-none"
          style={{ strokeWidth: Math.max(w, h) / 90 }}
        />
      ))}
    </svg>
  );
}

export function VersionList({
  versions,
  activeVersion,
  compareFrom,
  compareTo,
  onSelect,
  restoring,
  onRestore,
}: {
  versions: PatternVersionEntry[];
  activeVersion: number;
  /** Version numbers currently selected for VersionCompare, shared state
   *  lifted into VersionsShell so a card click and the compare panel agree. */
  compareFrom: number;
  compareTo: number;
  onSelect: (version: number) => void;
  restoring: boolean;
  onRestore: (versionId: string) => void;
}) {
  const t = useTranslations("VersionList");
  const tFormat = useTranslations("Format");
  const tData = useTranslations("PatternData");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirming = versions.find((v) => v.id === confirmingId) ?? null;

  const total = versions.reduce((sum, v) => sum + v.cost, 0);

  return (
    <section className="flex min-w-0 flex-none flex-col gap-[9px]">
      <div className="flex items-baseline gap-[10px]">
        <h2 className="text-muted-2 text-meta tracking-eyebrow m-0 font-semibold uppercase">
          {t("sectionLabel")}
        </h2>
        <span className="text-muted text-meta">{t("compareHint")}</span>
        <div className="flex-1" />
        <span className="text-muted text-meta">
          {t("totalSpent", { total })}
        </span>
      </div>

      <div className="flex min-w-0 gap-[10px] overflow-x-auto pb-[2px]">
        {versions.map((v) => {
          const isActive = v.version === activeVersion;
          const isFrom = v.version === compareFrom;
          const isTo = v.version === compareTo;
          const selected = isFrom || isTo;

          return (
            <div
              key={v.id}
              className={[
                "rounded-card bg-surface flex w-[152px] flex-none flex-col overflow-hidden border",
                selected ? "border-olive ring-olive ring-1" : "border-border",
              ].join(" ")}
            >
              {/* The design nests a real "Restaurar" <button> inside a
                  role="button" card (Versoes.dc.html:116,136) -- invalid
                  ARIA (interactive content inside interactive content). The
                  selectable area here is a real <button> that stops short of
                  the restore control instead, so nothing nests. */}
              <button
                type="button"
                aria-pressed={selected}
                aria-label={
                  selected
                    ? t("selectedHint")
                    : t("selectHint", { version: v.version })
                }
                title={
                  selected
                    ? t("selectedHint")
                    : t("selectHint", { version: v.version })
                }
                onClick={() => onSelect(v.version)}
                className="flex flex-col text-left"
              >
                <div className="border-border bg-surface-alt relative aspect-[4/3] border-b">
                  <VersionThumbnail version={v} t={tData} />
                  {selected && (
                    <Badge
                      variant={isTo ? "oliveSolid" : "olive"}
                      className="absolute top-2 left-2"
                    >
                      {isTo ? t("toBadge") : t("fromBadge")}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col gap-px px-[10px] pt-[9px]">
                  <div className="flex items-baseline gap-[6px]">
                    <span className="text-control font-semibold">
                      {t("versionLabel", { version: v.version })}
                    </span>
                    <span className="text-muted text-meta">
                      {relativeTime(tFormat, v.createdAt)}
                    </span>
                  </div>
                  <span className="text-muted-2 text-meta truncate">
                    {reasonLabel(t, v.reason)}
                  </span>
                  <span className="text-muted text-tick">
                    {v.cost === 0
                      ? t("costFree")
                      : t("costCredits", { cost: v.cost })}
                  </span>
                </div>
              </button>
              <div className="px-[10px] pb-[10px]">
                {isActive ? (
                  <span className="text-olive-dark text-meta mt-[5px] flex h-6 items-center font-semibold">
                    {t("currentVersionLabel")}
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restoring}
                    onClick={() => setConfirmingId(v.id)}
                    className="mt-[5px] h-6 self-start px-2"
                  >
                    {t("restoreButton", { version: v.version })}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {confirming && (
        <ConfirmModal
          title={t("restoreModalTitle", { version: confirming.version })}
          description={t("restoreModalDescription")}
          confirmLabel={t("restoreModalConfirmButton")}
          cancelLabel={t("restoreModalCancelButton")}
          variant="default"
          onConfirm={() => {
            setConfirmingId(null);
            onRestore(confirming.id);
          }}
          onCancel={() => setConfirmingId(null)}
        />
      )}
    </section>
  );
}
