import type { PlanId } from "@/lib/types";

export interface Wallet {
  plan: PlanId;
  balance: number;
  total: number;
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

export function applyPurchase(
  wallet: Wallet,
  type: "topup" | "subscribe",
  now: Date,
): LedgerEntry {
  if (type === "topup") {
    wallet.balance += 100;
    return { type: "topup", amount: 100, balanceAfter: wallet.balance };
  }
  wallet.plan = "atelier";
  wallet.balance = 500;
  wallet.total = 500;
  wallet.renewsAt = new Date(now.getTime() + 30 * DAY_MS);
  return { type: "subscribe", amount: 500, balanceAfter: wallet.balance };
}

// Called by the renewal cron (scripts/cron-renew.ts) for wallets past renewsAt.
// Rolls forward from the *scheduled* renewsAt, not `now`, so a cron run that's
// a few hours (or days) late doesn't push the next renewal date out by the delay.
export function renewWallet(wallet: Wallet, now: Date): LedgerEntry {
  wallet.balance = wallet.total;
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
