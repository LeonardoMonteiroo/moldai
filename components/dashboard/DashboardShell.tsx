"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardStore } from "@/lib/dashboardStore";
import { AppShell } from "@/components/shared/AppShell";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { Sidebar } from "./Sidebar";
import { PatternGrid } from "./PatternGrid";
import { CreditsCard } from "./CreditsCard";
import { RecentUsageCard } from "./RecentUsageCard";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";

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
  const checklist = useDashboardStore((s) => s.checklist);
  const patterns = useDashboardStore((s) => s.patterns);
  const recentUsage = useDashboardStore((s) => s.recentUsage);
  const init = useDashboardStore((s) => s.init);
  const actionError = useDashboardStore((s) => s.actionError);
  const clearActionError = useDashboardStore((s) => s.clearActionError);

  useEffect(() => {
    init();
  }, [init]);

  const create = useDashboardStore((s) => s.create);
  const openPattern = (id: string) => router.push(`/pattern/${id}`);

  // create() records its own failure on this screen's store, which the
  // ActionErrorNotice below renders.
  const handleNewPattern = async () => {
    const id = await create();
    if (id) openPattern(id);
  };

  // Loading and error live inside the content region, not in place of the
  // whole screen: the header and nav are stable across the fetch. The
  // dashboard passes neither backHref nor title — it IS "/", and the sidebar
  // already marks "Meus moldes" as the active section.
  return (
    <AppShell
      credits={credits}
      userEmail={userEmail}
      sidebar={<Sidebar active="patterns" />}
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
        <div role="status" className="flex flex-1 flex-col gap-4 p-[22px]">
          <span className="sr-only">{t("loading")}</span>
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-8 w-[200px]" />
            <div className="flex-1" />
            <Skeleton className="h-[34px] w-[200px]" />
            <Skeleton className="h-[34px] w-[150px]" />
          </div>
          <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="rounded-card h-[168px] w-full" />
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            <Skeleton className="rounded-card h-[100px] min-w-[200px] flex-1" />
            <Skeleton className="rounded-card h-[100px] min-w-[200px] flex-1" />
          </div>
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
        // #114: one scroll region owns the grid AND the summary cards, so an
        // empty or lightly-populated grid sizes to its own content and the
        // cards sit directly beneath it, rather than the grid alone being
        // stretched to fill the viewport and shoving the cards to the floor.
        // Deliberately no `fill` -- that's what forces the stretch.
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 pt-[22px]">
            <PatternGrid
              onOpen={openPattern}
              onNewPattern={handleNewPattern}
              checklistSlot={
                checklist && (
                  <OnboardingChecklistCard
                    patterns={patterns}
                    checklist={checklist}
                  />
                )
              }
            />
            {credits && (
              <div className="flex flex-col gap-[14px] px-[22px] pb-[22px] sm:flex-row">
                <CreditsCard credits={credits} />
                <RecentUsageCard entries={recentUsage} />
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </AppShell>
  );
}
