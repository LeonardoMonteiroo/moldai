"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
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
        credits={credits}
        userEmail={userEmail}
      />
      {!ready && (
        <div className="text-muted flex flex-1 items-center justify-center text-[13px]">
          {t("loading")}
        </div>
      )}
      {ready && error && (
        <div className="text-muted flex flex-1 items-center justify-center text-[13px]">
          {t("loadError")}
        </div>
      )}
      {ready && !error && (
        <div className="flex flex-1 gap-4 overflow-y-auto p-[22px]">
          <SizeChartLibrary />
          {draft && <SizeChartTable />}
        </div>
      )}
    </div>
  );
}
