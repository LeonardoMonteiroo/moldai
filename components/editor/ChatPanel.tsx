"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useEditorStore, GENERATION_STEP_COUNT } from "@/lib/store";
import { ChatBubble } from "./ChatBubble";
import { AttachmentChips } from "./AttachmentChips";
import { MessageInput } from "./MessageInput";
import { ConflictActions } from "./ConflictActions";
import { COSTS } from "@/lib/types";

export function ChatPanel() {
  const t = useTranslations("ChatPanel");
  const chat = useEditorStore((s) => s.chat);
  const conflict = useEditorStore((s) => s.conflict);
  const generationStatus = useEditorStore((s) => s.generationStatus);
  const generationStepIndex = useEditorStore((s) => s.generationStepIndex);
  const sendMessage = useEditorStore((s) => s.sendMessage);
  const cancelGeneration = useEditorStore((s) => s.cancelGeneration);
  const resolveConflict = useEditorStore((s) => s.resolveConflict);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chat.length, generationStatus]);

  const isGenerating = generationStatus === "generating";
  const tSteps = useTranslations("GeneratingOverlay");

  return (
    <div className="bg-surface border-border flex min-h-0 w-[312px] shrink-0 flex-col border-r">
      <div className="border-line flex items-center gap-2 border-b px-4 py-[13px]">
        <span className="text-muted text-[11px] font-semibold tracking-[.8px] uppercase">
          {t("title")}
        </span>
        <div className="flex-1" />
        <span className="text-muted text-[11px]">{t("subtitle")}</span>
      </div>

      <div
        ref={listRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        {chat.map((message, i) => (
          <ChatBubble
            key={message.id}
            message={message}
            active={i === chat.length - 1 && generationStatus !== "generating"}
          />
        ))}
        {conflict && (
          <ConflictActions
            onFix={() => resolveConflict("fix")}
            onIgnore={() => resolveConflict("ignore")}
          />
        )}
        {generationStatus === "error" && (
          <div className="bg-amber-bg border-amber-border text-amber-text max-w-[92%] rounded-[12px_12px_12px_3px] border px-[13px] py-[10px] text-[13px] leading-[1.45]">
            {t("generationError")}
          </div>
        )}
      </div>

      <div className="border-line flex flex-col gap-[10px] border-t px-4 py-[14px]">
        {isGenerating ? (
          <>
            <div className="border-disabled-border rounded-item text-muted-2 bg-surface-alt border border-dashed p-2 text-[12.5px]">
              {tSteps("steps.stepLabel", {
                n: generationStepIndex + 1,
                stage: tSteps("steps.stage" + (generationStepIndex + 1)),
              })}
              <div className="bg-track mt-[7px] h-[6px] overflow-hidden rounded-full">
                <div
                  className="bg-ink h-full animate-pulse transition-all duration-300"
                  style={{
                    // Never reaches 100% while the AI is responding — leaves headroom
                    // and pulses so it doesn't look "done" stuck on the last step.
                    width: `${Math.min(92, ((generationStepIndex + 1) / (GENERATION_STEP_COUNT + 0.5)) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <span className="text-muted text-[11px]">
              {t("generatingCost", { cost: COSTS.adjust })}
            </span>
            <div className="flex items-center gap-[10px]">
              <div className="bg-disabled-border text-disabled rounded-item flex-1 py-[11px] text-center text-[13px] font-semibold">
                {t("generateButton")}
              </div>
              <button
                onClick={cancelGeneration}
                className="border-border rounded-btn text-muted-2 hover:bg-surface-alt border px-3 py-2 text-[12px] transition-colors"
              >
                {t("cancelButton")}
              </button>
            </div>
          </>
        ) : (
          <>
            <AttachmentChips />
            <MessageInput disabled={isGenerating} onSend={sendMessage} />
          </>
        )}
      </div>
    </div>
  );
}
