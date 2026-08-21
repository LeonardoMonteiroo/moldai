-- Adds User.emailVerified and the EmailVerificationToken table. Additive only:
-- no column is dropped and no JSON blob shape changes, so Pattern/SizeChart/
-- Wallet rows are untouched.
ALTER TABLE "User" ADD COLUMN "emailVerified" TIMESTAMP(3);

CREATE TABLE "EmailVerificationToken" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("tokenHash")
);

CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grandfather every account that already exists, including the dev seeds and
-- anything created before the gate. Without this, adding the login gate locks
-- out every existing user. The gate applies to accounts created from here on.
UPDATE "User" SET "emailVerified" = now() WHERE "emailVerified" IS NULL;
