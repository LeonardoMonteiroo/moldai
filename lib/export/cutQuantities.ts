import {
  MAX_CUT_QUANTITY_PER_SIZE,
  MAX_TOTAL_CUT_QUANTITY,
  type SizeLabel,
} from "@/lib/types";

/**
 * #280: the "Quantidade por tamanho" panel's own trust boundary -- the wire
 * body reaching PATCH /api/patterns/[id]/cut-plan is untrusted the same way
 * lib/sizeCharts/validate.ts's validateSizeChartPatch treats a size-chart
 * patch: drops or clamps anything unusable rather than throwing, so a
 * malformed body 400s at readJsonObject or is silently narrowed here, never
 * a 500. Never throws.
 *
 * `availableSizes` is always `[pattern.baseSize, ...pattern.sizesApplied]`
 * deduped -- the only sizes with real drafted geometry (buildExportModel
 * falls back to baseSize for anything else). A key not in that list is
 * dropped, not clamped to 0: keeping it around would let a later
 * un-graduation resurrect a stale quantity for a size the user never set.
 */
export function validateCutQuantities(
  raw: unknown,
  availableSizes: readonly SizeLabel[],
): Record<SizeLabel, number> {
  const obj =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const allowed = new Set(availableSizes);
  const result: Record<SizeLabel, number> = {};
  let runningTotal = 0;
  for (const [size, value] of Object.entries(obj)) {
    if (!allowed.has(size)) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const perSize = Math.min(
      MAX_CUT_QUANTITY_PER_SIZE,
      Math.max(0, Math.round(value)),
    );
    // #280: clamps this entry further so the running SUM across every size
    // never exceeds MAX_TOTAL_CUT_QUANTITY -- perSize alone bounds one size,
    // not the packer's real cost, which scales with every size's quantity
    // combined.
    const clamped = Math.min(
      perSize,
      Math.max(0, MAX_TOTAL_CUT_QUANTITY - runningTotal),
    );
    runningTotal += clamped;
    result[size] = clamped;
  }
  return result;
}
