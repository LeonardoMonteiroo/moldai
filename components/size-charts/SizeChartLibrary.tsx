"use client";

import { useTranslations } from "next-intl";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";

export function SizeChartLibrary() {
  const t = useTranslations("SizeCharts");
  const tLib = useTranslations("SizeChartLibrary");
  const charts = useSizeChartsStore((s) => s.charts);
  const selectedId = useSizeChartsStore((s) => s.selectedId);
  const select = useSizeChartsStore((s) => s.select);
  const create = useSizeChartsStore((s) => s.create);

  return (
    <div className="flex w-[230px] shrink-0 flex-col gap-[9px]">
      {charts.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => select(c.id)}
          className={[
            "rounded-item flex flex-col gap-px border p-[11px] text-left transition-colors",
            c.id === selectedId
              ? "border-olive bg-olive-tint"
              : "border-border bg-surface hover:bg-surface-alt",
          ].join(" ")}
        >
          <span className="text-[12.5px] font-semibold">
            {c.name}
            {c.isActive && (
              <span className="text-olive ml-[6px] text-[10px] font-semibold tracking-[.6px] uppercase">
                {tLib("activeBadge")}
              </span>
            )}
          </span>
          <span className="text-muted-2 text-[11.5px]">
            {c.sizes[0]}–{c.sizes[c.sizes.length - 1]} ·{" "}
            {c.isSystem ? tLib("systemBadge") : tLib("customBadge")}
          </span>
        </button>
      ))}

      <div className="flex-1" />

      <div className="border-border rounded-card bg-paper text-muted border border-dashed p-3 text-[12px] leading-relaxed">
        {t("importLabel")}
      </div>

      <button
        type="button"
        onClick={() => create()}
        className="bg-ink rounded-btn px-[13px] py-[9px] text-center text-[12.5px] font-medium text-white transition-[filter] hover:brightness-[0.95]"
      >
        {t("newSizeChartButton")}
      </button>
    </div>
  );
}
