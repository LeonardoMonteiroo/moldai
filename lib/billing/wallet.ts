import type { PlanId } from "@/lib/types";

export interface Wallet {
  plan: PlanId;
  balance: number;
  total: number;
  // Credits bought via top-up, carried over across renewals — #37: the
  // renewal sweep used to reset `balance` straight to `total`, deleting any
  // top-up bought outside the monthly allowance. `total` stays the plan
  // allowance only ("use it or lose it"); `purchased` never resets on renew.
  purchased: number;
  renewsAt: Date | null;
}

export type LedgerEntryType =
  "debit" | "refund" | "topup" | "subscribe" | "renew";

export interface LedgerEntry {
  type: LedgerEntryType;
  amount: number;
  balanceAfter: number;
  reason?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Every new account starts on the design's Free tier (5c: "Grátis · R$ 0 ·
// 30 créditos/mês"). Open sign-up must not hand a stranger a paid balance;
// applyPurchase("subscribe") is the upgrade path to Ateliê.
export function seedWallet(now: Date): Wallet {
  return {
    plan: "free",
    balance: 30,
    total: 30,
    purchased: 0,
    renewsAt: new Date(now.getTime() + 30 * DAY_MS),
  };
}

export function debitWallet(
  wallet: Wallet,
  amount: number,
  reason: string,
): LedgerEntry {
  wallet.balance -= amount;
  return { type: "debit", amount, balanceAfter: wallet.balance, reason };
}

export function refundWallet(
  wallet: Wallet,
  amount: number,
  reason: string,
): LedgerEntry {
  wallet.balance += amount;
  return { type: "refund", amount, balanceAfter: wallet.balance, reason };
}

export type PurchaseType = "topup" | "subscribe";

/**
 * Narrows an untrusted wire value to a PurchaseType. Required because the
 * route reads `type` off a JSON body: an unrecognised value used to fall into
 * applyPurchase's else branch and grant the Atelie plan for free.
 */
export function isPurchaseType(value: unknown): value is PurchaseType {
  return value === "topup" || value === "subscribe";
}

// Exhaustive on purpose -- the `never` binding makes a new PurchaseType member
// a compile error here instead of silently taking the subscribe branch.
export function applyPurchase(
  wallet: Wallet,
  type: PurchaseType,
  now: Date,
): LedgerEntry {
  switch (type) {
    case "topup":
      wallet.balance += 100;
      wallet.purchased += 100;
      return { type: "topup", amount: 100, balanceAfter: wallet.balance };
    case "subscribe":
      wallet.plan = "atelier";
      wallet.total = 500;
      // Plan allowance plus whatever top-up credits were already bought —
      // upgrading plans must not erase them either (#37).
      wallet.balance = 500 + wallet.purchased;
      wallet.renewsAt = new Date(now.getTime() + 30 * DAY_MS);
      return { type: "subscribe", amount: 500, balanceAfter: wallet.balance };
    default: {
      const exhaustive: never = type;
      throw new Error(`unhandled purchase type: ${String(exhaustive)}`);
    }
  }
}

// Called by the renewal cron (scripts/cron-renew.ts) for wallets past renewsAt.
// Rolls forward from the *scheduled* renewsAt, not `now`, so a cron run that's
// a few hours (or days) late doesn't push the next renewal date out by the delay.
export function renewWallet(wallet: Wallet, now: Date): LedgerEntry {
  // "Use it or lose it" resets only the monthly plan allowance; purchased
  // top-up credits (#37) are never touched by a renewal.
  wallet.balance = wallet.total + wallet.purchased;
  const base = wallet.renewsAt ?? now;
  wallet.renewsAt = new Date(base.getTime() + 30 * DAY_MS);
  return { type: "renew", amount: wallet.total, balanceAfter: wallet.balance };
}

// Wire-facing days-remaining, replaces the old static Credits.renewsInDays.
export function renewsInDays(wallet: Wallet, now: Date): number {
  if (!wallet.renewsAt) return 0;
  return Math.max(
    0,
    Math.ceil((wallet.renewsAt.getTime() - now.getTime()) / DAY_MS),
  );
}
