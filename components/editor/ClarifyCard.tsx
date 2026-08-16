"use client";

import { useState } from "react";
import { ClarifyQuestion } from "@/lib/types";
import { useEditorStore } from "@/lib/store";

const OTHER = "__other__";

export function ClarifyCard({ questions }: { questions: ClarifyQuestion[] }) {
  const sendMessage = useEditorStore((s) => s.sendMessage);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const answerFor = (q: ClarifyQuestion): string | null => {
    const c = choice[q.id];
    if (!c) return null;
    if (c === OTHER) {
      const t = (other[q.id] ?? "").trim();
      return t ? t : null;
    }
    return c;
  };

  const allAnswered = questions.every((q) => answerFor(q) !== null);

  const gerar = () => {
    const frase = questions.map((q) => `${q.label}: ${answerFor(q)}`).join(", ");
    void sendMessage(frase, { answering: true });
  };

  const gerarAssimMesmo = () => void sendMessage("pode gerar com os padrões", { answering: true });

  return (
    <div className="max-w-[92%] bg-surface border border-border rounded-[12px_12px_12px_3px] p-[13px] flex flex-col gap-[14px]">
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-[7px]">
          <span className="text-[12.5px] font-semibold text-ink">{q.label}</span>
          <div className="flex flex-wrap gap-[6px]">
            {q.options.map((opt) => {
              const sel = choice[q.id] === opt;
              return (
                <button
                  key={opt}
                  onClick={() => setChoice((s) => ({ ...s, [q.id]: opt }))}
                  className={[
                    "text-[12px] px-[10px] py-[5px] rounded-pill border transition-colors",
                    sel ? "bg-olive-tint border-olive-border text-olive-dark" : "bg-surface border-border text-muted-2 hover:bg-surface-alt",
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
                  "text-[12px] px-[10px] py-[5px] rounded-pill border transition-colors",
                  choice[q.id] === OTHER ? "bg-olive-tint border-olive-border text-olive-dark" : "bg-surface border-border text-muted-2 hover:bg-surface-alt",
                ].join(" ")}
              >
                outro
              </button>
            )}
          </div>
          {q.allowOther && choice[q.id] === OTHER && (
            <input
              autoFocus
              value={other[q.id] ?? ""}
              onChange={(e) => setOther((s) => ({ ...s, [q.id]: e.target.value }))}
              placeholder="descreva…"
              className="text-[12.5px] px-[9px] py-[6px] rounded-item border border-border bg-surface-alt outline-none focus:border-olive-border"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-[12px] pt-[2px]">
        <button
          disabled={!allAnswered}
          onClick={gerar}
          className={[
            "text-[13px] font-semibold px-[14px] py-[8px] rounded-btn transition-colors",
            allAnswered ? "bg-olive text-[#f7f7f2] hover:bg-olive-dark" : "bg-disabled-border text-disabled cursor-not-allowed",
          ].join(" ")}
        >
          Gerar molde
        </button>
        <button onClick={gerarAssimMesmo} className="text-[12px] text-muted hover:text-muted-2 underline underline-offset-2">
          gerar assim mesmo
        </button>
      </div>
    </div>
  );
}
