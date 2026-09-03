"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shared/Wordmark";

// #13: "Como funciona"/"Duvidas" are real anchors (Decision 2 = B) into
// sections that only exist on the landing page (StepsSection's
// #how-it-works, FaqSection's #faq) -- pointed at "/#..." rather than a bare
// "#..." because this same nav is also reused on /planos (#218), where a
// bare hash just tacks onto the current /planos URL and goes nowhere.
//
// #218: also reused by /planos (PricingPage), which is reachable while
// signed in. `signedIn` (default false) swaps the "Entrar"/"Testar gratis"
// pair for a single link back to the dashboard. Deliberately not a second
// avatar/account menu here: that affordance already lives in PageHeader for
// every screen inside the app.
//
// landing-page-design B7 (fluid island nav): this is no longer a full-width
// bar. Closed, it is a floating glass pill detached from the top
// (mt-6/mx-auto/w-max/rounded-full) that the page scrolls underneath. On a
// narrow viewport the links collapse behind a hamburger whose two lines
// ROTATE into an X rather than disappearing, and the menu opens as a
// screen-filling backdrop-blur overlay whose links fade up staggered.
//
// The marketing surface is the one place in this repo that is genuinely
// responsive: the authenticated app is desktop-only by design, but a public
// landing page gets real phone traffic.

const LINKS = [
  { key: "howItWorks", href: "/#how-it-works" },
  { key: "faq", href: "/#faq" },
  { key: "plans", href: "/planos" },
] as const;

export function LandingNav({ signedIn = false }: { signedIn?: boolean }) {
  const t = useTranslations("Landing");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // B9 "the current page must be indicated in the navigation". Only /planos
  // is a real route among the three -- the other two are anchors into the
  // landing page itself, which is never a separate "current page".
  const isCurrent = (href: string) =>
    href === "/planos" && pathname === "/planos";

  // A menu that survives the navigation it triggered would sit open over the
  // destination, and Next's client routing does not unmount this component
  // between marketing routes. Adjusted during render rather than in an
  // effect -- React's own "reset state when a prop changes" pattern, which
  // re-renders before anything is painted instead of flashing the open menu
  // over the new page for a frame.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setOpen(false);
  }

  // Escape is the expected way out of a full-screen overlay, and the overlay
  // covers the page, so it must not be dismissable only by pointer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 px-4">
      <nav
        aria-label={t("nav.label")}
        className="border-border bg-surface/80 pointer-events-auto mx-auto mt-6 flex w-max max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border py-2 pr-2 pl-4 shadow-sm backdrop-blur-xl transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] sm:gap-3 sm:pl-6"
      >
        {/* Wordmark renders its own <Link href="/">, so it is NOT wrapped in
            a second one here -- nested anchors are invalid HTML and React
            reports them as a hydration error. */}
        <Wordmark />

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map(({ key, href }) => (
            <Button
              key={key}
              asChild
              variant="ghost"
              size="marketingSm"
              className={
                isCurrent(href) ? "text-accent-foreground" : "text-muted-2"
              }
            >
              <Link
                href={href}
                aria-current={isCurrent(href) ? "page" : undefined}
              >
                {t(`nav.${key}`)}
              </Link>
            </Button>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <Button asChild size="marketingSm">
              <Link href="/">{t("nav.dashboard")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline" size="marketingSm">
                <Link href="/login">{t("nav.login")}</Link>
              </Button>
              <Button asChild size="marketingSm">
                <Link href="/signup">{t("nav.signup")}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Icon-only control, so it carries BOTH aria-label and title from
            the same catalog key, per the repo's icon-tooltip rule. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={open ? t("nav.menuClose") : t("nav.menuOpen")}
          title={open ? t("nav.menuClose") : t("nav.menuOpen")}
          aria-expanded={open}
          aria-controls="landing-menu"
          onClick={() => setOpen((v) => !v)}
          className="relative rounded-full md:hidden"
        >
          {/* B7: the two lines rotate and translate into a perfect X. They
              must never simply disappear, so both stay rendered and only
              their transform changes. */}
          <span
            aria-hidden
            className={`bg-ink absolute left-1/2 h-px w-4 -translate-x-1/2 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              open ? "top-1/2 rotate-45" : "top-[14px] rotate-0"
            }`}
          />
          <span
            aria-hidden
            className={`bg-ink absolute left-1/2 h-px w-4 -translate-x-1/2 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              open ? "top-1/2 -rotate-45" : "top-[22px] rotate-0"
            }`}
          />
        </Button>
      </nav>

      {/* B7 modal expansion: a screen-filling overlay with a heavy glass
          effect. Rendered only while open -- kept mounted it would put every
          link in the tab order behind the closed pill. */}
      {open && (
        <div
          id="landing-menu"
          className="pointer-events-auto fixed inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-white/80 backdrop-blur-3xl md:hidden"
        >
          {LINKS.map(({ key, href }, i) => (
            <Link
              key={key}
              href={href}
              aria-current={isCurrent(href) ? "page" : undefined}
              onClick={() => setOpen(false)}
              // B7 staggered mask reveal: each link slides up out of an
              // invisible box, one after the next.
              style={{ animationDelay: `${100 + i * 50}ms` }}
              className={`animate-in fade-in slide-in-from-bottom-12 fill-mode-both text-2xl font-semibold duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                isCurrent(href) ? "text-accent-foreground" : "text-ink"
              }`}
            >
              {t(`nav.${key}`)}
            </Link>
          ))}

          <div
            style={{ animationDelay: `${100 + LINKS.length * 50}ms` }}
            className="animate-in fade-in slide-in-from-bottom-12 fill-mode-both mt-6 flex flex-col items-center gap-3 duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
          >
            {signedIn ? (
              <Button asChild size="marketing">
                <Link href="/" onClick={() => setOpen(false)}>
                  {t("nav.dashboard")}
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" size="marketing">
                  <Link href="/login" onClick={() => setOpen(false)}>
                    {t("nav.login")}
                  </Link>
                </Button>
                <Button asChild size="marketing">
                  <Link href="/signup" onClick={() => setOpen(false)}>
                    {t("nav.signup")}
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
