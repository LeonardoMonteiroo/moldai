-- #71: User.activeSizeChartId was a bare scalar with no FK, so a crash
-- between deleteSizeChart's two writes (fixed at the app level by wrapping
-- them in one $transaction) could leave it naming a row that no longer
-- exists. Every read site already treats a dangling id the same as null
-- (pickSizeChartForGeneration, GET /api/size-charts), so this is a data-
-- hygiene gap, not a live bug -- but before the FK below can be added, any
-- database that already hit it needs those dangling ids cleared first, or
-- adding the constraint fails outright.
UPDATE "User" u
SET "activeSizeChartId" = NULL
WHERE u."activeSizeChartId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "SizeChart" sc WHERE sc."id" = u."activeSizeChartId"
  );

-- CreateIndex
CREATE INDEX "User_activeSizeChartId_idx" ON "User"("activeSizeChartId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeSizeChartId_fkey" FOREIGN KEY ("activeSizeChartId") REFERENCES "SizeChart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
