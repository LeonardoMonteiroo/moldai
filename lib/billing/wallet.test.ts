import { describe, it, expect } from "vitest";
import {
  seedWallet,
  debitWallet,
  refundWallet,
  applyPurchase,
  reverseSubscription,
  reversePurchasedCredits,
  reverseRefundedSubscription,
  reverseRefundedEntry,
  renewWallet,
  renewsInDays,
  isRenewalDue,
  type LedgerEntry,
} from "./wallet";
import { PLAN_CREDITS, TOPUP_CREDITS } from "./plans";

const NOW = new Date("2026-08-17T12:00:00.000Z");

describe("seedWallet", () => {
  it("Free plan, 30/30, renews in 30 days", () => {
    const w = seedWallet(NOW);
    expect(w.plan).toBe("free");
    expect(w.balance).toBe(30);
    expect(w.total).toBe(30);
    expect(w.purchased).toBe(0);
    expect(w.renewsAt).toEqual(new Date("2026-09-16T12:00:00.000Z"));
    expect(w.planSourceExternalId).toBeNull();
  });
});

describe("debitWallet / refundWallet", () => {
  it("debit reduces balance and returns a ledger entry with balanceAfter", () => {
    const w = seedWallet(NOW);
    const entry = debitWallet(w, 4, "generate");
    expect(w.balance).toBe(26);
    expect(entry).toEqual({
      type: "debit",
      amount: 4,
      balanceAfter: 26,
      reason: "generate",
    });
  });
  it("refund increases balance and returns a ledger entry", () => {
    const w = seedWallet(NOW);
    debitWallet(w, 4, "generate");
    const entry = refundWallet(w, 4, "generate-error");
    expect(w.balance).toBe(30);
    expect(entry.type).toBe("refund");
    expect(entry.balanceAfter).toBe(30);
  });
});

