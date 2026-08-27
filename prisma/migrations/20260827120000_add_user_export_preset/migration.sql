-- #17: the export screen's "Salvar preset" persists on the account, not in
-- the visitor's browser -- one nullable JSON column, additive. NULL means
-- "never saved" (the screen shows DEFAULT_EXPORT_PRESET and says so); a
-- non-null value is revalidated on every read through
-- lib/export/preset.ts's validateExportPreset (drop-or-clamp, never-throw),
-- the same trust boundary SizeChart.data already gets on read. No backfill
-- needed or possible -- there was never a server-side preset before this
-- column existed, only a per-browser localStorage value this migration does
-- not and cannot migrate.
ALTER TABLE "User" ADD COLUMN "exportPreset" JSONB;
