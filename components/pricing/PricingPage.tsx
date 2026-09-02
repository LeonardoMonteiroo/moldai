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
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LandingNav } from "@/components/landing/LandingNav";

type Billing = "monthly" | "annual";

const PAID_PLAN_IDS = PLAN_IDS.filter((id) => id !== "free");

// #15: design 5c lists "Plano de corte automático" only under Estúdio, but
// CutPlanTab ships it free on every plan -- and issue #16 shipped version
// history with no retention cap or plan gate at all, so "Histórico
// ilimitado de versões" is equally true everywhere now. Neither is listed
// as a plan differentiator anywhere below (see lib/billing/plans.ts's own
// comment on PLAN_FEATURES) rather than misrepresenting one as exclusive.
//
// #docs/design: layout follows docs/design/screens/Planos.dc.html -- a hero
// band, the Grátis card pulled out of the grid as its own highlighted card
// (the CreditsSection/PlanSection "border-olive bg-olive-tint border-2"
// idiom, reused rather than the mockup's separate 1px-border-plus-top-bar
// treatment this codebase has no other user of), a boxed credits pill on
// paid cards, and a stat-tile costs section. Copy stays whatever the real
// app charges/limits, with one deliberate exception: paymentNote uses the
// mockup's own generic "Pagamentos processados pela Stripe." verbatim (see
// docs/decisions.md) rather than the gateway's real BRL-only/Visa-Mastercard
// limitations this project stated on-screen before.
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
      <LandingNav signedIn={signedIn} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col">
          <section className="border-border bg-paper border-b">
            <div className="mx-auto flex max-w-[1160px] flex-wrap items-end gap-8 px-[34px] pt-14 pb-11">
              <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
                <span className="text-olive text-meta tracking-eyebrow font-semibold uppercase">
                  {t("title")}
                </span>
                <h1 className="font-display text-hero tracking-hero max-w-[640px] font-semibold text-balance">
                  {t("headline")}
                </h1>
                <p className="text-muted-2 text-body max-w-[520px]">
                  {t("subtitle")}
                </p>
              </div>
              <div className="flex flex-col items-start gap-2">
                <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
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

          <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-6 px-[34px] py-[28px]">
            <div className="flex flex-wrap items-stretch gap-[18px]">
              <FreeCard signedIn={signedIn} currentPlan={currentPlan} />

              <div className="grid min-w-0 flex-1 grid-cols-1 gap-[14px] sm:grid-cols-3">
                {PAID_PLAN_IDS.map((id) => {
                  const monthly = PLAN_PRICE_CENTS[id];
                  const price =
                    billing === "annual"
                      ? annualMonthlyEquivalentCents(id)
                      : monthly;
                  const isCurrent = currentPlan === id;
                  const isFeatured = id === "studio";

                  return (
                    <div
                      key={id}
                      className={
                        isFeatured
                          ? "border-olive shadow-plan rounded-card flex flex-col gap-[12px] border-2 bg-white p-[18px]"
                          : "border-border rounded-card flex flex-col gap-[12px] border bg-white p-[18px]"
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

                      <div className="flex flex-col gap-1">
                        <div className="flex items-baseline gap-1">
                          <span className="font-display text-title font-semibold">
                            {/* #206: formatBRL is the one place centavos become
                                display text -- no hand-built "R$ ${n}" and no
                                catalog price literal (the catalog carried
                                "R$ 59"/"R$ 149"/... which could silently
                                disagree with what Stripe actually charges). */}
                            {formatBRL(price)}
                          </span>
                          <span className="text-muted text-ui">
                            {t("priceSuffix")}
                          </span>
                        </div>
                        {billing === "annual" && (
                          <span className="text-muted text-tick">
                            {t("annualBilledNote")}
                          </span>
                        )}
                      </div>

                      <div className="border-line bg-paper rounded-item border px-[12px] py-[9px]">
                        <span className="text-body font-semibold">
                          {billing === "annual"
                            ? tPlan(`plans.${id}.creditsLabelAnnual`, {
                                credits: effectiveCredits(id, "year"),
                              })
                            : tPlan(`plans.${id}.creditsLabel`, {
                                credits: PLAN_CREDITS[id],
                              })}
                        </span>
                      </div>

                      <ul className="flex flex-col gap-[8px]">
                        {PLAN_FEATURES[id].map((feature) => (
                          <li
                            key={feature.key}
                            className="text-ui flex items-start gap-[8px]"
                          >
                            <span className="bg-olive mt-[6px] size-[5px] flex-none rounded-full" />
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
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-line flex flex-col gap-4 border-t pt-[22px]">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
                  {t("footer.costLabel")}
                </span>
                <div className="flex-1" />
                <span className="text-muted-2 text-ui">
                  {t("footer.topup", {
                    credits: TOPUP_CREDITS,
                    price: formatBRL(TOPUP_PRICE_CENTS),
                  })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-4">
                <CostTile
                  value={COSTS.adjust}
                  label={t("footer.costs.generate")}
                />
                <CostTile
                  value={COSTS.adjust}
                  label={t("footer.costs.adjust")}
                />
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

          {/* #docs/design: reverted to the design handoff's generic copy (see
              docs/decisions.md) -- the gateway's real BRL-only/Visa-Mastercard-
              only limitations no longer render here. */}
          <section className="border-border bg-paper border-t">
            <div className="mx-auto max-w-[1160px] px-[34px] py-[26px]">
              <p className="text-muted-2 text-ui max-w-[760px]">
                {t("paymentNote")}
              </p>
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
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
    <div className="border-olive bg-olive-tint rounded-card flex w-full flex-none flex-col gap-[12px] border-2 p-[20px] sm:w-[260px]">
      <span className="text-olive text-meta tracking-eyebrow font-semibold uppercase">
        {tPlan("plans.free.name")}
      </span>
      <span className="font-display text-title font-semibold">
        {tPlan("plans.free.creditsLabel", { credits: PLAN_CREDITS.free })}
      </span>

      <div className="h-px bg-[rgba(74,90,58,0.18)]" />

      <ul className="flex flex-col gap-[8px]">
        {PLAN_FEATURES.free.map((feature) => (
          <li key={feature.key} className="text-ui flex items-start gap-[8px]">
            <span className="bg-olive mt-[6px] size-[5px] flex-none rounded-full" />
            <span>{t(`feature.${feature.key}`)}</span>
            {feature.status === "soon" && (
              <Badge variant="soon">{tPlan("comingSoonBadge")}</Badge>
            )}
          </li>
        ))}
      </ul>

      <div className="min-h-2 flex-1" />

      <PlanCta id="free" signedIn={signedIn} isCurrent={isCurrent} />
      <span className="text-olive-dark text-meta">{t("freeNote")}</span>
    </div>
  );
}

function CostTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="border-border rounded-card flex flex-col gap-0.5 border bg-white p-[16px]">
      <span className="font-display text-display font-semibold">{value}</span>
      <span className="text-muted-2 text-ui">{label}</span>
    </div>
  );
}

// #15's CTA decisions: Confecção always says "Falar com vendas", disabled --
// there is no sales contact destination anywhere in this repo (issue #9's
// own audit). Every other plan: the current plan shows "Plano atual" (no
// control); a signed-out visitor's CTA goes to /signup; a signed-in
// visitor's goes to /settings?section=plan, which is where the real
// upgrade-only enforcement and error handling already live (PlanSection) --
// this page is marketing, not a second place implementing that logic. The
// annual toggle is real now (annual billing design, 2026-08-30): every CTA
// stays a live link regardless of billing interval.
function PlanCta({
  id,
  signedIn,
  isCurrent,
}: {
  id: PlanId;
  signedIn: boolean;
  isCurrent: boolean;
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

  const href = signedIn ? "/settings?section=plan" : "/signup";
  return (
    <Button asChild size="sm" variant={id === "free" ? "outline" : "default"}>
      <Link href={href}>{t(`plans.${id}.cta`)}</Link>
    </Button>
  );
}
