"use client";

import { useEffect } from "react";
import { useEditorStore } from "@/lib/store";
import { Topbar } from "./Topbar";
import { ChatPanel } from "./ChatPanel";
import { CanvasArea } from "./CanvasArea";
import { Footer } from "./Footer";
import { PaywallModal } from "./PaywallModal";

export function EditorShell() {
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
      <div className="flex-1 flex items-center justify-center text-[13px] text-muted">
        Carregando molde…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden min-h-0">
      <div
        className={paywallOpen ? "flex-1 flex flex-col min-h-0 opacity-30 blur-[1.2px] pointer-events-none" : "flex-1 flex flex-col min-h-0"}
      >
        <Topbar pattern={pattern} credits={credits} />
        <div className="flex flex-1 min-h-0">
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
