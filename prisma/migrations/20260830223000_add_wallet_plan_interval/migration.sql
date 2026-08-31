-- Annual billing (docs/superpowers/specs/2026-08-30-annual-billing-design.md):
-- which cycle backs the wallet's CURRENT plan/total. Additive, backfill-free
-- -- every existing row (free or monthly-paid) is correctly "month", which
-- Postgres applies to every existing row for free via the column default.
ALTER TABLE "Wallet" ADD COLUMN "planInterval" TEXT NOT NULL DEFAULT 'month';
