"use client";

import { useMemo, useState } from "react";
import { Pattern } from "@/lib/types";
import { buildPathD } from "@/lib/export/model";
import { planCutLayout, FABRIC_WIDTHS_CM } from "@/lib/export/cutplan";

const meters = (cm: number) => (cm / 100).toFixed(2).replace(".", ",") + " m";

export function PlanoCorteTab({ pattern }: { pattern: Pattern }) {
  const [fabricWidthCm, setFabricWidthCm] = useState<number>(150);

  // Encaixe real: só recalcula quando o molde ou a largura mudam.
  const plan = useMemo(() => {
    if (!pattern.spec || pattern.pieces.length === 0) return null;
    try {
      return planCutLayout(pattern, fabricWidthCm);
    } catch {
      return null;
    }
  }, [pattern, fabricWidthCm]);

  return (
    <div className="flex-1 overflow-auto p-[22px] flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[19px] font-semibold">Plano de corte</span>
        <span className="text-[12px] text-muted">{pattern.name}</span>
      </div>

      {!plan ? (
        <div className="flex-1 border border-dashed border-pattern-guide rounded-card bg-surface-alt flex items-center justify-center min-h-[200px]">
          <span className="text-[12.5px] text-muted">Gere um molde para ver o plano de corte.</span>
        </div>
      ) : (
        <>
          {/* seletor de largura de tecido */}
          <div className="flex flex-col gap-[6px]">
            <span className="text-[11px] font-semibold tracking-[.8px] uppercase text-muted">
              Largura do tecido
            </span>
            <div className="flex gap-[6px]">
              {FABRIC_WIDTHS_CM.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setFabricWidthCm(w)}
                  className={[
                    "text-[12.5px] px-[13px] py-[6px] rounded-btn border transition-colors",
                    w === fabricWidthCm
                      ? "border-olive text-olive bg-olive-tint font-semibold"
                      : "border-border bg-surface hover:bg-surface-alt",
                  ].join(" ")}
                >
                  {meters(w)}
                </button>
              ))}
            </div>
          </div>

          {/* métricas */}
          <div className="flex gap-3 flex-wrap">
            <Metric label="Consumo" value={meters(plan.lengthCm)} hint="comprimento no tecido" />
            <Metric
              label="Aproveitamento"
              value={`${Math.round(plan.efficiency * 100)}%`}
              hint="área útil / área do tecido"
            />
            <Metric
              label="Peças no corte"
              value={String(plan.instances.length)}
              hint="cópias (peça × quantidade)"
            />
          </div>

          {plan.overflow && (
            <span
              role="alert"
              className="text-[11.5px] text-alert bg-amber-bg border border-amber-border rounded-item px-[10px] py-[6px]"
            >
              Alguma peça é mais larga que o tecido — use um tecido mais largo ou reduza a peça.
            </span>
          )}

          {/* prévia do encaixe */}
          <div className="border border-border rounded-card bg-surface-alt p-3 overflow-auto">
            <svg
              viewBox={`0 0 ${fabricWidthCm} ${plan.lengthCm}`}
              className="w-full h-auto"
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

          <p className="text-[10.5px] text-muted leading-snug">
            Encaixe automático first-fit (não ótimo) · fio travado, sem rotação das peças ·
            cada peça repetida pela quantidade a cortar. Linha líquida — sem margem de costura.
            Encaixe manual e otimizado <span className="text-olive font-semibold">em breve</span>.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border border-border rounded-card bg-surface p-[14px] flex flex-col gap-1 min-w-[150px]">
      <span className="text-[11px] font-semibold tracking-[.8px] uppercase text-muted">{label}</span>
      <span className="font-display text-[19px] font-semibold">{value}</span>
      <span className="text-[10.5px] text-muted">{hint}</span>
    </div>
  );
}
