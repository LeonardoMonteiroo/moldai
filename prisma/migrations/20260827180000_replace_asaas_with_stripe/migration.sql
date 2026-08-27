-- #206: replaces the Asaas gateway's two identity columns with Stripe's.
--
-- NO BACKFILL IS NEEDED, and this is the one fact that makes a destructive
-- DROP acceptable here rather than a rename: Asaas was never exercised
-- against a real account (lib/billing/asaas.ts's own header said so, and
-- PAYMENT_PROVIDER defaulted to "mock" for its entire life), so no row in
-- any environment ever held an "asaasCustomerId" or "asaasSubscriptionId".
-- Dropping them therefore discards no customer identity and orphans no
-- gateway record. If that assumption is ever wrong for some environment,
-- the values are still recoverable from the Stripe/Asaas dashboards --
-- but the app cannot use an Asaas id after this migration in any case,
-- since the module that spoke that API is deleted.
--
-- Additive/nullable in the same shape the dropped pair had: every existing
-- wallet simply carries NULL until its first real Stripe checkout, exactly
-- as it did before under the mock provider.

ALTER TABLE "Wallet" DROP COLUMN IF EXISTS "asaasCustomerId";
ALTER TABLE "Wallet" DROP COLUMN IF EXISTS "asaasSubscriptionId";

ALTER TABLE "Wallet" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Wallet" ADD COLUMN "stripeSubscriptionId" TEXT;

-- UNIQUE because a Stripe subscription belongs to exactly one wallet, and
-- app/api/billing/webhook/route.ts looks a wallet UP by it to route a
-- monthly renewal. Without the constraint, a bug that wrote the same
-- subscription id onto two wallets would make that lookup silently
-- ambiguous -- and it renews credits, so "silently ambiguous" means
-- crediting the wrong account.
CREATE UNIQUE INDEX "Wallet_stripeSubscriptionId_key"
  ON "Wallet"("stripeSubscriptionId");
