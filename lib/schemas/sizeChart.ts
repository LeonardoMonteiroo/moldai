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
