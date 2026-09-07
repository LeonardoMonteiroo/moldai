"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { COSTS, MAX_CHAT_MESSAGE_LENGTH } from "@/lib/types";
import type { PreparedAttachment } from "@/lib/editor/attachment";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentChips } from "./AttachmentChips";

/**
 * Editor.dc.html:203-218: ONE bordered card holding the textarea and, on its
 * own bottom row, the attachment icons, the credit label and a compact
 * "Gerar". The textarea is borderless/transparent inside it.
 *
 * This used to be three stacked blocks (a chips row, a bordered textarea, and
 * a full-width Gerar button with the credit label after it), which is why the
 * button dominated the composer and the attachments read as a separate
 * toolbar.
 */
export function MessageInput({
  disabled,
  attachments,
  onAttachmentsChange,
  onSend,
}: {
  disabled: boolean;
  attachments: PreparedAttachment[];
  onAttachmentsChange: (next: PreparedAttachment[]) => void;
  onSend: (message: string) => void;
}) {
  const t = useTranslations("MessageInput");
  const [value, setValue] = useState("");
  // #274: a pick is genuinely async (prepareImage decodes/downscales on a
  // real canvas) -- without this, Enter/Gerar during that window sent the
  // message with the attachment still missing, and the pick's own completion
  // then re-attached it to whatever was sent NEXT instead.
  const [preparingAttachment, setPreparingAttachment] = useState(false);
  const busy = disabled || preparingAttachment;

  function submit() {
    const message = value.trim();
    if (busy || !message) return;
    onSend(message);
    setValue("");
  }

  return (
    <div className="border-border rounded-card bg-surface border px-3 py-[10px]">
      {/* A textarea, not an input: describing a garment ("blusa feminina,
          manga longa, gola V, pence, comprimento 60 cm…") is the app's primary
          interaction, and a single line scrolled it sideways out of view.
          field-sizing-content grows the box; max-h keeps it from eating the
          chat above it. */}
      <Textarea
        value={value}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter is how you get a newline now that there
          // is more than one line to get.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        rows={2}
        maxLength={MAX_CHAT_MESSAGE_LENGTH}
        placeholder={t("placeholder")}
        className="max-h-[160px] min-h-0 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      />
      <div className="mt-[10px] flex items-center gap-[6px]">
        <AttachmentChips
          attachments={attachments}
          onChange={onAttachmentsChange}
          onPreparingChange={setPreparingAttachment}
        />
        <div className="flex-1" />
        <span className="text-muted text-meta whitespace-nowrap">
          {t("creditCost", { cost: COSTS.adjust })}
        </span>
        <Button
          size="chrome"
          onClick={submit}
          disabled={busy || !value.trim()}
          className="h-8"
        >
          {t("generateButton")}
        </Button>
      </div>
    </div>
  );
}
