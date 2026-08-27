-- #196: reverseSubscription was resetting plan/total to free for ANY
-- refunded "subscribe" ledger entry, regardless of whether that entry is
-- still what backs the wallet's CURRENT plan. Two new columns let a refund
-- tell the three real cases apart -- see lib/billing/wallet.ts's
-- Wallet.planSourceExternalId / LedgerEntry.planChanged / and the pure
-- decision function reverseRefundedSubscription for the full reasoning.

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN "planSourceExternalId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "planChanged" BOOLEAN NOT NULL DEFAULT false;

-- Best-effort backfill: for every wallet already on a paid plan, treat its
-- most recent gateway-originated ("externalId" IS NOT NULL) 'subscribe'
-- ledger row as the one currently backing that plan -- the only kind
-- handleRefunded can ever be asked to reverse in the first place, since it
-- looks entries up by externalId. This is EXACT whenever a wallet's
-- subscribe history has no fold (#193) after its last real upgrade -- the
-- common case, and the only one reachable before this migration, since
-- #193 (the guard that makes a fold possible at all) shipped in the same
-- release wave as this fix. A wallet whose true plan-setting payment was
-- itself already superseded by a still-later upgrade before this migration
-- ran is a known, accepted approximation -- the same shape as
-- Wallet.purchased's own migration precedent (20260822220000, "existing
-- wallets migrate with purchased = 0 -- there is no way to retroactively
-- attribute an already-elevated balance to a past purchase"). Worst case
-- here is milder than that one: a wrongly-backfilled row is treated as
-- "folded" on its next refund (see reverseRefundedSubscription), which
-- still never resets the plan -- the exact bug this migration exists to
-- prevent -- it just doesn't get the fully-precise "superseded" no-op
-- either.
WITH latest_subscribe AS (
  SELECT DISTINCT ON (t."userId") t."userId", t."externalId"
  FROM "Transaction" t
  WHERE t."type" = 'subscribe' AND t."externalId" IS NOT NULL
  ORDER BY t."userId", t."createdAt" DESC
)
UPDATE "Transaction" t
SET "planChanged" = true
FROM latest_subscribe ls
JOIN "Wallet" w ON w."userId" = ls."userId"
WHERE t."externalId" = ls."externalId"
  AND w."plan" <> 'free';

WITH latest_subscribe AS (
  SELECT DISTINCT ON (t."userId") t."userId", t."externalId"
  FROM "Transaction" t
  WHERE t."type" = 'subscribe' AND t."externalId" IS NOT NULL
  ORDER BY t."userId", t."createdAt" DESC
)
UPDATE "Wallet" w
SET "planSourceExternalId" = ls."externalId"
FROM latest_subscribe ls
WHERE w."userId" = ls."userId"
  AND w."plan" <> 'free';
