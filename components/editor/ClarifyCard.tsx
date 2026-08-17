"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
          <div className="flex flex-wrap gap-[6px]">
            {q.options.map((opt) => {
              const sel = choice[q.id] === opt;
              return (
                <button
                  key={opt}
                  onClick={() => setChoice((s) => ({ ...s, [q.id]: opt }))}
                  className={[
                    "rounded-pill border px-[10px] py-[5px] text-[12px] transition-colors",
                    sel
                      ? "bg-olive-tint border-olive-border text-olive-dark"
                      : "bg-surface border-border text-muted-2 hover:bg-surface-alt",
                  ].join(" ")}
                >
                  {opt}
                </button>
              );
            })}
            {q.allowOther && (
              <button
                onClick={() => setChoice((s) => ({ ...s, [q.id]: OTHER }))}
                className={[
                  "rounded-pill border px-[10px] py-[5px] text-[12px] transition-colors",
                  choice[q.id] === OTHER
                    ? "bg-olive-tint border-olive-border text-olive-dark"
                    : "bg-surface border-border text-muted-2 hover:bg-surface-alt",
                ].join(" ")}
              >
                {t("otherOption")}
              </button>
            )}
          </div>
          {q.allowOther && choice[q.id] === OTHER && (
            <input
              value={other[q.id] ?? ""}
              onChange={(e) =>
                setOther((s) => ({ ...s, [q.id]: e.target.value }))
              }
              placeholder={t("otherPlaceholder")}
              className="rounded-item border-border bg-surface-alt focus:border-olive-border border px-[9px] py-[6px] text-[12.5px] outline-none"
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
              ? "bg-olive hover:bg-olive-dark text-[#f7f7f2]"
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
