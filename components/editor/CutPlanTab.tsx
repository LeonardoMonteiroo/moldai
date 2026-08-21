"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Pattern } from "@/lib/types";
import { buildPathD } from "@/lib/export/model";
import { planCutLayout, FABRIC_WIDTHS_CM } from "@/lib/export/cutplan";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const meters = (cm: number) => (cm / 100).toFixed(2).replace(".", ",") + " m";

export function CutPlanTab({ pattern }: { pattern: Pattern }) {
  const t = useTranslations("CutPlanTab");
  const tData = useTranslations("PatternData");
  const [fabricWidthCm, setFabricWidthCm] = useState<number>(150);

  // Real nesting: only recalculates when the pattern or the width changes.
  const plan = useMemo(() => {
    if (!pattern.spec || pattern.pieces.length === 0) return null;
    try {
      return planCutLayout(pattern, fabricWidthCm, tData);
    } catch {
      return null;
    }
  }, [pattern, fabricWidthCm, tData]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-[22px]">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[19px] font-semibold">
          {t("title")}
        </span>
        <span className="text-muted text-[12px]">{pattern.name}</span>
      </div>

      {!plan ? (
        <div className="border-pattern-guide rounded-card bg-surface-alt flex min-h-[200px] flex-1 items-center justify-center border border-dashed">
          <span className="text-muted text-[12.5px]">{t("emptyState")}</span>
        </div>
      ) : (
        <>
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
              className="text-alert bg-amber-bg border-amber-border rounded-item border px-[10px] py-[6px] text-[11.5px]"
            >
              {t("overflowWarning")}
            </span>
          )}

          {/* nesting preview */}
          <div className="border-border rounded-card bg-surface-alt overflow-auto border p-3">
            <svg
              viewBox={`0 0 ${fabricWidthCm} ${plan.lengthCm}`}
              className="h-auto w-full"
              style={{ maxHeight: 460 }}
              preserveAspectRatio="xMidYMin meet"
            >
              <rect
                x={0}
                y={0}
                width={fabricWidthCm}
                height={plan.lengthCm}
                fill="var(--color-surface)"
                stroke="var(--color-pattern-guide)"
                strokeWidth={0.6}
              />
              {plan.instances.map((it) => (
                <g key={it.id}>
                  <path
                    d={buildPathD(
                      it.outline.start,
                      it.outline.segs,
                      (x) => it.originCm.x + x,
                      (y) => it.originCm.y + y,
                    )}
                    fill="var(--color-olive-tint)"
                    stroke="var(--color-ink)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={it.originCm.x + it.widthCm / 2}
                    y={it.originCm.y + it.heightCm / 2}
                    fontSize={Math.max(3, fabricWidthCm / 34)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--color-muted-2)"
                  >
                    {it.name}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <p className="text-muted text-[10.5px] leading-snug">
            {t.rich("layoutNote", {
              em: (chunks) => (
                <span className="text-olive font-semibold">{chunks}</span>
              ),
            })}
          </p>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border-border rounded-card bg-surface flex min-w-[150px] flex-col gap-1 border p-[14px]">
      <span className="text-muted text-[11px] font-semibold tracking-[.8px] uppercase">
        {label}
      </span>
      <span className="font-display text-[19px] font-semibold">{value}</span>
      <span className="text-muted text-[10.5px]">{hint}</span>
    </div>
  );
}
