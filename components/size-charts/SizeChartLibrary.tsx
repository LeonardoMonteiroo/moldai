"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";
import { ImportSizeChartDialog } from "./ImportSizeChartDialog";

function ChartCard({
  chart: c,
  selected,
  onSelect,
}: {
  chart: ReturnType<typeof useSizeChartsStore.getState>["charts"][number];
  selected: boolean;
  onSelect: () => void;
}) {
  const tLib = useTranslations("SizeChartLibrary");

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "rounded-item flex items-center gap-[9px] border p-[11px] text-left transition-colors",
        selected
          ? "border-olive bg-olive-tint"
          : "border-border bg-surface hover:bg-surface-alt",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "w-[3px] self-stretch rounded-full",
          selected ? "bg-olive" : "bg-transparent",
        ].join(" ")}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
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
        {/* "ativa" alone read as "used for everything", but generation falls
            back to the system chart whenever the garment's gender differs.
            Only shown on the active chart, where the limit actually bites. */}
        {c.isActive && (
          <span className="text-muted-2 text-meta">
            {tLib("activeScope", { gender: tLib("gender." + c.gender) })}
          </span>
        )}
      </span>
    </button>
  );
}

export function SizeChartLibrary() {
  const t = useTranslations("SizeCharts");
  const tLib = useTranslations("SizeChartLibrary");
  const charts = useSizeChartsStore((s) => s.charts);
  const selectedId = useSizeChartsStore((s) => s.selectedId);
  const select = useSizeChartsStore((s) => s.select);
  const create = useSizeChartsStore((s) => s.create);
  const systemCharts = charts.filter((c) => c.isSystem);
  const myCharts = charts.filter((c) => !c.isSystem);

  return (
    <div className="border-border flex w-[252px] shrink-0 flex-col border-r">
      <div className="flex flex-col gap-[3px] pb-3">
        <span className="font-display text-title font-semibold">
          {t("title")}
        </span>
        <span className="text-muted text-meta text-pretty">
          {t("subtitle")}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {systemCharts.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <span className="text-muted text-tick tracking-eyebrow px-1 font-semibold uppercase">
              {tLib("systemSectionLabel")}
            </span>
            {systemCharts.map((c) => (
              <ChartCard
                key={c.id}
                chart={c}
                selected={c.id === selectedId}
                onSelect={() => select(c.id)}
              />
            ))}
            {/* #133: "padrão do sistema" alone didn't say the numbers aren't
                a certified standard -- shown once for the whole group, not
                per card. */}
            <span className="text-muted-2 text-tick px-[5px] text-pretty">
              {tLib("houseStandardNote")}
            </span>
          </div>
        )}

        {myCharts.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <span className="text-muted text-tick tracking-eyebrow px-1 font-semibold uppercase">
              {tLib("myChartsSectionLabel")}
            </span>
            {myCharts.map((c) => (
              <ChartCard
                key={c.id}
                chart={c}
                selected={c.id === selectedId}
                onSelect={() => select(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      <div className="border-border flex flex-col gap-[7px] border-t pt-3">
        <Button onClick={() => create()}>{t("newSizeChartButton")}</Button>
        {/* #12: was an inert dashed placeholder (SizeCharts.importLabel) with
            no onClick, no file input, no parser -- ImportSizeChartDialog is
            the real control now, kept in the same dashed spot in the layout. */}
        <ImportSizeChartDialog />
      </div>
    </div>
  );
}
