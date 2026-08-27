-- #16: additive. New PatternVersion table recording a snapshot (spec + frozen
-- size snapshot, never geometry) on every version bump. No existing table's
-- columns or Pattern.data JSON shape change -- nothing here can break an
-- already-persisted Pattern/SizeChart/Wallet blob.
--
-- Backfills exactly one row per existing Pattern, from its current blob
-- (reason='generate', cost=0), so the history screen is never empty for a
-- pre-existing pattern -- no intermediate versions are invented, matching
-- add_email_verification's grandfather-clause precedent above.
CREATE TABLE "PatternVersion" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "sizes" JSONB NOT NULL,
    "baseSize" TEXT NOT NULL,
    "sizeTable" JSONB NOT NULL,
    "sizeChartName" TEXT,
    "reason" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatternVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatternVersion_patternId_version_key" ON "PatternVersion"("patternId", "version");

CREATE INDEX "PatternVersion_patternId_version_idx" ON "PatternVersion"("patternId", "version");

ALTER TABLE "PatternVersion" ADD CONSTRAINT "PatternVersion_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "Pattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one row per existing Pattern, read off its current blob.
-- COALESCE guards a hypothetical blob missing a key rather than failing the
-- whole migration -- seedPattern always sets spec/sizes/baseSize/sizeTable in
-- practice, but a migration should not assume every historical row agrees.
INSERT INTO "PatternVersion"
    ("id", "patternId", "userId", "version", "spec", "sizes", "baseSize", "sizeTable", "sizeChartName", "reason", "cost", "createdAt")
SELECT
    gen_random_uuid()::text,
    "id",
    "userId",
    COALESCE(("data"->'pattern'->>'version')::int, 0),
    COALESCE("data"->'pattern'->'spec', '{}'::jsonb),
    COALESCE("data"->'pattern'->'sizes', '[]'::jsonb),
    COALESCE("data"->'pattern'->>'baseSize', ''),
    COALESCE("data"->'pattern'->'sizeTable', '{}'::jsonb),
    "data"->'pattern'->>'sizeChartName',
    'generate',
    0,
    "updatedAt"
FROM "Pattern";
