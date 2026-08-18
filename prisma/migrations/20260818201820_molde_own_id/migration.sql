-- Molde moves from 1-per-user (userId as PK) to N-per-user (own id, userId
-- an indexed FK) to back the dashboard's molde list. Existing dev rows are
-- not preserved -- same "reset is acceptable, decision registered in spec"
-- precedent as prisma/migrations/20260817002232_reset_moldes_english.
DROP TABLE "Molde";

CREATE TABLE "Molde" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Molde_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Molde_userId_updatedAt_idx" ON "Molde"("userId", "updatedAt");

ALTER TABLE "Molde" ADD CONSTRAINT "Molde_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
