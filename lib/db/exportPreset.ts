import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { validateExportPreset, type ExportPreset } from "@/lib/export/preset";

/**
 * #17: `User.exportPreset` is the account's one saved "Salvar preset" from
 * the export screen. NULL is meaningful and distinct from a validated
 * default -- it means "never saved," which is what tells the export screen
 * to keep whatever it already has on screen (DEFAULT_EXPORT_PRESET or an
 * in-progress edit) instead of overwriting it with a fabricated baseline.
 *
 * Re-validated on every read, not just on write, the same "validated on
 * read" precedent lib/db/sizeChart.ts's toRecord follows for its own JSON
 * blob column -- the column is untrusted the moment anything other than
 * this app's own PUT route could have written it (a direct DB edit, a
 * stale app version, a future migration).
 */
export async function getExportPreset(
  userId: string,
): Promise<ExportPreset | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { exportPreset: true },
  });
  if (!user || user.exportPreset === null) return null;
  return validateExportPreset(user.exportPreset);
}

/**
 * `preset` is deliberately `unknown` -- it comes straight off the wire (the
 * PUT route's body), the same `validateSizeChartPatch`/`validateSpec` shape
 * every other trust boundary in this app uses. validateExportPreset never
 * throws, so this never persists anything other than the sanitised shape:
 * an unknown field is dropped, an out-of-range/unrecognised value falls
 * back to its default.
 */
export async function saveExportPreset(
  userId: string,
  preset: unknown,
): Promise<ExportPreset> {
  const validated = validateExportPreset(preset);
  await prisma.user.update({
    where: { id: userId },
    data: { exportPreset: validated as unknown as Prisma.InputJsonValue },
  });
  return validated;
}
