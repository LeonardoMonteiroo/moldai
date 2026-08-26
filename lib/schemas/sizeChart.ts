import { z } from "zod";
import { GENDERS } from "@/lib/draft/garment";
import { BODY_TYPES } from "@/lib/types";
import { MEASUREMENT_KEYS } from "@/lib/measurements";
import { MeasurementsSchema } from "./measurements";

// Mirrors lib/types.ts's SizeChartData. progressionRule/overrides stay
// Partial-shaped (every measurement key optional) -- a chart legitimately
// only sets a rule for some fields and no per-cell overrides at all.
export const SizeChartDataSchema = z.object({
  name: z.string(),
  gender: z.enum(GENDERS),
  bodyType: z.enum(BODY_TYPES),
  isSystem: z.boolean(),
  sizes: z.array(z.string()),
  baseSizeIndex: z.number(),
  baseMeasurements: MeasurementsSchema,
  progressionRule: z.object(
    Object.fromEntries(
      MEASUREMENT_KEYS.map((k) => [k, z.number().optional()]),
    ) as Record<(typeof MEASUREMENT_KEYS)[number], z.ZodOptional<z.ZodNumber>>,
  ),
  overrides: z.record(z.string(), MeasurementsSchema.partial()),
});

// POST /api/size-charts deliberately tolerates an unusable body -- an
// absent, malformed, or wrong-typed sourceId all mean the same thing, "no
// source, create a blank chart" -- so the route folds a failed parse into
// `sourceId: undefined` instead of returning parseBody's 400. This schema
// exists only to give that fold a typed shape to parse against.
//
// #12: `chart` is deliberately z.unknown() rather than SizeChartDataSchema
// -- it's an imported spreadsheet's candidate object, and the real trust
// boundary is validateSizeChartPatch (via createSizeChartFromImport), not
// this schema. Rejecting it here on shape would duplicate that boundary
// with a stricter, throw-on-mismatch one instead of the drop-or-clamp
// contract the rest of the size-chart write path already follows.
export const CreateSizeChartBodySchema = z.object({
  sourceId: z.string().optional(),
  chart: z.unknown().optional(),
});
