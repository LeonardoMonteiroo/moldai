-- Molde -> Pattern rename (domain entity, not just the route). Dev data is
-- disposable -- same "reset is acceptable, decision registered in spec"
-- precedent as prisma/migrations/20260817002232_reset_moldes_english and
-- prisma/migrations/20260818201820_molde_own_id.
DROP TABLE "Molde";

CREATE TABLE "Pattern" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pattern_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Pattern_userId_updatedAt_idx" ON "Pattern"("userId", "updatedAt");

ALTER TABLE "Pattern" ADD CONSTRAINT "Pattern_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
