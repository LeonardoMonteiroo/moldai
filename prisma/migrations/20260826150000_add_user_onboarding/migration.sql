-- #14: post-signup onboarding wizard. Adds User.onboardedAt (gates the
-- app/page.tsx redirect to /onboarding by null-ness) and User.workStyle
-- (honest, unused research data from the wizard's step 1). Additive only --
-- no column dropped, no JSON blob shape changes.
--
-- Existing rows are backfilled to "already onboarded" -- the same precedent
-- as 20260820120000_add_email_verification's backfill of emailVerified. A
-- plain nullable column with NO backfill would mean every established
-- account (created before this migration) also reads onboardedAt IS NULL,
-- which is indistinguishable from a brand-new signup and would show the
-- wizard to accounts that have been using the product for weeks. Only
-- accounts created AFTER this migration keep the column NULL by default,
-- until they complete (or skip) onboarding.
ALTER TABLE "User" ADD COLUMN "onboardedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "workStyle" TEXT;

UPDATE "User" SET "onboardedAt" = now() WHERE "onboardedAt" IS NULL;