describe("applyPurchase", () => {
  it("topup adds 100 to the balance and to the purchased carry-over, plan/renewsAt untouched", () => {
    const w = seedWallet(NOW);
    const renewsBefore = w.renewsAt;
    const entry = applyPurchase(w, { type: "topup" }, NOW);
    expect(w.balance).toBe(130);
    expect(w.purchased).toBe(100);
    expect(w.renewsAt).toEqual(renewsBefore);
    expect(entry).toEqual({ type: "topup", amount: 100, balanceAfter: 130 });
  });
  it("subscribe resets to the Ateliê plan, 500/500, renews in 30 days", () => {
    const w = seedWallet(NOW);
    w.balance = 10;
    const entry = applyPurchase(w, { type: "subscribe", plan: "atelier" }, NOW);
    expect(w.plan).toBe("atelier");
    expect(w.balance).toBe(500);
    expect(w.total).toBe(500);
    expect(w.renewsAt).toEqual(new Date("2026-09-16T12:00:00.000Z"));
    // #38: amount is the balance delta (500 - 10), not the plan size.
    expect(entry).toEqual({
      type: "subscribe",
      amount: 490,
      balanceAfter: 500,
      reason: "atelier",
      // #196: this call genuinely moved plan/total.
      planChanged: true,
    });
  });
  it("subscribe keeps any already-purchased top-up credits on top of the new plan allowance (#37)", () => {
    const w = seedWallet(NOW);
    applyPurchase(w, { type: "topup" }, NOW); // balance 130, purchased 100
    const entry = applyPurchase(w, { type: "subscribe", plan: "atelier" }, NOW);
    expect(w.balance).toBe(600); // 500 plan + 100 purchased, not just 500
    expect(w.purchased).toBe(100);
    // #38: amount is the delta (600 - 130), not the flat plan size.
    expect(entry.amount).toBe(470);
    expect(entry.balanceAfter).toBe(600);
  });

  // #9: studio and factory are now real subscribe destinations, not just
  // atelier -- each takes its own PLAN_CREDITS total.
  it("subscribe to studio sets plan/total to 2000 and tags the ledger reason", () => {
    const w = seedWallet(NOW);
    const entry = applyPurchase(w, { type: "subscribe", plan: "studio" }, NOW);
    expect(w.plan).toBe("studio");
    expect(w.balance).toBe(2000);
    expect(w.total).toBe(2000);
    expect(w.renewsAt).toEqual(new Date("2026-09-16T12:00:00.000Z"));
    expect(entry).toEqual({
      type: "subscribe",
      amount: 2000 - 30,
      balanceAfter: 2000,
      reason: "studio",
      planChanged: true,
    });
  });

  it("subscribe to factory sets plan/total to 10000 and tags the ledger reason", () => {
    const w = seedWallet(NOW);
    const entry = applyPurchase(w, { type: "subscribe", plan: "factory" }, NOW);
    expect(w.plan).toBe("factory");
    expect(w.balance).toBe(10000);
    expect(w.total).toBe(10000);
    expect(entry.reason).toBe("factory");
  });

  // Decision 1 (issue #9): an upgrade never destroys credits already on the
  // wallet from a prior top-up -- balance ends at the new plan's total plus
  // whatever was purchased, which happens to equal max(oldBalance, newTotal)
  // whenever purchased alone (without the plan allowance) doesn't exceed it.
  it("an upgrade never drops a balance that a prior top-up had pushed above the new plan's total", () => {
    const w = seedWallet(NOW);
    applyPurchase(w, { type: "subscribe", plan: "atelier" }, NOW); // balance 500
    applyPurchase(w, { type: "topup" }, NOW); // balance 600, purchased 100
    w.balance = 700; // simulate several top-ups pushing balance to 700
    w.purchased = 200;
    applyPurchase(w, { type: "subscribe", plan: "studio" }, NOW); // 2000 total
    // 2000 (studio total) + 200 (purchased) = 2200, comfortably above the
    // pre-upgrade 700 -- the balance moved up, never down.
    expect(w.balance).toBe(2200);
    expect(w.balance).toBeGreaterThanOrEqual(700);
  });

  // #193: out-of-order webhook delivery -- a lower/equal-plan subscribe
  // payment confirmed after a higher one already landed must not move the
  // wallet backwards. The mock path's synchronous plan_not_upgradable check
  // has no equivalent once the mutation happens async from a webhook, so
  // applyPurchase itself has to be the one place this can't be bypassed.
  describe("subscribe monotonicity guard (#193)", () => {
    it("a lower-plan subscribe confirmed after a higher one never downgrades plan/total/renewsAt", () => {
      const w = seedWallet(NOW);
      applyPurchase(w, { type: "subscribe", plan: "factory" }, NOW);
      const renewsAtAfterFactory = w.renewsAt;
      // A later timestamp, simulating the delayed/reordered webhook -- if
      // renewsAt moved at all it would prove the guard let the lower plan
      // through.
      const LATER = new Date("2026-08-20T12:00:00.000Z");
      const entry = applyPurchase(
        w,
        { type: "subscribe", plan: "studio" },
        LATER,
      );
      expect(w.plan).toBe("factory");
      expect(w.total).toBe(10000);
      expect(w.renewsAt).toEqual(renewsAtAfterFactory);
      // The payment is still honoured: studio's own credit value (2000) is
      // folded into balance/purchased rather than silently dropped.
      expect(w.balance).toBe(12000); // 10000 (factory) + 2000 (studio, as purchased)
      expect(w.purchased).toBe(2000);
      expect(entry).toEqual({
        type: "subscribe",
        amount: 2000,
        balanceAfter: 12000,
        reason: "studio",
        // #196: folded into `purchased`, never touched plan/total -- the
        // marker a later refund of THIS entry needs to reverse it precisely
        // (reversePurchasedCredits) rather than resetting the plan.
        planChanged: false,
      });
    });

    it("a same-tier subscribe confirmation is also refused as a plan change, but still credits the payment", () => {
      const w = seedWallet(NOW);
      applyPurchase(w, { type: "subscribe", plan: "atelier" }, NOW); // balance 500
      const renewsAtAfterFirst = w.renewsAt;
      const entry = applyPurchase(
        w,
        { type: "subscribe", plan: "atelier" },
        new Date("2026-08-20T12:00:00.000Z"),
      );
      expect(w.plan).toBe("atelier");
      expect(w.total).toBe(500);
      expect(w.renewsAt).toEqual(renewsAtAfterFirst);
      expect(w.balance).toBe(1000); // 500 + 500, both honoured
      expect(w.purchased).toBe(500);
      expect(entry.amount).toBe(500);
    });

    it("purchased credits folded in by a superseded subscribe survive a later real upgrade, same as any other top-up (#37)", () => {
      const w = seedWallet(NOW);
      applyPurchase(w, { type: "subscribe", plan: "factory" }, NOW); // 10000
      applyPurchase(w, { type: "subscribe", plan: "studio" }, NOW); // superseded: +2000 purchased
      expect(w.purchased).toBe(2000);
      // A same-tier factory re-confirmation isn't an upgrade either (equal
      // credits, not strictly greater) -- it also stays folded, for its
      // own full plan value, rather than being treated as a plan reset.
      applyPurchase(w, { type: "subscribe", plan: "factory" }, NOW);
      expect(w.plan).toBe("factory");
      expect(w.purchased).toBe(12000); // 2000 + 10000
      expect(w.balance).toBe(22000); // 10000 + 2000 + 10000
    });
  });
});

