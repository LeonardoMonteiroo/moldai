"use client";

import { useState } from "react";
import { COSTS } from "@/lib/types";

export function MessageInput({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (message: string) => void;
}) {
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
        placeholder="Descreva o ajuste…"
        className="border border-border rounded-item px-[13px] py-[11px] text-[13px] bg-surface-alt placeholder:text-placeholder disabled:opacity-60 outline-none focus:border-olive-border"
      />
      <div className="flex items-center gap-[10px]">
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="flex-1 bg-ink text-white rounded-item py-[11px] text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          Gerar
        </button>
        <span className="text-[12px] text-muted">{COSTS.adjust} crédito</span>
      </div>
    </div>
  );
}
