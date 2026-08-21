"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDashboardStore } from "@/lib/dashboardStore";
import { DashboardTopbar } from "./DashboardTopbar";
import { Sidebar } from "./Sidebar";
import { PatternGrid } from "./PatternGrid";
import { CreditsCard } from "./CreditsCard";
import { RecentUsageCard } from "./RecentUsageCard";

export function DashboardShell({ userEmail }: { userEmail: string }) {
  const t = useTranslations("DashboardShell");
  const router = useRouter();
  const ready = useDashboardStore((s) => s.ready);
  const error = useDashboardStore((s) => s.error);
  const credits = useDashboardStore((s) => s.credits);
  const recentUsage = useDashboardStore((s) => s.recentUsage);
  const init = useDashboardStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  const openPattern = (id: string) => router.push(`/pattern/${id}`);

  if (!ready) {
    return (
      <div className="text-muted text-control flex flex-1 items-center justify-center">
        {t("loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-alert text-control flex flex-1 items-center justify-center">
        {t("loadError")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardTopbar userEmail={userEmail} credits={credits} />
      <div className="flex min-h-0 flex-1">
        <Sidebar onCreate={openPattern} />
        <div className="flex min-h-0 flex-1 flex-col">
          <PatternGrid onOpen={openPattern} />
          {credits && (
            <div className="flex gap-[14px] px-[22px] pb-[22px]">
              <CreditsCard credits={credits} />
              <RecentUsageCard entries={recentUsage} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
