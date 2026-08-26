-- #6: real payment gateway (Asaas), shipped behind PAYMENT_PROVIDER=mock|asaas
-- (default mock). Additive only -- no existing column changes, no data
-- rewritten, every new column nullable. Every existing row (and every wallet/
-- transaction created while PAYMENT_PROVIDER stays "mock") simply never
-- populates these.
--
-- Wallet.asaasCustomerId / asaasSubscriptionId: the gateway's own identity for
-- this account, written lazily by the purchase route / webhook once a real
-- checkout happens.
--
-- Transaction.externalId: the gateway's own payment/event id, UNIQUE. This
-- constraint is the entire idempotency story for crediting a wallet from a
-- webhook -- Asaas guarantees at-least-once delivery, so the same
-- PAYMENT_CONFIRMED event WILL be delivered more than once, and the second
-- insert hitting this constraint (caught as Prisma P2002 in
-- lib/db/wallet.ts's withWalletIdempotent) is what turns a duplicate
-- delivery into a no-op instead of a double credit.

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN "asaasCustomerId" TEXT;
ALTER TABLE "Wallet" ADD COLUMN "asaasSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_externalId_key" ON "Transaction"("externalId");
