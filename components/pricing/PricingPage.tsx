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
  annualMonthlyEquivalentCents,
  effectiveCredits,
} from "@/lib/billing/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { Reveal } from "@/components/landing/reveal";

type Billing = "monthly" | "annual";

const PAID_PLAN_IDS = PLAN_IDS.filter((id) => id !== "free");

// #15: design 5c lists "Plano de corte automatico" only under Estudio, but
// CutPlanTab ships it free on every plan -- and issue #16 shipped version
// history with no retention cap or plan gate at all, so "Historico
// ilimitado de versoes" is equally true everywhere now. Neither is listed
// as a plan differentiator anywhere below (see lib/billing/plans.ts's own
// comment on PLAN_FEATURES) rather than misrepresenting one as exclusive.
//
// Copy stays whatever the real app charges/limits, with one deliberate
// exception: paymentNote uses the design handoff's generic "Pagamentos
// processados pela Stripe." (see docs/decisions.md) rather than the
// gateway's real BRL-only/Visa-Mastercard limitations.
//
// landing-page-design: this screen shares the marketing surface's type
// system and chrome with the landing page -- both render through
// MarketingShell, so the island nav, skip link and Geist/Tailwind-scale
// boundary are defined in exactly one place.
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
    <MarketingShell signedIn={signedIn}>
      <section className="border-border bg-paper border-b">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-end gap-8 px-4 pt-24 pb-12 sm:px-6">
          <Reveal className="flex min-w-0 flex-1 flex-col gap-3">
            <span className="text-olive tracking-eyebrow text-sm font-semibold uppercase">
              {t("title")}
            </span>
            {/* B5: the hero heading takes the light-theme text gradient and
                the same 680px cap as the landing hero. */}
            <h1 className="marketing-hero-title max-w-[680px] text-4xl font-semibold text-balance sm:text-5xl lg:text-6xl">
              {t("headline")}
            </h1>
            <p className="text-muted-2 max-w-[680px] text-lg text-pretty">
              {t("subtitle")}
            </p>
          </Reveal>

          <div className="flex flex-col items-start gap-2">
            <span className="text-muted tracking-eyebrow text-sm font-semibold uppercase">
              {t("toggleLabel")}
            </span>
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
        </div>
      </section>

      <section className="bg-surface">
        <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-12 px-4 py-24 sm:px-6">
          <div className="flex flex-wrap items-stretch gap-6">
            <FreeCard signedIn={signedIn} currentPlan={currentPlan} />

            <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
              {PAID_PLAN_IDS.map((id, i) => {
                const monthly = PLAN_PRICE_CENTS[id];
                const price =
                  billing === "annual"
                    ? annualMonthlyEquivalentCents(id)
                    : monthly;
                const isCurrent = currentPlan === id;
                const isFeatured = id === "atelier";

                return (
                  <Reveal
                    key={id}
                    delayMs={i * 60}
                    className={
                      isFeatured
                        ? "border-olive shadow-plan bg-surface flex flex-col gap-3 rounded-2xl border-2 p-4"
                        : "border-border bg-surface flex flex-col gap-3 rounded-2xl border p-4"
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-muted-2 tracking-eyebrow text-sm font-semibold uppercase">
                        {tPlan(`plans.${id}.name`)}
                      </span>
                      {isFeatured && (
                        <Badge variant="notice">{t("mostChosenBadge")}</Badge>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-semibold">
                          {/* #206: formatBRL is the one place centavos become
                              display text -- no hand-built "R$ ${n}" and no
                              catalog price literal. */}
                          {formatBRL(price)}
                        </span>
                        <span className="text-muted text-sm">
                          {t("priceSuffix")}
                        </span>
                      </div>
                      {billing === "annual" && (
                        <span className="text-muted text-xs">
                          {t("annualBilledNote")}
                        </span>
                      )}
                    </div>

                    {/* B3 nested radius: a 16px outer radius with 16px of
                        padding gives 16 - 16 = 0, below the formula's floor
                        of 2, so this stays at the smallest step rather than
                        taking a derived radius. */}
                    <div className="border-line bg-paper rounded-sm border px-3 py-2">
                      <span className="text-base font-semibold">
                        {billing === "annual"
                          ? tPlan(`plans.${id}.creditsLabelAnnual`, {
                              credits: effectiveCredits(id, "year"),
                            })
                          : tPlan(`plans.${id}.creditsLabel`, {
                              credits: PLAN_CREDITS[id],
                            })}
                      </span>
                    </div>

                    <ul className="flex flex-col gap-2">
                      {PLAN_FEATURES[id].map((feature) => (
                        <li
                          key={feature.key}
                          className="flex items-start gap-2 text-sm"
                        >
                          <span className="bg-olive mt-2 size-1 flex-none rounded-full" />
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
                      isFeatured={isFeatured}
                    />
                  </Reveal>
                );
              })}
            </div>
          </div>

          <div className="border-line flex flex-col gap-6 border-t pt-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-muted tracking-eyebrow text-sm font-semibold uppercase">
                {t("footer.costLabel")}
              </span>
              <div className="flex-1" />
              <span className="text-muted-2 text-sm">
                {t("footer.topup", {
                  credits: TOPUP_CREDITS,
                  price: formatBRL(TOPUP_PRICE_CENTS),
                })}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <CostTile
                value={COSTS.adjust}
                label={t("footer.costs.generate")}
              />
              <CostTile value={COSTS.adjust} label={t("footer.costs.adjust")} />
              <CostTile
                value={COSTS.graduate}
                label={t("footer.costs.graduate")}
              />
              <CostTile
                value={COSTS.correction}
                label={t("footer.costs.correction")}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border-border bg-paper border-t">
        <div className="mx-auto max-w-[1160px] px-4 py-6 sm:px-6">
          <p className="text-muted-2 max-w-[680px] text-sm text-pretty">
            {t("paymentNote")}
          </p>
        </div>
      </section>

      <LandingFooter />
    </MarketingShell>
  );
}

function FreeCard({
  signedIn,
  currentPlan,
}: {
  signedIn: boolean;
  currentPlan: PlanId | null;
}) {
  const t = useTranslations("Pricing");
  const tPlan = useTranslations("PlanSection");
  const isCurrent = currentPlan === "free";

  return (
    <Reveal className="border-olive bg-olive-tint flex w-full flex-none flex-col gap-3 rounded-2xl border-2 p-6 sm:w-[260px]">
      <span className="text-olive tracking-eyebrow text-sm font-semibold uppercase">
        {tPlan("plans.free.name")}
      </span>
      <span className="text-2xl font-semibold">
        {tPlan("plans.free.creditsLabel", { credits: PLAN_CREDITS.free })}
      </span>

      {/* The olive-tint card's own divider. `border-line` is the repo's
          hairline token -- the literal rgba() this used to carry was the one
          hardcoded color left on the marketing surface. */}
      <div className="border-line border-t" />

      <ul className="flex flex-col gap-2">
        {PLAN_FEATURES.free.map((feature) => (
          <li key={feature.key} className="flex items-start gap-2 text-sm">
            <span className="bg-olive mt-2 size-1 flex-none rounded-full" />
            <span>{t(`feature.${feature.key}`)}</span>
            {feature.status === "soon" && (
              <Badge variant="soon">{tPlan("comingSoonBadge")}</Badge>
            )}
          </li>
        ))}
      </ul>

      <div className="min-h-2 flex-1" />

      <PlanCta
        id="free"
        signedIn={signedIn}
        isCurrent={isCurrent}
        isFeatured={false}
      />
      <span className="text-olive-dark text-xs">{t("freeNote")}</span>
    </Reveal>
  );
}

function CostTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="border-border bg-surface flex flex-col gap-1 rounded-2xl border p-4">
      <span className="text-3xl font-semibold">{value}</span>
      <span className="text-muted-2 text-sm">{label}</span>
    </div>
  );
}

// #15's CTA decisions: Confeccao always says "Falar com vendas", disabled --
// there is no sales contact destination anywhere in this repo (issue #9's
// own audit). Every other plan: the current plan shows "Plano atual" (no
// control); a signed-out visitor's CTA goes to /signup; a signed-in
// visitor's goes to /settings?section=plan, which is where the real
// upgrade-only enforcement and error handling already live (PlanSection) --
// this page is marketing, not a second place implementing that logic.
function PlanCta({
  id,
  signedIn,
  isCurrent,
  isFeatured,
}: {
  id: PlanId;
  signedIn: boolean;
  isCurrent: boolean;
  isFeatured: boolean;
}) {
  const t = useTranslations("Pricing");
  const tPlan = useTranslations("PlanSection");

  if (isCurrent) {
    return (
      <div className="border-border text-muted rounded-full border px-3 py-2 text-center text-sm font-semibold">
        {tPlan("currentBadge")}
      </div>
    );
  }

  if (id === "factory") {
    return (
      <div className="flex flex-col items-center gap-2">
        <Button
          variant="outline"
          size="marketingSm"
          disabled
          className="w-full"
        >
          {t("plans.factory.cta")}
        </Button>
        <Badge variant="soon">{tPlan("comingSoonBadge")}</Badge>
      </div>
    );
  }

  const href = signedIn ? "/settings?section=plan" : "/signup";
  return (
    <Button
      asChild
      size="marketingSm"
      variant={isFeatured ? "default" : "outline"}
    >
      <Link href={href}>{t(`plans.${id}.cta`)}</Link>
    </Button>
  );
}
