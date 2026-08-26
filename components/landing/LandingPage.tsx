"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { LandingNav } from "./LandingNav";
import { LandingHero } from "./LandingHero";
import { FormatsSection } from "./FormatsSection";
import { StepCards } from "./StepCards";

// #13: the public front door for a signed-out visitor. Deliberately does NOT
// go through AppShell/PageHeader -- those require `credits` + `userEmail`
// (there is no session here), the same documented exception /login,
// /signup and /verify already take by rendering Wordmark directly (here via
// LandingNav). Owns its own scroll region because app/layout.tsx's body is
// `h-screen overflow-hidden` -- the SettingsShell ScrollArea precedent.
export function LandingPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LandingNav />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-[1040px]">
          <LandingHero />
          <FormatsSection />
          <StepCards />
        </div>
      </ScrollArea>
    </div>
  );
}
