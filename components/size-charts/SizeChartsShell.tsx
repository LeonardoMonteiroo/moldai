"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shared/AppShell";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { Skeleton } from "@/components/ui/skeleton";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { SizeChartLibrary } from "./SizeChartLibrary";
import { SizeChartTable } from "./SizeChartTable";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";
import type { Credits } from "@/lib/types";

export function SizeChartsShell({
  userEmail,
  credits,
}: {
  userEmail: string;
  credits: Credits;
}) {
  const t = useTranslations("SizeCharts");
  const init = useSizeChartsStore((s) => s.init);
  const ready = useSizeChartsStore((s) => s.ready);
  const error = useSizeChartsStore((s) => s.error);
  const draft = useSizeChartsStore((s) => s.draft);
  const actionError = useSizeChartsStore((s) => s.actionError);
  const clearActionError = useSizeChartsStore((s) => s.clearActionError);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <AppShell
      title={t("title")}
      backHref="/"
      credits={credits}
      userEmail={userEmail}
      sidebar={<Sidebar active="size-charts" />}
    >
      {/* A failed save/activate/delete used to be completely silent, with
          `dirty` left true and no explanation. */}
      {actionError && <ActionErrorNotice onDismiss={clearActionError} />}
      {!ready && (
        // Shaped like the two panels it stands in for, at their real widths,
        // so the skeleton doesn't reflow into a different layout when the
        // charts land. The library half was 220px wide against a 252px
        // column, and the table half a single undifferentiated block.
        <div role="status" className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <span className="sr-only">{t("loading")}</span>
          <div className="border-border flex w-full shrink-0 flex-col gap-2 border-b p-[14px] lg:w-[252px] lg:border-r lg:border-b-0">
            <Skeleton className="mb-1 h-[15px] w-[60%]" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="rounded-item h-[52px] w-full" />
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-[22px]">
            <div className="flex items-center gap-[10px]">
              <Skeleton className="h-[30px] w-[200px]" />
              <Skeleton className="h-[18px] w-[84px] rounded-full" />
              <div className="flex-1" />
              <Skeleton className="h-[28px] w-[76px]" />
            </div>
            <Skeleton className="rounded-card h-[400px] w-full" />
          </div>
        </div>
      )}
      {ready && error && (
        <div
          role="alert"
          className="text-muted text-control flex flex-1 items-center justify-center"
        >
          {t("loadError")}
        </div>
      )}
      {/* Two flush full-height panels at `lg` and up, each owning its own
          scroll -- Medidas e grades.dc.html's own structure, and not a
          cosmetic point: as one padded region scrolling together, the
          library's footer ("Nova grade" / "Importar planilha") was laid out
          against the *table's* height and rendered ~400px below the fold on a
          900px viewport, so the screen's primary action was reachable only by
          scrolling past every measurement row. Below `lg` (#119) they stack
          and this region scrolls as one, which is correct there -- a 252px
          column and a wide table cannot sit side by side. */}
      {ready && !error && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <SizeChartLibrary />
          {draft && <SizeChartTable />}
        </div>
      )}
    </AppShell>
  );
}
