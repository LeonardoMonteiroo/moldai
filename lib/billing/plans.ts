import type { PlanId } from "@/lib/types";

// Framework-free leaf module, the lib/export/formats.ts precedent: a single
// source for each plan's terms, so applyPurchase (the money path), the
// authenticated PlanSection and the public /planos page all read the same
// numbers instead of each hardcoding its own copy -- the exact drift shape
// CLAUDE.md documents for the deleted Wallet.planLabel column.

export type PaidPlanId = Exclude<PlanId, "free">;

// Design 5c's monthly credit allowance per tier
// (docs/design/MoldAI Wireframes.dc.html:995,1056,1131,1194). free/atelier
// match seedWallet/applyPurchase's pre-existing figures.
export const PLAN_CREDITS: Record<PlanId, number> = {
  free: 30,
  atelier: 500,
  studio: 2000,
  factory: 10000,
};

// #206: the currency every price below is denominated in, and the currency
// a charge actually SETTLES in. A Brazil-based Stripe account is in a
// foreign-exchange-control country, so settlement is BRL-only regardless of
// what currency the buyer is shown -- Adaptive Pricing converts at checkout
// for presentation, it does not change what we get paid in. Lowercase
// because that is the literal Stripe expects in `currency`.
export const CURRENCY = "brl";

// Design 5c's monthly prices, **in the currency's smallest unit** (centavos)
// -- #206: Stripe's `unit_amount` is always the minor unit, so 5900 charges
// R$ 59,00. Renamed from PLAN_PRICES/TOPUP_PRICE deliberately rather than
// silently rescaled in place: every existing call site becomes a compile
// error, which is the safe direction for a money constant changing units by
// a factor of 100. Never format one of these by hand -- formatBRL below is
// the one place that turns centavos into display text.
export const PLAN_PRICE_CENTS: Record<PlanId, number> = {
  free: 0,
  atelier: 5900,
  studio: 14900,
  factory: 39900,
};

// The top-up: credits granted and its price in centavos. TOPUP_CREDITS was
// duplicated as a literal 100 in applyPurchase and UsageSection's optimistic
// ledger row.
export const TOPUP_CREDITS = 100;
export const TOPUP_PRICE_CENTS = 1900;

/**
 * #206: the single place centavos become display text, so no component (and
 * no catalog entry) hardcodes a currency symbol or a decimal separator
 * again. The catalog used to carry the literals "R$ 0"/"R$ 59"/"R$ 149"/
 * "R$ 399" and PricingPage built `R$ ${price}` by hand -- the same
 * duplicated-fact drift CLAUDE.md documents for the deleted
 * Wallet.planLabel column, one step worse because a price that disagrees
 * with what Stripe charges is a money defect rather than a cosmetic one.
 *
 * Framework-free (Intl is a JS built-in, not a next-intl call), so this
 * module stays a plain leaf the way lib/export/formats.ts is. pt-BR is
 * hardcoded as the locale because this app is single-locale by design
 * (CLAUDE.md's i18n section) and BRL is the settlement currency above --
 * when a second locale lands, the locale argument comes from next-intl and
 * this signature grows a parameter.
 */
export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: CURRENCY.toUpperCase(),
  }).format(cents / 100);
}

/**
 * Narrows an untrusted wire value to a paid PlanId. Same trust-boundary
 * shape as isPurchaseType (lib/billing/wallet.ts) -- an unrecognised value,
 * or the literal "free", must never reach applyPurchase's subscribe branch.
 */
export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return value === "atelier" || value === "studio" || value === "factory";
}

// A plan switch is only ever offered as an upgrade (issue #9's decision 2:
// downgrades are refused server-side, not merely hidden). Derived from
// PLAN_CREDITS rather than a second rank table, so the two can't disagree.
export function isPlanUpgrade(from: PlanId, to: PlanId): boolean {
  return PLAN_CREDITS[to] > PLAN_CREDITS[from];
}

// Each plan's marketing bullets for the public /planos screen (issue #15),
// as structured data rather than JSX conditionals -- `status` decides
// whether the bullet renders with an "em breve" badge. `key` resolves under
// Pricing.feature.* in the catalog.
//
// Four capabilities design 5c advertises don't exist in this codebase and
// must not be claimed as shipped (issue #15's decisions): a second, more
// precise AI model ("Modelo v2 Pro" -- every plan drafts with the same
// claude-sonnet-5), and per-plan user seats ("1/3/5 usuários" -- there is no
// multi-user concept anywhere; Pattern/Wallet/SizeChart are all keyed to a
// single userId) and a priority queue/API product (Confecção). "Plano de
// corte automático" is deliberately absent from every list below rather
// than shown as an Estúdio differentiator -- it ships client-side on every
// plan, free (CutPlanTab), so listing it anywhere here would misrepresent
// it as plan-gated. "Histórico ilimitado de versões" is similarly omitted
// rather than marked "soon": issue #16 shipped version history with no
// retention cap and no plan gate at all (its own text: "If a cap is ever
// wanted it becomes a plan-gated policy, not a storage necessity") -- by
// the time this module was written it was true for every plan, not an
// Ateliê exclusive, so listing it as one would now be the false claim.
export interface PlanFeature {
  key: string;
  status: "shipped" | "soon";
}

export const PLAN_FEATURES: Record<PlanId, PlanFeature[]> = {
  free: [
    { key: "graduationExport", status: "shipped" },
    // Split out of a single "Audaces e Molde.me" bullet that claimed both as
    // shipped. Audaces is real -- the AAMA/ASTM DXF subset, itself tagged
    // "beta" in the export menu for its own disclosed gaps. Molde.me is not:
    // ExportFormatList's SOON_FORMATS carries "moldeme", and the import
    // screen's formatNote already tells the user Molde.me is "ainda nao --
    // em breve". A public pricing page must not sell what two other screens
    // admit does not exist.
    { key: "audaces", status: "shipped" },
    { key: "moldeme", status: "soon" },
  ],
  atelier: [
    { key: "ownSizeChart", status: "shipped" },
    { key: "oneUser", status: "soon" },
  ],
  studio: [
    { key: "modelV2Pro", status: "soon" },
    { key: "threeUsers", status: "soon" },
  ],
  factory: [
    { key: "priorityQueueApi", status: "soon" },
    { key: "fiveUsers", status: "soon" },
    // Design 5c lists this as its own bullet, separate from "Fila
    // prioritária e API" above. Not one of the issue's own enumerated four,
    // but there is no support channel of any kind in this repo (issue #9's
    // audit: no mailto:/suporte@/contato@ anywhere) -- claiming it shipped
    // would be a plainer falsehood than the AAMA export's disclosed "beta"
    // gaps, so it gets the same "soon" treatment as the rest.
    { key: "dedicatedSupport", status: "soon" },
  ],
};
