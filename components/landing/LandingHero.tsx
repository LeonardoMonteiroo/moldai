"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PLAN_CREDITS } from "@/lib/billing/plans";

// The design's own hero drops the earlier disabled "Ver um molde real"
// secondary CTA entirely rather than keeping a permanently-disabled control
// -- a single real CTA plus the no-card note underneath it. The hero image
// (public/landing/hero-editor.svg) is a neutral placeholder -- a plain
// image glyph on the surface-alt token -- deliberately standing in for real
// artwork rather than claiming to be one, until the real hero image ships.
export function LandingHero() {
  const t = useTranslations("Landing");

  return (
    <section className="border-border bg-paper border-b">
      <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-12 px-[34px] py-16">
        <div className="flex min-w-0 flex-1 basis-[360px] flex-col gap-5">
          <span className="text-olive text-meta tracking-eyebrow font-semibold uppercase">
            {t("hero.eyebrow")}
          </span>
          <h1 className="font-display text-hero tracking-hero font-semibold">
            {t("hero.title")}
          </h1>
          <p className="text-muted-2 text-body max-w-[390px]">
            {t("hero.body")}
          </p>
          <div className="flex flex-col items-start gap-[9px]">
            <Button asChild size="lg">
              <Link href="/signup">
                {t("hero.primaryCta", { credits: PLAN_CREDITS.free })}
              </Link>
            </Button>
            <span className="text-muted text-ui">{t("hero.noCardNote")}</span>
          </div>
        </div>
        <div className="border-border rounded-modal shadow-modal min-w-0 flex-1 basis-[560px] overflow-hidden border">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed
              local asset; no repo precedent for next/image and none of its
              optimization pipeline applies to a single static asset. */}
          <img
            src="/landing/hero-editor.svg"
            alt={t("hero.imageAlt")}
            className="h-full w-full object-cover object-top"
          />
        </div>
      </div>
    </section>
  );
}
