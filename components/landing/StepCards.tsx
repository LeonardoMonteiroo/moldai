"use client";

import { useTranslations } from "next-intl";

const STEPS = ["describe", "adjust", "export"] as const;

// English id -- the "Como funciona" nav anchor's target, per the
// English-identifiers/pt-BR-display-text boundary.
export function StepCards() {
  const t = useTranslations("Landing");

  return (
    <div id="how-it-works" className="flex gap-[14px] px-[30px] pb-[34px]">
      {STEPS.map((key) => (
        <div
          key={key}
          className="bg-surface border-border rounded-card flex flex-1 flex-col gap-[7px] border p-4"
        >
          <span className="font-display text-body font-semibold">
            {t(`steps.${key}.title`)}
          </span>
          <span className="text-muted-2 text-ui">{t(`steps.${key}.body`)}</span>
        </div>
      ))}
    </div>
  );
}
