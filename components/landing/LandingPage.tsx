"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { LandingNav } from "./LandingNav";
import { LandingHero } from "./LandingHero";
import { StepsSection } from "./StepsSection";
import { FaqSection } from "./FaqSection";
import { CreditsSection } from "./CreditsSection";
import { LandingFooter } from "./LandingFooter";

// #13: the public front door for a signed-out visitor. Deliberately does NOT
// go through AppShell/PageHeader -- those require `credits` + `userEmail`
// (there is no session here), the same documented exception /login,
// /signup and /verify already take by rendering Wordmark directly (here via
// LandingNav). Owns its own scroll region because app/layout.tsx's body is
// `h-screen overflow-hidden` -- the SettingsShell ScrollArea precedent.
//
// Each section owns its own full-bleed background band (paper/surface,
// alternating) and centers its own max-w-[1040px] content -- there is no
// shared outer max-width wrapper, so a section's background can run edge to
// edge behind its border-top/bottom.
export function LandingPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LandingNav />
      <ScrollArea className="min-h-0 flex-1">
        <LandingHero />
        <StepsSection />
        <FaqSection />
        <CreditsSection />
        <LandingFooter />
      </ScrollArea>
    </div>
  );
}
