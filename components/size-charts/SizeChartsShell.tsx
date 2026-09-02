"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shared/AppShell";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { ScrollArea } from "@/components/ui/scroll-area";
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
        <div
          role="status"
          className="text-muted text-control flex flex-1 items-center justify-center"
        >
          {t("loading")}
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
      {/* `fill` + `min-h-full`: at `lg` and up the two columns are full-height
          panels, not a stack of cards, so the row has to keep the region's
          height. Below `lg` (#119) they stack instead -- the library's own
          w-[230px] cards fit a narrow column fine, and the table keeps its own
          overflow-x-auto for whatever width it ends up with. */}
      {ready && !error && (
        <ScrollArea fill className="min-h-0 flex-1">
          <div className="flex min-h-full flex-col gap-4 p-[22px] lg:flex-row">
            <SizeChartLibrary />
            {draft && <SizeChartTable />}
          </div>
        </ScrollArea>
      )}
    </AppShell>
  );
}
