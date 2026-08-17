import { describe, it, expect } from "vitest";
import {
  seedWallet,
  debitWallet,
  refundWallet,
  applyPurchase,
  renewWallet,
  renewsInDays,
} from "./wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");

describe("seedWallet", () => {
  it("Ateliê plan, 320/500, renews in 12 days", () => {
    const w = seedWallet(NOW);
    expect(w.plan).toBe("atelier");
    expect(w.planLabel).toBe("Ateliê");
    expect(w.balance).toBe(320);
    expect(w.total).toBe(500);
    expect(w.renewsAt).toEqual(new Date("2026-08-29T12:00:00.000Z"));
  });
});

describe("debitWallet / refundWallet", () => {
  it("debit reduces balance and returns a ledger entry with balanceAfter", () => {
    const w = seedWallet(NOW);
    const entry = debitWallet(w, 4, "generate");
    expect(w.balance).toBe(316);
    expect(entry).toEqual({
      type: "debit",
      amount: 4,
      balanceAfter: 316,
      reason: "generate",
    });
  });
  it("refund increases balance and returns a ledger entry", () => {
    const w = seedWallet(NOW);
    debitWallet(w, 4, "generate");
    const entry = refundWallet(w, 4, "generate-error");
    expect(w.balance).toBe(320);
    expect(entry.type).toBe("refund");
    expect(entry.balanceAfter).toBe(320);
  });
});

describe("applyPurchase", () => {
  it("topup adds 100 to the balance, plan/renewsAt untouched", () => {
    const w = seedWallet(NOW);
    const renewsBefore = w.renewsAt;
    const entry = applyPurchase(w, "topup", NOW);
    expect(w.balance).toBe(420);
    expect(w.renewsAt).toEqual(renewsBefore);
    expect(entry).toEqual({ type: "topup", amount: 100, balanceAfter: 420 });
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
});

describe("renewWallet", () => {
  it("resets balance to total and rolls renewsAt forward 30 days from the scheduled date", () => {
    const w = seedWallet(NOW);
    w.balance = 12;
    w.renewsAt = new Date("2026-08-17T00:00:00.000Z");
    const entry = renewWallet(w, NOW);
    expect(w.balance).toBe(500);
    expect(w.renewsAt).toEqual(new Date("2026-09-16T00:00:00.000Z"));
    expect(entry).toEqual({ type: "renew", amount: 500, balanceAfter: 500 });
  });
  it("rolls forward from the scheduled date, not from now (no drift on late cron runs)", () => {
    const w = seedWallet(NOW);
    w.renewsAt = new Date("2026-08-10T00:00:00.000Z"); // 7 days overdue
    renewWallet(w, NOW);
    expect(w.renewsAt).toEqual(new Date("2026-09-09T00:00:00.000Z"));
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
