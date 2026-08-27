"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PlanId } from "@/lib/types";
import { COSTS, PLAN_IDS } from "@/lib/types";
import {
  PLAN_CREDITS,
  PLAN_PRICE_CENTS,
  formatBRL,
  PLAN_FEATURES,
  TOPUP_CREDITS,
  TOPUP_PRICE_CENTS,
} from "@/lib/billing/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LandingNav } from "@/components/landing/LandingNav";

type Billing = "monthly" | "annual";

// The −20% annual discount is display-only (issue #15's own decision):
// applyPurchase/renewWallet only ever renew on a 30-day cycle, so an
// "annual" CTA would charge the monthly price under an annual label --
// every card's CTA is disabled + badged while this toggle is on Anual,
// exactly like a tier design 5c advertises but this codebase can't sell yet.
const ANNUAL_FACTOR = 0.8;

// #15: design 5c lists "Plano de corte automático" only under Estúdio, but
// CutPlanTab ships it free on every plan -- and issue #16 shipped version
// history with no retention cap or plan gate at all, so "Histórico
// ilimitado de versões" is equally true everywhere now. Neither is listed
// as a plan differentiator anywhere below (see lib/billing/plans.ts's own
// comment on PLAN_FEATURES) rather than misrepresenting one as exclusive.
export function PricingPage({
  signedIn,
  currentPlan,
}: {
  signedIn: boolean;
  currentPlan: PlanId | null;
}) {
  const t = useTranslations("Pricing");
  const tPlan = useTranslations("PlanSection");
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LandingNav />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-[1040px] flex-col gap-5 px-[26px] py-[28px]">
          <div className="flex items-end gap-4">
            <div className="flex flex-col gap-[5px]">
              <h1 className="font-display text-display font-semibold">
                {t("title")}
              </h1>
              <p className="text-muted-2 text-ui">{t("subtitle")}</p>
            </div>
            <div className="flex-1" />
            <ToggleGroup
              type="single"
              variant="outline"
              value={billing}
              aria-label={t("toggleLabel")}
              onValueChange={(value) => {
                if (value) setBilling(value as Billing);
              }}
            >
              <ToggleGroupItem value="monthly">
                {t("toggle.monthly")}
              </ToggleGroupItem>
              <ToggleGroupItem value="annual">
                {t("toggle.annual")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-stretch gap-[14px]">
            {PLAN_IDS.map((id) => {
              const monthly = PLAN_PRICE_CENTS[id];
              const price =
                billing === "annual"
                  ? Math.round(monthly * ANNUAL_FACTOR)
                  : monthly;
              const isCurrent = currentPlan === id;
              const isFeatured = id === "studio";

              return (
                <div
                  key={id}
                  className={
                    isFeatured
                      ? "border-olive shadow-plan rounded-card flex flex-1 flex-col gap-[9px] border-2 bg-white p-[18px]"
                      : "border-border rounded-card flex flex-1 flex-col gap-[9px] border bg-white p-[18px]"
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-2 text-meta tracking-eyebrow font-semibold uppercase">
                      {tPlan(`plans.${id}.name`)}
                    </span>
                    {isFeatured && (
                      <Badge variant="notice">{t("mostChosenBadge")}</Badge>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-title font-semibold">
                      {/* #206: formatBRL is the one place centavos become
                          display text -- no hand-built "R$ ${n}" and no
                          catalog price literal (the catalog carried
                          "R$ 0"/"R$ 59"/... which could silently disagree
                          with what Stripe actually charges). The free tier
                          renders through the same formatter rather than its
                          own catalog string, so all four cards share one
                          format. */}
                      {formatBRL(price)}
                    </span>
                    {id !== "free" && (
                      <span className="text-muted text-ui">
                        {t("priceSuffix")}
                      </span>
                    )}
                  </div>
                  <span className="text-muted-2 text-ui">
                    {tPlan(`plans.${id}.creditsLabel`, {
                      credits: PLAN_CREDITS[id],
                    })}
                  </span>
                  {billing === "annual" && id !== "free" && (
                    <span className="text-muted text-tick">
                      {t("annualBilledNote")}
                    </span>
                  )}

                  <div className="bg-line h-px" />

                  <ul className="flex flex-col gap-[6px]">
                    {PLAN_FEATURES[id].map((feature) => (
                      <li
                        key={feature.key}
                        className="text-ui flex items-center gap-[7px]"
                      >
                        <span>{t(`feature.${feature.key}`)}</span>
                        {feature.status === "soon" && (
                          <Badge variant="soon">
                            {tPlan("comingSoonBadge")}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="min-h-2 flex-1" />

                  <PlanCta
                    id={id}
                    signedIn={signedIn}
                    isCurrent={isCurrent}
                    billing={billing}
                  />
                </div>
              );
            })}
          </div>

          <div className="border-border rounded-card flex flex-wrap items-center gap-[10px] border bg-white p-[15px]">
            <span className="text-muted-2 text-ui">
              {t("footer.costLabel")}
            </span>
            <FooterChip>
              {t("footer.costGenerate", { cost: COSTS.adjust })}
            </FooterChip>
            <FooterChip>
              {t("footer.costAdjust", { cost: COSTS.adjust })}
            </FooterChip>
            <FooterChip>
              {t("footer.costGraduate", { cost: COSTS.graduate })}
            </FooterChip>
            <FooterChip>
              {t("footer.costCorrection", { cost: COSTS.correction })}
            </FooterChip>
            <div className="flex-1" />
            <span className="text-muted-2 text-ui">
              {t("footer.topup", {
                credits: TOPUP_CREDITS,
                price: formatBRL(TOPUP_PRICE_CENTS),
              })}
            </span>
          </div>
          {/* #206: the gateway's real limitations, stated on the public
              pricing page rather than discovered at checkout -- the "surface
              feature limitations on-screen, never silently" rule. All three
              are permanent properties of a Brazil-based Stripe account, not
              gaps, so none is an "em breve": BRL-only settlement, a
              converted local amount shown at checkout, and Visa/Mastercard
              only (no Elo/Amex/Hipercard/Diners). */}
          <p className="text-muted-2 text-ui">{t("paymentNote")}</p>
        </div>
      </ScrollArea>
    </div>
  );
}

function FooterChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-paper border-border text-meta rounded-pill border px-[11px] py-[5px]">
      {children}
    </span>
  );
}

// #15's CTA decisions: Confecção always says "Falar com vendas", disabled --
// there is no sales contact destination anywhere in this repo (issue #9's
// own audit). Every other plan: the current plan shows "Plano atual" (no
// control); a signed-out visitor's CTA goes to /signup; a signed-in
// visitor's goes to /settings?section=plan, which is where the real
// upgrade-only enforcement and error handling already live (PlanSection) --
// this page is marketing, not a second place implementing that logic. The
// annual toggle disables every non-free, non-current CTA with an "em breve"
// badge rather than starting a checkout billing's not built to honour.
function PlanCta({
  id,
  signedIn,
  isCurrent,
  billing,
}: {
  id: PlanId;
  signedIn: boolean;
  isCurrent: boolean;
  billing: Billing;
}) {
  const t = useTranslations("Pricing");
  const tPlan = useTranslations("PlanSection");

  if (isCurrent) {
    return (
      <div className="border-border text-muted rounded-card text-ui border px-[10px] py-[10px] text-center font-semibold">
        {tPlan("currentBadge")}
      </div>
    );
  }

  if (id === "factory") {
    return (
      <div className="flex flex-col items-center gap-[6px]">
        <Button variant="outline" size="sm" disabled className="w-full">
          {t("plans.factory.cta")}
        </Button>
        <Badge variant="soon">{tPlan("comingSoonBadge")}</Badge>
      </div>
    );
  }

  const annualDisabled = billing === "annual" && id !== "free";
  if (annualDisabled) {
    return (
      <div className="flex flex-col items-center gap-[6px]">
        <Button size="sm" disabled className="w-full">
          {t(`plans.${id}.cta`)}
        </Button>
        <Badge variant="soon">{tPlan("comingSoonBadge")}</Badge>
      </div>
    );
  }

  const href = signedIn ? "/settings?section=plan" : "/signup";
  return (
    <Button asChild size="sm" variant={id === "free" ? "outline" : "default"}>
      <Link href={href}>{t(`plans.${id}.cta`)}</Link>
    </Button>
  );
}
