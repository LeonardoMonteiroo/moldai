-- #232: dashboard onboarding checklist. Additive, nullable, no backfill --
-- see the schema.prisma comment above these columns for why.
ALTER TABLE "User" ADD COLUMN "firstExportedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "firstImportedAt" TIMESTAMP(3);
