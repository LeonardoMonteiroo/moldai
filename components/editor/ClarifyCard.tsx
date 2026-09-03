"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ClarifyQuestion } from "@/lib/types";
import { useEditorStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

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
    // The card was hand-rolling the AI bubble's tail geometry; it belongs to the
    // same family, so it gets it from the same primitive.
    <Bubble variant="surface" className="w-full">
      <BubbleContent className="flex flex-col gap-[14px] py-[13px]">
        {questions.map((q) => (
          <div key={q.id} className="flex flex-col gap-[7px]">
            <span className="text-ink text-ui font-semibold">{q.label}</span>
            {/* Editor.dc.html:162-166: independently-rounded pills with a gap,
                size sm -- NOT the joined segmented control the default
                spacing=0 produces. With real AI option text ("Convertible
                (gola esporte dobrada)") the joined variant collapsed into one
                full-width row per option; spaced pills wrap several per row,
                which is what makes a 4-option question scannable. */}
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={1.5}
              aria-label={q.label}
              value={choice[q.id] ?? ""}
              onValueChange={(value) => {
                if (value) setChoice((s) => ({ ...s, [q.id]: value }));
              }}
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
          <Button disabled={!allAnswered} onClick={gerar}>
            {t("generateButton")}
          </Button>
          <Button variant="link" size="sm" onClick={gerarAssimMesmo}>
            {t("generateAnywayButton")}
          </Button>
        </div>
      </BubbleContent>
    </Bubble>
  );
}
