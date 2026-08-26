"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shared/Wordmark";

// #13: "Como funciona"/"Formatos" are real same-page anchors (Decision 2 =
// B) -- both sections already exist below (StepCards' #how-it-works,
// FormatsSection's #formats), inventing no new copy. "Planos" stays
// disabled + badged until the public plans screen (#15) ships -- CLAUDE.md
// prefers a disabled+badged control over a hidden or dead-linked one.
export function LandingNav() {
  const t = useTranslations("Landing");

  return (
    <div className="bg-surface border-border flex items-center gap-[26px] border-b px-[30px] py-4">
      <Wordmark />
      <div className="flex-1" />
      <Button asChild variant="ghost" size="chrome" className="text-muted-2">
        <a href="#how-it-works">{t("nav.howItWorks")}</a>
      </Button>
      <Button asChild variant="ghost" size="chrome" className="text-muted-2">
        <a href="#formats">{t("nav.formats")}</a>
      </Button>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="chrome"
          disabled
          title={t("nav.comingSoonTitle")}
          className="text-placeholder"
        >
          {t("nav.plans")}
        </Button>
        <Badge variant="soon">{t("nav.comingSoonBadge")}</Badge>
      </div>
      <Button asChild variant="outline" size="chrome">
        <Link href="/login">{t("nav.login")}</Link>
      </Button>
      <Button asChild size="chrome">
        <Link href="/signup">{t("nav.signup")}</Link>
      </Button>
    </div>
  );
}
