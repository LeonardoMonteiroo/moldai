"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ClarifyQuestion } from "@/lib/types";
import { useEditorStore } from "@/lib/store";

const OTHER = "__other__";

export function ClarifyCard({ questions }: { questions: ClarifyQuestion[] }) {
  const t = useTranslations("ClarifyCard");
  const sendMessage = useEditorStore((s) => s.sendMessage);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const answerFor = (q: ClarifyQuestion): string | null => {
    const c = choice[q.id];
    if (!c) return null;
    if (c === OTHER) {
      const trimmed = (other[q.id] ?? "").trim();
      return trimmed ? trimmed : null;
    }
    return c;
  };

  const allAnswered = questions.every((q) => answerFor(q) !== null);

  const gerar = () => {
    const frase = questions
      .map((q) => `${q.label}: ${answerFor(q)}`)
      .join(", ");
    void sendMessage(frase, { answering: true });
  };

  const gerarAssimMesmo = () =>
    void sendMessage(t("generateAnywayMessage"), { answering: true });

  return (
    <div className="bg-surface border-border flex max-w-[92%] flex-col gap-[14px] rounded-[12px_12px_12px_3px] border p-[13px]">
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-[7px]">
          <span className="text-ink text-[12.5px] font-semibold">
            {q.label}
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label={q.label}
            value={choice[q.id] ?? ""}
            onValueChange={(value) => {
              if (value) setChoice((s) => ({ ...s, [q.id]: value }));
            }}
            className="flex-wrap"
          >
            {q.options.map((opt) => (
              <ToggleGroupItem key={opt} value={opt}>
                {opt}
              </ToggleGroupItem>
            ))}
            {q.allowOther && (
              <ToggleGroupItem value={OTHER}>
                {t("otherOption")}
              </ToggleGroupItem>
            )}
          </ToggleGroup>
          {q.allowOther && choice[q.id] === OTHER && (
            <Input
              value={other[q.id] ?? ""}
              onChange={(event) =>
                setOther((s) => ({ ...s, [q.id]: event.target.value }))
              }
              placeholder={t("otherPlaceholder")}
              className="bg-surface-alt h-auto py-[6px]"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-[12px] pt-[2px]">
        <button
          disabled={!allAnswered}
          onClick={gerar}
          className={[
            "rounded-btn px-[14px] py-[8px] text-[13px] font-semibold transition-colors",
            allAnswered
              ? "bg-olive hover:bg-olive-dark text-olive-foreground"
              : "bg-disabled-border text-disabled cursor-not-allowed",
          ].join(" ")}
        >
          {t("generateButton")}
        </button>
        <button
          onClick={gerarAssimMesmo}
          className="text-muted hover:text-muted-2 text-[12px] underline underline-offset-2"
        >
          {t("generateAnywayButton")}
        </button>
      </div>
    </div>
  );
}
