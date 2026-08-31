# Annual billing

**Date:** 2026-08-30
**Status:** approved, ready for implementation planning
**Resolves:** CLAUDE.md's `/planos` section ("The Mensal/Anual −20% toggle changes only the displayed price; annual billing isn't implemented, so its CTA is disabled + badged") and design 5c's advertised annual option.

## Problem

`/planos` already renders a Mensal/Anual toggle with a −20% price preview, but it's decorative: every non-free CTA disables + badges "em breve" the moment Anual is selected, because `applyPurchase`/`renewWallet`/the Stripe checkout only know a 30-day cycle. `/settings`'s `PlanSection` (where real subscribing actually happens) has no interval concept at all. This spec makes annual a real, payable option in both places.

## Key context

- Decided with the user (2026-08-30), each a real product call, not an implementation detail:
  1. **Credit model: annual is a lump sum.** A `year`-interval subscribe grants `PLAN_CREDITS[plan] * 12` once, at purchase/renewal time. It is drawn down over the year with no further refills until the next annual invoice — not a monthly refill decoupled from billing.
  2. **Interval can be changed anytime, self-serve**, same as a tier upgrade — not fixed at first subscribe.
  3. **The old Stripe subscription gets canceled** when a new one is confirmed (folding in a fix for a pre-existing gap — see "Incidental fix" below).
