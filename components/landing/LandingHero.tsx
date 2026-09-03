"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PLAN_CREDITS } from "@/lib/billing/plans";
import { EXPORT_FORMATS } from "@/lib/export/formats";
import { Reveal } from "./reveal";

// The hero drops the earlier disabled "Ver um molde real" secondary CTA
// entirely rather than keeping a permanently-disabled control -- a single
// real CTA plus the no-card note underneath it, per A4 ("never place
// competing CTAs above the fold").
//
// The hero image is a cartooned SVG of the editor, drawn from real captures
// of it (see public/landing/*.svg). It is deliberately NOT a screenshot: the
// design gives this image a 531x341 box, and a 1400px screenshot downscaled
// into that lands the app's 12px UI text under 5px, which reads as a grey
// smudge rather than as a product. An illustration can be drawn at the size
// it will be seen, so the bubbles, the piece labels and the credit chip stay
// legible.
//
// It still has to be TRUE: every panel, label and number in it exists in the
// product, and none of it claims a capability the app does not have. That is
// the line B8 draws -- a stylised drawing of the real thing is fine, an
// invented feature is not.
//
// landing-page-design B5: the h1 takes the left-to-right text gradient
// (light theme #000000 -> #666666, since the app is light-only), and both
// heading and subheading are capped at 680px so their lines break where the
// thought breaks. The break itself is left to `text-balance` rather than a
// hardcoded <br>: a fixed break point is only meaningful at one viewport
// width, and this is the one genuinely responsive surface in the repo.
//
// A2 #4 requires a proof signal above the fold. This product has no
// customers yet, so there is no testimonial or logo strip to show -- and
// inventing one would be a fabricated record, not a design choice. The
// proof is therefore three verifiable facts about the product, each read
// from the same constants the app bills and exports by.
export function LandingHero() {
  const t = useTranslations("Landing");

  return (
    <section className="border-border bg-paper border-b">
      <div className="mx-auto flex max-w-[1160px] flex-col items-center gap-12 px-4 pt-24 pb-24 sm:px-6 lg:flex-row lg:items-center">
        <Reveal className="flex min-w-0 flex-1 flex-col gap-6">
          <span className="text-olive tracking-eyebrow text-sm font-semibold uppercase">
            {t("hero.eyebrow")}
          </span>

          <h1 className="marketing-hero-title max-w-[680px] text-4xl font-semibold text-balance sm:text-5xl lg:text-6xl">
            {t("hero.title")}
          </h1>

          <p className="text-muted-2 max-w-[680px] text-lg text-pretty">
            {t("hero.body")}
          </p>

          <div className="flex flex-col items-start gap-2">
            <Button asChild size="marketing">
              <Link href="/signup">
                {t("hero.primaryCta", { credits: PLAN_CREDITS.free })}
              </Link>
            </Button>
            <span className="text-muted text-sm">{t("hero.noCardNote")}</span>
          </div>

          {/* A2 #4 proof signal. "·" is this repo's deliberate UI separator. */}
          <ul className="text-muted-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <li>{t("hero.proof.credits", { credits: PLAN_CREDITS.free })}</li>
            <li aria-hidden>·</li>
            <li>
              {t("hero.proof.formats", { formats: EXPORT_FORMATS.length })}
            </li>
            <li aria-hidden>·</li>
            <li>{t("hero.proof.seams")}</li>
          </ul>
        </Reveal>

        <Reveal
          delayMs={120}
          className="border-border w-full min-w-0 flex-1 overflow-hidden rounded-2xl border shadow-lg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed
              local asset; no repo precedent for next/image and none of its
              optimization pipeline applies to a single static asset. */}
          <img
            src="/landing/hero-editor.svg"
            alt={t("hero.imageAlt")}
            className="h-full w-full object-cover object-top"
          />
        </Reveal>
      </div>
    </section>
  );
}
