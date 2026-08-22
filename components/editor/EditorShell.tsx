"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useEditorStore } from "@/lib/store";
import { relativeTime } from "@/lib/format";
import { AppShell } from "@/components/shared/AppShell";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "./ChatPanel";
import { CanvasArea } from "./CanvasArea";
import { Footer } from "./Footer";
import { PaywallModal } from "./PaywallModal";

export function EditorShell({
  userEmail,
  patternId,
}: {
  userEmail: string;
  patternId: string;
}) {
  const t = useTranslations("EditorShell");
  const tf = useTranslations("Format");
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
    init(patternId);
  }, [init, patternId]);

  // A failed load has to be distinguishable from a slow one. Without this the
  // store's `ready` stayed false forever on a rejected fetch and the loading
  // text below was the permanent end state.
  if (error && !pattern) {
    return (
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
    );
  }

  // The header's title IS the pattern name, so unlike the other screens there
  // is nothing to paint until the store is ready.
  if (!ready || !pattern || !credits) {
    return (
      <div className="text-muted text-control flex flex-1 items-center justify-center">
        {t("loading")}
      </div>
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
          footer={
            <Footer
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
