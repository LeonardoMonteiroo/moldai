"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDashboardStore } from "@/lib/dashboardStore";
import { DashboardTopbar } from "./DashboardTopbar";
import { Sidebar } from "./Sidebar";
import { MoldeGrid } from "./MoldeGrid";
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

  const openMolde = (id: string) => router.push(`/molde/${id}`);

  if (!ready) {
    return (
      <div className="text-muted flex flex-1 items-center justify-center text-[13px]">
        {t("loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-alert flex flex-1 items-center justify-center text-[13px]">
        {t("loadError")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardTopbar userEmail={userEmail} credits={credits} />
      <div className="flex min-h-0 flex-1">
        <Sidebar onCreate={openMolde} />
        <div className="flex min-h-0 flex-1 flex-col">
          <MoldeGrid onOpen={openMolde} />
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
