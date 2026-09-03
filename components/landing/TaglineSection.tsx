"use client";

import { useTranslations } from "next-intl";
import { LitWords } from "./reveal";

// landing-page-design B11, the mandatory tagline reveal. It is deliberately
// its own moment further down the page rather than stacked under the hero,
// and it states the benefit in the product's own voice instead of being a
// generic section heading.
//
// Three lines (the rule's minimum is two), capped at the hero's own 680px so
// the lines break where the thought breaks. Each word starts at ~30% ink and
// resolves to full ink as it crosses the trigger line, one word at a time,
// in reading order -- the transition and the muted tone both live in
// app/globals.css so prefers-reduced-motion can neutralise them in one
// place.
const LINES = ["line1", "line2", "line3"] as const;

export function TaglineSection() {
  const t = useTranslations("Landing");

  return (
    <section className="border-border bg-paper border-t border-b">
      <div className="mx-auto max-w-[1160px] px-4 py-24 sm:px-6">
        <p className="max-w-[680px] text-4xl font-semibold text-balance sm:text-5xl">
          {LINES.map((key) => (
            <span key={key} className="block">
              <LitWords text={t(`tagline.${key}`)} />
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
