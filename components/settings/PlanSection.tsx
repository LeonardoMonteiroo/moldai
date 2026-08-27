"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Credits, PlanId } from "@/lib/types";
import { COSTS, PLAN_IDS } from "@/lib/types";
import {
  PLAN_CREDITS,
  isPlanUpgrade,
  type PaidPlanId,
} from "@/lib/billing/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { purchase, errorCode } from "@/lib/api-client";

// #9: applyPurchase (lib/billing/wallet.ts) can now move a wallet to any
// paid tier -- a plan above the account's own is a real, working "Assinar"
// control; a plan below it stays disabled + badged (downgrades are refused
// server-side, decision 2 of issue #9), and the note below the grid says so
// rather than leaving the disabled control unexplained.
export function PlanSection({ credits: initial }: { credits: Credits }) {
  const t = useTranslations("PlanSection");
  const router = useRouter();
  const [credits, setCredits] = useState(initial);
  const [pending, setPending] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Both PaywallModal (Ateliê only) and every upgrade card here drive the
  // same purchase("subscribe", plan) call; the try/catch/finally shape
  // mirrors UsageSection's buyTopup (#44), which purchase() itself was
  // fixed for. router.refresh() re-runs app/settings/page.tsx's server
  // read (the app/login/page.tsx precedent) so the AppShell header's
  // credits bar and the usage section pick up the new plan too, without a
  // manual reload -- the local setCredits below is what makes this card
  // grid update immediately, before that round trip lands.
  async function subscribe(plan: PaidPlanId) {
    setPending(plan);
    setError(null);
    try {
      const result = await purchase("subscribe", plan);
      // #161: under the real gateway this is {status:"redirect", url} --
      // the wallet isn't touched until the async webhook lands, so there is
      // no new plan to show yet and no router.refresh() to run (the plan
      // hasn't changed on the server either). Navigate out to the hosted
      // checkout instead; on return this section's own server-rendered
      // load reflects whatever the webhook actually granted.
      if (result.status === "redirect") {
        // location.assign(), not `location.href = ...`: the latter is a
        // property assignment on `window` (defined outside the component),
        // which react-hooks/immutability flags -- assign() is a method
        // call and does the identical same-tab navigation.
        window.location.assign(result.url);
        return;
      }
      if ("credits" in result) setCredits(result.credits);
      router.refresh();
    } catch (err) {
      setError(t(`errors.${errorCode(err)}`));
    } finally {
      setPending(null);
    }
  }

  const hasLowerTier = credits.plan !== "free";

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3">
        {PLAN_IDS.map((id) => {
          const isCurrent = credits.plan === id;
          const canUpgrade = !isCurrent && isPlanUpgrade(credits.plan, id);
          return (
            <div
              key={id}
              className={
                isCurrent
                  ? "border-olive bg-olive-tint shadow-plan rounded-card flex flex-col gap-2 border-2 p-[16px]"
                  : canUpgrade
                    ? "border-border bg-surface rounded-card flex flex-col gap-2 border p-[16px]"
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
                ) : canUpgrade ? null : (
                  <Badge variant="soon">{t("comingSoonBadge")}</Badge>
                )}
              </div>
              <span className="font-display text-title font-semibold">
                {t(`plans.${id}.price`)}
              </span>
              <span className="text-muted text-meta">
                {t(`plans.${id}.creditsLabel`, { credits: PLAN_CREDITS[id] })}
              </span>
              {!isCurrent &&
                (canUpgrade ? (
                  <Button
                    size="sm"
                    onClick={() => subscribe(id as PaidPlanId)}
                    disabled={pending !== null}
                    className="mt-1"
                  >
                    {t("subscribeButton", { plan: t(`plans.${id}.name`) })}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled className="mt-1">
                    {t("downgradeButton")}
                  </Button>
                ))}
            </div>
          );
        })}
      </section>
      {error && (
        <p role="alert" className="text-alert text-ui">
          {error}
        </p>
      )}
      {hasLowerTier && (
        <p className="text-muted text-ui">{t("downgradeNote")}</p>
      )}
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
      {/* #15: the public pricing screen -- feature bullets, the annual
          toggle, and Confecção's "Falar com vendas" don't belong in this
          three-line card grid, so this links out rather than duplicating
          them. */}
      <Link href="/planos" className="text-olive-dark text-ui font-semibold">
        {t("viewAllPlansLink")}
      </Link>
    </div>
  );
}
