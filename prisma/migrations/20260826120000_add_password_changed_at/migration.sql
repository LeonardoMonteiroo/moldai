-- #29: adds User.passwordChangedAt. Additive only -- nullable, no backfill,
-- no JSON blob shape changes, so every other row/table is untouched.
-- Existing users migrate with NULL, which honestly means "never changed
-- since this column existed" rather than a fabricated timestamp.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