- `Wallet.total`/`Wallet.balance`/`Wallet.renewsAt` today assume a single, always-30-day cycle (`lib/billing/wallet.ts`). `PLAN_CREDITS` (`lib/billing/plans.ts`) is documented as "monthly credit allowance per tier."
- Every plan change today — even an existing Stripe subscriber upgrading tiers — works by creating a **brand-new** Checkout Session (`mode: "subscription"`) and pointing `Wallet.stripeSubscriptionId` at the new one (`lib/db/wallet.ts`'s `withWalletIdempotent`, "written unconditionally... so a resubscribe... points at the live subscription"). The previous subscription is never canceled. This is pre-existing, not introduced here, but interval-switching inherits it, so this spec closes it.
- `applyPurchase`'s existing monotonicity guard (`isPlanUpgrade`, `lib/billing/plans.ts`) ranks purely by `PLAN_CREDITS[plan]` and is reused/generalized rather than replaced — every call site that depends on "downgrades are refused server-side" keeps working, just against a wider ranking key.
- `scripts/cron-renew.ts` already excludes any wallet carrying a live `stripeSubscriptionId` (#161) — this holds for annual wallets unchanged; annual renewal is exclusively the webhook's `subscription_cycle` path, same as monthly.
- Stripe mechanics referenced: `recurring.interval` on inline `price_data`, `Stripe.subscriptions.cancel`. No live Stripe account is reachable from this environment — verified against the mock provider, the SDK's own types, and unit tests only, matching every other Stripe integration note in CLAUDE.md.

## Non-goals

- Prorating an interval switch. A switch is a brand-new Checkout Session at the new interval's full price, exactly like a tier upgrade today — no partial-period credit for the canceled subscription's unused time. (Stripe itself still won't double-charge inside one checkout; this is about not building proration logic in this app.)
- A UI to view/manage the Stripe subscription cancellation history — the cancel call is a fire-and-forget cleanup, not a new user-facing feature.
- Carrying an interval choice made on the signed-out `/planos` toggle through `/signup` into `/settings` — matches existing behavior (tier choice on `/planos` isn't carried through either).
- Any change to top-ups (`type: "topup"`) — interval is a subscribe-only concept.
- Changing `isPlanUpgrade`'s existing call sites' external behavior for two monthly-only comparisons (e.g. atelier→studio monthly-to-monthly) — the generalized ranking must produce identical answers to today's for any all-monthly comparison.

## Design

### 1. Ranking: generalize `isPlanUpgrade` to `(plan, interval)` pairs

`lib/billing/plans.ts`:

```ts
export type BillingInterval = "month" | "year";

// A year-interval plan grants its whole year's allowance as one lump sum
// (decided 2026-08-30) -- this is the one place "how many credits does this
// purchase grant" is computed, so applyPurchase and the ranking below agree.
export function effectiveCredits(
  plan: PlanId,
  interval: BillingInterval,
): number {
  return PLAN_CREDITS[plan] * (interval === "year" ? 12 : 1);
}

// Generalizes the old isPlanUpgrade (PLAN_CREDITS[to] > PLAN_CREDITS[from])
// to rank by effectiveCredits instead -- every existing all-monthly call
// keeps its exact answer, since effectiveCredits(x, "month") === PLAN_CREDITS[x].
// This is also what makes "switch interval anytime" and "downgrades refused"
// the same rule: monthly-to-annual same tier is always an increase (allowed
// self-serve); annual-to-monthly same tier is always a decrease (refused),
// with no special-casing beyond this one comparison.
export function isPlanOrIntervalUpgrade(
  from: { plan: PlanId; interval: BillingInterval },
  to: { plan: PlanId; interval: BillingInterval },
): boolean {
  return (
    effectiveCredits(to.plan, to.interval) >
    effectiveCredits(from.plan, from.interval)
  );
}
```

`isPlanUpgrade(from: PlanId, to: PlanId)` is **replaced**, not kept alongside the new function: its four real call sites (`applyPurchase`'s guard, both `isPlanUpgrade` checks in `app/api/billing/purchase/route.ts`, and `PlanSection.tsx`'s `canUpgrade`) all move to `isPlanOrIntervalUpgrade`, which leaves the bare-`PlanId` version with no caller outside its own test — this repo's own "if something is unused, delete it completely" rule, not a case for a compatibility shim. `lib/billing/plans.test.ts`'s existing `isPlanUpgrade` cases move onto `isPlanOrIntervalUpgrade` with both sides fixed at `interval: "month"`, preserving every one of today's assertions verbatim (this is the "all-monthly answers match" regression case from the Non-goals section).

### 2. Pricing constants

`lib/billing/plans.ts` adds the one source for the annual numbers, replacing `PricingPage.tsx`'s local `ANNUAL_FACTOR`. **Two related but distinct figures, not one** — the catalog's existing `priceSuffix: "/mês"` + `annualBilledNote: "cobrado anualmente"` pair proves the current (display-only) UI already shows a discounted _monthly-equivalent_ number for Anual, separately noting it's billed once a year, not the full annual total:

```ts
export const ANNUAL_DISCOUNT_FACTOR = 0.8; // -20%, design 5c's own figure

// What both cards' price ("R$X/mês", per the existing priceSuffix +
// annualBilledNote pair) DISPLAY for an annual plan -- the discounted
// monthly-equivalent rate, not what a single charge actually is.
export function annualMonthlyEquivalentCents(plan: PaidPlanId): number {
  return Math.round(PLAN_PRICE_CENTS[plan] * ANNUAL_DISCOUNT_FACTOR);
}

// The real, one-time annual charge -- what a "year" checkout's
// price_data.unit_amount actually is, and what applyPurchase's effectiveCredits
// lump sum is paid for. Deliberately 12x the ROUNDED monthly-equivalent above,
// not a separately-rounded `PLAN_PRICE_CENTS[plan] * 12 * ANNUAL_DISCOUNT_FACTOR`
// -- the two must agree exactly (12 x what's displayed per month), or a buyer
// could be charged a few centavos more/less than "12x the price shown."
export function annualPriceCents(plan: PaidPlanId): number {
  return annualMonthlyEquivalentCents(plan) * 12;
}
```

`PricingPage.tsx` and `PlanSection.tsx` both render `annualMonthlyEquivalentCents(id)` for the on-screen price (keeping today's `priceSuffix`/`annualBilledNote` display convention); the checkout session and the credited lump sum both use `annualPriceCents(id)`/`effectiveCredits(id, "year")` — the actual one-time charge, never the displayed per-month figure charged only once (that would undercharge by 12x).

### 3. Wallet model

`lib/billing/wallet.ts`:

- `Wallet` gains `planInterval: BillingInterval` (mirrors `plan`/`total`/`renewsAt` — meaningful for a paid plan, harmlessly `"month"` on free).
- `Purchase`'s subscribe variant gains `interval: BillingInterval`: `{ type: "subscribe"; plan: PaidPlanId; interval: BillingInterval }`.
- `applyPurchase`'s subscribe branch: `planCredits = effectiveCredits(purchase.plan, purchase.interval)`; the monotonicity guard calls `isPlanOrIntervalUpgrade({plan: wallet.plan, interval: wallet.planInterval}, {plan: purchase.plan, interval: purchase.interval})`; on the upgrade branch, `wallet.planInterval = purchase.interval` and `wallet.renewsAt = new Date(now.getTime() + (purchase.interval === "year" ? 365 : 30) * DAY_MS)`.
- `renewWallet(wallet, now)`: unchanged formula (`total + purchased`), but the `renewsAt` advance reads `wallet.planInterval` instead of the hardcoded 30-day constant: `base.getTime() + (wallet.planInterval === "year" ? 365 : 30) * DAY_MS`. This is the only change needed for annual renewal (`subscription_cycle`) to roll the date forward correctly — `total` was already stamped with the annual lump at subscribe time.
- `seedWallet` sets `planInterval: "month"` (inert for the free tier, consistent default).
- `reverseSubscription` (full refund reset to free) also resets `planInterval: "month"`, matching how it already resets `plan`/`total`.

### 4. Schema

One additive migration on `Wallet`:

```prisma
planInterval String @default("month")
```

No backfill needed — every existing row (free or monthly-paid) is correctly `"month"`. To be reviewed by the `migration-safety` agent before this is considered done, per this repo's own subagent guidance for anything touching `prisma/schema.prisma`.

**`lib/db/wallet.ts` reads/writes `Wallet` through hand-written raw SQL, not Prisma model calls** (`lockWallet`'s `$executeRaw`/`$queryRaw`, `saveWallet`'s `$executeRaw`) — adding the column to the migration and the `Wallet` interface is not sufficient by itself. `WalletRow`, `toWallet`, `lockWallet`'s `INSERT`/`SELECT` column lists, and `saveWallet`'s `UPDATE ... SET` all need `planInterval` added explicitly, or it silently never round-trips (no type error, since none of those reference an "unknown" Prisma field — it would just always read back the column default).

### 5. Stripe checkout + webhook

`lib/billing/stripe.ts`:

- `createCheckoutSession`: `recurring.interval` becomes `input.purchase.interval` (subscribe only) instead of the hardcoded `"month" as const`.
- `buildPurchaseMetadata`/`parsePurchaseMetadata` grow a `METADATA_INTERVAL` (`"moldaiInterval"`) key, present only for `type: "subscribe"`, validated the same way `plan` is (an unrecognised value makes the metadata unusable → `ignored`, never defaults to `"month"` silently) — a forged interval must not reach `applyPurchase` any more than a forged plan can.
- `app/api/billing/purchase/route.ts`: `resolvePurchase` reads `body.interval`, narrowed by a new `isBillingInterval` guard (the `isPurchaseType`/`isPaidPlanId` trust-boundary shape) — absent/invalid → `invalid_interval` 400, mirroring `invalid_plan`. Both the mock-provider branch and the Stripe branch's `withStripeCustomerId` guard switch their `isPlanUpgrade` call to `isPlanOrIntervalUpgrade`. The subscribe checkout's `amountCents` becomes `annualPriceCents(plan)` when `interval === "year"`.
- `lib/schemas/billing.ts`'s `PurchaseBodySchema` gains `interval: z.unknown().optional()`.
- `app/api/billing/webhook/route.ts`'s `handleSubscriptionStarted`: `parsePurchaseMetadata`'s recovered `purchase.interval` threads into `applyPurchase`. **Incidental fix (approved 2026-08-30), corrected mechanism:** `Wallet` (`lib/billing/wallet.ts`) has no `stripeSubscriptionId` field — that column lives only in the DB row, by deliberate design ("lib/billing/wallet.ts stays gateway-agnostic"), so it cannot be read off the locked wallet inside `applyPurchase`'s callback. Instead: `withWalletIdempotent` (`lib/db/wallet.ts`) reads the row's _current_ `stripeSubscriptionId` in a raw query right after `lockWallet` (same already-locked row, no new lock), before its existing unconditional `UPDATE` overwrites it, and returns it as a new `previousStripeSubscriptionId: string | null` field on `IdempotentMutationResult`. The webhook route then cancels it (`stripe.subscriptions.cancel`, best-effort — logged via `reportError` on failure, never blocking or rolling back the credit that already landed) **only when the credit actually happened (`credited: true`) and the entry genuinely changed the plan (`entry.planChanged === true`, the same flag `handleSubscriptionStarted` already reads for its `superseded` report)**, and only if that previous id differs from `event.subscriptionId`. Scoped this narrowly on purpose: the fold branch (`planChanged: false`, an out-of-order/duplicate confirmation that doesn't move the plan) means the wallet's _previous_ subscription is still the one actually backing its plan — canceling it there would cut off the real subscription. That rarer race (two concurrent new subscriptions, where the _second, redundant_ one is never applied and is left live) is a known, separate gap this fix does not close.

### 6. UI

`components/pricing/PricingPage.tsx`:

- Delete `ANNUAL_FACTOR` and the `annualDisabled` branch in `PlanCta` — every CTA is a live link once `billing === "annual"`, same `href` logic as monthly (this page never calls `purchase()` directly, so there's nothing else to wire here). Price display switches from the local `Math.round(monthly * ANNUAL_FACTOR)` to `annualPriceCents(id)`.

`components/settings/PlanSection.tsx`:

- Adds a `ToggleGroup` (Mensal/Anual) mirroring `PricingPage`'s, with local `useState<BillingInterval>`.
- Each plan card's price and `canUpgrade` badge use `isPlanOrIntervalUpgrade({plan: credits.plan, interval: credits.planInterval}, {plan: id, interval: selectedInterval})` instead of the bare-`PlanId` `isPlanUpgrade`.
- `subscribe(plan)` becomes `subscribe(plan, interval)`, passed through to `purchase("subscribe", plan, interval)`.
- `Credits` (`lib/types.ts`) gains `planInterval?: BillingInterval` — **optional**, not mirroring `Wallet.planInterval`'s non-optional shape. 26 files across the codebase construct a `Credits`-shaped object literal (test fixtures mostly); making the field required would force an unrelated edit in every one of them just to satisfy the type, for a field only `PlanSection` reads. Optional is also this repo's own precedent for a new wire field (`Pattern.sizeChartName`'s own "additive... absent on older patterns and therefore omitted rather than guessed"). `lib/api/compose.ts`'s `buildCredits` always sets it from `wallet.planInterval` (never actually undefined coming from a real request) — a hand-built test fixture is the only place it can be absent, and `PlanSection`'s ranking reads it as `credits.planInterval ?? "month"` for that case. `PageHeader` needs no change; it doesn't render interval today.

`lib/api-client.ts`: `purchase()`'s signature grows an `interval?: BillingInterval` parameter (required whenever `type === "subscribe"`).

### 7. Tests

- `lib/billing/plans.test.ts`: `effectiveCredits`, `annualPriceCents`, `isPlanOrIntervalUpgrade` (including the "all-monthly answers match the old `isPlanUpgrade`" regression case).
- `lib/billing/wallet.test.ts`: subscribe-annual sets the 12× lump + 365-day `renewsAt`; `renewWallet` advances 30 vs 365 days per `wallet.planInterval`; interval-switch guard behavior (monthly→annual allowed, annual→monthly refused/folded).
- `lib/billing/invariants.test.ts`: the 200×60-step random walk's subscribe/upgrade steps also randomize interval; assertions extend to `total === effectiveCredits(plan, planInterval)` and the interval-correct `renewsAt` advance.
- `lib/billing/stripe.test.ts`: `recurring.interval`/`unit_amount` for an annual checkout; metadata round-trip including interval; an unrecognised interval in metadata is `ignored`.
- Webhook route test: the previous-subscription-cancel call fires exactly when the subscription id actually changed, and is best-effort (a cancel failure doesn't fail the webhook or roll back the credit).
- Component tests: `PricingPage.test.tsx` (already mid-edit from a prior session — build on top of it) and a new/extended `PlanSection.test.tsx` for the toggle and the interval-aware upgrade/downgrade badges.

### 8. Docs

- CLAUDE.md's `/planos` bullet ("annual billing isn't implemented...") gets corrected to describe what's actually shipped (lump-sum annual, interval-aware upgrade-only ranking).
- `docs/decisions.md` gets one entry: the three 2026-08-30 decisions above (lump sum vs. monthly-decoupled refill; switch-anytime vs. fixed-at-subscribe; include-the-cancel-fix vs. defer), each with its one-line why.

## Open risk

No live Stripe account is reachable from this environment (matching every other Stripe note in CLAUDE.md) — the `recurring.interval: "year"` checkout, the metadata round-trip, and `subscriptions.cancel` are verified against the mock provider and the SDK's own type declarations/unit tests only, never a real annual invoice cycle or a real cancellation.
