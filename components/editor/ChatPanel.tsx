"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useEditorStore, GENERATION_STEP_COUNT } from "@/lib/store";
import { ChatBubble } from "./ChatBubble";
import { AttachmentChips, type AttachmentSelection } from "./AttachmentChips";
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
      <div className="border-line flex items-center gap-2 border-b px-4 py-[13px]">
        <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
          {t("title")}
        </span>
        <div className="flex-1" />
        <span className="text-muted text-meta">{t("subtitle")}</span>
      </div>

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
            />
          )}
          {generationStatus === "error" && (
            // Was a hand-rolled copy of the conflict bubble's classes living
            // outside ChatBubble; it is the same thing, so it is the same
            // primitive. `role="alert"` because a failed generation appearing
            // in the thread announced nothing at all before.
            <Bubble variant="notice">
              <BubbleContent role="alert">{t("generationError")}</BubbleContent>
            </Bubble>
          )}
        </div>
      </ScrollArea>

      <div className="border-line flex flex-col gap-[10px] border-t px-4 py-[14px]">
        {isGenerating ? (
          <>
            <div className="border-disabled-border rounded-item text-muted-2 bg-surface-alt text-ui border border-dashed p-2">
              {tSteps("steps.stepLabel", {
                n: generationStepIndex + 1,
                stage: tSteps("steps.stage" + (generationStepIndex + 1)),
              })}
              <Progress
                value={Math.min(
                  92,
                  ((generationStepIndex + 1) / (GENERATION_STEP_COUNT + 0.5)) *
                    100,
                )}
                aria-label={tSteps("steps.stage" + (generationStepIndex + 1))}
                className="bg-track mt-[7px] h-[6px] [&>[data-slot=progress-indicator]]:animate-pulse"
              />
            </div>
            <span className="text-muted text-meta">
              {t("generatingCost", { cost: COSTS.adjust })}
            </span>
            <div className="flex items-center gap-[10px]">
              <div className="bg-disabled-border text-disabled rounded-item text-control flex-1 py-[11px] text-center font-semibold">
                {t("generateButton")}
              </div>
              <Button
                variant="outline"
                size="chrome"
                onClick={cancelGeneration}
                className="text-muted-2"
              >
                {t("cancelButton")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <AttachmentChips attachment={attachment} onChange={setAttachment} />
            <MessageInput
              disabled={isGenerating || attachment?.status === "preparing"}
              onSend={(message) => {
                sendMessage(message, {
                  image:
                    attachment?.status === "ready"
                      ? attachment.prepared
                      : undefined,
                });
                setAttachment(null);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
