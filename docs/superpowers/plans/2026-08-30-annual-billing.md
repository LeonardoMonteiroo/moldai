# Annual Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Mensal/Anual billing toggle real on both `/planos` and `/settings?section=plan` — a year-interval subscribe grants a 12x lump-sum credit total, can be switched to/from at any time (upgrades only, same as tier switching today), and closes a pre-existing gap where an old Stripe subscription is never canceled when a new one supersedes it.

**Architecture:** `lib/billing/plans.ts` gains a `BillingInterval` type and an `effectiveCredits`-based ranking (`isPlanOrIntervalUpgrade`) that replaces `isPlanUpgrade` everywhere it's called. `Wallet` gains a persisted `planInterval` field threaded through `applyPurchase`/`renewWallet`. Stripe checkout/webhook/metadata thread the interval through unchanged plumbing (one new metadata key, `recurring.interval` no longer hardcoded). The UI (`PricingPage`, `PlanSection`) adds a real toggle wired to the new ranking function.

**Tech Stack:** Next.js 16, Prisma/Postgres, Stripe SDK (`stripe` npm package), Vitest (`node` + `dom` projects), next-intl, Zustand (unaffected by this plan).

**Spec:** [`docs/superpowers/specs/2026-08-30-annual-billing-design.md`](../specs/2026-08-30-annual-billing-design.md)

## Global Constraints

