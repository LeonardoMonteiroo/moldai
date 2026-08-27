import { describe, it, expect } from "vitest";
import {
  seedWallet,
  debitWallet,
  refundWallet,
  applyPurchase,
  reverseSubscription,
  renewWallet,
  renewsInDays,
  isRenewalDue,
  type LedgerEntry,
} from "./wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");

describe("seedWallet", () => {
  it("Free plan, 30/30, renews in 30 days", () => {
    const w = seedWallet(NOW);
    expect(w.plan).toBe("free");
    expect(w.balance).toBe(30);
    expect(w.total).toBe(30);
    expect(w.purchased).toBe(0);
    expect(w.renewsAt).toEqual(new Date("2026-09-16T12:00:00.000Z"));
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
      reason: "asaas_refund",
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