// #6: a PAYMENT_REFUNDED for a subscribe purchase has to undo more than the
// balance -- debitWallet alone would leave plan/total on "atelier"/500
// forever, so a refunded subscriber would keep renewing at the full paid
// allowance every month even though the payment that granted it was given
// back.
describe("reverseSubscription", () => {
  it("debits the balance and downgrades plan/total back to the free tier", () => {
    const w = seedWallet(NOW);
    applyPurchase(w, { type: "subscribe", plan: "atelier" }, NOW); // plan atelier, balance 500, total 500
    const entry = reverseSubscription(w, 500);
    expect(w.plan).toBe("free");
    expect(w.total).toBe(30);
    expect(w.balance).toBe(0);
    expect(entry).toEqual({
      type: "debit",
      amount: 500,
      balanceAfter: 0,
      reason: "gateway_refund",
    });
  });

  it("leaves purchased top-up credits untouched -- a refunded subscription didn't erase a prior top-up", () => {
    const w = seedWallet(NOW);
    applyPurchase(w, { type: "topup" }, NOW); // balance 130, purchased 100
    applyPurchase(w, { type: "subscribe", plan: "atelier" }, NOW); // balance 600 (500 + 100 purchased)
    reverseSubscription(w, 500);
    expect(w.balance).toBe(100); // 600 - 500, the purchased credits remain
    expect(w.purchased).toBe(100);
    expect(w.plan).toBe("free");
  });

  it("clears planSourceExternalId -- the plan it pointed at no longer exists (#196)", () => {
    const w = seedWallet(NOW);
    applyPurchase(w, { type: "subscribe", plan: "atelier" }, NOW);
    w.planSourceExternalId = "pay_1";
    reverseSubscription(w, 500);
    expect(w.planSourceExternalId).toBeNull();
  });
});

// #196: reverses applyPurchase's "folded" subscribe branch (#193's
// monotonicity guard) -- it added `amount` to BOTH `purchased` and
// `balance`, never touched plan/total, so undoing it must mirror exactly
// that, regardless of what plan the wallet is on now.
describe("reversePurchasedCredits", () => {
  it("subtracts the amount from both balance and purchased, leaves plan/total untouched", () => {
    const w = seedWallet(NOW);
    applyPurchase(w, { type: "subscribe", plan: "factory" }, NOW); // plan factory, balance 10000
    applyPurchase(w, { type: "subscribe", plan: "studio" }, NOW); // folded: +2000 purchased/balance
    expect(w.balance).toBe(12000);
    expect(w.purchased).toBe(2000);
    const entry = reversePurchasedCredits(w, 2000);
    expect(w.balance).toBe(10000);
    expect(w.purchased).toBe(0);
    expect(w.plan).toBe("factory"); // untouched -- this entry never set it
    expect(w.total).toBe(10000);
    expect(entry).toEqual({
      type: "debit",
      amount: 2000,
      balanceAfter: 10000,
      reason: "gateway_refund",
    });
  });
});

