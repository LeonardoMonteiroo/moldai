"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useEditorStore } from "@/lib/store";
import { relativeTime } from "@/lib/format";
import { AppShell, DESKTOP_MEDIA_QUERY } from "@/components/shared/AppShell";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatPanel } from "./ChatPanel";
import { CanvasArea } from "./CanvasArea";
import { HeaderActions } from "./HeaderActions";
import { PaywallModal } from "./PaywallModal";

/**
 * Local to this file on purpose (CLAUDE.md: no new hook unless two unrelated
 * components genuinely need one) -- the editor is the only screen that swaps
 * its entire content for a notice rather than reflowing, so nothing else
 * needs this. `DESKTOP_MEDIA_QUERY` itself is shared with AppShell's own
 * drawer collapse, so the two can't drift apart on what "desktop" means.
 *
 * Returns the raw tri-state (`null` = "not yet measured") rather than
 * resolving it to a boolean here: the render below treats `null` as
 * "desktop" (so the server-rendered/first-hydration pass never disagrees
 * with itself, at the cost of one frame of the editor on a real narrow
 * viewport before the effect corrects it -- cheaper than a hydration
 * mismatch), but the data-loading effect further down treats `null`
 * differently -- it *waits* rather than assuming, so a real mobile visit
 * never fires the pattern fetch at all.
 */
function useDesktopMatch() {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return matches;
}

export function EditorShell({
  userEmail,
  patternId,
}: {
  userEmail: string;
  patternId: string;
}) {
  const t = useTranslations("EditorShell");
  const tf = useTranslations("Format");
  const desktopMatch = useDesktopMatch();
  const isDesktop = desktopMatch !== false;
  const ready = useEditorStore((s) => s.ready);
  const pattern = useEditorStore((s) => s.pattern);
  const credits = useEditorStore((s) => s.credits);
  const conflict = useEditorStore((s) => s.conflict);
  const generationStatus = useEditorStore((s) => s.generationStatus);
  const paywallOpen = useEditorStore((s) => s.paywall.open);
  const error = useEditorStore((s) => s.error);
  const init = useEditorStore((s) => s.init);
  const clearError = useEditorStore((s) => s.clearError);

  useEffect(() => {
    // Waits for a definitive "yes" rather than firing on the same
    // assume-desktop default the render above uses -- a real mobile visit
    // never issues this fetch at all, since it never reaches `=== true`.
    if (desktopMatch !== true) return;
    init(patternId);
  }, [init, patternId, desktopMatch]);

  // The header persists through every one of these states now (it did not
  // used to -- see CLAUDE.md) -- only the content region swaps. `title` is
  // omitted rather than guessed at: the pattern's real name isn't known yet
  // in any of these branches, and AppShell already treats an absent title as
  // valid (the dashboard's own header has none).
  //
  // #119: the desktop gate comes before the load/error/loading checks below
  // -- a narrow viewport has nothing to gain from the editor's data loading
  // at all, and showing "Carregando molde…" first would just replace one
  // unusable screen with another.
  if (!isDesktop) {
    return (
      <AppShell backHref="/" credits={credits} userEmail={userEmail}>
        <div
          role="status"
          className="flex flex-1 flex-col items-center justify-center gap-2 p-[22px] text-center"
        >
          <p className="text-control font-semibold">{t("desktopOnlyTitle")}</p>
          <p className="text-muted text-ui max-w-[320px]">
            {t("desktopOnlyDescription")}
          </p>
        </div>
      </AppShell>
    );
  }

  // A failed load has to be distinguishable from a slow one. Without this the
  // store's `ready` stayed false forever on a rejected fetch and the loading
  // text below was the permanent end state.
  if (error && !pattern) {
    return (
      <AppShell backHref="/" credits={credits} userEmail={userEmail}>
        <div
          role="alert"
          className="flex flex-1 flex-col items-center justify-center gap-[14px]"
        >
          <p className="text-alert text-control">
            {error === "unauthorized" ? t("sessionExpired") : t("loadError")}
          </p>
          <Button
            variant="outline"
            size="chrome"
            onClick={() => {
              clearError();
              init(patternId);
            }}
          >
            {t("retryButton")}
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!ready || !pattern || !credits) {
    return (
      <AppShell backHref="/" credits={credits} userEmail={userEmail}>
        <div role="status" className="flex min-h-0 flex-1">
          <span className="sr-only">{t("loading")}</span>
          <div className="border-border flex w-[312px] shrink-0 flex-col gap-3 border-r p-4">
            <Skeleton className="h-6 w-2/3" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <div className="flex flex-1 items-center justify-center p-[22px]">
            <Skeleton className="h-full max-h-[500px] w-full max-w-[700px]" />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className={
          paywallOpen
            ? "pointer-events-none flex min-h-0 flex-1 flex-col opacity-30 blur-[1.2px]"
            : "flex min-h-0 flex-1 flex-col"
        }
      >
        <AppShell
          title={pattern.name}
          subtitle={t("savedVersion", {
            // pattern.updatedAt is set by every server response through
            // composeEditorState (lib/api/compose.ts) — the store's `pattern`
            // is typed PatternRecord, so this is a required string once the
            // ready/pattern guard above has passed.
            savedAgo: relativeTime(tf, pattern.updatedAt),
            version: pattern.version,
          })}
          backHref="/"
          credits={credits}
          userEmail={userEmail}
          headerActions={
            <HeaderActions
              pattern={pattern}
              conflictActive={conflict !== null}
              generating={generationStatus === "generating"}
            />
          }
        >
          {/* A notice, not a replacement: the pattern is intact, only the last
              action was not applied. */}
          {error && <ActionErrorNotice onDismiss={clearError} />}
          <div className="flex min-h-0 flex-1">
            <ChatPanel />
            <CanvasArea />
          </div>
        </AppShell>
      </div>
      <PaywallModal />
    </div>
  );
}
