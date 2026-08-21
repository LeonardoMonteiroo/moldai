"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDashboardStore } from "@/lib/dashboardStore";
import { AppShell } from "@/components/shared/AppShell";
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

  // Loading and error live inside the content region, not in place of the
  // whole screen: the header and nav are stable across the fetch. The
  // dashboard passes no backHref — it IS "/".
  return (
    <AppShell
      title={t("title")}
      credits={credits}
      userEmail={userEmail}
      sidebar={<Sidebar onCreate={openPattern} />}
    >
      {!ready && (
        <div className="text-muted text-control flex flex-1 items-center justify-center">
          {t("loading")}
        </div>
      )}
      {ready && error && (
        <div className="text-alert text-control flex flex-1 items-center justify-center">
          {t("loadError")}
        </div>
      )}
      {ready && !error && (
        <>
          <PatternGrid onOpen={openPattern} />
          {credits && (
            <div className="flex gap-[14px] px-[22px] pb-[22px]">
              <CreditsCard credits={credits} />
              <RecentUsageCard entries={recentUsage} />
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
