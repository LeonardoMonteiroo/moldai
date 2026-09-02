"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shared/Wordmark";

// #13: "Como funciona"/"Dúvidas" are real anchors (Decision 2 = B) into
// sections that only exist on the landing page (StepsSection's
// #how-it-works, FaqSection's #faq) -- pointed at "/#..." rather than a bare
// "#..." because this same nav is also reused on /planos (#218), where a
// bare hash just tacks onto the current /planos URL and goes nowhere.
// "Planos" was disabled + badged until the public plans screen shipped
// (#15) -- now a real link to the dedicated pricing page.
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
  // Planos.dc.html shows this same nav's "Planos" link in the accent color
  // while every other link (and Planos itself on every other page) stays
  // text-muted-2 -- the design's plain "current page" indicator, not a new
  // link or section.
  const isPlanos = usePathname() === "/planos";

  return (
    <div className="bg-surface border-border flex items-center gap-[26px] border-b px-[30px] py-4">
      <Wordmark />
      <div className="flex-1" />
      <Button asChild variant="ghost" size="chrome" className="text-muted-2">
        <Link href="/#how-it-works">{t("nav.howItWorks")}</Link>
      </Button>
      <Button asChild variant="ghost" size="chrome" className="text-muted-2">
        <Link href="/#faq">{t("nav.faq")}</Link>
      </Button>
      <Button
        asChild
        variant="ghost"
        size="chrome"
        className={isPlanos ? "text-accent-foreground" : "text-muted-2"}
      >
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