// #198: the topup half of the same operation. A topup adds to BOTH
// `purchased` and `balance`; reversing only the balance half (the plain
// debitWallet this used to be) left `purchased` inflated forever.
describe("reversePurchasedCredits (refunded topup, #198)", () => {
  it("returns purchased to its pre-topup value, not just balance", () => {
    const w = seedWallet(NOW);
    const before = { balance: w.balance, purchased: w.purchased };
    const topup = applyPurchase(w, { type: "topup" }, NOW);
    expect(w.purchased).toBe(TOPUP_CREDITS);

    reversePurchasedCredits(w, topup.amount);

    expect(w.purchased).toBe(before.purchased);
    expect(w.balance).toBe(before.balance);
  });

  it("a renewal after a refunded topup no longer regrants the refunded credits", () => {
    const w = seedWallet(NOW);
    const topup = applyPurchase(w, { type: "topup" }, NOW);
    debitWallet(w, 10, "generate");
    reversePurchasedCredits(w, topup.amount);

    // Past due, so the renewal actually runs.
    w.renewsAt = new Date(NOW.getTime() - 1000);
    renewWallet(w, NOW);

    // The plan allowance only -- exactly what a wallet that had never
    // bought (and been refunded) a topup would renew to.
    expect(w.balance).toBe(w.total);
    expect(w.purchased).toBe(0);
  });
});

// #198: the dispatch the webhook route delegates to wholesale, so these
// cases exercise the branch selection itself rather than a copy of it.
describe("reverseRefundedEntry", () => {
  it("routes a topup entry to the purchased-and-balance reversal", () => {
    const w = seedWallet(NOW);
    const topup = applyPurchase(w, { type: "topup" }, NOW);

    const result = reverseRefundedEntry(
      w,
      { type: "topup", amount: topup.amount, planChanged: false },
      "pay_1",
    );

    expect(result.outcome).toBe("topup");
    expect(w.purchased).toBe(0);
    expect(w.balance).toBe(PLAN_CREDITS.free);
  });

  it("routes a subscribe entry to the plan-source decision", () => {
    const w = seedWallet(NOW);
    const sub = applyPurchase(w, { type: "subscribe", plan: "atelier" }, NOW);
    w.planSourceExternalId = "pay_1";

    const result = reverseRefundedEntry(
      w,
      { type: "subscribe", amount: sub.amount, planChanged: true },
      "pay_1",
    );

    expect(result.outcome).toBe("reset");
    expect(w.plan).toBe("free");
  });

  it("degrades an unrecognised entry type to a plain balance debit", () => {
    const w = seedWallet(NOW);

    const result = reverseRefundedEntry(
      w,
      { type: "renew", amount: 5, planChanged: false },
      "pay_1",
    );

    expect(result.outcome).toBe("other");
    expect(w.balance).toBe(PLAN_CREDITS.free - 5);
    expect(w.purchased).toBe(0);
  });
});

