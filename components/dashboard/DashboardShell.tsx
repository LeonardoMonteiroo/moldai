"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/lib/dashboardStore";
import { AppShell } from "@/components/shared/AppShell";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { Sidebar } from "./Sidebar";
import { PatternGrid } from "./PatternGrid";
import { CreditsCard } from "./CreditsCard";
import { RecentUsageCard } from "./RecentUsageCard";

export function DashboardShell({
  userEmail,
  /** True when /pattern/[id] bounced here because the pattern was gone. */
  patternMissing = false,
}: {
  userEmail: string;
  patternMissing?: boolean;
}) {
  const t = useTranslations("DashboardShell");
  const router = useRouter();
  const [dismissedMissing, setDismissedMissing] = useState(false);
  const ready = useDashboardStore((s) => s.ready);
  const error = useDashboardStore((s) => s.error);
  const credits = useDashboardStore((s) => s.credits);
  const recentUsage = useDashboardStore((s) => s.recentUsage);
  const init = useDashboardStore((s) => s.init);
  const actionError = useDashboardStore((s) => s.actionError);
  const clearActionError = useDashboardStore((s) => s.clearActionError);

  useEffect(() => {
    init();
  }, [init]);

  const openPattern = (id: string) => router.push(`/pattern/${id}`);

  // Loading and error live inside the content region, not in place of the
  // whole screen: the header and nav are stable across the fetch. The
  // dashboard passes neither backHref nor title — it IS "/", and the sidebar
  // already marks "Meus moldes" as the active section.
  return (
    <AppShell
      credits={credits}
      userEmail={userEmail}
      sidebar={<Sidebar onCreate={openPattern} disabled={error} />}
    >
      {/* Sits above the list: a failed rename/delete/create leaves the list
          itself perfectly usable, so it gets a notice, not a takeover. */}
      {actionError && <ActionErrorNotice onDismiss={clearActionError} />}
      {/* Answers "why am I suddenly on the dashboard?" after /pattern/[id]
          redirects here for a pattern that is gone or not yours. */}
      {patternMissing && !dismissedMissing && (
        <div
          role="status"
          className="border-amber-border bg-amber-bg flex items-center gap-[10px] border-b px-[22px] py-[9px]"
        >
          <span className="text-ui flex-1">{t("patternMissing")}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("dismissPatternMissing")}
            onClick={() => setDismissedMissing(true)}
          >
            <XIcon />
          </Button>
        </div>
      )}
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
          className="text-alert text-control flex flex-1 items-center justify-center"
        >
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
