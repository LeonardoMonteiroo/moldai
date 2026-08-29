"use client";

import { useTranslations } from "next-intl";

const QUESTIONS = ["seamCheck", "sizeChart", "dxf", "readyToCut"] as const;

// English id -- the "Dúvidas" nav anchor's target, per the
// English-identifiers/pt-BR-display-text boundary.
export function FaqSection() {
  const t = useTranslations("Landing");

  return (
    <section id="faq" className="border-border bg-paper border-t border-b">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-[22px] px-[30px] py-14">
        <div className="flex flex-col gap-1.5">
          <span className="text-olive text-meta tracking-eyebrow font-semibold uppercase">
            {t("faq.eyebrow")}
          </span>
          <h2 className="font-display text-display max-w-[620px] font-semibold">
            {t("faq.sectionTitle")}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          {QUESTIONS.map((key) => (
            <div
              key={key}
              className="bg-surface border-border rounded-card flex flex-col gap-[7px] border p-4"
            >
              <span className="text-control font-semibold">
                {t(`faq.${key}.question`)}
              </span>
              <span className="text-muted-2 text-ui">
                {t(`faq.${key}.answer`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
