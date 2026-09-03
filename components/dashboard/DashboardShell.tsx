"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDashboardStore,
  type NewPatternFormInput,
} from "@/lib/dashboardStore";
import { AppShell } from "@/components/shared/AppShell";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { Sidebar } from "./Sidebar";
import { NewPatternDialog } from "./NewPatternDialog";
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

  // Dashboard.dc.html routes every "new pattern" affordance through one
  // chooser rather than creating a blank pattern outright -- the toolbar
  // button, the empty state and the grid's trailing cell all open it.
  const [chooserOpen, setChooserOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // create() records its own failure on this screen's store, which the
  // ActionErrorNotice below renders.
  const handleStartFromPrompt = async () => {
    setCreating(true);
    const id = await create();
    setCreating(false);
    if (id) openPattern(id);
    // Closed on failure too: create() records the error on this screen's
    // store, and that notice renders in the content region behind the
    // dialog -- leaving it open would hide the only feedback there is.
    else setChooserOpen(false);
  };

  const createFromForm = useDashboardStore((s) => s.createFromForm);
  const creatingFromForm = useDashboardStore((s) => s.creatingFromForm);
  const [formErrorCode, setFormErrorCode] = useState<string | null>(null);

  // Unlike the prompt option, a failure here keeps the dialog OPEN: the form
  // holds everything the user filled in, and the store keeps the created
  // Pattern's id so submitting again resumes it rather than orphaning a
  // second one. The code is handed back to the form, which resolves its own
  // message -- ActionErrorNotice renders one fixed sentence and sits behind
  // the dialog.
  const handleSubmitForm = async (input: NewPatternFormInput) => {
    setFormErrorCode(null);
    const result = await createFromForm(input);
    if (result.status === "ok") openPattern(result.id);
    else setFormErrorCode(result.code);
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
            title={t("dismissPatternMissing")}
            onClick={() => setDismissedMissing(true)}
          >
            <XIcon />
          </Button>
        </div>
      )}
      {!ready && (
        <div role="status" className="flex flex-1 flex-col gap-4 p-[22px]">
          <span className="sr-only">{t("loading")}</span>
          {/* Mirrors Dashboard.dc.html's own loading composition: a short
              count placeholder, then one placeholder per real control in the
              row (search / filter / "+ Novo molde" -- the button's was
              missing), then cards shaped like the cards they stand in for
              rather than plain blocks, so the skeleton doesn't reflow into a
              different layout the moment data lands. */}
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-[26px] w-[120px]" />
            <div className="flex-1" />
            <Skeleton className="h-[34px] w-[200px]" />
            <Skeleton className="h-[34px] w-[150px]" />
            <Skeleton className="h-[34px] w-[120px]" />
          </div>
          <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="border-border rounded-card flex flex-col gap-2 border bg-white p-[10px]"
              >
                <Skeleton className="rounded-item h-[128px] w-full" />
                <Skeleton className="h-[13px] w-[70%]" />
                <Skeleton className="h-[11px] w-[45%]" />
              </div>
            ))}
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
              onNewPattern={() => setChooserOpen(true)}
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
      <NewPatternDialog
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        onStartFromPrompt={handleStartFromPrompt}
        creating={creating}
        onSubmitForm={handleSubmitForm}
        submittingForm={creatingFromForm}
        formErrorCode={formErrorCode}
      />
    </AppShell>
  );
}
