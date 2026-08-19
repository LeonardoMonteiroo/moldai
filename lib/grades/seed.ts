import { SIZE_TABLE, SIZE_TABLE_MALE, Measurements } from "@/lib/measurements";
import type { Gender, GradeData } from "@/lib/types";

const SIZES = ["PP", "P", "M", "G", "GG"];
const BASE_INDEX = 2; // "M"

function deriveProgressionRule(
  table: Record<string, Measurements>,
): Partial<Record<keyof Measurements, number>> {
  const base = table[SIZES[BASE_INDEX]];
  const prev = table[SIZES[BASE_INDEX - 1]];
  const rule: Partial<Record<keyof Measurements, number>> = {};
  for (const key of Object.keys(base) as (keyof Measurements)[]) {
    rule[key] = Math.round((base[key] - prev[key]) * 10) / 10;
  }
  return rule;
}

// Builds the GradeData for a system-seeded default, from today's static
// SIZE_TABLE/SIZE_TABLE_MALE. The progression rule is derived from the M->P
// step; any size where that rule doesn't reproduce the original table exactly
// gets a manual override, so buildSizeTable(this) === the original table.
export function buildSystemGradeData(gender: Gender): GradeData {
  const table = gender === "male" ? SIZE_TABLE_MALE : SIZE_TABLE;
  const baseMeasurements = table[SIZES[BASE_INDEX]];
  const progressionRule = deriveProgressionRule(table);
  const overrides: Record<string, Partial<Measurements>> = {};
  for (let idx = 0; idx < SIZES.length; idx++) {
    if (idx === BASE_INDEX) continue;
    const size = SIZES[idx];
    const step = idx - BASE_INDEX;
    const diffs: Partial<Measurements> = {};
    for (const key of Object.keys(baseMeasurements) as (keyof Measurements)[]) {
      const ruleValue =
        baseMeasurements[key] + (progressionRule[key] ?? 0) * step;
      const actual = table[size][key];
      if (Math.abs(ruleValue - actual) > 1e-9) diffs[key] = actual;
    }
    if (Object.keys(diffs).length > 0) overrides[size] = diffs;
  }
  return {
    name: gender === "male" ? "Masculino adulto" : "Feminino adulto · ABNT",
    gender,
    bodyType: "straight",
    isSystem: true,
    sizes: [...SIZES],
    baseSizeIndex: BASE_INDEX,
    baseMeasurements,
    progressionRule,
    overrides,
  };
}
