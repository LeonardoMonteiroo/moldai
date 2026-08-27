"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

// A static illustration, not a working composer -- see CLAUDE.md's Out of
// scope note. The fake prompt field and "Gerar" chip are wrapped in
// aria-hidden so no phantom textbox/button reaches assistive tech or a
// query like getByRole("button", {name: generateButton}); the "Gerar" label
// itself is reused from MessageInput's real catalog entry rather than
// pasted, and the piece labels reuse PatternData.pieceNames the same way
// PatternCanvas resolves them.
export function MockupCard() {
  const t = useTranslations("Landing");
  const tGen = useTranslations("MessageInput");
  const tData = useTranslations("PatternData");

  return (
    <div className="bg-surface border-border rounded-modal flex flex-1 flex-col gap-3 border p-[18px]">
      <div aria-hidden="true" className="flex items-center gap-[9px]">
        <div className="bg-surface-alt border-border rounded-btn text-muted-2 text-ui flex-1 border px-3 py-[9px]">
          {t("mockup.promptExample")}
        </div>
        <span className="bg-primary text-primary-foreground rounded-btn text-ui px-[14px] py-[9px] font-semibold">
          {tGen("generateButton")}
        </span>
      </div>
      <div className="pattern-grid bg-paper min-h-[230px] rounded-xl p-4">
        <svg
          viewBox="0 0 460 260"
          className="h-full w-full"
          role="img"
          aria-label={t("mockup.canvasAlt")}
        >
          <g className="stroke-ink fill-white" strokeWidth={1.6}>
            <polygon points="40,20 130,20 143,124 118,240 34,240 22,124" />
            <polygon points="165,20 255,20 268,124 243,240 159,240 147,124" />
            <path d="M310 30 q62 10 70 60 l-15 150 h-92 l-15 -150 q10 -50 52 -60z" />
          </g>
          <g
            className="stroke-pattern-guide fill-none"
            strokeWidth={1}
            strokeDasharray="5 4"
          >
            <polygon points="32,13 138,13 151,126 126,248 26,248 13,126" />
          </g>
          <g className="fill-muted" fontFamily="Archivo" fontSize={10}>
            <text x="40" y="256">
              {tData("pieceNames.front").toUpperCase()}
            </text>
            <text x="165" y="256">
              {tData("pieceNames.back").toUpperCase()}
            </text>
            <text x="290" y="256">
              {tData("pieceNames.sleeve").toUpperCase()}
            </text>
          </g>
        </svg>
      </div>
      <div className="flex gap-2">
        <Badge variant="outline" className="rounded-pill">
          {t("mockup.chipGraduate")}
        </Badge>
        <Badge variant="outline" className="rounded-pill">
          {t("mockup.chipCutPlan")}
        </Badge>
        <Badge variant="outline" className="rounded-pill">
          {t("mockup.chipExport")}
        </Badge>
      </div>
    </div>
  );
}
