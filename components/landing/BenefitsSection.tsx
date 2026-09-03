"use client";

import { useTranslations } from "next-intl";
import { COSTS } from "@/lib/types";
import { EXPORT_FORMATS } from "@/lib/export/formats";
import { Reveal } from "./reveal";

// A2 #7 / A5: outcome-driven benefits, bold benefit then the proof or
// detail. Every number rendered here is read from the constant the app
// actually bills or exports by (COSTS, EXPORT_FORMATS) rather than typed
// into the catalog -- the same rule the pricing page follows, so a change to
// what a graduation costs can never leave a stale promise on the landing
// page.
//
// A4 puts proof next to the claim it supports, which is why each card
// carries its own concrete detail rather than the page collecting them into
// a separate proof block.
const BENEFITS = [
  "seamCheck",
  "sizeChart",
  "grading",
  "export",
  "correction",
] as const;

export function BenefitsSection() {
  const t = useTranslations("Landing");

  // The three values any benefit body may interpolate. Passed to every
  // t() call because next-intl resolves only the placeholders a given
  // string actually contains.
  const values = {
    adjust: COSTS.adjust,
    graduate: COSTS.graduate,
    formats: EXPORT_FORMATS.length,
  };

  return (
    <section className="bg-surface">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-12 px-4 py-24 sm:px-6">
        <Reveal className="flex flex-col gap-3">
          <span className="text-olive tracking-eyebrow text-sm font-semibold uppercase">
            {t("benefits.eyebrow")}
          </span>
          <h2 className="max-w-[680px] text-3xl font-semibold text-balance sm:text-4xl">
            {t("benefits.sectionTitle")}
          </h2>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-2">
          {BENEFITS.map((key, i) => (
            <Reveal
              key={key}
              delayMs={i * 60}
              // rounded-2xl (16px) outer with 24px of padding: the gap is not
              // under 32px, so B3's nested radius formula does not apply and
              // nothing inside inherits a derived radius.
              className="border-border bg-surface flex flex-col gap-2 rounded-2xl border p-6"
            >
              <h3 className="text-lg font-semibold text-pretty">
                {t(`benefits.${key}.title`, values)}
              </h3>
              <p className="text-muted-2 text-base text-pretty">
                {t(`benefits.${key}.body`, values)}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
