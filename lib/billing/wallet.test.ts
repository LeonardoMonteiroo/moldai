import { describe, it, expect } from "vitest";
import {
  seedWallet,
  debitWallet,
  refundWallet,
  applyPurchase,
  renewWallet,
  renewsInDays,
  isRenewalDue,
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
    const entry = applyPurchase(w, "topup", NOW);
    expect(w.balance).toBe(130);
    expect(w.purchased).toBe(100);
    expect(w.renewsAt).toEqual(renewsBefore);
    expect(entry).toEqual({ type: "topup", amount: 100, balanceAfter: 130 });
  });
  it("subscribe resets to the Ateliê plan, 500/500, renews in 30 days", () => {
    const w = seedWallet(NOW);
    w.balance = 10;
    const entry = applyPurchase(w, "subscribe", NOW);
    expect(w.plan).toBe("atelier");
    expect(w.balance).toBe(500);
    expect(w.total).toBe(500);
    expect(w.renewsAt).toEqual(new Date("2026-09-16T12:00:00.000Z"));
    expect(entry).toEqual({
      type: "subscribe",
      amount: 500,
      balanceAfter: 500,
    });
  });
  it("subscribe keeps any already-purchased top-up credits on top of the new plan allowance (#37)", () => {
    const w = seedWallet(NOW);
    applyPurchase(w, "topup", NOW); // balance 130, purchased 100
    const entry = applyPurchase(w, "subscribe", NOW);
    expect(w.balance).toBe(600); // 500 plan + 100 purchased, not just 500
    expect(w.purchased).toBe(100);
    expect(entry.balanceAfter).toBe(600);
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
    expect(entry).toEqual({ type: "renew", amount: 30, balanceAfter: 30 });
  });
  it("rolls forward from the scheduled date, not from now (no drift on late cron runs)", () => {
    const w = seedWallet(NOW);
    w.renewsAt = new Date("2026-08-10T00:00:00.000Z"); // 7 days overdue
    renewWallet(w, NOW);
    expect(w.renewsAt).toEqual(new Date("2026-09-09T00:00:00.000Z"));
  });
  it("leaves purchased top-up credits untouched — 'use it or lose it' governs only the plan allowance (#37)", () => {
    const w = seedWallet(NOW);
    applyPurchase(w, "topup", NOW); // balance 130, total 30, purchased 100
    const entry = renewWallet(w, NOW);
    expect(w.balance).toBe(130); // total (30) + purchased (100), not reset to 30
    expect(w.purchased).toBe(100);
    expect(entry).toEqual({ type: "renew", amount: 30, balanceAfter: 130 });
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
