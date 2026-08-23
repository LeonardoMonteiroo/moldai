"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { COSTS, MAX_CHAT_MESSAGE_LENGTH } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MessageInput({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (message: string) => void;
}) {
  const t = useTranslations("MessageInput");
  const [value, setValue] = useState("");

  function submit() {
    const message = value.trim();
    if (disabled || !message) return;
    onSend(message);
    setValue("");
  }

  return (
    <div className="flex flex-col gap-[10px]">
      {/* A textarea, not an input: describing a garment ("blusa feminina,
          manga longa, gola V, pence, comprimento 60 cm…") is the app's primary
          interaction, and a single line scrolled it sideways out of view.
          field-sizing-content grows the box; max-h keeps it from eating the
          chat above it. */}
      <Textarea
        value={value}
        disabled={disabled}
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
        className="bg-surface-alt max-h-[160px] min-h-0 resize-none py-[11px]"
      />
      <div className="flex items-center gap-[10px]">
        <Button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="h-auto flex-1 py-[11px]"
        >
          {t("generateButton")}
        </Button>
        <span className="text-muted text-ui">
          {t("creditCost", { cost: COSTS.adjust })}
        </span>
      </div>
    </div>
  );
}
