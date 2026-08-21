"use client";

import { Button } from "@/components/ui/button";
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
          <span className="text-ui font-semibold">
            {c.name}
            {c.isActive && (
              <span className="text-olive text-tick tracking-eyebrow ml-[6px] font-semibold uppercase">
                {tLib("activeBadge")}
              </span>
            )}
          </span>
          <span className="text-muted-2 text-meta">
            {c.sizes[0]}–{c.sizes[c.sizes.length - 1]} ·{" "}
            {c.isSystem ? tLib("systemBadge") : tLib("customBadge")}
          </span>
        </button>
      ))}

      <div className="flex-1" />

      <div className="border-border rounded-card bg-paper text-muted text-ui border border-dashed p-3 leading-relaxed">
        {t("importLabel")}
      </div>

      <Button onClick={() => create()}>{t("newSizeChartButton")}</Button>
    </div>
  );
}