- English identifiers, pt-BR UI text (CLAUDE.md's language boundary) — every new catalog key goes in `messages/pt-BR.json`, never hardcoded JSX.
- UI labels come from catalog lookups keyed by the EN enum value, never a hand-written label map.
- No hardcoded price/credit/rank numbers outside `lib/billing/plans.ts` — every call site imports the constant.
- `lib/billing/*.ts` and `lib/db/*.ts` stay framework-free (no Next.js/React imports); Stripe is only ever imported inside `lib/billing/stripe.ts`.
- Component tests render through `renderWithIntl` (`components/test-utils.tsx`) and assert against the exported `ptBR` catalog object, never a pasted pt-BR literal.
- Every `app/api/*` route reads its body through `parseBody`/`readJsonObject` (webhook route is the sole, pre-existing exception — untouched by this plan).
- No live Stripe account is reachable from this environment — every Stripe-touching task is verified against the mock provider, the SDK's own type declarations, and unit tests with an injected fake client, never a real sandbox.
- Commits: Conventional Commits, English (`feat(billing): ...`, `test(billing): ...`, `docs: ...`).

---

### Task 1: `lib/billing/plans.ts` — `BillingInterval`, `effectiveCredits`, `isPlanOrIntervalUpgrade`, annual price helpers

**Files:**

- Modify: `lib/billing/plans.ts`
- Modify: `lib/billing/plans.test.ts`

**Interfaces:**

- Produces: `BillingInterval = "month" | "year"`; `isBillingInterval(value: unknown): value is BillingInterval`; `effectiveCredits(plan: PlanId, interval: BillingInterval): number`; `isPlanOrIntervalUpgrade(from: {plan: PlanId; interval: BillingInterval}, to: {plan: PlanId; interval: BillingInterval}): boolean`; `ANNUAL_DISCOUNT_FACTOR: number`; `annualMonthlyEquivalentCents(plan: PaidPlanId): number`; `annualPriceCents(plan: PaidPlanId): number`.
- Removes: `isPlanUpgrade` (no remaining caller after Tasks 6/7/11 land — kept in this task's diff only long enough that `plans.test.ts` compiles; deleted in the same commit).

- [ ] **Step 1: Write the failing tests**

Replace the existing `describe("isPlanUpgrade", ...)` block in `lib/billing/plans.test.ts` with:

```ts
describe("isPlanOrIntervalUpgrade", () => {
  it("matches the old isPlanUpgrade for every all-monthly comparison", () => {
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "free", interval: "month" },
        { plan: "atelier", interval: "month" },
      ),
    ).toBe(true);
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "atelier", interval: "month" },
        { plan: "studio", interval: "month" },
      ),
    ).toBe(true);
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "studio", interval: "month" },
        { plan: "factory", interval: "month" },
      ),
    ).toBe(true);
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "free", interval: "month" },
        { plan: "factory", interval: "month" },
      ),
    ).toBe(true);
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "factory", interval: "month" },
        { plan: "studio", interval: "month" },
      ),
    ).toBe(false);
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "studio", interval: "month" },
        { plan: "atelier", interval: "month" },
      ),
    ).toBe(false);
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "atelier", interval: "month" },
        { plan: "free", interval: "month" },
      ),
    ).toBe(false);
    for (const id of PLAN_IDS) {
      expect(
        isPlanOrIntervalUpgrade(
          { plan: id, interval: "month" },
          { plan: id, interval: "month" },
        ),
      ).toBe(false);
    }
  });

  it("monthly to annual, same tier, is always an upgrade", () => {
    for (const plan of ["atelier", "studio", "factory"] as const) {
      expect(
        isPlanOrIntervalUpgrade(
          { plan, interval: "month" },
          { plan, interval: "year" },
        ),
      ).toBe(true);
    }
  });

  it("annual to monthly, same tier, is always a downgrade (refused)", () => {
    for (const plan of ["atelier", "studio", "factory"] as const) {
      expect(
        isPlanOrIntervalUpgrade(
          { plan, interval: "year" },
          { plan, interval: "month" },
        ),
      ).toBe(false);
    }
  });

  it("ranks purely by effectiveCredits across both axes at once", () => {
    // atelier-annual (500*12=6000) beats studio-monthly (2000).
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "studio", interval: "month" },
        { plan: "atelier", interval: "year" },
      ),
    ).toBe(true);
    // studio-monthly (2000) does not beat atelier-annual (6000).
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "atelier", interval: "year" },
        { plan: "studio", interval: "month" },
      ),
    ).toBe(false);
  });
});

describe("effectiveCredits", () => {
  it("is the plain plan allowance for a monthly interval", () => {
    for (const id of PLAN_IDS) {
      expect(effectiveCredits(id, "month")).toBe(PLAN_CREDITS[id]);
    }
  });
  it("is 12x the plan allowance for an annual interval", () => {
    expect(effectiveCredits("atelier", "year")).toBe(500 * 12);
    expect(effectiveCredits("studio", "year")).toBe(2000 * 12);
    expect(effectiveCredits("factory", "year")).toBe(10000 * 12);
  });
});

describe("isBillingInterval", () => {
  it("accepts exactly month and year", () => {
    expect(isBillingInterval("month")).toBe(true);
    expect(isBillingInterval("year")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isBillingInterval("annual")).toBe(false);
    expect(isBillingInterval("")).toBe(false);
    expect(isBillingInterval(null)).toBe(false);
    expect(isBillingInterval(undefined)).toBe(false);
    expect(isBillingInterval(12)).toBe(false);
  });
});

describe("annualMonthlyEquivalentCents / annualPriceCents", () => {
  it("discounts the monthly price by ANNUAL_DISCOUNT_FACTOR, rounded", () => {
    expect(annualMonthlyEquivalentCents("atelier")).toBe(
      Math.round(PLAN_PRICE_CENTS.atelier * ANNUAL_DISCOUNT_FACTOR),
    );
  });
  it("the real annual charge is exactly 12x the displayed monthly-equivalent, never separately rounded", () => {
    for (const plan of ["atelier", "studio", "factory"] as const) {
      expect(annualPriceCents(plan)).toBe(
        annualMonthlyEquivalentCents(plan) * 12,
      );
    }
  });
});
```

Update the test file's imports at the top to add the new names and drop `isPlanUpgrade`:

```ts
import {
  PLAN_CREDITS,
  PLAN_PRICE_CENTS,
  PLAN_FEATURES,
  TOPUP_CREDITS,
  isPaidPlanId,
  isPlanOrIntervalUpgrade,
  isBillingInterval,
  effectiveCredits,
  annualMonthlyEquivalentCents,
  annualPriceCents,
  ANNUAL_DISCOUNT_FACTOR,
} from "./plans";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project node lib/billing/plans.test.ts`
Expected: FAIL — `isPlanOrIntervalUpgrade`/`effectiveCredits`/`isBillingInterval`/`annualMonthlyEquivalentCents`/`annualPriceCents`/`ANNUAL_DISCOUNT_FACTOR` are not exported yet.

- [ ] **Step 3: Implement**

In `lib/billing/plans.ts`, replace the `isPlanUpgrade` function and everything below it up to `PLAN_FEATURES` with:

```ts
export type BillingInterval = "month" | "year";

/**
 * Narrows an untrusted wire value to a BillingInterval -- the isPaidPlanId
 * trust-boundary shape, for the same reason: an unrecognised interval must
 * never reach applyPurchase or become a real Stripe recurring.interval.
 */
export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "month" || value === "year";
}

// A year-interval plan grants its whole year's allowance as one lump sum
// (decided 2026-08-30, docs/superpowers/specs/2026-08-30-annual-billing-design.md)
// -- this is the one place "how many credits does this purchase grant" is
// computed, so applyPurchase and the ranking below agree.
export function effectiveCredits(
  plan: PlanId,
  interval: BillingInterval,
): number {
  return PLAN_CREDITS[plan] * (interval === "year" ? 12 : 1);
}

// Replaces the old isPlanUpgrade(from: PlanId, to: PlanId) -- every real
// caller compared PLAN_CREDITS[to] > PLAN_CREDITS[from], which is exactly
// effectiveCredits(to.plan, "month") > effectiveCredits(from.plan, "month"),
// so every all-monthly comparison keeps its old answer. This is also what
// makes "switch interval anytime" and "downgrades refused" the same rule:
// monthly-to-annual same tier is always an increase (allowed self-serve);
// annual-to-monthly same tier is always a decrease (refused), with no
// special-casing beyond this one comparison.
export function isPlanOrIntervalUpgrade(
  from: { plan: PlanId; interval: BillingInterval },
  to: { plan: PlanId; interval: BillingInterval },
): boolean {
  return (
    effectiveCredits(to.plan, to.interval) >
    effectiveCredits(from.plan, from.interval)
  );
}

// The -20% annual discount (design 5c's own figure), and the two related but
// distinct numbers it produces -- see the design doc's "Two related but
// distinct figures" note for why there are two functions, not one.
export const ANNUAL_DISCOUNT_FACTOR = 0.8;

// What both cards' price ("R$X/mês", per the existing priceSuffix +
// annualBilledNote catalog pair) DISPLAY for an annual plan -- the
// discounted monthly-equivalent rate, not what a single charge actually is.
export function annualMonthlyEquivalentCents(plan: PaidPlanId): number {
  return Math.round(PLAN_PRICE_CENTS[plan] * ANNUAL_DISCOUNT_FACTOR);
}

// The real, one-time annual charge -- what a "year" checkout's
// price_data.unit_amount actually is, and what applyPurchase's
// effectiveCredits lump sum is paid for. Deliberately 12x the ROUNDED
// monthly-equivalent above, never a separately-rounded
// `PLAN_PRICE_CENTS[plan] * 12 * ANNUAL_DISCOUNT_FACTOR` -- the two must
// agree exactly (12x what's displayed per month), or a buyer could be
// charged a few centavos more/less than "12x the price shown."
export function annualPriceCents(plan: PaidPlanId): number {
  return annualMonthlyEquivalentCents(plan) * 12;
}
```

Delete the old `isPlanUpgrade` function entirely (it sat directly above `PLAN_FEATURES` in the file).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project node lib/billing/plans.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/billing/plans.ts lib/billing/plans.test.ts
git commit -m "feat(billing): add interval-aware plan ranking and annual pricing"
```

---

### Task 2: `lib/billing/wallet.ts` — `Wallet.planInterval`, `Purchase.interval`, `applyPurchase`/`renewWallet` interval-aware

**Files:**

- Modify: `lib/billing/wallet.ts`
- Modify: `lib/billing/wallet.test.ts`

**Interfaces:**

- Consumes: `BillingInterval`, `effectiveCredits`, `isPlanOrIntervalUpgrade` (Task 1, `./plans`).
- Produces: `Wallet.planInterval: BillingInterval`; `Purchase = {type:"topup"} | {type:"subscribe", plan: PaidPlanId, interval: BillingInterval}`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/billing/wallet.test.ts` (imports at top need `effectiveCredits` from `./plans`):

```ts
import { PLAN_CREDITS, TOPUP_CREDITS, effectiveCredits } from "./plans";
```

Update every existing `applyPurchase(w, { type: "subscribe", plan: "..." }, NOW)` call in the file to include `interval: "month"` (every existing test asserts monthly behavior, which must be unchanged):

```ts
applyPurchase(
  w,
  { type: "subscribe", plan: "atelier", interval: "month" },
  NOW,
);
```

(Apply this to all ~10 call sites across `describe("applyPurchase", ...)`, `describe("subscribe monotonicity guard (#193)", ...)`, `describe("reverseSubscription", ...)`, `describe("reversePurchasedCredits", ...)`, `describe("reverseRefundedEntry", ...)`, `describe("reverseRefundedSubscription", ...)`, and `describe("ledger amount invariant", ...)`.)

Then append these new blocks:

```ts
describe("seedWallet planInterval", () => {
  it("defaults to month -- inert for the free tier, the consistent default for a paid one later", () => {
    const w = seedWallet(NOW);
    expect(w.planInterval).toBe("month");
  });
});

describe("applyPurchase (annual)", () => {
  it("subscribing annually grants the 12x lump sum and renews in 365 days", () => {
    const w = seedWallet(NOW);
    const entry = applyPurchase(
      w,
      { type: "subscribe", plan: "atelier", interval: "year" },
      NOW,
    );
    expect(w.plan).toBe("atelier");
    expect(w.planInterval).toBe("year");
    expect(w.total).toBe(effectiveCredits("atelier", "year"));
    expect(w.balance).toBe(effectiveCredits("atelier", "year"));
    expect(w.renewsAt).toEqual(new Date("2027-08-17T12:00:00.000Z"));
    expect(entry.planChanged).toBe(true);
  });

  it("monthly to annual, same tier, is a real upgrade (allowed self-serve)", () => {
    const w = seedWallet(NOW);
    applyPurchase(
      w,
      { type: "subscribe", plan: "atelier", interval: "month" },
      NOW,
    );
    const entry = applyPurchase(
      w,
      { type: "subscribe", plan: "atelier", interval: "year" },
      NOW,
    );
    expect(entry.planChanged).toBe(true);
    expect(w.planInterval).toBe("year");
    expect(w.total).toBe(effectiveCredits("atelier", "year"));
  });

  it("annual to monthly, same tier, is refused (folded into purchased, plan/interval/renewsAt untouched)", () => {
    const w = seedWallet(NOW);
    applyPurchase(
      w,
      { type: "subscribe", plan: "atelier", interval: "year" },
      NOW,
    );
    const renewsAtAfterAnnual = w.renewsAt;
    const entry = applyPurchase(
      w,
      { type: "subscribe", plan: "atelier", interval: "month" },
      NOW,
    );
    expect(entry.planChanged).toBe(false);
    expect(w.planInterval).toBe("year");
    expect(w.renewsAt).toEqual(renewsAtAfterAnnual);
    expect(w.total).toBe(effectiveCredits("atelier", "year"));
    // The monthly payment is still honoured -- folded into purchased.
    expect(w.purchased).toBe(PLAN_CREDITS.atelier);
  });

  it("a lower-tier annual can still outrank a higher-tier monthly (ranked by effectiveCredits, not tier alone)", () => {
    const w = seedWallet(NOW);
    applyPurchase(
      w,
      { type: "subscribe", plan: "studio", interval: "month" },
      NOW,
    );
    const entry = applyPurchase(
      w,
      { type: "subscribe", plan: "atelier", interval: "year" },
      NOW,
    );
    expect(entry.planChanged).toBe(true);
    expect(w.plan).toBe("atelier");
    expect(w.planInterval).toBe("year");
  });
});

describe("renewWallet (annual)", () => {
  it("rolls renewsAt forward 365 days, not 30, for an annual wallet", () => {
    const w = seedWallet(NOW);
    applyPurchase(
      w,
      { type: "subscribe", plan: "atelier", interval: "year" },
      NOW,
    );
    const renewsAtAfterSubscribe = w.renewsAt!;
    w.balance -= 1000; // spend some of the year's allowance
    const entry = renewWallet(w, renewsAtAfterSubscribe);
    expect(w.balance).toBe(effectiveCredits("atelier", "year"));
    expect(w.renewsAt).toEqual(
      new Date(renewsAtAfterSubscribe.getTime() + 365 * 86_400_000),
    );
    expect(entry.type).toBe("renew");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project node lib/billing/wallet.test.ts`
Expected: FAIL — `Purchase`'s subscribe variant has no `interval` field yet (TypeScript compile error), and `Wallet` has no `planInterval`.

- [ ] **Step 3: Implement**

In `lib/billing/wallet.ts`:

1. Update the import line:

```ts
import type { PlanId } from "@/lib/types";
import {
  PLAN_CREDITS,
  TOPUP_CREDITS,
  isPlanOrIntervalUpgrade,
  effectiveCredits,
  type PaidPlanId,
  type BillingInterval,
} from "./plans";
```

2. Add `planInterval` to the `Wallet` interface, right after `renewsAt`:

```ts
export interface Wallet {
  plan: PlanId;
  balance: number;
  total: number;
  purchased: number;
  renewsAt: Date | null;
  // Which billing cycle the CURRENT plan/total were granted under -- "month"
  // is inert (and the only value) for the free tier. Read by renewWallet to
  // decide whether a renewal rolls renewsAt forward 30 or 365 days; written
  // only by applyPurchase's subscribe upgrade branch and reset to "month" by
  // reverseSubscription, the same lifecycle as plan/total themselves.
  planInterval: BillingInterval;
  planSourceExternalId: string | null;
}
```

3. Update `seedWallet`:

```ts
export function seedWallet(now: Date): Wallet {
  return {
    plan: "free",
    balance: PLAN_CREDITS.free,
    total: PLAN_CREDITS.free,
    purchased: 0,
    renewsAt: new Date(now.getTime() + 30 * DAY_MS),
    planInterval: "month",
    planSourceExternalId: null,
  };
}
```

4. Update `Purchase`:

```ts
export type Purchase =
  | { type: "topup" }
  | { type: "subscribe"; plan: PaidPlanId; interval: BillingInterval };
```

5. Rewrite `applyPurchase`'s `subscribe` case:

```ts
case "subscribe": {
  const planCredits = effectiveCredits(purchase.plan, purchase.interval);
  if (
    !isPlanOrIntervalUpgrade(
      { plan: wallet.plan, interval: wallet.planInterval },
      { plan: purchase.plan, interval: purchase.interval },
    )
  ) {
    wallet.purchased += planCredits;
    wallet.balance += planCredits;
    return {
      type: "subscribe",
      amount: planCredits,
      balanceAfter: wallet.balance,
      reason: purchase.plan,
      planChanged: false,
    };
  }
  const newBalance = planCredits + wallet.purchased;
  const delta = newBalance - wallet.balance;
  wallet.plan = purchase.plan;
  wallet.total = planCredits;
  wallet.balance = newBalance;
  wallet.planInterval = purchase.interval;
  wallet.renewsAt = new Date(
    now.getTime() + (purchase.interval === "year" ? 365 : 30) * DAY_MS,
  );
  return {
    type: "subscribe",
    amount: delta,
    balanceAfter: wallet.balance,
    reason: purchase.plan,
    planChanged: true,
  };
}
```

(Keep every surrounding comment in the current file — only the guard call and the two new `interval`/`planCredits` lines change; the delta/ledger-shape logic is untouched.)

6. Update `reverseSubscription` to also reset the interval:

```ts
export function reverseSubscription(
  wallet: Wallet,
  amount: number,
): LedgerEntry {
  wallet.balance -= amount;
  wallet.plan = "free";
  wallet.total = PLAN_CREDITS.free;
  wallet.planInterval = "month";
  wallet.planSourceExternalId = null;
  return {
    type: "debit",
    amount,
    balanceAfter: wallet.balance,
    reason: "gateway_refund",
  };
}
```

7. Update `renewWallet`'s `renewsAt` advance:

```ts
export function renewWallet(wallet: Wallet, now: Date): LedgerEntry {
  const newBalance = wallet.total + wallet.purchased;
  const delta = newBalance - wallet.balance;
  wallet.balance = newBalance;
  const base = wallet.renewsAt ?? now;
  const days = wallet.planInterval === "year" ? 365 : 30;
  wallet.renewsAt = new Date(base.getTime() + days * DAY_MS);
  return { type: "renew", amount: delta, balanceAfter: wallet.balance };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project node lib/billing/wallet.test.ts`
Expected: PASS

- [ ] **Step 5: Fix every other `Wallet`-typed literal so the build compiles**

`Wallet.planInterval` is a new required field. Besides this task's own two files, exactly four other files construct a `Wallet`-typed object literal by hand (verified via `grep -rn "planSourceExternalId:\s*null"`) and will fail to compile without it — add `planInterval: "month",` to each (right next to the existing `renewsAt`/`planSourceExternalId` lines, matching this task's own style):

- `app/page-guards.test.tsx` — the module-level `const WALLET: Wallet = { ... }`.
- `app/planos/page.test.tsx` — the one `vi.mocked(loadWallet).mockResolvedValue({ ... })` object.
- `app/onboarding-gate.test.ts` — **two** separate `vi.mocked(loadWallet).mockResolvedValue({ ... })` objects (one per test).
- `lib/api/compose.test.ts` — the two raw `Wallet` object literals inside `describe("buildCredits", ...)` (`plan: "atelier"` and `plan: "free"` cases). Leave this file's `toEqual` assertions and its `composeEditorState` describe block alone for now — those are Task 8's job, once `buildCredits` itself is producing `planInterval` on the wire.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If any OTHER file still fails to compile because of a `Wallet`-typed literal this grep missed, fix it the same way (add `planInterval: "month"`) before moving on — do not defer it to a later task.

- [ ] **Step 7: Commit**

```bash
git add lib/billing/wallet.ts lib/billing/wallet.test.ts \
  app/page-guards.test.tsx app/planos/page.test.tsx \
  app/onboarding-gate.test.ts lib/api/compose.test.ts
git commit -m "feat(billing): thread billing interval through the wallet model"
```

---

### Task 3: `lib/billing/invariants.test.ts` — extend the random walk with interval

**Files:**

- Modify: `lib/billing/invariants.test.ts`

**Interfaces:**

- Consumes: `Wallet.planInterval`, `effectiveCredits` (Tasks 1/2).

- [ ] **Step 1: Write the failing test changes**

In `runSequence`, the subscribe branch (`roll < 0.4`) picks a plan but not an interval — add an interval pick and pass it through:

```ts
} else if (roll < 0.4) {
  // A confirmed subscribe to any paid tier -- including downgrades and
  // same-tier reapplies, which is exactly the out-of-order webhook
  // delivery #193's guard exists for. Those fold into purchased instead
  // of moving the plan. Interval is also randomized: monthly-to-annual on
  // the same tier is an upgrade too now, and annual-to-monthly is a
  // downgrade -- both must fold/upgrade correctly under the same guard.
  const id = `pay_sub_${i}`;
  const plan = pick(PAID_PLANS);
  const interval = pick(["month", "year"] as const);
  const creditsBefore = effectiveCredits(h.wallet.plan, h.wallet.planInterval);
  const entry = applyPurchase(
    h.wallet,
    { type: "subscribe", plan, interval },
    now,
  );
  h.expectedPurchased += purchasedContribution(entry);
  record(h, id, entry);
  expect(
    effectiveCredits(h.wallet.plan, h.wallet.planInterval),
    `F (subscribe ${plan}/${interval} never downgrades)`,
  ).toBeGreaterThanOrEqual(creditsBefore);
  if (entry.planChanged === false) {
    expect(
      effectiveCredits(h.wallet.plan, h.wallet.planInterval),
      `F (a folded subscribe leaves the plan/interval alone)`,
    ).toBe(creditsBefore);
  }
  check(h, `subscribe ${plan}/${interval} ${id}`);
}
```

Update the `check()` function's invariant B (today `total === PLAN_CREDITS[w.plan]`) to account for interval:

```ts
function check(h: Harness, step: string): void {
  const w = h.wallet;
  expect(w.balance, `A (balance vs ledger) after ${step}`).toBe(
    h.expectedBalance,
  );
  expect(w.total, `B (total vs plan/interval) after ${step}`).toBe(
    effectiveCredits(w.plan, w.planInterval),
  );
  expect(w.purchased, `C (purchased accounting) after ${step}`).toBe(
    h.expectedPurchased,
  );
  expect(
    w.purchased,
    `D (purchased >= 0) after ${step}`,
  ).toBeGreaterThanOrEqual(0);
  if (w.planSourceExternalId !== null) {
    expect(
      h.planChangingIds.has(w.planSourceExternalId),
      `E (plan source names a plan-changing entry) after ${step}`,
    ).toBe(true);
  }
}
```

Update the import line to add `effectiveCredits`:

```ts
import {
  PLAN_CREDITS,
  TOPUP_CREDITS,
  effectiveCredits,
  type PaidPlanId,
} from "./plans";
```

The renewal branch (the final `else`) needs no logic change (`renewWallet` already reads `wallet.planInterval` internally), but its own inline assertion already reads `h.wallet.total + h.expectedPurchased`, which stays correct since `total` is still whatever `effectiveCredits` last set it to.

- [ ] **Step 2: Run to verify it fails first (sanity), then implement**

Run: `npx vitest run --project node lib/billing/invariants.test.ts`
Expected: initially FAILS to compile (`effectiveCredits` not imported yet) — add the import and the changes above together, since this is a single cohesive edit to one test file, then re-run.

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npx vitest run --project node lib/billing/invariants.test.ts`
Expected: PASS, all 200 seeded sequences green.

- [ ] **Step 4: Commit**

```bash
git add lib/billing/invariants.test.ts
git commit -m "test(billing): extend wallet invariant walk to randomize billing interval"
```

---

### Task 4: Prisma migration + `lib/db/wallet.ts` — persist `planInterval`, capture the previous Stripe subscription id

**Files:**

- Create: `prisma/migrations/20260830223000_add_wallet_plan_interval/migration.sql`
- Modify: `prisma/schema.prisma`
- Modify: `lib/db/wallet.ts`
- Modify: `lib/db/wallet.test.ts` (a real, existing 706-line file with its own `wireTx()` mock harness — read it in full before editing; do not write a new, separate mock)

**Interfaces:**

- Consumes: `Wallet.planInterval` (Task 2).
- Produces: `IdempotentMutationResult.previousStripeSubscriptionId: string | null`.

- [ ] **Step 1: Update every existing `applyPurchase({type:"subscribe",...})` call in this file to include `interval: "month"`**

`lib/db/wallet.test.ts` already exists and already calls `applyPurchase(wallet, { type: "subscribe", plan: "..." }, NOW)` in 9 places (verified via `grep -n 'type: "subscribe"' lib/db/wallet.test.ts`) — every one needs `, interval: "month"` added to its object literal, or the file fails to compile once Task 2 makes `interval` required on `Purchase`'s subscribe variant. The 9 call sites, by their surrounding test name:

- `describe("withWallet", ...)` → `"never sets planSourceExternalId, even for a real plan-changing subscribe"` — `{ type: "subscribe", plan: "atelier" }` (a multi-line `applyPurchase(wallet, {...}, ...)` call).
- `describe("withWalletIdempotent", ...)` → `"records planSourceExternalId when fn's entry actually changed the plan"` — `{ type: "subscribe", plan: "atelier" }`.
- same describe → `"does not set planSourceExternalId for a folded subscribe (plan unchanged)"` — has **two** calls: `{ type: "subscribe", plan: "factory" }` and `{ type: "subscribe", plan: "studio" }` (the second is commented `// folded`).
- same describe → `"reports planChanged: true for a subscribe entry that actually moved plan/total"` — `{ type: "subscribe", plan: "atelier" }`.
- `describe("withStripeCustomerId", ...)` → the test building a multi-line `applyPurchase(wallet, {...}, ...)` with `plan: "studio"` (around the file's `"does not clobber an existing wallet's balance..."` / `"keeps a previously set customer id..."` tests — read the surrounding `it` block to confirm which one before editing).
- `describe("withWalletIdempotent (stripeSubscriptionId)", ...)` → `"persists the subscription id in the same transaction as the credit"` — `{ type: "subscribe", plan: "atelier" }`.
- same describe → `"does not write the subscription id when the credit was a duplicate no-op"` — has **two** calls, `{ type: "subscribe", plan: "atelier" }` (first `withWalletIdempotent` call) and `{ type: "subscribe", plan: "factory" }` (second call).

- [ ] **Step 2: Update `wireTx()`'s column-position destructuring for the new `planInterval` column**

`wireTx()` (defined once, near the top of the file, shared by every `describe` block via its own `beforeEach`) parses the raw SQL by substring-matching (`sql.includes("INSERT")` / `'"stripeCustomerId"'` / `'"stripeSubscriptionId"'` / `"UPDATE"`) and destructures `vals` **positionally**, matching `lockWallet`'s exact INSERT column order and `saveWallet`'s exact UPDATE column order. Task 4's Step 4 (below) inserts `planInterval` between `renewsAt` and `planSourceExternalId` in both statements, so `wireTx()` must destructure it in the same position or every existing test in this file silently mis-assigns fields. Update the INSERT branch:

```ts
      if (sql.includes("INSERT")) {
        // vals order matches lockWallet: userId, plan, balance, total,
        // purchased, renewsAt, planInterval, planSourceExternalId.
        const [
          userId,
          plan,
          balance,
          total,
          purchased,
          renewsAt,
          planInterval,
          planSourceExternalId,
        ] = vals as [string, ...unknown[]];
        if (!store.has(userId)) {
          store.set(userId, {
            plan,
            balance,
            total,
            purchased,
            renewsAt,
            planInterval,
            planSourceExternalId,
          });
        }
      } else if (sql.includes('"stripeCustomerId"')) {
```

And the generic UPDATE branch (leave the `"stripeCustomerId"`/`"stripeSubscriptionId"` branches above it untouched — they're distinct, checked first):

```ts
      } else if (sql.includes("UPDATE")) {
        // vals order matches saveWallet: plan, balance, total, purchased,
        // renewsAt, planInterval, planSourceExternalId, userId -- userId last.
        const [
          plan,
          balance,
          total,
          purchased,
          renewsAt,
          planInterval,
          planSourceExternalId,
          userId,
        ] = vals as [
          unknown,
          unknown,
          unknown,
          unknown,
          unknown,
          unknown,
          unknown,
          string,
        ];
        const current = (store.get(userId) ?? {}) as Record<string, unknown>;
        store.set(userId, {
          ...current,
          plan,
          balance,
          total,
          purchased,
          renewsAt,
          planInterval,
          planSourceExternalId,
        });
      }
```

- [ ] **Step 3: Write the new failing tests**

Add these three tests to the existing `describe("withWalletIdempotent (stripeSubscriptionId)", ...)` block, right after `"does not write the subscription id when the credit was a duplicate no-op"` (reuse that block's own `beforeEach`, `NOW`, and `store`):

```ts
it("is null on a wallet's first-ever subscription (nothing to have superseded)", async () => {
  const result = await withWalletIdempotent(
    "u1",
    "pi_first",
    (wallet) =>
      applyPurchase(
        wallet,
        { type: "subscribe", plan: "atelier", interval: "month" },
        NOW,
      ),
    "sub_new",
  );
  expect(result.credited).toBe(true);
  expect(result.previousStripeSubscriptionId).toBeNull();
});

it("captures the OLD subscription id before overwriting it with the new one", async () => {
  await withWalletIdempotent(
    "u1",
    "pi_first",
    (wallet) =>
      applyPurchase(
        wallet,
        { type: "subscribe", plan: "atelier", interval: "month" },
        NOW,
      ),
    "sub_old",
  );
  const result = await withWalletIdempotent(
    "u1",
    "pi_second",
    (wallet) =>
      applyPurchase(
        wallet,
        { type: "subscribe", plan: "studio", interval: "month" },
        NOW,
      ),
    "sub_new",
  );
  expect(result.previousStripeSubscriptionId).toBe("sub_old");
  expect(
    (store.get("u1") as { stripeSubscriptionId?: string }).stripeSubscriptionId,
  ).toBe("sub_new");
});

it("is null when the call passes no stripeSubscriptionId at all, e.g. a topup", async () => {
  await withWalletIdempotent(
    "u1",
    "pi_first",
    (wallet) =>
      applyPurchase(
        wallet,
        { type: "subscribe", plan: "atelier", interval: "month" },
        NOW,
      ),
    "sub_old",
  );
  const result = await withWalletIdempotent("u1", "pi_topup", (wallet) =>
    applyPurchase(wallet, { type: "topup" }, NOW),
  );
  expect(result.previousStripeSubscriptionId).toBeNull();
  expect(
    (store.get("u1") as { stripeSubscriptionId?: string }).stripeSubscriptionId,
  ).toBe("sub_old"); // untouched
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run --project node lib/db/wallet.test.ts`
Expected: FAIL — `previousStripeSubscriptionId` doesn't exist on `IdempotentMutationResult` yet; `applyPurchase`'s subscribe variant doesn't accept `interval` yet (compile error until Step 1 and Task 2 both land).

- [ ] **Step 5: Implement**

**4a. Migration** — create `prisma/migrations/20260830223000_add_wallet_plan_interval/migration.sql`:

```sql
-- Annual billing (docs/superpowers/specs/2026-08-30-annual-billing-design.md):
-- which cycle backs the wallet's CURRENT plan/total. Additive, backfill-free
-- -- every existing row (free or monthly-paid) is correctly "month", which
-- Postgres applies to every existing row for free via the column default.
ALTER TABLE "Wallet" ADD COLUMN "planInterval" TEXT NOT NULL DEFAULT 'month';
```

**4b. `prisma/schema.prisma`** — in the `Wallet` model, add the field right after `renewsAt`:

```prisma
  renewsAt            DateTime?
  planInterval        String        @default("month")
  updatedAt           DateTime      @updatedAt
```

Run `npx prisma generate` afterward so the Prisma Client types pick up the new column (needed before `lib/db/wallet.ts` can reference it in a typed way, though this file uses raw SQL so it's not strictly required for compilation — run it anyway to keep the client in sync with the schema, matching every prior migration in this repo).

**4c. `lib/db/wallet.ts`**:

```ts
interface WalletRow {
  plan: string;
  balance: number;
  total: number;
  purchased: number;
  renewsAt: Date | null;
  planInterval: string;
  planSourceExternalId: string | null;
}

function toWallet(row: WalletRow): Wallet {
  return {
    plan: row.plan as Wallet["plan"],
    balance: row.balance,
    total: row.total,
    purchased: row.purchased,
    renewsAt: row.renewsAt,
    planInterval: row.planInterval as Wallet["planInterval"],
    planSourceExternalId: row.planSourceExternalId,
  };
}

export async function lockWallet(tx: Tx, userId: string): Promise<Wallet> {
  const seed = seedWallet(new Date());
  await tx.$executeRaw`
    INSERT INTO "Wallet" ("userId", "plan", "balance", "total", "purchased", "renewsAt", "planInterval", "planSourceExternalId", "updatedAt")
    VALUES (${userId}, ${seed.plan}, ${seed.balance}, ${seed.total}, ${seed.purchased}, ${seed.renewsAt}, ${seed.planInterval}, ${seed.planSourceExternalId}, now())
    ON CONFLICT ("userId") DO NOTHING`;
  const rows = await tx.$queryRaw<WalletRow[]>`
    SELECT "plan", "balance", "total", "purchased", "renewsAt", "planInterval", "planSourceExternalId"
    FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
  return toWallet(rows[0]);
}

export async function saveWallet(
  tx: Tx,
  userId: string,
  wallet: Wallet,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Wallet"
    SET "plan" = ${wallet.plan},
        "balance" = ${wallet.balance}, "total" = ${wallet.total},
        "purchased" = ${wallet.purchased},
        "renewsAt" = ${wallet.renewsAt},
        "planInterval" = ${wallet.planInterval},
        "planSourceExternalId" = ${wallet.planSourceExternalId},
        "updatedAt" = now()
    WHERE "userId" = ${userId}`;
}
```

Update `IdempotentMutationResult` and `withWalletIdempotent`:

```ts
export interface IdempotentMutationResult {
  /** false means this externalId was already credited/debited -- a
   * duplicate webhook delivery, handled as a no-op rather than an error. */
  credited: boolean;
  /** The wallet's stripeSubscriptionId immediately before this call's own
   * (unconditional) overwrite -- read inside the same transaction, off the
   * already-locked row, right before the UPDATE. Null when the wallet had
   * none yet, or when this call passed no stripeSubscriptionId at all (a
   * topup/refund credit, or a duplicate delivery that never reached the
   * UPDATE). Lets a caller detect "this account's plan just moved to a
   * DIFFERENT live subscription" without a second, separately-locked read.
   */
  previousStripeSubscriptionId: string | null;
}

export async function withWalletIdempotent(
  userId: string,
  externalId: string,
  fn: (wallet: Wallet) => LedgerEntry,
  stripeSubscriptionId?: string,
): Promise<IdempotentMutationResult> {
  return prisma.$transaction(async (tx) => {
    const wallet = await lockWallet(tx, userId);
    const entry = fn(wallet);
    if (entry.type === "subscribe" && entry.planChanged) {
      wallet.planSourceExternalId = externalId;
    }
    try {
      await tx.transaction.create({
        data: {
          userId,
          type: entry.type,
          amount: entry.amount,
          balanceAfter: entry.balanceAfter,
          reason: entry.reason ?? null,
          externalId,
          planChanged: entry.planChanged ?? false,
        },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        return { credited: false, previousStripeSubscriptionId: null };
      }
      throw err;
    }
    await saveWallet(tx, userId, wallet);
    let previousStripeSubscriptionId: string | null = null;
    if (stripeSubscriptionId) {
      const rows = await tx.$queryRaw<
        { stripeSubscriptionId: string | null }[]
      >`
        SELECT "stripeSubscriptionId" FROM "Wallet" WHERE "userId" = ${userId}`;
      previousStripeSubscriptionId = rows[0]?.stripeSubscriptionId ?? null;
      await tx.$executeRaw`
        UPDATE "Wallet" SET "stripeSubscriptionId" = ${stripeSubscriptionId}
        WHERE "userId" = ${userId}`;
    }
    return { credited: true, previousStripeSubscriptionId };
  }, TX_OPTS);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --project node lib/db/wallet.test.ts`
Expected: PASS

- [ ] **Step 7: Run the full node suite (this file is imported widely)**

Run: `npx vitest run --project node`
Expected: PASS for everything except tests this plan hasn't reached yet (`app/api/billing/*`, `lib/billing/stripe.test.ts`) — note any failures there for Tasks 5–7, don't fix them in this task.

- [ ] **Step 8: `migration-safety` review**

Dispatch the `migration-safety` agent (per CLAUDE.md: invoke whenever a diff adds a migration or touches `lib/db/*`) on this task's diff (`prisma/schema.prisma`, the new migration, `lib/db/wallet.ts`) before committing. Fix anything it flags.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260830223000_add_wallet_plan_interval lib/db/wallet.ts lib/db/wallet.test.ts
git commit -m "feat(billing): persist Wallet.planInterval, capture previous Stripe subscription id"
```

---

### Task 5: `lib/billing/stripe.ts` — interval in checkout/metadata, `cancelSubscription`

**Files:**

- Modify: `lib/billing/stripe.ts`
- Modify: `lib/billing/stripe.test.ts`

**Interfaces:**

- Consumes: `BillingInterval`, `isBillingInterval` (Task 1).
- Produces: `METADATA_INTERVAL: string`; `cancelSubscription(config, subscriptionId, deps?): Promise<void>`; `GatewayEvent`'s `subscriptionStarted` variant gains `interval: BillingInterval`.

- [ ] **Step 1: Write the failing tests**

In `lib/billing/stripe.test.ts`:

1. Update the import line to add `isBillingInterval` (re-exported from `./plans`, imported the same way `isPaidPlanId` already would be if this file imported it directly — it doesn't today, so just import `cancelSubscription`/`METADATA_INTERVAL` from `./stripe`):

```ts
import {
  loadStripeConfig,
  createCustomer,
  createCheckoutSession,
  cancelSubscription,
  verifyWebhookEvent,
  parseGatewayEvent,
  resolveInvoicePaymentIntent,
  buildPurchaseMetadata,
  parsePurchaseMetadata,
  StripeGatewayError,
  STRIPE_TIMEOUT_MS,
  METADATA_USER_ID,
  METADATA_PURCHASE_TYPE,
  METADATA_PLAN,
  METADATA_INTERVAL,
  type StripeLike,
} from "./stripe";
```

2. `fakeClient()` needs a default `subscriptions.cancel`:

```ts
function fakeClient(overrides: Partial<StripeLike> = {}): StripeLike {
  return {
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: "cs_1", url: "https://pay/x" })),
      },
    },
    customers: { create: vi.fn(async () => ({ id: "cus_1" })) },
    subscriptions: { cancel: vi.fn(async () => ({})) },
    invoices: {
      retrieve: vi.fn(async () => ({}) as Stripe.Invoice),
    },
    webhooks: {
      constructEvent: vi.fn(() => ({}) as Stripe.Event),
    },
    ...overrides,
  } as StripeLike;
}
```

3. Update `buildPurchaseMetadata` round-trip test to include interval:

```ts
describe("purchase metadata round trip", () => {
  it("round-trips a topup and every paid plan, monthly and annual", () => {
    expect(
      parsePurchaseMetadata(buildPurchaseMetadata("u1", { type: "topup" })),
    ).toEqual({ userId: "u1", purchase: { type: "topup" } });
    for (const plan of ["atelier", "studio", "factory"] as const) {
      for (const interval of ["month", "year"] as const) {
        expect(
          parsePurchaseMetadata(
            buildPurchaseMetadata("u1", { type: "subscribe", plan, interval }),
          ),
        ).toEqual({
          userId: "u1",
          purchase: { type: "subscribe", plan, interval },
        });
      }
    }
  });

  it("writes no plan or interval key for a topup", () => {
    expect(buildPurchaseMetadata("u1", { type: "topup" })).not.toHaveProperty(
      METADATA_PLAN,
    );
    expect(buildPurchaseMetadata("u1", { type: "topup" })).not.toHaveProperty(
      METADATA_INTERVAL,
    );
  });
  // (leave the existing it.each rejection-cases test as-is, then add:)
  it("rejects a subscribe whose metadata carries an unrecognised interval", () => {
    expect(
      parsePurchaseMetadata({
        [METADATA_USER_ID]: "u1",
        [METADATA_PURCHASE_TYPE]: "subscribe",
        [METADATA_PLAN]: "atelier",
        [METADATA_INTERVAL]: "weekly",
      }),
    ).toBeNull();
  });
});
```

4. Update `createCheckoutSession`'s subscribe test to pass/assert interval, and add an annual case:

```ts
it("prices a subscribe from PLAN_PRICE_CENTS, monthly by default, and stamps metadata on BOTH the session and the subscription", async () => {
  const create = vi.fn(async (_p: Stripe.Checkout.SessionCreateParams) => ({
    id: "cs_2",
    url: "https://pay/y" as string | null,
  }));
  const client = fakeClient({
    checkout: { sessions: { create } },
  } as Partial<StripeLike>);
  await createCheckoutSession(
    CONFIG,
    {
      customerId: "cus_1",
      purchase: { type: "subscribe", plan: "studio", interval: "month" },
      userId: "u1",
      itemName: "Estúdio",
      amountCents: PLAN_PRICE_CENTS.studio,
      successUrl: "https://app/ok",
      cancelUrl: "https://app/no",
    },
    { client },
  );
  const params = create.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
  expect(params.mode).toBe("subscription");
  const priceData = params.line_items?.[0]
    ?.price_data as Stripe.Checkout.SessionCreateParams.LineItem.PriceData;
  expect(priceData.unit_amount).toBe(PLAN_PRICE_CENTS.studio);
  expect(priceData.recurring).toEqual({ interval: "month" });
  expect((params.metadata as Record<string, string>)[METADATA_PLAN]).toBe(
    "studio",
  );
  expect(
    (params.subscription_data?.metadata as Record<string, string>)[
      METADATA_PLAN
    ],
  ).toBe("studio");
  expect(
    (params.subscription_data?.metadata as Record<string, string>)[
      METADATA_USER_ID
    ],
  ).toBe("u1");
  expect(
    (params.subscription_data?.metadata as Record<string, string>)[
      METADATA_INTERVAL
    ],
  ).toBe("month");
});

