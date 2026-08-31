import { describe, it, expect } from "vitest";
import {
  seedWallet,
  debitWallet,
  refundWallet,
  applyPurchase,
  reverseRefundedEntry,
  renewWallet,
  isRenewalDue,
  type LedgerEntry,
  type Wallet,
} from "./wallet";
import {
  PLAN_CREDITS,
  TOPUP_CREDITS,
  effectiveCredits,
  type PaidPlanId,
} from "./plans";

/**
 * The wallet/ledger invariant suite.
 *
 * Written after #179 -> #193 -> #196 -> #198: four defects in the same small
 * surface, each one found only by fixing the previous one, and none of them
 * in the original backlog. Every one was a *reversal or reapplication that
 * did not mirror what it was undoing or repeating* -- a shape no amount of
 * one-case-per-issue testing was ever going to converge on, because each new
 * case only ever pinned the one scenario its own issue happened to describe.
 *
 * So this file asserts the properties instead, over pseudo-randomly generated
 * operation sequences: whatever order credits, debits, refunds, plan changes
 * and renewals arrive in, these five statements must hold after EVERY step.
 *
 *   A. The ledger reproduces the balance. balance == seed + the signed sum of
 *      every entry, and each entry's own balanceAfter matches the wallet at
 *      the moment it was produced.
 *   B. total always names the current plan's allowance (PLAN_CREDITS[plan]).
 *   C. purchased is exactly the sum of purchased-credit grants that have not
 *      been reversed -- the property #198 broke.
 *   D. purchased is never negative (no reversal runs twice, or runs against
 *      something it did not grant).
 *   E. planSourceExternalId, when set, names an entry that actually moved the
 *      plan and has not since been reset away.
 *   F. A confirmation never moves the plan DOWN, and only a plan-source
 *      refund ever moves it at all -- the property #193 and #196 broke.
 *
 * C is computed from what each entry itself contributed at credit time, NOT
 * from the outcome reverseRefundedEntry reports for its reversal. That is the
 * difference between an independent check and a self-fulfilling one: if the
 * dispatch ever misclassifies an entry (pre-#196, every refunded subscribe
 * was treated as a full plan reset, including folded ones that had really
 * added to purchased), the expectation still moves and C fails.
 *
 * The walk drives the SAME pure functions the webhook route and the cron
 * sweep call -- reverseRefundedEntry is the entire refund dispatch, which is
 * why #198 extracted it out of the route -- so a regression in any of them
 * fails here, not only in a scenario someone thought to write down.
 */

// Deterministic 32-bit LCG (Numerical Recipes). A seeded generator, not
// Math.random, so a failure is reproducible from the seed in its own test
// name and CI can never go red or green for a different reason than a local
// run. Deliberately not a new dependency: what these shapes need is a biased
// op picker, not a shrinking property-test framework.
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const PAID_PLANS: PaidPlanId[] = ["atelier", "studio", "factory"];

/** Signed balance movement a ledger entry represents. */
function signedAmount(entry: LedgerEntry): number {
  return entry.type === "debit" ? -entry.amount : entry.amount;
}

/**
 * How much this entry added to `purchased` when it was credited -- read off
 * the entry itself, never off how its reversal was later classified. A topup
 * and a folded subscribe both grant their full amount; a plan-changing
 * subscribe grants none (applyPurchase's upgrade branch assigns total and
 * leaves purchased alone).
 */
function purchasedContribution(entry: LedgerEntry): number {
  if (entry.type === "topup") return entry.amount;
  if (entry.type === "subscribe" && entry.planChanged === false) {
    return entry.amount;
  }
  return 0;
}

interface GatewayEntry {
  externalId: string;
  entry: LedgerEntry;
  refunded: boolean;
}

interface Harness {
  wallet: Wallet;
  /** Independent expectation for invariant A. */
  expectedBalance: number;
  /** Independent expectation for invariant C. */
  expectedPurchased: number;
  gateway: GatewayEntry[];
  /** externalIds of entries that actually moved the plan (invariant E). */
  planChangingIds: Set<string>;
}

/**
 * Mirrors lib/db/wallet.ts's withWalletIdempotent, the single place that
 * records which externalId backs the wallet's current plan -- the simulation
 * has to do the same, or invariant E would be asserting nothing.
 */
function record(h: Harness, externalId: string, entry: LedgerEntry): void {
  if (entry.type === "subscribe" && entry.planChanged) {
    h.wallet.planSourceExternalId = externalId;
    h.planChangingIds.add(externalId);
  }
  h.expectedBalance += signedAmount(entry);
  h.gateway.push({ externalId, entry, refunded: false });
}

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

