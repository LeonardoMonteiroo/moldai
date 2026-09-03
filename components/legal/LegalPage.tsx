"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { COSTS } from "@/lib/types";
import { PLAN_CREDITS } from "@/lib/billing/plans";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { LandingFooter } from "@/components/landing/LandingFooter";

// B10 asks for privacy and terms links in the footer, and B9 forbids a dead
// link -- so these are real pages rather than a "#".
//
// Both are honest plain-language summaries of what this codebase actually
// does, with every number read from the constant the app bills by. Neither
// has been through legal review, and `Legal.reviewNote` says exactly that on
// screen rather than letting the page imply an authority it does not have --
// the same "surface limitations where the user meets them" rule the rest of
// the app follows.
const SECTIONS = {
  privacy: ["account", "work", "ai", "billing", "cookies", "deletion"],
  terms: ["service", "credits", "plans", "beta", "fit", "account"],
} as const;

export function LegalPage({
  kind,
  signedIn = false,
}: {
  kind: "privacy" | "terms";
  signedIn?: boolean;
}) {
  const t = useTranslations("Legal");
  const values = {
    adjust: COSTS.adjust,
    graduate: COSTS.graduate,
    credits: PLAN_CREDITS.free,
  };

  return (
    <MarketingShell signedIn={signedIn}>
      <section className="bg-paper">
        <div className="mx-auto flex max-w-[680px] flex-col gap-6 px-4 pt-24 pb-12 sm:px-6">
          <h1 className="text-4xl font-semibold text-balance sm:text-5xl">
            {t(`${kind}.title`)}
          </h1>
          <p className="text-muted-2 text-lg text-pretty">
            {t(`${kind}.intro`)}
          </p>
          <p className="border-line text-muted rounded-2xl border p-4 text-sm text-pretty">
            {t("reviewNote")}
          </p>
        </div>
      </section>

      <section className="border-border bg-surface border-t">
        <div className="mx-auto flex max-w-[680px] flex-col gap-8 px-4 py-24 sm:px-6">
          {SECTIONS[kind].map((key) => (
            <article key={key} className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-pretty">
                {t(`${kind}.sections.${key}.title`)}
              </h2>
              <p className="text-muted-2 text-base text-pretty">
                {t(`${kind}.sections.${key}.body`, values)}
              </p>
            </article>
          ))}

          <div className="border-line flex flex-col items-start gap-3 border-t pt-6">
            <span className="text-muted text-sm">{t("updatedAt")}</span>
            {/* B10: a way back from every page. */}
            <Link
              href="/"
              className="hover:text-ink focus-visible:ring-ring rounded-sm text-sm font-semibold underline underline-offset-4 transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:outline-none"
            >
              {t("backHome")}
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </MarketingShell>
  );
}