it("prices an annual subscribe with recurring.interval 'year' and the full annual amount", async () => {
  const create = vi.fn(async (_p: Stripe.Checkout.SessionCreateParams) => ({
    id: "cs_5",
    url: "https://pay/annual" as string | null,
  }));
  const client = fakeClient({
    checkout: { sessions: { create } },
  } as Partial<StripeLike>);
  await createCheckoutSession(
    CONFIG,
    {
      customerId: "cus_1",
      purchase: { type: "subscribe", plan: "atelier", interval: "year" },
      userId: "u1",
      itemName: "Ateliê",
      amountCents: annualPriceCents("atelier"),
      successUrl: "https://app/ok",
      cancelUrl: "https://app/no",
    },
    { client },
  );
  const params = create.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
  const priceData = params.line_items?.[0]
    ?.price_data as Stripe.Checkout.SessionCreateParams.LineItem.PriceData;
  expect(priceData.recurring).toEqual({ interval: "year" });
  expect(priceData.unit_amount).toBe(annualPriceCents("atelier"));
});
```

(Add `import { PLAN_PRICE_CENTS, TOPUP_PRICE_CENTS, annualPriceCents } from "./plans";` to the top import.)

5. `describe("parseGatewayEvent", ...)` defines a shared `const subMeta = buildPurchaseMetadata("u1", { type: "subscribe", plan: "studio" });` at the top, reused by several tests (including `"ignores a completed SUBSCRIPTION session for money purposes"`, which only checks `.kind`, unaffected). Rebuild it with an interval:

```ts
const subMeta = buildPurchaseMetadata("u1", {
  type: "subscribe",
  plan: "studio",
  interval: "month",
});
```

Then update the existing test `"maps subscription_create to subscriptionStarted with the plan from metadata"` (the one using `subMeta`, not a fresh inline payload) — rename it to `"...with the plan AND interval from metadata"` and add `interval: "month"` to its expected object:

```ts
it("maps subscription_create to subscriptionStarted with the plan AND interval from metadata", () => {
  expect(
    parseGatewayEvent(
      event("invoice.paid", {
        id: "in_1",
        billing_reason: "subscription_create",
        parent: {
          subscription_details: {
            subscription: "sub_1",
            metadata: subMeta,
          },
        },
      }),
    ),
  ).toEqual({
    kind: "subscriptionStarted",
    userId: "u1",
    plan: "studio",
    interval: "month",
    invoiceId: "in_1",
    subscriptionId: "sub_1",
  });
});
```

And add a second, separate test for the annual case, since `subMeta` is now fixed at `"month"`:

```ts
it("recovers an annual interval from metadata the same way", () => {
  expect(
    parseGatewayEvent(
      event("invoice.paid", {
        id: "in_2",
        billing_reason: "subscription_create",
        parent: {
          subscription_details: {
            subscription: "sub_2",
            metadata: buildPurchaseMetadata("u1", {
              type: "subscribe",
              plan: "atelier",
              interval: "year",
            }),
          },
        },
      }),
    ),
  ).toMatchObject({ interval: "year" });
});
```

6. Add a new `describe("cancelSubscription", ...)` block:

```ts
describe("cancelSubscription", () => {
  it("calls subscriptions.cancel with the given id", async () => {
    const cancel = vi.fn(async () => ({}));
    const client = fakeClient({
      subscriptions: { cancel },
    } as Partial<StripeLike>);
    await cancelSubscription(CONFIG, "sub_old", { client });
    expect(cancel).toHaveBeenCalledWith("sub_old");
  });

  it("wraps a provider failure in StripeGatewayError", async () => {
    const client = fakeClient({
      subscriptions: {
        cancel: vi.fn(async () => {
          throw new Error("no such subscription");
        }),
      },
    } as Partial<StripeLike>);
    await expect(
      cancelSubscription(CONFIG, "sub_old", { client }),
    ).rejects.toBeInstanceOf(StripeGatewayError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project node lib/billing/stripe.test.ts`
Expected: FAIL — `cancelSubscription`/`METADATA_INTERVAL` not exported, `Purchase`'s subscribe variant missing `interval` (compile error).

- [ ] **Step 3: Implement**

In `lib/billing/stripe.ts`:

1. Update the import line:

```ts
import { isPurchaseType, type Purchase } from "./wallet";
import {
  CURRENCY,
  isPaidPlanId,
  isBillingInterval,
  type PaidPlanId,
} from "./plans";
```

2. `StripeLike` gains `subscriptions.cancel`:

```ts
export interface StripeLike {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
      ): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
    };
  };
  customers: {
    create(params: Stripe.CustomerCreateParams): Promise<{ id: string }>;
  };
  subscriptions: {
    cancel(id: string): Promise<unknown>;
  };
  invoices: {
    retrieve(
      id: string,
      params: Stripe.InvoiceRetrieveParams,
    ): Promise<Stripe.Invoice>;
  };
  webhooks: {
    constructEvent(
      payload: string | Buffer,
      header: string,
      secret: string,
    ): Stripe.Event;
  };
}
```

3. Metadata constant + build/parse:

```ts
export const METADATA_USER_ID = "moldaiUserId";
export const METADATA_PURCHASE_TYPE = "moldaiPurchaseType";
export const METADATA_PLAN = "moldaiPlan";
export const METADATA_INTERVAL = "moldaiInterval";

export function buildPurchaseMetadata(
  userId: string,
  purchase: Purchase,
): Record<string, string> {
  const base = {
    [METADATA_USER_ID]: userId,
    [METADATA_PURCHASE_TYPE]: purchase.type,
  };
  return purchase.type === "subscribe"
    ? {
        ...base,
        [METADATA_PLAN]: purchase.plan,
        [METADATA_INTERVAL]: purchase.interval,
      }
    : base;
}

export function parsePurchaseMetadata(
  metadata: Record<string, string> | null | undefined,
): ParsedPurchaseMetadata | null {
  if (!metadata) return null;
  const userId = metadata[METADATA_USER_ID];
  const type = metadata[METADATA_PURCHASE_TYPE];
  if (!userId || !isPurchaseType(type)) return null;
  if (type === "topup") return { userId, purchase: { type: "topup" } };
  const plan = metadata[METADATA_PLAN];
  if (!isPaidPlanId(plan)) return null;
  const interval = metadata[METADATA_INTERVAL];
  if (!isBillingInterval(interval)) return null;
  return { userId, purchase: { type: "subscribe", plan, interval } };
}
```

4. `createCheckoutSession`'s `recurring` line:

```ts
        price_data: {
          currency: CURRENCY,
          unit_amount: input.amountCents,
          product_data: { name: input.itemName },
          ...(input.purchase.type === "subscribe"
            ? { recurring: { interval: input.purchase.interval } }
            : {}),
        },
```

5. `GatewayEvent`'s `subscriptionStarted` variant:

```ts
  | {
      kind: "subscriptionStarted";
      userId: string;
      plan: PaidPlanId;
      interval: BillingInterval;
      invoiceId: string;
      subscriptionId: string;
    }
```

(Add `import type { BillingInterval } from "./plans";` — or fold into the existing named import from `./plans` above.)

6. `parseGatewayEvent`'s `subscription_create` branch:

```ts
if (invoice.billing_reason === "subscription_create") {
  if (!parsed || parsed.purchase.type !== "subscribe") {
    return {
      kind: "ignored",
      reason: "subscription invoice metadata unusable",
    };
  }
  return {
    kind: "subscriptionStarted",
    userId: parsed.userId,
    plan: parsed.purchase.plan,
    interval: parsed.purchase.interval,
    invoiceId,
    subscriptionId,
  };
}
```

7. New `cancelSubscription` function, placed after `createCheckoutSession`:

```ts
/**
 * Cancels a Stripe subscription immediately. Used by the webhook route as a
 * best-effort cleanup when a NEW subscription supersedes an OLD one (a real
 * plan/interval upgrade) -- every plan change in this app creates a
 * brand-new Checkout subscription rather than updating an existing one, so
 * without this the old subscription is left live, billing forever. Errors
 * propagate as StripeGatewayError; the caller decides whether to treat that
 * as fatal (it does not -- see the webhook route's own comment).
 */
export async function cancelSubscription(
  config: StripeConfig,
  subscriptionId: string,
  deps: StripeDeps = {},
): Promise<void> {
  try {
    await clientFor(config, deps).subscriptions.cancel(subscriptionId);
  } catch (err) {
    throw new StripeGatewayError("stripe subscription cancel failed", err);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project node lib/billing/stripe.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/billing/stripe.ts lib/billing/stripe.test.ts
git commit -m "feat(billing): thread billing interval through Stripe checkout/metadata, add cancelSubscription"
```

---

### Task 6: `lib/schemas/billing.ts` + `app/api/billing/purchase/route.ts` — interval in the purchase request

**Files:**

- Modify: `lib/schemas/billing.ts`
- Modify: `app/api/billing/purchase/route.ts`
- Modify: `app/api/billing/purchase/route.test.ts`

**Interfaces:**

- Consumes: `isPaidPlanId`, `isBillingInterval`, `isPlanOrIntervalUpgrade`, `annualPriceCents` (Task 1); `Wallet.planInterval` (Task 2).
- Produces: `resolvePurchase(type, plan, interval)` returns `{ok:true, purchase: Purchase} | {ok:false, error: "invalid_plan"|"invalid_interval"}`.

- [ ] **Step 1: Write the failing tests**

`app/api/billing/purchase/route.test.ts` builds requests via a local `req(body: unknown)` helper (`new Request(...)` with `JSON.stringify(body)`) — every test that expects a subscribe request to actually reach `applyPurchase`/the checkout call (as opposed to being rejected for an unrelated reason like a missing/unknown/free plan, which is refused before interval is ever checked) needs `interval: "month"` added to its body, or it now fails with `invalid_interval` instead of its real expected outcome. Verified exhaustively via `grep -n 'type: "subscribe"' app/api/billing/purchase/route.test.ts` — add `interval: "month"` to the request body in exactly these tests (identified by their `it(...)` description; leave every other subscribe-body test in the file untouched, since they test the plan check, which still fires first):

- `"still accepts the two real types"` — `req({ type: "subscribe", plan: "atelier" })`
- `"subscribes a free wallet straight to studio, skipping atelier"` — `plan: "studio"`
- `"subscribes to factory"` — `plan: "factory"`
- `"refuses a downgrade under the wallet lock, with no mutation and no ledger row"` — `plan: "atelier"`
- `"refuses a same-plan subscribe request"` — `plan: "atelier"`
- `"hands the whole validated Purchase to the checkout, so mode/recurrence is decided in one place"` — the request body (`plan: "atelier"`) AND the expected `purchase: { type: "subscribe", plan: "atelier" }` object in its `expect(createCheckoutSession).toHaveBeenCalledWith(...)` assertion both need `interval: "month"` added.
- `"refuses a downgrade before creating any checkout"` — `plan: "atelier"`
- `"refuses a same-tier resubscribe the same way"` — `plan: "studio"`
- `"still allows a real upgrade"` — `plan: "factory"`
- `"prices the checkout from plans.ts per requested tier, in centavos"` — the loop's `req({ type: "subscribe", plan })` call.

Leave `"rejects a subscribe with no plan"`, `"rejects a subscribe to an unknown plan"`, and `'rejects a subscribe to "free"...'` (both the mock-provider and the `#179` stripe-provider copies of these three) exactly as they are — no plan means `resolvePurchase` never reaches the interval check.

Then add:

```ts
describe("interval validation", () => {
  it("answers invalid_interval for a subscribe body with no interval", async () => {
    const res = await POST(req({ type: "subscribe", plan: "atelier" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_interval");
  });

  it("answers invalid_interval for an unrecognised interval value", async () => {
    const res = await POST(
      req({ type: "subscribe", plan: "atelier", interval: "weekly" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_interval");
  });

  it("mock provider: subscribing annually grants the 12x lump sum", async () => {
    const res = await POST(
      req({ type: "subscribe", plan: "atelier", interval: "year" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credits.total).toBe(500 * 12);
  });

  it("mock provider: refuses annual-to-monthly on the same tier as a downgrade", async () => {
    await POST(req({ type: "subscribe", plan: "atelier", interval: "year" }));
    const res = await POST(
      req({ type: "subscribe", plan: "atelier", interval: "month" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("plan_not_upgradable");
  });
});
```

(`req(...)` is this file's existing `function req(body: unknown)` helper — `new Request(...)` with `JSON.stringify(body)` — already used verbatim above; no adaptation needed.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project node app/api/billing/purchase/route.test.ts`
Expected: FAIL — `invalid_interval` doesn't exist yet, so every one of the 10 tests listed above now fails with `invalid_plan`/a schema error instead of its real expected outcome, and the 4 new `describe("interval validation", ...)` tests fail outright. (This file's own `wallet` fixture — check its declaration near the top of the file — is built via `seedWallet(NOW)`, not a hand-written literal, so it already carries `planInterval` once Task 2 lands; no separate literal-fixing needed here.)

- [ ] **Step 3: Implement**

In `lib/schemas/billing.ts`, add `interval` to `PurchaseBodySchema`:

```ts
export const PurchaseBodySchema = z.object({
  type: z.unknown().optional(),
  patternId: z.unknown().optional(),
  plan: z.unknown().optional(),
  interval: z.unknown().optional(),
});
```

In `app/api/billing/purchase/route.ts`:

1. Update imports:

```ts
import {
  isPaidPlanId,
  isPlanOrIntervalUpgrade,
  isBillingInterval,
  PLAN_PRICE_CENTS,
  TOPUP_PRICE_CENTS,
  annualPriceCents,
} from "@/lib/billing/plans";
```

2. Replace `resolvePurchase`:

```ts
type ResolvedPurchase =
  | { ok: true; purchase: Purchase }
  | { ok: false; error: "invalid_plan" | "invalid_interval" };

/**
 * #9/#179: an unusable "subscribe" plan or interval -- absent, unknown, or
 * (for plan) the literal "free" -- must never reach applyPurchase (mock
 * path) or become a real, plan-priced checkout charge (stripe path). Shared
 * by both provider branches so the same trust-boundary check guards both.
 */
function resolvePurchase(
  type: PurchaseType,
  plan: unknown,
  interval: unknown,
): ResolvedPurchase {
  if (type !== "subscribe") return { ok: true, purchase: { type: "topup" } };
  if (!isPaidPlanId(plan)) return { ok: false, error: "invalid_plan" };
  if (!isBillingInterval(interval))
    return { ok: false, error: "invalid_interval" };
  return { ok: true, purchase: { type: "subscribe", plan, interval } };
}
```

3. Both call sites — mock branch:

```ts
  if (getPaymentProvider() !== "stripe") {
    const resolved = resolvePurchase(type, body.plan, body.interval);
    if (!resolved.ok) {
      return apiError(resolved.error, 400);
    }
    const purchase = resolved.purchase;

    return await withWallet(gate.id, (wallet) => {
      if (
        purchase.type === "subscribe" &&
        !isPlanOrIntervalUpgrade(
          { plan: wallet.plan, interval: wallet.planInterval },
          { plan: purchase.plan, interval: purchase.interval },
        )
      ) {
        return { result: apiError("plan_not_upgradable", 400), entries: [] };
      }
      const entry = applyPurchase(wallet, purchase, now);
      // ... rest unchanged
```

4. Stripe branch:

```ts
  const resolved = resolvePurchase(type, body.plan, body.interval);
  if (!resolved.ok) {
    return apiError(resolved.error, 400);
  }
  const purchase = resolved.purchase;

  // ... loadStripeConfig check unchanged ...

  try {
    const prep = await withStripeCustomerId(
      gate.id,
      () => createCustomer(config, { name: gate.name ?? gate.email, email: gate.email, userId: gate.id }),
      (wallet) =>
        purchase.type === "subscribe" &&
        !isPlanOrIntervalUpgrade(
          { plan: wallet.plan, interval: wallet.planInterval },
          { plan: purchase.plan, interval: purchase.interval },
        )
          ? "plan_not_upgradable"
          : null,
    );
    // ... unchanged ...

    let itemName: string;
    let amountCents: number;
    if (purchase.type === "subscribe") {
      const tPlan = await getTranslations("PlanSection");
      itemName = tPlan(`plans.${purchase.plan}.name`);
      amountCents =
        purchase.interval === "year"
          ? annualPriceCents(purchase.plan)
          : PLAN_PRICE_CENTS[purchase.plan];
    } else {
      const tPaywall = await getTranslations("PaywallModal");
      itemName = tPaywall("topupTitle");
      amountCents = TOPUP_PRICE_CENTS;
    }
    // ... rest unchanged (createCheckoutSession call already receives `purchase` whole)
```

5. `messages/pt-BR.json`'s `PlanSection.errors` needs a new key (added in Task 9, but reference it here so this task's tests pass once Task 9 lands — if executing tasks in order, add `"invalid_interval": "Ciclo de cobrança inválido."` to `PlanSection.errors` right now rather than waiting, since this route test doesn't read the catalog at all — only `PlanSection.tsx`'s component test does, in Task 11).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project node app/api/billing/purchase/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/schemas/billing.ts app/api/billing/purchase/route.ts app/api/billing/purchase/route.test.ts
git commit -m "feat(billing): validate and thread billing interval through POST /api/billing/purchase"
```

---

### Task 7: `app/api/billing/webhook/route.ts` — interval threading + cancel the superseded subscription

**Files:**

- Modify: `app/api/billing/webhook/route.ts`
- Modify: `app/api/billing/webhook/route.test.ts`

**Interfaces:**

- Consumes: `GatewayEvent.subscriptionStarted.interval`, `cancelSubscription` (Task 5); `IdempotentMutationResult.previousStripeSubscriptionId` (Task 4).

- [ ] **Step 1: Write the failing tests**

In `app/api/billing/webhook/route.test.ts`:

1. The mocked `withWalletIdempotent` in this file's `vi.mock("@/lib/db/wallet", ...)` needs to return `previousStripeSubscriptionId` too. Update its implementation:

```ts
vi.mock("@/lib/db/wallet", () => ({
  withWalletIdempotent: vi.fn(
    async (
      userId: string,
      externalId: string,
      fn: (w: Wallet) => LedgerEntry,
      stripeSubscriptionId?: string,
    ) => {
      const w = wallet(userId);
      const before = { ...w };
      const entry = fn(w);
      if (seenExternalIds.has(externalId)) {
        Object.assign(w, before);
        return { credited: false, previousStripeSubscriptionId: null };
      }
      if (entry.type === "subscribe" && entry.planChanged) {
        w.planSourceExternalId = externalId;
      }
      let previousStripeSubscriptionId: string | null = null;
      if (stripeSubscriptionId) {
        previousStripeSubscriptionId = subscriptionIds.get(userId) ?? null;
        subscriptionIds.set(userId, stripeSubscriptionId);
      }
      seenExternalIds.add(externalId);
      ledger.push({ userId, externalId, entry });
      return { credited: true, previousStripeSubscriptionId };
    },
  ),
  // ... findLedgerEntryByExternalId / findWalletUserIdByStripeSubscriptionId unchanged
}));
```

2. Mock `cancelSubscription` alongside the existing `@/lib/billing/stripe` partial mock:

```ts
vi.mock("@/lib/billing/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/stripe")>();
  return {
    ...actual,
    loadStripeConfig: vi.fn(() => ({
      secretKey: "sk_test_x",
      webhookSecret: "whsec_test_x",
    })),
    verifyWebhookEvent: vi.fn(),
    resolveInvoicePaymentIntent: vi.fn(async () => "pi_default"),
    cancelSubscription: vi.fn(async () => {}),
  };
});
```

And import it in the test file's top-level import from `@/lib/billing/stripe`:

```ts
import {
  loadStripeConfig,
  verifyWebhookEvent,
  resolveInvoicePaymentIntent,
  cancelSubscription,
  StripeGatewayError,
  buildPurchaseMetadata,
} from "@/lib/billing/stripe";
```

Reset it in `beforeEach`: `vi.mocked(cancelSubscription).mockClear();`

3. `subscriptionInvoice(...)`'s `buildPurchaseMetadata` call needs `interval` — update the helper:

```ts
function subscriptionInvoice(
  billingReason: string,
  {
    invoiceId = "in_1",
    subscriptionId = "sub_1",
    plan = "atelier",
    interval = "month",
  }: {
    invoiceId?: string;
    subscriptionId?: string;
    plan?: "atelier" | "studio" | "factory";
    interval?: "month" | "year";
  } = {},
) {
  return stripeEvent("invoice.paid", {
    id: invoiceId,
    billing_reason: billingReason,
    parent: {
      subscription_details: {
        subscription: subscriptionId,
        metadata: buildPurchaseMetadata("u1", {
          type: "subscribe",
          plan,
          interval,
        }),
      },
    },
  });
}
```

4. New test cases:

```ts
describe("subscription first payment -- cancels the superseded subscription", () => {
  it("cancels the OLD subscription when a genuine upgrade confirms on a NEW one", async () => {
    vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_first");
    vi.mocked(verifyWebhookEvent).mockReturnValue(
      subscriptionInvoice("subscription_create", {
        invoiceId: "in_first",
        subscriptionId: "sub_atelier",
        plan: "atelier",
      }),
    );
    await POST(req());

    vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_second");
    vi.mocked(verifyWebhookEvent).mockReturnValue(
      subscriptionInvoice("subscription_create", {
        invoiceId: "in_second",
        subscriptionId: "sub_studio",
        plan: "studio",
      }),
    );
    await POST(req());

    expect(cancelSubscription).toHaveBeenCalledWith(
      expect.anything(),
      "sub_atelier",
    );
  });

  it("does not cancel anything on a wallet's first-ever subscription", async () => {
    vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_first");
    vi.mocked(verifyWebhookEvent).mockReturnValue(
      subscriptionInvoice("subscription_create"),
    );
    await POST(req());
    expect(cancelSubscription).not.toHaveBeenCalled();
  });

  it("does not cancel when the confirmation is FOLDED (not a real plan change) -- the wallet's real subscription must stay untouched", async () => {
    vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_factory");
    vi.mocked(verifyWebhookEvent).mockReturnValue(
      subscriptionInvoice("subscription_create", {
        invoiceId: "in_factory",
        subscriptionId: "sub_factory",
        plan: "factory",
      }),
    );
    await POST(req());

    // A late/lower confirmation on a DIFFERENT new subscription -- folds,
    // never changes plan/total.
    vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_atelier_late");
    vi.mocked(verifyWebhookEvent).mockReturnValue(
      subscriptionInvoice("subscription_create", {
        invoiceId: "in_atelier_late",
        subscriptionId: "sub_atelier_late",
        plan: "atelier",
      }),
    );
    await POST(req());

    expect(cancelSubscription).not.toHaveBeenCalled();
  });

  it("a cancel failure is logged but never fails the webhook or the credit", async () => {
    vi.mocked(cancelSubscription).mockRejectedValue(
      new StripeGatewayError("stripe subscription cancel failed"),
    );
    vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_first");
    vi.mocked(verifyWebhookEvent).mockReturnValue(
      subscriptionInvoice("subscription_create", {
        invoiceId: "in_first",
        subscriptionId: "sub_atelier",
        plan: "atelier",
      }),
    );
    await POST(req());

    vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_second");
    vi.mocked(verifyWebhookEvent).mockReturnValue(
      subscriptionInvoice("subscription_create", {
        invoiceId: "in_second",
        subscriptionId: "sub_studio",
        plan: "studio",
      }),
    );
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(wallet("u1").plan).toBe("studio");
  });
});

describe("subscription first payment -- annual", () => {
  it("applies the 12x lump sum for an annual first payment", async () => {
    vi.mocked(resolveInvoicePaymentIntent).mockResolvedValue("pi_annual");
    vi.mocked(verifyWebhookEvent).mockReturnValue(
      subscriptionInvoice("subscription_create", { interval: "year" }),
    );
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(wallet("u1").total).toBe(PLAN_CREDITS.atelier * 12);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project node app/api/billing/webhook/route.test.ts`
Expected: FAIL — the route doesn't call `cancelSubscription` yet.

- [ ] **Step 3: Implement**

In `app/api/billing/webhook/route.ts`, update the import line:

```ts
import {
  loadStripeConfig,
  verifyWebhookEvent,
  parseGatewayEvent,
  resolveInvoicePaymentIntent,
  cancelSubscription,
  type GatewayEvent,
  type StripeConfig,
  type StripeDeps,
} from "@/lib/billing/stripe";
```

Rewrite `handleSubscriptionStarted`:

```ts
async function handleSubscriptionStarted(
  config: StripeConfig,
  event: Extract<GatewayEvent, { kind: "subscriptionStarted" }>,
  eventId: string,
  deps: StripeDeps,
): Promise<void> {
  const paymentIntentId = await paymentIntentFor(config, event.invoiceId, deps);
  const now = new Date();
  const superseded: {
    value: { plan: PaidPlanId; previousPlan: PlanId } | null;
  } = { value: null };
  const result = await withWalletIdempotent(
    event.userId,
    paymentIntentId,
    (wallet) => {
      const previousPlan = wallet.plan;
      const entry = applyPurchase(
        wallet,
        { type: "subscribe", plan: event.plan, interval: event.interval },
        now,
      );
      if (entry.planChanged === false) {
        superseded.value = { plan: event.plan, previousPlan };
      }
      return entry;
    },
    event.subscriptionId,
  );
  if (superseded.value) {
    const { plan, previousPlan } = superseded.value;
    reportError(
      "billing-webhook-subscribe-superseded",
      new Error(
        `subscribe payment for plan "${plan}" arrived after wallet was ` +
          `already on "${previousPlan}" (or better) -- credited as ` +
          `purchased credits instead of changing plan`,
      ),
      { userId: event.userId, eventId, plan, previousPlan },
    );
  }
  // Incidental fix (docs/superpowers/specs/2026-08-30-annual-billing-design.md):
  // every plan/interval change in this app creates a brand-new Stripe
  // Checkout subscription rather than updating an existing one -- so a
  // genuine upgrade leaves the OLD subscription live, billing forever,
  // unless something cancels it. Scoped narrowly to that one case:
  // credited must be true (a real, first-time credit, not a duplicate
  // delivery), the entry must have actually moved the plan
  // (superseded.value is null exactly then), and there must BE a
  // different previous subscription to cancel. A FOLDED confirmation
  // (superseded.value set) is deliberately excluded: the wallet's
  // previous subscription is still the one actually backing its plan,
  // so canceling it there would cut off the real subscription.
  if (
    result.credited &&
    !superseded.value &&
    result.previousStripeSubscriptionId &&
    result.previousStripeSubscriptionId !== event.subscriptionId
  ) {
    try {
      await cancelSubscription(
        config,
        result.previousStripeSubscriptionId,
        deps,
      );
    } catch (err) {
      reportError("billing-webhook-cancel-previous-subscription", err, {
        userId: event.userId,
        eventId,
        previousSubscriptionId: result.previousStripeSubscriptionId,
        newSubscriptionId: event.subscriptionId,
      });
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project node app/api/billing/webhook/route.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full node suite**

Run: `npx vitest run --project node`
Expected: PASS everywhere except `components/**` (dom project, untouched by this task) and anything Tasks 8–11 haven't reached yet.

- [ ] **Step 6: Commit**

```bash
git add app/api/billing/webhook/route.ts app/api/billing/webhook/route.test.ts
git commit -m "feat(billing): cancel the superseded Stripe subscription on a genuine plan/interval upgrade"
```

---

### Task 8: `lib/types.ts` + `lib/api/compose.ts` + `lib/api-client.ts` — `Credits.planInterval`, `purchase()` gains `interval`

**Files:**

- Modify: `lib/types.ts`
- Modify: `lib/api/compose.ts`
- Modify: `lib/api/compose.test.ts`
- Modify: `lib/api-client.ts`
- Modify: `lib/api-client.contract.test.ts`

**Interfaces:**

- Consumes: `Wallet.planInterval` (Task 2), `BillingInterval` (Task 1).
- Produces: `Credits.planInterval?: BillingInterval`; `purchase(type, plan?, patternId?, interval?)`.

- [ ] **Step 1: Write the failing tests**

`lib/api/compose.test.ts` has two relevant spots (read the file's current full content first — it's short, 85 lines):

1. Its first test, `"merges pattern/chat/conflict with credits derived from the wallet"` (inside `describe("composeEditorState", ...)`), builds its wallet via `seedWallet(NOW)` and asserts `state.credits` with `toEqual({ plan: "free", balance: 30, total: 30, renewsInDays: 30 })`. Add `planInterval: "month"` to that expected object (Vitest's `toEqual` fails on an extra defined key the expected side lacks, so this breaks the moment `buildCredits` starts setting it).
2. `describe("buildCredits", ...)` has two tests, each building its own raw `Wallet` object literal (already given `planInterval: "month"` in Task 2, Step 5) and asserting the result with `toEqual({...})`. Add `planInterval: "month"` to both expected objects:
   - `"builds a Credits object from a wallet, independent of any pattern"` — expected becomes `{ plan: "atelier", balance: 320, total: 500, renewsInDays: 14, planInterval: "month" }`.
   - `"does not put a display label on the wire"` — this one only asserts `credits.plan`/`not.toHaveProperty("planLabel")`, not a full `toEqual`, so it needs no change.

Then append a new test to the `buildCredits` describe block:

```ts
it("carries the wallet's planInterval onto the wire", () => {
  const wallet = {
    plan: "atelier" as const,
    balance: 6000,
    total: 6000,
    purchased: 0,
    renewsAt: new Date("2027-08-17T00:00:00.000Z"),
    planInterval: "year" as const,
    planSourceExternalId: null,
  };
  const now = new Date("2026-08-18T00:00:00.000Z");
  expect(buildCredits(wallet, now).planInterval).toBe("year");
});
```

In `lib/api-client.contract.test.ts`, the `purchase` cases live in a data table of `{name, call, url, method, body}` rows (`CONTRACT_CASES`-shaped array, read the file to confirm the exact array name). Update the existing `"purchase (subscribe, from the editor's paywall)"` row's `body` to include the interval `purchase()` now always sends (defaulted to `"month"` since that call passes no 4th argument):

```ts
{
  name: "purchase (subscribe, from the editor's paywall)",
  call: () => purchase("subscribe", "studio", "p1"),
  url: "/api/billing/purchase",
  method: "POST",
  body: { type: "subscribe", plan: "studio", patternId: "p1", interval: "month" },
},
```

Leave the `"purchase (topup)"` row's `body: { type: "topup" }` untouched — a topup's `interval` is `undefined`, dropped by `JSON.stringify` exactly like `plan`/`patternId` already are (per that row's own comment). Then add a new row right after it, exercising an explicit annual interval:

```ts
{
  name: "purchase (subscribe, annual)",
  call: () => purchase("subscribe", "atelier", undefined, "year"),
  url: "/api/billing/purchase",
  method: "POST",
  body: { type: "subscribe", plan: "atelier", interval: "year" },
},
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project node lib/api/compose.test.ts lib/api-client.contract.test.ts`
Expected: FAIL — the updated `toEqual` expectations in `compose.test.ts` now want a `planInterval` key `buildCredits` doesn't produce yet, and `lib/api-client.contract.test.ts`'s updated/new rows expect a request body `purchase()` doesn't send yet (a 4th parameter it doesn't accept is also a compile error).

- [ ] **Step 3: Implement**

`lib/types.ts` currently imports only `import type { Measurements } from "./measurements";` — nothing from `lib/billing/plans.ts` (verified). `lib/billing/plans.ts`, in turn, already imports `PlanId` FROM `@/lib/types`. So `lib/types.ts` importing `BillingInterval` back from `lib/billing/plans.ts` would create a real module cycle (`types.ts -> plans.ts -> types.ts`). Avoid it by re-declaring the same two-value literal union directly in `lib/types.ts` instead of importing it — add right after `renewsInDays` in the `Credits` interface:

```ts
export interface Credits {
  plan: PlanId;
  balance: number;
  total: number;
  renewsInDays: number;
  // Optional, not mirroring Wallet.planInterval's non-optional shape: 26
  // files construct a Credits-shaped literal (mostly test fixtures), and
  // only PlanSection reads this field. buildCredits always sets it from the
  // real wallet -- absent only in a hand-built fixture that predates this
  // field. The literal union is re-declared here rather than imported from
  // lib/billing/plans.ts's BillingInterval, which would create a cycle
  // (plans.ts already imports PlanId from this file).
  planInterval?: "month" | "year";
}
```

`lib/api/compose.ts`:

```ts
export function buildCredits(wallet: Wallet, now: Date): Credits {
  return {
    plan: wallet.plan,
    balance: wallet.balance,
    total: wallet.total,
    renewsInDays: renewsInDays(wallet, now),
    planInterval: wallet.planInterval,
  };
}
```

`lib/api-client.ts`:

```ts
export function purchase(
  type: "topup" | "subscribe",
  plan?: PaidPlanId,
  patternId?: string,
  interval?: "month" | "year",
): Promise<PurchaseResult> {
  return postJson<PurchaseResult>("/api/billing/purchase", {
    type,
    plan,
    patternId,
    // Defaults to monthly when omitted -- every pre-existing call site
    // (PaywallModal, the editor store's retry thunk) subscribes monthly
    // only and never passes this.
    interval: type === "subscribe" ? (interval ?? "month") : undefined,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project node lib/api/compose.test.ts lib/api-client.contract.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full node suite once more**

Run: `npx vitest run --project node`
Expected: PASS across the whole `node` project.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/api/compose.ts lib/api/compose.test.ts lib/api-client.ts lib/api-client.contract.test.ts
git commit -m "feat(billing): surface planInterval on Credits, thread interval through purchase()"
```

---

### Task 9: `messages/pt-BR.json` — catalog additions

**Files:**

- Modify: `messages/pt-BR.json`

No test file — this task's correctness is verified by Tasks 10/11's component tests, which assert against these exact keys via `ptBR`.

- [ ] **Step 1: Add catalog keys**

Under `PlanSection`, add (alongside the existing `errors` object, and alongside `plans.<id>`):

```json
"PlanSection": {
  ...
  "toggleLabel": "Ciclo de cobrança",
  "toggle": {
    "monthly": "Mensal",
    "annual": "Anual · −20%"
  },
  "annualBilledNote": "cobrado anualmente",
  "plans": {
    "free": {
      "name": "Grátis",
      "creditsLabel": "{credits, number} créditos/mês"
    },
    "atelier": {
      "name": "Ateliê",
      "creditsLabel": "{credits, number} créditos/mês",
      "creditsLabelAnnual": "{credits, number} créditos/ano"
    },
    "studio": {
      "name": "Estúdio",
      "creditsLabel": "{credits, number} créditos/mês",
      "creditsLabelAnnual": "{credits, number} créditos/ano"
    },
    "factory": {
      "name": "Confecção",
      "creditsLabel": "{credits, number} créditos/mês",
      "creditsLabelAnnual": "{credits, number} créditos/ano"
    }
  },
  "errors": {
    "invalid_plan": "Plano inválido.",
    "invalid_interval": "Ciclo de cobrança inválido.",
    "plan_not_upgradable": "Esse plano não é um upgrade do seu plano atual.",
    ...
  }
}
```

(`free` gets no `creditsLabelAnnual` — it never participates in the annual toggle. Keep every other existing key in `PlanSection` untouched; this is a pure addition.)

`Pricing`'s own `toggle`/`annualBilledNote`/`priceSuffix` keys already exist (verified in Task exploration) and need no change.

- [ ] **Step 2: Validate the JSON**

Run: `npx prettier --check messages/pt-BR.json || npx prettier --write messages/pt-BR.json`

- [ ] **Step 3: Commit**

```bash
git add messages/pt-BR.json
git commit -m "feat(billing): add catalog copy for the annual billing toggle"
```

---

### Task 10: `components/pricing/PricingPage.tsx` — real annual CTAs

**Files:**

- Modify: `components/pricing/PricingPage.tsx`
- Modify: `components/pricing/PricingPage.test.tsx`

**Interfaces:**

- Consumes: `annualMonthlyEquivalentCents` (Task 1); catalog keys from Task 9.

- [ ] **Step 1: Write the failing test changes**

Replace the existing `describe("annual toggle", ...)` block in `PricingPage.test.tsx`:

```ts
describe("annual toggle", () => {
  it("shows the discounted monthly-equivalent price and keeps every paid CTA enabled", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);

    await user.click(screen.getByText(ptBR.Pricing.toggle.annual));

    expect(
      screen.getByText(
        priceText(formatBRL(annualMonthlyEquivalentCents("atelier"))),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: ptBR.Pricing.plans.atelier.cta }),
    ).toHaveAttribute("href", "/signup");
    expect(
      screen.getAllByText(ptBR.Pricing.annualBilledNote).length,
    ).toBeGreaterThan(0);
  });
});
```

(Add `import { PLAN_PRICE_CENTS, formatBRL, annualMonthlyEquivalentCents } from "@/lib/billing/plans";` to the top import — `PLAN_PRICE_CENTS`/`formatBRL` are already imported; just add `annualMonthlyEquivalentCents`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project dom components/pricing/PricingPage.test.tsx`
Expected: FAIL — the CTA is still disabled under Anual (old behavior).

- [ ] **Step 3: Implement**

In `components/pricing/PricingPage.tsx`:

1. Delete the `ANNUAL_FACTOR` constant and its comment block entirely (replaced by `annualMonthlyEquivalentCents`).

2. Update the import:

```ts
import {
  PLAN_CREDITS,
  PLAN_PRICE_CENTS,
  formatBRL,
  PLAN_FEATURES,
  TOPUP_CREDITS,
  TOPUP_PRICE_CENTS,
  annualMonthlyEquivalentCents,
} from "@/lib/billing/plans";
```

3. In the paid-plan-card map, replace the price computation:

```ts
const monthly = PLAN_PRICE_CENTS[id];
const price = billing === "annual" ? annualMonthlyEquivalentCents(id) : monthly;
```

4. Replace the `creditsLabel` line to use the annual variant when toggled:

```ts
<span className="text-body font-semibold">
  {billing === "annual"
    ? tPlan(`plans.${id}.creditsLabelAnnual`, {
        credits: PLAN_CREDITS[id] * 12,
      })
    : tPlan(`plans.${id}.creditsLabel`, { credits: PLAN_CREDITS[id] })}
</span>
```

(Using `PLAN_CREDITS[id] * 12` directly rather than importing `effectiveCredits` here is fine and matches the file's existing style of reading `PLAN_CREDITS` directly — but prefer `effectiveCredits(id, "year")` from `@/lib/billing/plans` for consistency with the rest of this plan; add it to the same import line and use it.)

5. In `PlanCta`, delete the entire `annualDisabled` block (the `const annualDisabled = billing === "annual" && id !== "free";` line and the `if (annualDisabled) { return (...) }` block that follows it, which renders the disabled `Button` + `soon` `Badge`).

Once that block is gone, `billing` is unused inside `PlanCta` — remove the `billing` prop from `PlanCta`'s signature entirely, and from both its call sites (the paid-card map's `<PlanCta id={id} signedIn={signedIn} isCurrent={isCurrent} billing={billing} />` and `FreeCard`'s `<PlanCta id="free" signedIn={signedIn} isCurrent={isCurrent} billing={billing} />`), dropping just the `billing={billing}` prop from each. `FreeCard` itself only ever used its own `billing` prop to forward into that call, so remove `billing` from `FreeCard`'s destructured props too, and from its one call site in the parent `PricingPage` component (`<FreeCard signedIn={signedIn} currentPlan={currentPlan} />`, dropping `billing={billing}`) — an unused prop is dead code per this repo's own convention.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project dom components/pricing/PricingPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Manual browser check**

Run `npm run dev`, visit `/planos` signed out, toggle Anual, and confirm every paid CTA is a live, clickable link to `/signup` (not disabled), the price shown is the discounted monthly-equivalent, and the credits line reads the annual total. Then sign in and confirm the CTA goes to `/settings?section=plan`.

- [ ] **Step 7: Commit**

```bash
git add components/pricing/PricingPage.tsx components/pricing/PricingPage.test.tsx
git commit -m "feat(billing): make /planos's annual toggle real (enabled CTAs, real annual price)"
```

---

### Task 11: `components/settings/PlanSection.tsx` — real annual subscribe

**Files:**

- Modify: `components/settings/PlanSection.tsx`
- Modify: `components/settings/PlanSection.test.tsx`

**Interfaces:**

- Consumes: `isPlanOrIntervalUpgrade`, `effectiveCredits`, `annualMonthlyEquivalentCents` (Task 1); `purchase(type, plan, patternId, interval)` (Task 8); catalog keys (Task 9).

- [ ] **Step 1: Write the failing test changes**

In `PlanSection.test.tsx`, update the existing subscribe assertion (`expect(purchase).toHaveBeenCalledWith("subscribe", "studio")`) to include the new arguments:

```ts
expect(purchase).toHaveBeenCalledWith(
  "subscribe",
  "studio",
  undefined,
  "month",
);
```

Add a new `describe` block:

```ts
describe("annual toggle", () => {
  afterEach(() => {
    vi.mocked(purchase).mockReset();
  });

  it("shows a Mensal/Anual toggle", () => {
    renderWithIntl(<PlanSection credits={CREDITS} />);
    expect(screen.getByText(ptBR.PlanSection.toggle.monthly)).toBeInTheDocument();
    expect(screen.getByText(ptBR.PlanSection.toggle.annual)).toBeInTheDocument();
  });

  it("switches to the annual price and passes interval:year on subscribe", async () => {
    vi.mocked(purchase).mockResolvedValue({
      status: "ok",
      credits: { plan: "atelier", balance: 6000, total: 6000, renewsInDays: 365 },
    });
    const user = userEvent.setup();
    renderWithIntl(<PlanSection credits={CREDITS} />);

    await user.click(screen.getByText(ptBR.PlanSection.toggle.annual));
    await user.click(
      screen.getByRole("button", { name: subscribeLabel("atelier") }),
    );

    expect(purchase).toHaveBeenCalledWith("subscribe", "atelier", undefined, "year");
  });

  it("never shows Grátis as an upgradeable target, even on Anual (there is no such product)", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PlanSection credits={{ ...CREDITS, plan: "free" }} />);
    await user.click(screen.getByText(ptBR.PlanSection.toggle.annual));
    expect(
      screen.queryByRole("button", { name: subscribeLabel("free") }),
    ).not.toBeInTheDocument();
  });

  it("treats an existing annual subscriber's same-tier monthly row as a downgrade (disabled)", () => {
    renderWithIntl(
      <PlanSection
        credits={{ ...CREDITS, plan: "atelier", planInterval: "year" }}
      />,
    );
    // Monthly is still selected by default -- atelier/monthly is a downgrade
    // from atelier/year, so it must show the disabled downgrade button, not
    // "Plano atual" (the wallet is on the ANNUAL variant, not this row).
    expect(
      screen.getAllByRole("button", { name: ptBR.PlanSection.downgradeButton }),
    ).not.toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project dom components/settings/PlanSection.test.tsx`
Expected: FAIL — no toggle rendered yet, `subscribe()` doesn't pass interval.

- [ ] **Step 3: Implement**

In `components/settings/PlanSection.tsx`:

1. Update imports:

```ts
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Credits, PlanId } from "@/lib/types";
import { COSTS, PLAN_IDS } from "@/lib/types";
import {
  PLAN_CREDITS,
  PLAN_PRICE_CENTS,
  formatBRL,
  isPlanOrIntervalUpgrade,
  effectiveCredits,
  annualMonthlyEquivalentCents,
  type PaidPlanId,
  type BillingInterval,
} from "@/lib/billing/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { purchase, errorCode } from "@/lib/api-client";
```

2. Add interval state and update `subscribe`:

```ts
export function PlanSection({ credits: initial }: { credits: Credits }) {
  const t = useTranslations("PlanSection");
  const router = useRouter();
  const [credits, setCredits] = useState(initial);
  const [pending, setPending] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("month");

  async function subscribe(plan: PaidPlanId, planInterval: BillingInterval) {
    setPending(plan);
    setError(null);
    try {
      const result = await purchase("subscribe", plan, undefined, planInterval);
      if (result.status === "redirect") {
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
  const currentInterval = credits.planInterval ?? "month";
```

3. Add the toggle, right before the `<section className="grid grid-cols-2 gap-3">`:

```tsx
<div className="flex flex-col items-start gap-2">
  <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
    {t("toggleLabel")}
  </span>
  <ToggleGroup
    type="single"
    variant="outline"
    value={interval}
    aria-label={t("toggleLabel")}
    onValueChange={(value) => {
      if (value) setInterval(value as BillingInterval);
    }}
  >
    <ToggleGroupItem value="month">{t("toggle.monthly")}</ToggleGroupItem>
    <ToggleGroupItem value="year">{t("toggle.annual")}</ToggleGroupItem>
  </ToggleGroup>
</div>
```

4. Rewrite the card-map body:

```tsx
<section className="grid grid-cols-2 gap-3">
  {PLAN_IDS.map((id) => {
    const isCurrent = credits.plan === id && currentInterval === interval;
    // Grátis never participates in the annual toggle -- there is no such
    // product, regardless of how the ranking compares.
    const canUpgrade =
      id !== "free" &&
      !isCurrent &&
      isPlanOrIntervalUpgrade(
        { plan: credits.plan, interval: currentInterval },
        { plan: id, interval },
      );
    const priceCents =
      id === "free" || interval === "month"
        ? PLAN_PRICE_CENTS[id]
        : annualMonthlyEquivalentCents(id);
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
          {formatBRL(priceCents)}
        </span>
        {id !== "free" && interval === "year" && (
          <span className="text-muted text-tick">{t("annualBilledNote")}</span>
        )}
        <span className="text-muted text-meta">
          {id !== "free" && interval === "year"
            ? t(`plans.${id}.creditsLabelAnnual`, {
                credits: effectiveCredits(id, "year"),
              })
            : t(`plans.${id}.creditsLabel`, { credits: PLAN_CREDITS[id] })}
        </span>
        {!isCurrent &&
          (canUpgrade ? (
            <Button
              size="sm"
              onClick={() => subscribe(id as PaidPlanId, interval)}
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project dom components/settings/PlanSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full dom project once more**

Run: `npx vitest run --project dom`
Expected: PASS (in particular `PageHeader.test.tsx` and any other consumer of a `Credits` fixture must still pass unmodified, since `planInterval` is optional).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Manual browser check**

`npm run dev`, sign in, visit `/settings?section=plan`, toggle Anual, confirm: prices switch to the discounted monthly-equivalent with "cobrado anualmente"; Grátis never becomes clickable; subscribing calls through to the mock provider and updates the current-plan badge; switching back to Mensal on an annual-subscribed account shows the same-tier monthly row disabled ("Indisponível").

- [ ] **Step 8: Commit**

```bash
git add components/settings/PlanSection.tsx components/settings/PlanSection.test.tsx
git commit -m "feat(billing): make /settings PlanSection's annual toggle real"
```

---

### Task 12: Docs — CLAUDE.md + docs/decisions.md

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/decisions.md`

- [ ] **Step 1: Update CLAUDE.md**

Find the `/planos` bullet in the Screens section containing: _"The Mensal/Anual −20% toggle changes only the displayed price; annual billing isn't implemented, so its CTA is disabled + badged rather than starting a checkout billed monthly under an annual label."_

Replace it with:

```markdown
- **The Mensal/Anual toggle is real.** A year-interval subscribe grants `PLAN_CREDITS[plan] * 12` as one lump sum (`effectiveCredits`, `lib/billing/plans.ts`) rather than a monthly refill decoupled from billing, and can be switched to/from at any time, self-serve — ranked by the same "upgrades only" rule tier switching already uses, generalized to compare `(plan, interval)` pairs by `effectiveCredits` (`isPlanOrIntervalUpgrade`, which replaced `isPlanUpgrade`). Monthly-to-annual on the same tier is always an increase (allowed); annual-to-monthly is always a decrease (refused, same "downgrades are refused server-side" philosophy). Every plan/interval change still creates a brand-new Stripe Checkout subscription rather than updating an existing one — the webhook's `handleSubscriptionStarted` now cancels the previous one when a genuine upgrade confirms, closing a gap where it used to stay live, billing forever.
```

Also update the `PLAN_CREDITS`/pricing bullet under Billing if it still says "monthly credit allowance" without qualifying annual — add one clause: _(a `year`-interval subscribe multiplies this by 12 as a lump sum — see `effectiveCredits`)_.

- [ ] **Step 2: Update docs/decisions.md**

Under the existing `### Billing (real; only the gateway is mocked)` section, append:

```markdown
- **2026-08-30: Annual billing decisions** (full design: [`docs/superpowers/specs/2026-08-30-annual-billing-design.md`](superpowers/specs/2026-08-30-annual-billing-design.md)). Three real product calls, not implementation details: (1) annual credits are a lump sum (`PLAN_CREDITS[plan] * 12`, granted once) rather than a monthly refill decoupled from billing — simpler to reason about, and matches "you paid for the year" more literally than a hidden monthly drip; (2) the billing interval can be switched anytime, self-serve, ranked by the same upgrade-only rule as tier switching, generalized to `effectiveCredits(plan, interval)` — this is what makes monthly-to-annual on the same tier a self-serve upgrade and annual-to-monthly a refused downgrade, with no new special-casing; (3) folded in a fix for a pre-existing gap this change would otherwise make more likely to hit — every plan/interval change creates a brand-new Stripe subscription rather than updating an existing one, and the old one was never canceled, so an account that changed plans twice would be billed for multiple live subscriptions. `handleSubscriptionStarted` now cancels the previous one, but only when the confirmation genuinely changed the plan (not a folded/superseded out-of-order delivery, where the previous subscription is still the real one).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/decisions.md
git commit -m "docs: document real annual billing (lump-sum credits, interval-aware ranking, subscription cancel fix)"
```

---

### Task 13: Final verification pass

**Files:** none (review only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS, both `node` and `dom` projects.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If working in a worktree, prefer this over `npm run typecheck`/`npm run build`, which is known to break there — see this session's own memory note.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: `moldai-conventions` review**

Dispatch the `moldai-conventions` agent against the full diff introduced by Tasks 9–11 (catalog + `PricingPage.tsx` + `PlanSection.tsx`) — the EN-identifier/pt-BR-UI boundary, catalog-lookup-vs-label-map, and no-abstractions-beyond-need checks. Fix anything it flags.

- [ ] **Step 5: `migration-safety` re-check**

If any change since Task 4's review touched `prisma/schema.prisma`, `lib/db/*`, or the `Wallet`/`Purchase`/`Credits` shapes again, re-run the `migration-safety` agent. Otherwise skip (Task 4 already covered the one migration this plan introduces).

- [ ] **Step 6: Manual smoke, mock provider**

`npm run dev`, walk both screens (`/planos` signed out and signed in, `/settings?section=plan`) end to end: toggle Anual, subscribe, confirm the credits bar/ledger reflect the 12x lump sum, then use `PlanSection` to switch back to Mensal on the same tier and confirm it's refused (disabled, "Indisponível").

- [ ] **Step 7: Note the open risk**

No live Stripe account is reachable from this environment (matching every other Stripe integration note in CLAUDE.md). The `recurring.interval: "year"` checkout, the metadata round-trip, and `cancelSubscription` are verified against the mock provider, the installed SDK's own type declarations, and unit tests with an injected fake client only — never a real annual invoice cycle or a real cancellation. State this in the PR description, the same standing caveat every prior Stripe PR in this repo has carried.
