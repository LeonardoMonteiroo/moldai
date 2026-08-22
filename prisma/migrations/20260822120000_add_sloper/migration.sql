-- Adds the Sloper table (same JSON-blob-per-row shape as Pattern/SizeChart)
-- for the "Bases do ateliê" feature. Purely additive -- no existing table or
-- persisted blob changes shape, so no reset migration is needed.
CREATE TABLE "Sloper" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sloper_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Sloper_userId_updatedAt_idx" ON "Sloper"("userId", "updatedAt");

ALTER TABLE "Sloper" ADD CONSTRAINT "Sloper_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
