import type { PlanId } from "@/lib/types";
import {
  PLAN_CREDITS,
  TOPUP_CREDITS,
  isPlanUpgrade,
  type PaidPlanId,
} from "./plans";

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
  // #196: the externalId (Asaas payment id) of the ledger entry that
  // actually set the wallet's CURRENT plan/total -- i.e. the entry that ran
  // applyPurchase's real upgrade branch (LedgerEntry.planChanged: true) most
  // recently. Only ever written by the webhook route's handleConfirmed
  // (lib/billing/wallet.ts stays gateway-agnostic; it just reads/writes this
  // field like any other Wallet property), since only a gateway-originated
  // subscribe entry carries an externalId at all -- the mock purchase path
  // never sets it, and never needs to: it has no refund flow to disambiguate
  // for. null when the wallet is on the free tier, or was moved there by a
  // full reverseSubscription reset. reverseRefundedSubscription is the pure
  // decision of whether a given refunded entry IS this pointer.
  planSourceExternalId: string | null;
}

export type LedgerEntryType =
  "debit" | "refund" | "topup" | "subscribe" | "renew";

export interface LedgerEntry {
  type: LedgerEntryType;
  amount: number;
  balanceAfter: number;
  reason?: string;
  // #196: only meaningful on a `type: "subscribe"` entry -- true when this
  // specific call to applyPurchase actually moved plan/total (the upgrade
  // branch), false when it folded into `purchased` instead (the #193
  // monotonicity guard's branch). Persisted (Transaction.planChanged) so a
  // later refund can tell the two apart: a folded entry never touched the
  // plan and is fully, precisely reversible; a plan-changing entry might
  // still be the wallet's CURRENT plan source (full reset) or might have
  // since been superseded by a later real upgrade (its contribution to
  // `total` was overwritten wholesale, not additively, so nothing about it
  // survives to claw back -- see reverseRefundedSubscription).
  planChanged?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Every new account starts on the design's Free tier (5c: "Grátis · R$ 0 ·
// 30 créditos/mês"). Open sign-up must not hand a stranger a paid balance;
// applyPurchase({type: "subscribe", plan}) is the upgrade path to any paid
// tier (#9 -- atelier/studio/factory are all real destinations now, not
// just atelier).
export function seedWallet(now: Date): Wallet {
  return {
    plan: "free",
    balance: PLAN_CREDITS.free,
    total: PLAN_CREDITS.free,
    purchased: 0,
    renewsAt: new Date(now.getTime() + 30 * DAY_MS),
    planSourceExternalId: null,
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

// #9: a "subscribe" carries which paid tier it targets -- studio/factory
// are real destinations now, not just atelier. `plan` is a PaidPlanId
// (never "free": isPaidPlanId is the trust-boundary narrowing for the wire
// value that becomes this) so the type itself makes "subscribe to free"
// unrepresentable.
export type Purchase =
  { type: "topup" } | { type: "subscribe"; plan: PaidPlanId };

// Exhaustive on purpose -- the `never` binding makes a new Purchase variant
// a compile error here instead of silently taking the subscribe branch.
export function applyPurchase(
  wallet: Wallet,
  purchase: Purchase,
  now: Date,
): LedgerEntry {
  switch (purchase.type) {
    case "topup":
      wallet.balance += TOPUP_CREDITS;
      wallet.purchased += TOPUP_CREDITS;
      return {
        type: "topup",
        amount: TOPUP_CREDITS,
        balanceAfter: wallet.balance,
      };
    case "subscribe": {
      const planCredits = PLAN_CREDITS[purchase.plan];
      // #193: monotonicity guard. The mock path's plan_not_upgradable check
      // (app/api/billing/purchase/route.ts) only runs synchronously, at
      // checkout-creation time -- under PAYMENT_PROVIDER=asaas the wallet
      // is instead mutated later, from an async PAYMENT_CONFIRMED webhook
      // (handleConfirmed, app/api/billing/webhook/route.ts), and Asaas's
      // own docs guarantee at-least-once, OUT-OF-ORDER delivery. Two
      // distinct subscribe checkouts for different plans (studio, then
      // factory) can therefore have their webhooks arrive in either order.
      // Without this guard, a factory wallet that later processes a
      // delayed/reordered "studio" confirmation would be silently moved
      // backwards.
      //
      // Asaas's payload carries nothing this app trusts as a true ordering
      // signal -- the webhook route already documents that a payment's
      // `value` is never trusted, and there is no reliable "this payment
      // was confirmed before that one" timestamp to compare against a
      // per-wallet high-water mark without adding new persisted state. So
      // the only honest guard achievable from what Asaas actually sends is
      // rank-based: never move `plan`/`total` to a tier whose credit
      // allowance isn't strictly greater than the wallet's current one
      // (isPlanUpgrade, lib/billing/plans.ts -- the exact function the
      // mock path's own synchronous check already uses, so both paths
      // agree on what counts as an upgrade). A same-tier confirmation is
      // refused by the identical check (isPlanUpgrade is false when the
      // credits are equal), covering the "reapply a same-tier" half of the
      // guard too.
      //
      // The payment itself is real and already settled by the time this
      // runs, so refusing it outright would silently swallow money the
      // customer already paid (the money-path prohibition this issue was
      // filed over). Instead: `plan`/`total`/`renewsAt` stay exactly as
      // they are, and the paid tier's credit value is folded into
      // `purchased` -- the same carry-over pool a top-up uses, never reset
      // by a renewal -- so the account keeps every credit it paid for
      // without ever losing the higher plan it was already on. The ledger
      // entry keeps `type: "subscribe"` with `reason: purchase.plan`
      // (rather than a new/topup type): it is still an accurate record of
      // which tier was actually paid for, just one that didn't change the
      // wallet's plan. The caller (the webhook route) is responsible for
      // reporting this case for operator visibility -- see handleConfirmed.
      if (!isPlanUpgrade(wallet.plan, purchase.plan)) {
        wallet.purchased += planCredits;
        wallet.balance += planCredits;
        return {
          type: "subscribe",
          amount: planCredits,
          balanceAfter: wallet.balance,
          reason: purchase.plan,
          // #196: folded into `purchased`, never touched plan/total -- a
          // later refund of this exact entry can undo precisely this
          // movement (reverseFoldedSubscription), and must never reset the
          // plan, since this entry never set it in the first place.
          planChanged: false,
        };
      }
      // Plan allowance plus whatever top-up credits were already bought —
      // upgrading plans must not erase them either (#37). Also applies on a
      // studio->factory (or any) upgrade: a wallet whose balance already
      // exceeds the new plan's own total (from a prior top-up) never drops,
      // since `purchased` always adds on top rather than being clamped away.
      const newBalance = planCredits + wallet.purchased;
      // #38: amount is the balance *delta*, like every other ledger entry
      // type — not the plan size — so summing the ledger reproduces
      // wallet.balance instead of overstating the movement whenever the
      // account wasn't starting from empty.
      const delta = newBalance - wallet.balance;
      wallet.plan = purchase.plan;
      wallet.total = planCredits;
      wallet.balance = newBalance;
      wallet.renewsAt = new Date(now.getTime() + 30 * DAY_MS);
      return {
        type: "subscribe",
        amount: delta,
        balanceAfter: wallet.balance,
        // Which tier was purchased -- lets UsageSection's ledger row say
        // "Assinatura · Estúdio" instead of just "Assinatura".
        reason: purchase.plan,
        // #196: this call genuinely moved plan/total -- the webhook route's
        // handleConfirmed uses this to record wallet.planSourceExternalId,
        // so a future refund of THIS entry (if it's still the wallet's
        // current plan source when that refund arrives) knows to do the
        // full reset, and a refund of any OTHER plan-changing entry knows
        // it was superseded instead.
        planChanged: true,
      };
    }
    default: {
      const exhaustive: never = purchase;
      throw new Error(`unhandled purchase: ${JSON.stringify(exhaustive)}`);
    }
  }
}

// #6: reverses a *subscribe* purchase's PAYMENT_REFUNDED. debitWallet alone
// only undoes the balance movement -- it would leave `plan`/`total` on
// "atelier"/500 forever, so a refunded subscriber kept renewing at the full
// paid allowance every month even though the payment that granted it was
// given back. Downgrades to the same free tier seedWallet issues a brand
// new account (plan/total only -- `purchased` carry-over top-up credits and
// `renewsAt` are untouched, matching applyPurchase("subscribe") never
// touching `purchased` either). Not used for a *topup* refund, which is a
// plain debitWallet -- a topup never changed plan/total to begin with.
//
// #196: only call this for the entry that IS the wallet's current plan
// source (reverseRefundedSubscription's "reset" outcome) -- calling it for
// ANY refunded subscribe entry, regardless of whether that entry is still
// what backs the current plan, was exactly issue #196's bug. Clears
// `planSourceExternalId` too: the plan it pointed at no longer exists.
export function reverseSubscription(
  wallet: Wallet,
  amount: number,
): LedgerEntry {
  wallet.balance -= amount;
  wallet.plan = "free";
  wallet.total = PLAN_CREDITS.free;
  wallet.planSourceExternalId = null;
  return {
    type: "debit",
    amount,
    balanceAfter: wallet.balance,
    reason: "asaas_refund",
  };
}

// #196: reverses a *folded* subscribe entry (applyPurchase's #193 guard
// branch, LedgerEntry.planChanged: false) -- it added `amount` to BOTH
// `purchased` and `balance` (mirroring a topup), never touched plan/total,
// so undoing it is the mirrored-undo `debitWallet`-shaped operation the
// issue's own acceptance criteria ask for: exactly what it added, nothing
// about the plan.
export function reverseFoldedSubscription(
  wallet: Wallet,
  amount: number,
): LedgerEntry {
  wallet.balance -= amount;
  wallet.purchased -= amount;
  return {
    type: "debit",
    amount,
    balanceAfter: wallet.balance,
    reason: "asaas_refund",
  };
}

export type RefundedSubscriptionOutcome = "reset" | "folded" | "superseded";

export interface RefundedSubscriptionResult {
  outcome: RefundedSubscriptionOutcome;
  ledgerEntry: LedgerEntry;
}

// #196: the pure decision at the heart of this fix -- given the wallet's
// CURRENT state, which of three things a refunded `type: "subscribe"`
// ledger entry actually means:
//
//  - "reset": `refundedExternalId` is exactly `wallet.planSourceExternalId`
//    -- this entry IS what currently backs the wallet's plan. A legitimate
//    refund of the real plan-setting payment; reverseSubscription's full
//    reset to free is correct here, same as before this issue.
//  - "folded": this entry never changed the plan at all (planChanged was
//    false when it ran -- applyPurchase's #193 guard branch). Its
//    contribution is precisely tracked (added to `purchased`+`balance`,
//    never overwritten since), so reverseFoldedSubscription undoes exactly
//    that, regardless of what plan the wallet is on now. This is the #196
//    acceptance criterion: refunding a superseded/folded payment must not
//    touch the plan.
//  - "superseded": this entry DID change the plan when it ran, but a later
//    real upgrade has since overwritten `total`/`plan` again (applyPurchase
//    always assigns, never adds, on that branch) -- e.g. atelier->studio,
//    then separately studio->factory, then the ORIGINAL atelier payment is
//    refunded. Nothing this entry contributed survives to claw back: its
//    delta was folded into a `total` that a later upgrade fully replaced,
//    and by the time of that replacement `balance` may also have moved
//    through unrelated debits/top-ups, so there is no honest amount left to
//    subtract. The wallet is left untouched; the caller is expected to
//    report this for operator visibility (there is no ledger row shape that
//    says "acknowledged, no-op" on its own).
export function reverseRefundedSubscription(
  wallet: Wallet,
  entry: { amount: number; planChanged: boolean },
  refundedExternalId: string,
): RefundedSubscriptionResult {
  if (wallet.planSourceExternalId === refundedExternalId) {
    return {
      outcome: "reset",
      ledgerEntry: reverseSubscription(wallet, entry.amount),
    };
  }
  if (!entry.planChanged) {
    return {
      outcome: "folded",
      ledgerEntry: reverseFoldedSubscription(wallet, entry.amount),
    };
  }
  return {
    outcome: "superseded",
    ledgerEntry: {
      type: "debit",
      amount: 0,
      balanceAfter: wallet.balance,
      reason: "asaas_refund_superseded",
    },
  };
}

// #40: dueness used to be decided once, by scripts/cron-renew.ts's unlocked
// findMany, then acted on unconditionally inside the row-locked transaction
// with no re-check -- a second process (or a subscribe purchase landing
// between the snapshot and the lock) renews an already-renewed wallet again,
// silently costing the user a whole month's allowance and leaving two
// `renew` ledger rows for one period. The renewal callback re-checks this
// against the locked row itself, immediately before calling renewWallet.
export function isRenewalDue(wallet: Wallet, now: Date): boolean {
  return wallet.renewsAt !== null && wallet.renewsAt <= now;
}

// Called by the renewal cron (scripts/cron-renew.ts) for wallets past renewsAt.
// Rolls forward from the *scheduled* renewsAt, not `now`, so a cron run that's
// a few hours (or days) late doesn't push the next renewal date out by the delay.
export function renewWallet(wallet: Wallet, now: Date): LedgerEntry {
  // "Use it or lose it" resets only the monthly plan allowance; purchased
  // top-up credits (#37) are never touched by a renewal.
  const newBalance = wallet.total + wallet.purchased;
  // #38: amount is the delta the renewal actually moved the balance by, not
  // the plan size — a user who ends the month with credits left over sees a
  // renewal amount smaller than the full allowance, matching what changed.
  const delta = newBalance - wallet.balance;
  wallet.balance = newBalance;
  const base = wallet.renewsAt ?? now;
  wallet.renewsAt = new Date(base.getTime() + 30 * DAY_MS);
  return { type: "renew", amount: delta, balanceAfter: wallet.balance };
}

// Wire-facing days-remaining, replaces the old static Credits.renewsInDays.
export function renewsInDays(wallet: Wallet, now: Date): number {
  if (!wallet.renewsAt) return 0;
  return Math.max(
    0,
    Math.ceil((wallet.renewsAt.getTime() - now.getTime()) / DAY_MS),
  );
}
