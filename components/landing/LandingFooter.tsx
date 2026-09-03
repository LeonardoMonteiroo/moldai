"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/shared/Wordmark";

// B10 ship requirements: a marketing page needs privacy and terms reachable
// from the footer. Both point at real routes (/privacy, /terms) rather than
// "#" -- B9 forbids a dead link outright, and a legal link that goes nowhere
// is the worst one to fake.
//
// Route names stay English, per the repo's routes-are-English rule; /planos
// remains the single deliberate marketing exception and this does not add a
// second one.
export function LandingFooter() {
  const t = useTranslations("Landing");

  return (
    <footer className="border-border bg-surface border-t">
      <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-6 pb-12 sm:px-6">
        <Wordmark />
        <span className="text-muted text-sm">
          {t("footer.copyright", { year: new Date().getFullYear() })}
        </span>

        <div className="flex-1" />

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            href="/privacy"
            className="text-muted-2 hover:text-ink focus-visible:ring-ring rounded-sm text-sm transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:outline-none"
          >
            {t("footer.privacy")}
          </Link>
          <Link
            href="/terms"
            className="text-muted-2 hover:text-ink focus-visible:ring-ring rounded-sm text-sm transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:outline-none"
          >
            {t("footer.terms")}
          </Link>
          <span className="text-muted text-sm">{t("footer.billingNote")}</span>
        </nav>
      </div>
    </footer>
  );
}
