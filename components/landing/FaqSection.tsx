"use client";

import { useTranslations } from "next-intl";
import { COSTS } from "@/lib/types";
import { PLAN_CREDITS } from "@/lib/billing/plans";
import { FAQ_KEYS } from "@/lib/landing/faq";
import { Reveal } from "./reveal";

// English id -- the "Duvidas" nav anchor's target, per the
// English-identifiers/pt-BR-display-text boundary.
//
// A2 #10 asks for six to twelve questions; this was four. The four added
// (skill, versions, importDxf, billing) are the objections that actually
// stop a pattern-maker signing up, and each answer stays inside what the app
// really does: version restore genuinely is free and uncapped, DXF import
// genuinely is beta, and plan changes genuinely are upgrade-only, so the
// billing answer says "a troca para um plano maior" rather than implying a
// self-serve downgrade the server refuses.
//
// Rendered as a real <dl>, and the key list itself lives in lib/landing/faq.ts
// so the AEO/FAQPage schema in app/page.tsx describes exactly the pairs this
// section shows.
export function FaqSection() {
  const t = useTranslations("Landing");
  const values = { adjust: COSTS.adjust, credits: PLAN_CREDITS.free };

  return (
    <section id="faq" className="border-border bg-paper border-t border-b">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-12 px-4 py-24 sm:px-6">
        <Reveal className="flex flex-col gap-3">
          <span className="text-olive tracking-eyebrow text-sm font-semibold uppercase">
            {t("faq.eyebrow")}
          </span>
          <h2 className="max-w-[680px] text-3xl font-semibold text-balance sm:text-4xl">
            {t("faq.sectionTitle")}
          </h2>
        </Reveal>

        <dl className="grid gap-4 md:grid-cols-2">
          {FAQ_KEYS.map((key, i) => (
            <Reveal
              key={key}
              delayMs={(i % 2) * 60}
              className="border-border bg-surface flex flex-col gap-2 rounded-2xl border p-6"
            >
              <dt className="text-base font-semibold text-pretty">
                {t(`faq.${key}.question`, values)}
              </dt>
              <dd className="text-muted-2 text-base text-pretty">
                {t(`faq.${key}.answer`, values)}
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
