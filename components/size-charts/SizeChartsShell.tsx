"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
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

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        backHref="/"
        credits={credits}
        userEmail={userEmail}
      />
      {!ready && (
        <div className="text-muted text-control flex flex-1 items-center justify-center">
          {t("loading")}
        </div>
      )}
      {ready && error && (
        <div className="text-muted text-control flex flex-1 items-center justify-center">
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
    </div>
  );
}
