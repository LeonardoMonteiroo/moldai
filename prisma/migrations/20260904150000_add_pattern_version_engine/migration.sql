-- #267: which drafting engine each pattern VERSION was drafted with.
-- Additive, nullable, backfill-free -- every existing row simply has no
-- value, which is the documented meaning of absent (resolves to "moldai"
-- through engineFor, lib/draft/engine/capability.ts), the same shape
-- sizeChartName already used when it was added to this table.
ALTER TABLE "PatternVersion" ADD COLUMN "engine" TEXT;
