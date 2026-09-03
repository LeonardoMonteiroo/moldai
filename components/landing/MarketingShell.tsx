"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LandingNav } from "./LandingNav";

// The chrome both public screens share: the marketing type system, the
// floating island nav, the skip link, and the page's own scroll region.
// Two real consumers (LandingPage and PricingPage), which is what earns it
// a component instead of being duplicated -- before this, /planos rebuilt
// the same wrapper by hand.
//
// `font-marketing` is the explicit boundary between the two type systems in
// this repo: everything under here is Geist on Tailwind's default scale,
// everything in the authenticated app stays Bricolage + Archivo on the
// named --text-* scale. See CLAUDE.md.
//
// Owns its own scroll region because app/layout.tsx's body is
// `h-screen overflow-hidden` -- the SettingsShell ScrollArea precedent. The
// nav is absolutely positioned over that region rather than sitting above
// it, which is what lets the page scroll underneath a detached pill.
export function MarketingShell({
  children,
  signedIn = false,
}: {
  children: ReactNode;
  signedIn?: boolean;
}) {
  const t = useTranslations("Landing");

  return (
    <div className="font-marketing relative flex min-h-0 flex-1 flex-col">
      {/* B10: a keyboard user must be able to jump past the nav. Visible
          only once focused, but never display:none -- a hidden element is
          not focusable and the link would be unreachable. */}
      <a
        href="#main"
        className="bg-surface text-ink focus:ring-ring sr-only rounded-full px-4 py-2 text-sm font-semibold focus:not-sr-only focus:absolute focus:top-6 focus:left-6 focus:z-60 focus:ring-2"
      >
        {t("skipToContent")}
      </a>

      <LandingNav signedIn={signedIn} />

      <ScrollArea className="min-h-0 flex-1">
        <main id="main">{children}</main>
      </ScrollArea>
    </div>
  );
}
