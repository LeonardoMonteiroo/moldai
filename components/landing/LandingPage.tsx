"use client";

import { MarketingShell } from "./MarketingShell";
import { LandingHero } from "./LandingHero";
import { BenefitsSection } from "./BenefitsSection";
import { TaglineSection } from "./TaglineSection";
import { StepsSection } from "./StepsSection";
import { CreditsSection } from "./CreditsSection";
import { FaqSection } from "./FaqSection";
import { FinalCtaSection } from "./FinalCtaSection";
import { LandingFooter } from "./LandingFooter";

// #13: the public front door for a signed-out visitor. Deliberately does NOT
// go through AppShell/PageHeader -- those require `credits` + `userEmail`
// (there is no session here), the same documented exception /login,
// /signup and /verify already take by rendering Wordmark directly (here via
// MarketingShell's LandingNav).
//
// Section order is the landing-page-design skill's A2 argument: hero (offer
// + proof) -> benefits (what it means for you) -> tagline reveal (B11's
// mandatory large-type moment, placed after the benefits rather than
// directly under the hero) -> how it works -> what a credit buys -> FAQ
// (objections) -> risk reversal and the closing CTA.
//
// Each section owns its own full-bleed background band (paper/surface,
// alternating) and centers its own max-w-[1160px] content -- there is no
// shared outer max-width wrapper, so a section's background can run edge to
// edge behind its border-top/bottom.
export function LandingPage() {
  return (
    <MarketingShell>
      <LandingHero />
      <BenefitsSection />
      <TaglineSection />
      <StepsSection />
      <CreditsSection />
      <FaqSection />
      <FinalCtaSection />
      <LandingFooter />
    </MarketingShell>
  );
}