// #196: the pure decision reverseRefundedSubscription makes, reproducing
// this issue's own three acceptance-criteria scenarios directly against the
// wallet model, independent of the webhook route/DB layer.
describe("reverseRefundedSubscription", () => {
  it("resets to free when the refunded entry IS the wallet's current plan source", () => {
    const w = seedWallet(NOW);
    applyPurchase(w, { type: "subscribe", plan: "atelier" }, NOW); // balance/total 500
    w.planSourceExternalId = "pay_atelier";
    const { outcome, ledgerEntry } = reverseRefundedSubscription(
      w,
      { amount: 500, planChanged: true },
      "pay_atelier",
    );
    expect(outcome).toBe("reset");
    expect(w.plan).toBe("free");
    expect(w.total).toBe(30);
    expect(w.planSourceExternalId).toBeNull();
    expect(ledgerEntry).toEqual({
      type: "debit",
      amount: 500,
      balanceAfter: w.balance,
      reason: "gateway_refund",
    });
  });

  // The issue's own acceptance criterion: wallet upgraded to factory, then a
  // separate, lower-plan subscribe payment is confirmed (folded into
  // purchased per #193), then THAT payment is refunded -- the wallet must
  // stay on factory, not drop to free.
  it("undoes exactly the folded amount and leaves the plan on factory when the refunded entry never set it", () => {
    const w = seedWallet(NOW);
    applyPurchase(w, { type: "subscribe", plan: "factory" }, NOW); // plan factory
    w.planSourceExternalId = "pay_factory";
    applyPurchase(w, { type: "subscribe", plan: "studio" }, NOW); // folded: +2000
    expect(w.balance).toBe(12000);
    const { outcome, ledgerEntry } = reverseRefundedSubscription(
      w,
      { amount: 2000, planChanged: false },
      "pay_studio_superseded",
    );
    expect(outcome).toBe("folded");
    expect(w.plan).toBe("factory");
    expect(w.total).toBe(10000);
    expect(w.balance).toBe(10000);
    expect(w.purchased).toBe(0);
    expect(w.planSourceExternalId).toBe("pay_factory"); // untouched
    expect(ledgerEntry.amount).toBe(2000);
  });

  // The chain-of-upgrades case named in the issue's own Context section:
  // refund the ORIGINAL atelier payment after the account later, separately,
  // upgraded to factory. atelier really did change the plan when it ran
  // (planChanged: true) -- but it is no longer wallet.planSourceExternalId,
  // because factory's own later upgrade overwrote plan/total wholesale.
  // Nothing about atelier's contribution survives to claw back.
  it("leaves the wallet untouched when a plan-changing entry has since been superseded by a later real upgrade", () => {
    const w = seedWallet(NOW);
    applyPurchase(w, { type: "subscribe", plan: "atelier" }, NOW); // pay_atelier would set planSourceExternalId here
    applyPurchase(w, { type: "subscribe", plan: "factory" }, NOW); // real upgrade -- overwrites plan/total
    w.planSourceExternalId = "pay_factory";
    const balanceBefore = w.balance;
    const { outcome, ledgerEntry } = reverseRefundedSubscription(
      w,
      { amount: 490, planChanged: true }, // atelier's own original entry
      "pay_atelier",
    );
    expect(outcome).toBe("superseded");
    expect(w.plan).toBe("factory");
    expect(w.total).toBe(10000);
    expect(w.balance).toBe(balanceBefore); // untouched
    expect(w.planSourceExternalId).toBe("pay_factory"); // untouched
    expect(ledgerEntry).toEqual({
      type: "debit",
      amount: 0,
      balanceAfter: balanceBefore,
      reason: "gateway_refund_superseded",
    });
  });
});

describe("renewWallet", () => {
  it("resets balance to total and rolls renewsAt forward 30 days from the scheduled date", () => {
    const w = seedWallet(NOW);
    w.balance = 12;
    w.renewsAt = new Date("2026-08-17T00:00:00.000Z");
    const entry = renewWallet(w, NOW);
    expect(w.balance).toBe(30);
    expect(w.renewsAt).toEqual(new Date("2026-09-16T00:00:00.000Z"));
    // #38: amount is the delta the renewal actually moved (12 -> 30 is +18),
    // not the flat plan size — the bug this issue closes.
    expect(entry).toEqual({ type: "renew", amount: 18, balanceAfter: 30 });
  });
  it("rolls forward from the scheduled date, not from now (no drift on late cron runs)", () => {
    const w = seedWallet(NOW);
    w.renewsAt = new Date("2026-08-10T00:00:00.000Z"); // 7 days overdue
    renewWallet(w, NOW);
    expect(w.renewsAt).toEqual(new Date("2026-09-09T00:00:00.000Z"));
  });
  it("leaves purchased top-up credits untouched — 'use it or lose it' governs only the plan allowance (#37)", () => {
    const w = seedWallet(NOW);
    applyPurchase(w, { type: "topup" }, NOW); // balance 130, total 30, purchased 100
    const entry = renewWallet(w, NOW);
    expect(w.balance).toBe(130); // total (30) + purchased (100), not reset to 30
    expect(w.purchased).toBe(100);
    // #38: the balance was already at the post-renewal value (130), so the
    // renewal moved it by 0 — a flat plan-size amount would wrongly claim +30.
    expect(entry).toEqual({ type: "renew", amount: 0, balanceAfter: 130 });
  });
});

