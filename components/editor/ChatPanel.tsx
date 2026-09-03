"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useEditorStore, GENERATION_STEP_COUNT } from "@/lib/store";
import { ChatBubble } from "./ChatBubble";
import { type AttachmentSelection } from "./AttachmentChips";
import { MessageInput } from "./MessageInput";
import { ConflictActions } from "./ConflictActions";
import { COSTS } from "@/lib/types";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

export function ChatPanel() {
  const t = useTranslations("ChatPanel");
  const chat = useEditorStore((s) => s.chat);
  const conflict = useEditorStore((s) => s.conflict);
  const generationStatus = useEditorStore((s) => s.generationStatus);
  const generationStepIndex = useEditorStore((s) => s.generationStepIndex);
  const lastFailedSend = useEditorStore((s) => s.lastFailedSend);
  const sendMessage = useEditorStore((s) => s.sendMessage);
  const cancelGeneration = useEditorStore((s) => s.cancelGeneration);
  const resolveConflict = useEditorStore((s) => s.resolveConflict);
  const [attachment, setAttachment] = useState<AttachmentSelection | null>(
    null,
  );
  const listRef = useRef<HTMLDivElement>(null);
  // Was the reader already at the bottom? If they scrolled up to re-read an
  // earlier turn, a generation finishing must not yank them back down.
  const pinnedToBottom = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      pinnedToBottom.current =
        el.scrollHeight - el.clientHeight - el.scrollTop < 40;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !pinnedToBottom.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.length, generationStatus]);

  const isGenerating = generationStatus === "generating";
  const tSteps = useTranslations("GeneratingOverlay");

  return (
    <div className="bg-surface border-border flex min-h-0 w-[312px] shrink-0 flex-col border-r">
      {/* No header bar: Editor.dc.html's chat column starts straight at the
          first bubble. The old "CONVERSA / MoldAI v2 Pro" strip also stated a
          capability that does not exist -- lib/billing/plans.ts marks
          `modelV2Pro` as status "soon", and every plan drafts with
          claude-sonnet-5, so the editor was claiming an unshipped model as
          present fact on every screen. */}
      <ScrollArea viewportRef={listRef} className="min-h-0 flex-1">
        {/* role="log" + polite: the AI's reply is the whole point of this
            screen, and its arrival was announced nowhere. "log" (rather than
            plain aria-live) tells assistive tech this is an append-only
            thread, so only the new turn is read out, not the whole history. */}
        <div role="log" aria-live="polite" className="flex flex-col gap-3 p-4">
          {chat.map((message, i) => (
            <ChatBubble
              key={message.id}
              message={message}
              active={
                i === chat.length - 1 && generationStatus !== "generating"
              }
            />
          ))}
          {conflict && (
            <ConflictActions
              onFix={() => resolveConflict("fix")}
              onIgnore={() => resolveConflict("ignore")}
              // #134: a legacy conflict (no `entries`) was always the
              // armhole/cap case, so it stays fixable; a live one offers
              // "Corrigir manga" only while at least one of its divergences
              // is actually addressed by it.
              fixable={
                conflict.entries
                  ? conflict.entries.some((e) => e.fixable)
                  : true
              }
            />
          )}
          {generationStatus === "error" && (
            // Was a hand-rolled copy of the conflict bubble's classes living
            // outside ChatBubble; it is the same thing, so it is the same
            // primitive. `role="alert"` because a failed generation appearing
            // in the thread announced nothing at all before.
            <Bubble variant="notice">
              <BubbleContent role="alert" className="flex flex-col gap-2">
                <span>{t("generationError")}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => lastFailedSend?.()}
                  >
                    {t("generationErrorRetryButton")}
                  </Button>
                  <span className="text-muted-2 text-meta">
                    {t("generationErrorNoCostNote")}
                  </span>
                </div>
              </BubbleContent>
            </Bubble>
          )}
        </div>
      </ScrollArea>

      {/* Editor.dc.html:185: the composer sits on its own warm band, with the
          card inside it white -- the band used to be the same surface as the
          thread above, so the composer had no edge of its own. */}
      <div className="border-border bg-surface-alt flex flex-col gap-[9px] border-t px-[14px] py-3">
        {isGenerating ? (
          // Editor.dc.html:187-198: one card carrying the step label, the
          // credit cost, the bar, and Cancelar alone on the trailing row.
          // The greyed full-width "Gerar" placeholder that used to sit beside
          // Cancelar is not in the design -- it only restated the state the
          // progress bar above it already shows.
          <div className="border-border rounded-card bg-surface border px-3 py-[11px]">
            <div className="flex items-baseline gap-2">
              <span className="text-muted-2 text-ui">
                {tSteps("steps.stepLabel", {
                  n: generationStepIndex + 1,
                  stage: tSteps("steps.stage" + (generationStepIndex + 1)),
                })}
              </span>
              <div className="flex-1" />
              <span className="text-muted text-meta whitespace-nowrap">
                {t("generatingCost", { cost: COSTS.adjust })}
              </span>
            </div>
            <Progress
              value={Math.min(
                92,
                ((generationStepIndex + 1) / (GENERATION_STEP_COUNT + 0.5)) *
                  100,
              )}
              aria-label={tSteps("steps.stage" + (generationStepIndex + 1))}
              className="mt-[9px] h-[5px] [&>[data-slot=progress-indicator]]:animate-pulse"
            />
            <div className="mt-[11px] flex items-center">
              <div className="flex-1" />
              <Button
                variant="outline"
                size="chrome"
                onClick={cancelGeneration}
                className="text-muted-2 h-8"
              >
                {t("cancelButton")}
              </Button>
            </div>
          </div>
        ) : (
          <MessageInput
            disabled={isGenerating || attachment?.status === "preparing"}
            attachment={attachment}
            onAttachmentChange={setAttachment}
            onSend={(message) => {
              const prepared =
                attachment?.status === "ready" ? attachment.prepared : null;
              sendMessage(message, {
                // One at most: the composer's own cap, unchanged by the
                // wire moving to a list.
                images: prepared ? [prepared] : undefined,
              });
              setAttachment(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
