"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Pattern } from "@/lib/types";
import type { ExPt, ExSeg } from "@/lib/export/model";
import { buildExportModel } from "@/lib/export/model";
import { planCutLayout, FABRIC_WIDTHS_CM } from "@/lib/export/cutplan";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const meters = (cm: number) => (cm / 100).toFixed(2).replace(".", ",") + " m";

/**
 * Every current drafter closes its outline by construction (the last
 * Catmull-Rom/straight segment always walks back to index 0, see
 * lib/draft/core.ts's catmullRomSegments) — so this always reads "closed"
 * today. It is still a real, derived check rather than a hardcoded "3 peças
 * fechadas": a future drafter emitting a genuinely open piece would be
 * caught here instead of silently exporting a gap in the cut line.
 */
export function isOutlineClosed(
  outline: { start: ExPt; segs: ExSeg[] },
  epsilonCm = 0.01,
): boolean {
  if (outline.segs.length === 0) return false;
  const last = outline.segs[outline.segs.length - 1];
  const dx = last.to.x - outline.start.x;
  const dy = last.to.y - outline.start.y;
  return Math.hypot(dx, dy) <= epsilonCm;
}

export function ExportChecklist({
  pattern,
  conflictActive,
  fabricWidthCm,
  onFabricWidthChange,
}: {
  pattern: Pattern;
  conflictActive: boolean;
  fabricWidthCm: number;
  onFabricWidthChange: (widthCm: number) => void;
}) {
  const t = useTranslations("Export");
  const tData = useTranslations("PatternData");

  // #17: both the closed-piece count and the consumption estimate are
  // computed from buildExportModel's own base-size draft, the same basis
  // planCutLayout always uses (it has no size parameter) — so the estimate
  // below is honestly captioned as base-size-only rather than claiming to
  // track whatever size the "Tamanhos" select currently has picked.
  const drafted = useMemo(() => {
    if (!pattern.spec || pattern.pieces.length === 0) return null;
    try {
      const model = buildExportModel(pattern, tData);
      const plan = planCutLayout(pattern, fabricWidthCm, tData);
      return { model, plan };
    } catch {
      return null;
    }
  }, [pattern, fabricWidthCm, tData]);

  const totalPieces = drafted?.model.pieces.length ?? 0;
  const closedPieces =
    drafted?.model.pieces.filter((p) => isOutlineClosed(p.outline)).length ?? 0;
  const piecesOk = totalPieces > 0 && closedPieces === totalPieces;

  return (
    <div className="border-border bg-surface rounded-card flex flex-col gap-3 border p-[16px]">
      <span className="text-control font-semibold">
        {t("checklistHeading")}
      </span>
      <ul className="flex flex-col gap-2">
        <li>
          <ChecklistRow
            ok={!conflictActive}
            text={
              conflictActive
                ? t("checklistConflictFail")
                : t("checklistConflictPass")
            }
          />
        </li>
        <li>
          <ChecklistRow
            ok={piecesOk}
            text={
              piecesOk
                ? t("checklistPiecesPass", {
                    closed: closedPieces,
                    total: totalPieces,
                  })
                : t("checklistPiecesFail")
            }
          />
        </li>
        <li className="flex flex-col gap-1">
          <ChecklistRow
            ok={!!drafted}
            text={
              drafted
                ? t("checklistConsumptionValue", {
                    length: meters(drafted.plan.lengthCm),
                    width: meters(fabricWidthCm),
                  })
                : t("checklistConsumptionUnavailable")
            }
          />
          <span className="text-muted text-meta pl-[26px]">
            {t("checklistConsumptionNote")}
          </span>
        </li>
      </ul>
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
            if (value) onFabricWidthChange(Number(value));
          }}
        >
          {FABRIC_WIDTHS_CM.map((w) => (
            <ToggleGroupItem key={w} value={String(w)}>
              {meters(w)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}

function ChecklistRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-[8px]">
      <span
        aria-hidden="true"
        className={
          ok
            ? "text-olive text-control flex size-[18px] shrink-0 items-center justify-center"
            : "text-alert text-control flex size-[18px] shrink-0 items-center justify-center"
        }
      >
        {ok ? "✓" : "✕"}
      </span>
      <span className={ok ? "text-ui" : "text-alert text-ui"}>{text}</span>
    </div>
  );
}
