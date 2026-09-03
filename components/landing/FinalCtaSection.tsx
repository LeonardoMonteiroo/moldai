"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PLAN_CREDITS } from "@/lib/billing/plans";
import { Reveal } from "./reveal";

// A2 #11 + #12: the risk reversal and the closing CTA, which repeats the
// hero's promise rather than introducing a new one.
//
// The risk reversal is deliberately NOT "cancele quando quiser". Plan
// downgrades are refused server-side in this app -- only upgrades are
// self-serve -- so a cancel-anytime promise here would be false. What is
// true, and is what the note says, is that the free plan needs no card and
// renews every 30 days.
export function FinalCtaSection() {
  const t = useTranslations("Landing");

  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-[1160px] px-4 py-24 sm:px-6">
        <Reveal className="border-olive bg-olive-tint flex flex-col items-start gap-6 rounded-2xl border-2 p-8">
          <div className="flex flex-col gap-3">
            <span className="text-olive tracking-eyebrow text-sm font-semibold uppercase">
              {t("finalCta.eyebrow")}
            </span>
            <h2 className="max-w-[680px] text-3xl font-semibold text-balance sm:text-4xl">
              {t("finalCta.title")}
            </h2>
            <p className="text-olive-dark max-w-[680px] text-lg text-pretty">
              {t("finalCta.body", { credits: PLAN_CREDITS.free })}
            </p>
          </div>

          <div className="flex flex-col items-start gap-2">
            {/* A2 #12: word for word the hero's CTA, credit count and all --
                the closing ask must not introduce a new promise. */}
            <Button asChild size="marketing">
              <Link href="/signup">
                {t("finalCta.cta", { credits: PLAN_CREDITS.free })}
              </Link>
            </Button>
            <span className="text-olive-dark text-sm">
              {t("finalCta.note")}
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
