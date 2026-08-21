"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useEditorStore } from "@/lib/store";
import { AppShell } from "@/components/shared/AppShell";
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
  const tTopbar = useTranslations("Topbar");
  const ready = useEditorStore((s) => s.ready);
  const pattern = useEditorStore((s) => s.pattern);
  const credits = useEditorStore((s) => s.credits);
  const conflict = useEditorStore((s) => s.conflict);
  const generationStatus = useEditorStore((s) => s.generationStatus);
  const paywallOpen = useEditorStore((s) => s.paywall.open);
  const init = useEditorStore((s) => s.init);

  useEffect(() => {
    init(patternId);
  }, [init, patternId]);

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
          subtitle={tTopbar("savedVersion", {
            savedAgo: pattern.savedAgo,
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
