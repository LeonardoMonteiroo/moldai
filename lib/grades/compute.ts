import { MEASUREMENT_RANGES, Measurements } from "@/lib/measurements";
import type { Gender, GradeData, GradeRecord } from "@/lib/types";

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Resolves one size's Measurements from a grade: base row + progression rule
// scaled by the size's distance from the base column, with any manual
// per-cell override winning outright, then clamped to MEASUREMENT_RANGES.
export function resolveGradeSize(grade: GradeData, size: string): Measurements {
  const idx = grade.sizes.indexOf(size);
  const step = idx === -1 ? 0 : idx - grade.baseSizeIndex;
  const override = grade.overrides[size] ?? {};
  const result = {} as Measurements;
  for (const key of Object.keys(
    grade.baseMeasurements,
  ) as (keyof Measurements)[]) {
    const ruleValue =
      grade.baseMeasurements[key] + (grade.progressionRule[key] ?? 0) * step;
    const value = override[key] ?? ruleValue;
    const range = MEASUREMENT_RANGES[key];
    result[key] = clamp(value, range.min, range.max);
  }
  return result;
}

// Every size in the grade, fully resolved — frozen onto a Pattern at first
// generation (lib/editor/state.ts's seedPatternSizeSnapshot).
export function buildSizeTable(grade: GradeData): Record<string, Measurements> {
  const table: Record<string, Measurements> = {};
  for (const size of grade.sizes) table[size] = resolveGradeSize(grade, size);
  return table;
}

// Picks which grade a NEW generation should draft from: the account's active
// grade if its gender matches the spec being drafted, else the system default
// for that gender. `grades` must contain at least one system grade per gender
// (guaranteed by lib/db/grade.ts's ensureSystemGrades) or this degrades to the
// active grade (if any) or the first grade in the list.
export function pickGradeForGeneration(
  grades: GradeRecord[],
  activeGradeId: string | null,
  gender: Gender,
): GradeRecord {
  const active = grades.find((g) => g.id === activeGradeId);
  if (active && active.gender === gender) return active;
  const systemMatch = grades.find((g) => g.isSystem && g.gender === gender);
  return systemMatch ?? active ?? grades[0];
}
