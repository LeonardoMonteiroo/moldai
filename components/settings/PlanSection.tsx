"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Credits, PlanId } from "@/lib/types";
import { COSTS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { purchase } from "@/lib/api-client";

const PLAN_IDS: PlanId[] = ["free", "atelier", "studio", "factory"];

// #111: applyPurchase (lib/billing/wallet.ts) only ever issues the atelier
// plan today -- studio/factory stay badged "em breve" until #9 gives them a
// real purchase path. This is the one place that distinction is made.
const PURCHASABLE: PlanId[] = ["atelier"];

export function PlanSection({ credits: initial }: { credits: Credits }) {
  const t = useTranslations("PlanSection");
  const [credits, setCredits] = useState(initial);
  const [subscribing, setSubscribing] = useState(false);
  const [actionError, setActionError] = useState(false);

  // #111: PlanSection used to badge Ateliê "em breve" while PaywallModal
  // sold it as a live, working subscribe card -- two screens making opposite
  // claims about the same purchasable plan. Both now drive the same
  // purchase("subscribe") call; the try/catch/finally shape mirrors
  // UsageSection's buyTopup (#44), which purchase() itself was fixed for.
  async function subscribeAtelier() {
    setSubscribing(true);
    setActionError(false);
    try {
      const result = await purchase("subscribe");
      if ("credits" in result) setCredits(result.credits);
    } catch {
      setActionError(true);
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {actionError && (
        <ActionErrorNotice onDismiss={() => setActionError(false)} />
      )}
      <section className="grid grid-cols-2 gap-3">
        {PLAN_IDS.map((id) => {
          const isCurrent = credits.plan === id;
          const isPurchasable = !isCurrent && PURCHASABLE.includes(id);
          return (
            <div
              key={id}
              className={
                isCurrent
                  ? "border-olive bg-olive-tint shadow-plan rounded-card flex flex-col gap-2 border-2 p-[16px]"
                  : "border-border bg-surface rounded-card flex flex-col gap-2 border p-[16px] opacity-70"
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-control font-semibold">
                  {t(`plans.${id}.name`)}
                </span>
                {isCurrent ? (
                  <span className="bg-olive rounded-pill text-tick px-[9px] py-[3px] font-semibold text-white">
                    {t("currentBadge")}
                  </span>
                ) : isPurchasable ? null : (
                  <Badge variant="soon">{t("comingSoonBadge")}</Badge>
                )}
              </div>
              <span className="font-display text-title font-semibold">
                {t(`plans.${id}.price`)}
              </span>
              <span className="text-muted text-meta">
                {t(`plans.${id}.creditsLabel`)}
              </span>
              {isPurchasable && (
                <Button
                  size="sm"
                  onClick={subscribeAtelier}
                  disabled={subscribing}
                  className="mt-1"
                >
                  {t("subscribeButton")}
                </Button>
              )}
            </div>
          );
        })}
      </section>
      <section className="bg-surface border-border rounded-card flex flex-col gap-2 border p-[18px]">
        <h2 className="font-display text-body font-semibold">
          {t("costsHeading")}
        </h2>
        <ul className="text-muted-2 text-ui flex flex-col gap-1">
          {/* #108: generation debits the same constant as an adjustment —
              there is no separate, higher "first draft" price. The cut plan
              has no entry here at all: it's computed client-side and free. */}
          <li>{t("costGenerate", { cost: COSTS.adjust })}</li>
          <li>{t("costAdjust", { cost: COSTS.adjust })}</li>
          <li>{t("costGraduate", { cost: COSTS.graduate })}</li>
          <li>{t("costCorrection", { cost: COSTS.correction })}</li>
        </ul>
      </section>
    </div>
  );
}
