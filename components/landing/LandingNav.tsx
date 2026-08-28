"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shared/Wordmark";

// #13: "Como funciona"/"Formatos" are real same-page anchors (Decision 2 =
// B) -- both sections already exist below (StepCards' #how-it-works,
// FormatsSection's #formats), inventing no new copy. "Planos" was disabled
// + badged until the public plans screen shipped (#15) -- now a real link.
//
// #218: also reused by /planos (PricingPage), which is reachable while
// signed in -- it used to always render the signed-out "Entrar"/"Testar
// grátis" pair regardless of session. `signedIn` (default false, so
// LandingPage's own signed-out-only render is unaffected) swaps those two
// for a single link back to the dashboard. Deliberately not a second
// avatar/account menu here: that affordance already lives in PageHeader for
// every screen inside the app -- this is the simpler public nav, not a
// second place to maintain it.
export function LandingNav({ signedIn = false }: { signedIn?: boolean }) {
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
      <Button asChild variant="ghost" size="chrome" className="text-muted-2">
        <Link href="/planos">{t("nav.plans")}</Link>
      </Button>
      {signedIn ? (
        <Button asChild size="chrome">
          <Link href="/">{t("nav.dashboard")}</Link>
        </Button>
      ) : (
        <>
          <Button asChild variant="outline" size="chrome">
            <Link href="/login">{t("nav.login")}</Link>
          </Button>
          <Button asChild size="chrome">
            <Link href="/signup">{t("nav.signup")}</Link>
          </Button>
        </>
      )}
    </div>
  );
}