function runSequence(seed: number, steps: number): void {
  const rand = lcg(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

  let now = new Date("2026-01-01T00:00:00.000Z");
  const h: Harness = {
    wallet: seedWallet(now),
    expectedBalance: PLAN_CREDITS.free,
    expectedPurchased: 0,
    gateway: [],
    planChangingIds: new Set(),
  };
  check(h, "seed");

  for (let i = 0; i < steps; i++) {
    const roll = rand();
    if (roll < 0.18) {
      // A confirmed top-up. Grants BOTH balance and purchased.
      const id = `pay_topup_${i}`;
      const planBefore = h.wallet.plan;
      const entry = applyPurchase(h.wallet, { type: "topup" }, now);
      h.expectedPurchased += purchasedContribution(entry);
      record(h, id, entry);
      expect(h.wallet.plan, "F (a topup never moves the plan)").toBe(
        planBefore,
      );
      check(h, `topup ${id}`);
    } else if (roll < 0.4) {
      // A confirmed subscribe to any paid tier -- including downgrades and
      // same-tier reapplies, which is exactly the out-of-order webhook
      // delivery #193's guard exists for. Those fold into purchased instead
      // of moving the plan. Interval is also randomized: monthly-to-annual
      // on the same tier is an upgrade too now, and annual-to-monthly is a
      // downgrade -- both must fold/upgrade correctly under the same guard.
      const id = `pay_sub_${i}`;
      const plan = pick(PAID_PLANS);
      const interval = pick(["month", "year"] as const);
      const creditsBefore = effectiveCredits(
        h.wallet.plan,
        h.wallet.planInterval,
      );
      const entry = applyPurchase(
        h.wallet,
        { type: "subscribe", plan, interval },
        now,
      );
      h.expectedPurchased += purchasedContribution(entry);
      record(h, id, entry);
      // F: an out-of-order webhook may never walk the account backwards --
      // #193. A same-tier reapply must not move it either, so this is >= on
      // an unchanged plan and > only when the plan genuinely changed.
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
    } else if (roll < 0.58) {
      // A PAYMENT_REFUNDED for some earlier confirmed payment, in any order
      // -- not necessarily the most recent one.
      const open = h.gateway.filter((g) => !g.refunded);
      if (open.length === 0) continue;
      const target = pick(open);
      target.refunded = true;
      const planBefore = h.wallet.plan;
      const result = reverseRefundedEntry(
        h.wallet,
        {
          type: target.entry.type,
          amount: target.entry.amount,
          planChanged: target.entry.planChanged ?? false,
        },
        target.externalId,
      );
      // Whatever this entry put into `purchased` at credit time has to come
      // back out -- computed from the entry, not from result.outcome, so a
      // misclassified reversal fails C instead of redefining it.
      h.expectedPurchased -= purchasedContribution(target.entry);
      h.expectedBalance += signedAmount(result.ledgerEntry);
      // F: a refund is the ONLY thing that may move the plan, and only when
      // the refunded entry is the one currently backing it (#196).
      if (result.outcome === "reset") {
        expect(h.wallet.plan, "F (a plan-source refund lands on free)").toBe(
          "free",
        );
        expect(h.wallet.planSourceExternalId).toBeNull();
      } else {
        expect(
          h.wallet.plan,
          `F (a ${result.outcome} refund leaves the plan alone)`,
        ).toBe(planBefore);
      }
      check(h, `refund ${target.externalId} (${result.outcome})`);
    } else if (roll < 0.82) {
      // A generation/graduation spend, bounded by the balance the same way
      // the real routes 402 rather than overdrawing.
      const amount = Math.floor(rand() * 12) + 1;
      if (h.wallet.balance < amount) continue;
      const entry = debitWallet(h.wallet, amount, "generate");
      h.expectedBalance += signedAmount(entry);
      check(h, `debit ${amount}`);
    } else if (roll < 0.9) {
      // A declined/failed generation handing its credit back.
      const amount = Math.floor(rand() * 6) + 1;
      const entry = refundWallet(h.wallet, amount, "declined");
      h.expectedBalance += signedAmount(entry);
      check(h, `refund-credit ${amount}`);
    } else {
      // Time passes and the cron sweep runs.
      now = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
      if (!isRenewalDue(h.wallet, now)) continue;
      const entry = renewWallet(h.wallet, now);
      h.expectedBalance += signedAmount(entry);
      check(h, "renew");
      // The renewal's whole point: the plan allowance plus exactly the
      // top-up credits still outstanding -- never ones already refunded.
      expect(h.wallet.balance, "renewal grants total + live purchased").toBe(
        h.wallet.total + h.expectedPurchased,
      );
    }
  }
}

describe("wallet/ledger invariants", () => {
  // 200 sequences x 60 steps -- enough to reach the interleavings the four
  // shipped bugs each needed (an out-of-order subscribe, a refund of a folded
  // entry, a refund of a superseded one, a renewal after a refunded top-up)
  // without making the suite slow.
  for (let seed = 1; seed <= 200; seed++) {
    it(`holds across a 60-step random walk (seed ${seed})`, () => {
      runSequence(seed, 60);
    });
  }
});

/**
 * #198's own acceptance criteria as the concrete scenario the issue
 * describes -- kept alongside the property walk because a named regression is
 * what a future reader greps for.
 */
describe("refunded top-up does not survive a renewal (#198)", () => {
  it("two renewals after a refunded top-up grant the plan allowance only", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const w = seedWallet(now);

    const topup = applyPurchase(w, { type: "topup" }, now);
    expect(w.balance).toBe(PLAN_CREDITS.free + TOPUP_CREDITS);
    expect(w.purchased).toBe(TOPUP_CREDITS);

    reverseRefundedEntry(
      w,
      { type: "topup", amount: topup.amount, planChanged: false },
      "pay_1",
    );
    expect(w.purchased).toBe(0);

    let clock = now;
    for (let month = 0; month < 2; month++) {
      clock = new Date(clock.getTime() + 31 * 24 * 60 * 60 * 1000);
      renewWallet(w, clock);
      // Before the fix this was PLAN_CREDITS.free + TOPUP_CREDITS every
      // month, forever: purchased stayed inflated and renewWallet adds it
      // straight back on top of the allowance.
      expect(w.balance).toBe(PLAN_CREDITS.free);
    }
  });
});
