-- Adds the Grade table (same JSON-blob-per-row shape as Pattern/Wallet) and
-- User.activeGradeId, for the measurement-grades feature (5i). Additive --
-- existing Pattern/User rows are untouched.
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Grade_userId_updatedAt_idx" ON "Grade"("userId", "updatedAt");

ALTER TABLE "Grade" ADD CONSTRAINT "Grade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "activeGradeId" TEXT;
