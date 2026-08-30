"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { PatternListItem } from "@/lib/api-client";

const DISMISSED_KEY = "moldai.onboardingChecklistDismissed";
const TOTAL_STEPS = 5;

// #232/react-hooks/set-state-in-effect: localStorage doesn't notify the tab
// that wrote it, so dismissing needs its own same-tab pub-sub.
// useSyncExternalStore (not a raw useEffect + setState, which this repo's
// lint config flags -- the ExportShell precedent) re-renders every
// subscribed instance the moment writeDismissed() notifies, this tab
// included, and the native "storage" event covers other tabs.
const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

// SSR has no localStorage, and this must match the client's very first
// render before hydration reconciles against the real value, or React
// reports a mismatch -- "not dismissed" is the safe, honest default.
function getServerSnapshot(): boolean {
  return false;
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Private browsing / storage disabled -- the card just reappears next visit.
  }
  listeners.forEach((listener) => listener());
}

export interface ChecklistProgress {
  hasCustomSizeChart: boolean;
  hasExported: boolean;
  hasImported: boolean;
}

interface Step {
  titleKey: string;
  descriptionKey: string;
  done: boolean;
  ctaKey?: string;
  href?: string;
  soon?: boolean;
}

/**
 * #232: the redesign handoff's "Comece com o pé direito" card. Every step's
 * `done` state is derived from real account data passed in as props (the
 * CreditsCard/RecentUsageCard precedent) rather than read from the store
 * directly, except step 5 ("convidar alguém da equipe"), which is
 * permanently unreachable -- multi-user accounts don't exist -- so it
 * always renders disabled + "em breve" badged, never a checkmark.
 * Dismissal is localStorage-only (browser-local, not synced per account):
 * confirmed in the #232 design spec.
 */
export function OnboardingChecklistCard({
  patterns,
  checklist,
}: {
  patterns: PatternListItem[];
  checklist: ChecklistProgress;
}) {
  const t = useTranslations("OnboardingChecklistCard");
  const dismissed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (dismissed) return null;

  // A blank pattern reports garmentType: null (lib/db/pattern.ts's
  // listPatternsForUser) -- only a drafted one counts, regardless of
  // whether it came from chat, an import, or a sloper copy.
  const hasGeneratedPattern = patterns.some((p) => p.garmentType !== null);
  const mostRecentPatternId = patterns[0]?.id ?? null;

  const steps: Step[] = [
    {
      titleKey: "step1Title",
      descriptionKey: "step1Description",
      done: hasGeneratedPattern,
    },
    {
      titleKey: "step2Title",
      descriptionKey: "step2Description",
      done: checklist.hasCustomSizeChart,
      ctaKey: "step2Cta",
      href: "/size-charts",
    },
    {
      titleKey: "step3Title",
      descriptionKey: "step3Description",
      done: checklist.hasExported,
      ctaKey: "step3Cta",
      href: mostRecentPatternId
        ? `/pattern/${mostRecentPatternId}/export`
        : undefined,
    },
    {
      titleKey: "step4Title",
      descriptionKey: "step4Description",
      done: checklist.hasImported,
      ctaKey: "step4Cta",
      href: "/import",
    },
    {
      titleKey: "step5Title",
      descriptionKey: "step5Description",
      done: false,
      soon: true,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / TOTAL_STEPS) * 100);

  return (
    <div className="border-border rounded-card mx-[22px] mt-[22px] flex flex-col gap-[14px] border bg-white p-[18px]">
      <div className="flex items-center justify-between gap-[10px]">
        <span className="text-ui font-semibold">
          {t("title")} ·{" "}
          {t("progressLabel", { done: doneCount, total: TOTAL_STEPS })}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("dismissLabel")}
          onClick={writeDismissed}
        >
          <XIcon />
        </Button>
      </div>
      <Progress value={pct} />
      <ul className="flex flex-col gap-[10px]">
        {steps.map((step, i) => (
          <li key={step.titleKey} className="flex items-center gap-[12px]">
            <span
              className={
                "text-meta flex size-[22px] shrink-0 items-center justify-center rounded-full font-semibold " +
                (step.done
                  ? "bg-surface-alt text-olive-dark"
                  : "bg-surface-alt text-muted")
              }
            >
              {step.done ? <CheckIcon className="size-[13px]" /> : i + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-ui font-semibold">{t(step.titleKey)}</span>
              <span className="text-muted text-meta">
                {t(step.descriptionKey)}
              </span>
            </div>
            {step.done && (
              <span className="text-muted text-meta shrink-0">
                {t("doneLabel")}
              </span>
            )}
            {!step.done && step.soon && (
              <Badge variant="soon">{t("step5Badge")}</Badge>
            )}
            {!step.done && !step.soon && step.href && step.ctaKey && (
              <Link
                href={step.href}
                className="text-olive-dark text-ui shrink-0 font-semibold"
              >
                {t(step.ctaKey)}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
