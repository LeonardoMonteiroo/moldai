"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { COSTS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <Input
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
        }}
        placeholder={t("placeholder")}
        className="bg-surface-alt h-auto py-[11px]"
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
