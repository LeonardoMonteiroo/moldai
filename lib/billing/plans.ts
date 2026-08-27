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

// Design 5c's monthly prices in BRL, display-only: no code charges these
// yet (the mock provider grants credits without moving money). Kept
// independent of app/api/billing/purchase/route.ts's own CHECKOUT_PRICES,
// which prices what the asaas checkout actually bills -- that route's own
// comment explains why the two are not unified.
export const PLAN_PRICES: Record<PlanId, number> = {
  free: 0,
  atelier: 59,
  studio: 149,
  factory: 399,
};

// The mock top-up: credits granted and its display price. Was duplicated as
// a literal 100 in applyPurchase and UsageSection's optimistic ledger row;
// TOPUP_PRICE matches app/api/billing/purchase/route.ts's own
// CHECKOUT_PRICES.topup (kept independent there for the same reason as the
// plan prices above).
export const TOPUP_CREDITS = 100;
export const TOPUP_PRICE = 19;

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
    { key: "audacesMoldeme", status: "shipped" },
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
