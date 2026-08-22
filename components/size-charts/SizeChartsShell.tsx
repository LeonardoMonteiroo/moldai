"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shared/AppShell";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { ScrollArea } from "@/components/ui/scroll-area";
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
      subtitle={t("subtitle")}
      backHref="/"
      credits={credits}
      userEmail={userEmail}
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
      {/* `fill` + `min-h-full`: the two columns are full-height panels, not a
          stack of cards, so the row has to keep the region's height. */}
      {ready && !error && (
        <ScrollArea fill className="min-h-0 flex-1">
          <div className="flex min-h-full gap-4 p-[22px]">
            <SizeChartLibrary />
            {draft && <SizeChartTable />}
          </div>
        </ScrollArea>
      )}
    </AppShell>
  );
}
