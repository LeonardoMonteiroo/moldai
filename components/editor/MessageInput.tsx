"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { COSTS } from "@/lib/types";

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
    if (disabled || !value.trim()) return;
    onSend(value);
    setValue("");
  }

  return (
    <div className="flex flex-col gap-[10px]">
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder={t("placeholder")}
        className="border-border rounded-item bg-surface-alt placeholder:text-placeholder focus:border-olive-border border px-[13px] py-[11px] text-[13px] outline-none disabled:opacity-60"
      />
      <div className="flex items-center gap-[10px]">
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="bg-ink rounded-item flex-1 py-[11px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("generateButton")}
        </button>
        <span className="text-muted text-[12px]">
          {t("creditCost", { cost: COSTS.adjust })}
        </span>
      </div>
    </div>
  );
}
