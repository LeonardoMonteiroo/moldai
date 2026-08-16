"use client";

import { useEffect, useRef } from "react";
import { useEditorStore, GENERATION_STEPS } from "@/lib/store";
import { ChatBubble } from "./ChatBubble";
import { AttachmentChips } from "./AttachmentChips";
import { MessageInput } from "./MessageInput";
import { ConflictActions } from "./ConflictActions";
import { COSTS } from "@/lib/types";

export function ChatPanel() {
  const chat = useEditorStore((s) => s.chat);
  const conflict = useEditorStore((s) => s.conflict);
  const generationStatus = useEditorStore((s) => s.generationStatus);
  const generationStepIndex = useEditorStore((s) => s.generationStepIndex);
  const sendMessage = useEditorStore((s) => s.sendMessage);
  const cancelGeneration = useEditorStore((s) => s.cancelGeneration);
  const resolveConflict = useEditorStore((s) => s.resolveConflict);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, generationStatus]);

  const isGenerating = generationStatus === "generating";
  const step = GENERATION_STEPS[generationStepIndex];

  return (
    <div className="w-[312px] shrink-0 bg-surface border-r border-border flex flex-col min-h-0">
      <div className="px-4 py-[13px] border-b border-line flex items-center gap-2">
        <span className="text-[11px] font-semibold tracking-[.8px] uppercase text-muted">
          Conversa
        </span>
        <div className="flex-1" />
        <span className="text-[11px] text-muted">MoldAI v2 Pro</span>
      </div>

      <div ref={listRef} className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
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
          <div className="max-w-[92%] bg-amber-bg border border-amber-border text-amber-text text-[13px] leading-[1.45] px-[13px] py-[10px] rounded-[12px_12px_12px_3px]">
            A geração falhou. Seus créditos foram devolvidos — tente novamente.
          </div>
        )}
      </div>

      <div className="px-4 py-[14px] border-t border-line flex flex-col gap-[10px]">
        {isGenerating ? (
          <>
            <div className="border border-dashed border-disabled-border rounded-item p-2 text-[12.5px] text-muted-2 bg-surface-alt">
              {step.label}
              <div className="h-[6px] rounded-full bg-track overflow-hidden mt-[7px]">
                <div
                  className="h-full bg-ink transition-all duration-300 animate-pulse"
                  style={{
                    // Nunca chega a 100% enquanto a IA responde — deixa headroom
                    // e pulsa pra não parecer "concluído" parado no último passo.
                    width: `${Math.min(92, ((generationStepIndex + 1) / (GENERATION_STEPS.length + 0.5)) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <span className="text-[11px] text-muted">−{COSTS.adjust} crédito · gerando…</span>
            <div className="flex items-center gap-[10px]">
              <div className="flex-1 bg-disabled-border text-disabled rounded-item py-[11px] text-center text-[13px] font-semibold">
                Gerar
              </div>
              <button
                onClick={cancelGeneration}
                className="text-[12px] px-3 py-2 border border-border rounded-btn text-muted-2 hover:bg-surface-alt transition-colors"
              >
                Cancelar
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
