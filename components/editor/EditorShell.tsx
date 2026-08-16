"use client";

import { useEffect } from "react";
import { useEditorStore } from "@/lib/store";
import { Topbar } from "./Topbar";
import { ChatPanel } from "./ChatPanel";
import { CanvasArea } from "./CanvasArea";
import { Footer } from "./Footer";
import { PaywallModal } from "./PaywallModal";

export function EditorShell({ userEmail }: { userEmail: string }) {
  const ready = useEditorStore((s) => s.ready);
  const pattern = useEditorStore((s) => s.pattern);
  const credits = useEditorStore((s) => s.credits);
  const conflict = useEditorStore((s) => s.conflict);
  const generationStatus = useEditorStore((s) => s.generationStatus);
  const paywallOpen = useEditorStore((s) => s.paywall.open);
  const init = useEditorStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  if (!ready || !pattern || !credits) {
    return (
      <div className="text-muted flex flex-1 items-center justify-center text-[13px]">
        Carregando molde…
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
        <Topbar pattern={pattern} credits={credits} userEmail={userEmail} />
        <div className="flex min-h-0 flex-1">
          <ChatPanel />
          <CanvasArea />
        </div>
        <Footer
          pattern={pattern}
          conflictActive={conflict !== null}
          generating={generationStatus === "generating"}
        />
      </div>
      <PaywallModal />
    </div>
  );
}
