"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MockupCard } from "./MockupCard";
import { FREE_PLAN_CREDITS } from "./constants";

// Decision 3 (issue #13): "Ver um molde real" is disabled + badged "em
// breve" rather than hidden or faked -- there is no public demo pattern,
// and every /pattern/[id] route requires a session.
export function LandingHero() {
  const t = useTranslations("Landing");

  return (
    <div className="flex gap-[34px] px-[30px] pt-[44px] pb-[34px]">
      <div className="flex w-[430px] flex-col gap-[18px]">
        <span className="text-olive text-meta tracking-eyebrow font-semibold uppercase">
          {t("hero.eyebrow")}
        </span>
        <h1 className="font-display text-hero tracking-hero font-semibold">
          {t("hero.title")}
        </h1>
        <p className="text-muted-2 text-body max-w-[390px]">{t("hero.body")}</p>
        <div className="flex items-center gap-[10px]">
          <Button asChild size="lg">
            <Link href="/signup">
              {t("hero.primaryCta", { credits: FREE_PLAN_CREDITS })}
            </Link>
          </Button>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="lg"
              disabled
              title={t("hero.secondaryCtaTitle")}
            >
              {t("hero.secondaryCta")}
            </Button>
            <Badge variant="soon">{t("nav.comingSoonBadge")}</Badge>
          </div>
        </div>
        <span className="text-muted text-ui">{t("hero.noCardNote")}</span>
      </div>
      <MockupCard />
    </div>
  );
}
