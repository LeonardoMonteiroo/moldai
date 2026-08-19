-- Renames the Grade domain to SizeChart -- "grade" was the Portuguese design
-- term ("Medidas e grades") carried straight into the English code/route
-- instead of being translated. No data loss: pure rename, not drop/recreate.
ALTER TABLE "Grade" RENAME TO "SizeChart";
ALTER TABLE "SizeChart" RENAME CONSTRAINT "Grade_pkey" TO "SizeChart_pkey";
ALTER TABLE "SizeChart" RENAME CONSTRAINT "Grade_userId_fkey" TO "SizeChart_userId_fkey";
ALTER INDEX "Grade_userId_updatedAt_idx" RENAME TO "SizeChart_userId_updatedAt_idx";

ALTER TABLE "User" RENAME COLUMN "activeGradeId" TO "activeSizeChartId";