// #38: amount meant "delta" for debit/refund/topup but "new absolute
// balance" for renew/subscribe, so summing an append-only ledger — the
// obvious way to audit one — never reproduced Wallet.balance for any account
// that had ever renewed or subscribed. This drives every entry type through
// one wallet and asserts the running sum tracks the balance throughout,
// using the same sign convention UsageSection.tsx renders with (debit is the
// only type that *reduces* balance).
describe("ledger amount invariant", () => {
  it("summing every entry's signed amount reproduces the balance movement, across all entry types", () => {
    const w = seedWallet(NOW);
    let runningBalance = w.balance;
    const entries: LedgerEntry[] = [];

    entries.push(debitWallet(w, 4, "generate"));
    entries.push(refundWallet(w, 4, "generate-error"));
    entries.push(applyPurchase(w, { type: "topup" }, NOW)); // balance 130, purchased 100
    w.renewsAt = new Date("2026-08-01T00:00:00.000Z"); // force a renewal to be due
    entries.push(renewWallet(w, NOW)); // total 30 + purchased 100 = still 130
    entries.push(applyPurchase(w, { type: "subscribe", plan: "atelier" }, NOW)); // 500 + purchased 100

    for (const entry of entries) {
      runningBalance += entry.type === "debit" ? -entry.amount : entry.amount;
      expect(runningBalance).toBe(entry.balanceAfter);
    }
    expect(runningBalance).toBe(w.balance);
  });
});

// #40: dueness used to be decided once, outside any lock, then acted on
// unconditionally inside the row-locked transaction with no re-check -- a
// second process (or a subscribe purchase) racing between the snapshot and
// the lock renewed an already-renewed wallet again, silently costing the
// user a whole month's allowance.
describe("isRenewalDue", () => {
  it("is due when renewsAt is in the past", () => {
    const w = seedWallet(NOW);
    w.renewsAt = new Date(NOW.getTime() - 86_400_000);
    expect(isRenewalDue(w, NOW)).toBe(true);
  });
  it("is due exactly at renewsAt (inclusive, matching the findMany lte query)", () => {
    const w = seedWallet(NOW);
    w.renewsAt = NOW;
    expect(isRenewalDue(w, NOW)).toBe(true);
  });
  it("is not due when renewsAt is in the future", () => {
    const w = seedWallet(NOW);
    w.renewsAt = new Date(NOW.getTime() + 86_400_000);
    expect(isRenewalDue(w, NOW)).toBe(false);
  });
  it("is not due when renewsAt is null", () => {
    const w = seedWallet(NOW);
    w.renewsAt = null;
    expect(isRenewalDue(w, NOW)).toBe(false);
  });
  it("a wallet just renewed by a racing process is no longer due for a second renewal", () => {
    const w = seedWallet(NOW);
    w.renewsAt = new Date("2026-08-10T00:00:00.000Z"); // overdue, due at NOW
    expect(isRenewalDue(w, NOW)).toBe(true);
    renewWallet(w, NOW); // a "concurrent process" wins the lock first
    // Re-checking against the now-renewed row is exactly what stops a
    // second renewal from ever calling renewWallet again for this pass.
    expect(isRenewalDue(w, NOW)).toBe(false);
  });
});

describe("renewsInDays", () => {
  it("rounds up the days remaining until renewsAt", () => {
    const w = seedWallet(NOW);
    w.renewsAt = new Date(NOW.getTime() + 11.2 * 86_400_000);
    expect(renewsInDays(w, NOW)).toBe(12);
  });
  it("never returns negative — clamps at 0 for an overdue renewsAt", () => {
    const w = seedWallet(NOW);
    w.renewsAt = new Date(NOW.getTime() - 86_400_000);
    expect(renewsInDays(w, NOW)).toBe(0);
  });
});
