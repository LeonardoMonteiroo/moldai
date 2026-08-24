import { z } from "zod";
import { MeasurementsSchema } from "./measurements";
import { GarmentSpecSchema } from "./garment";

// Mirrors lib/types.ts's SloperData -- never the pieces, since draftGarment
// deterministically reproduces them from spec + sizeTable (see convert.ts's
// round-trip test, which is what licenses not storing geometry here).
export const SloperDataSchema = z
  .object({
    name: z.string(),
    spec: GarmentSpecSchema,
    sizes: z.array(z.string()),
    baseSize: z.string(),
    sizeTable: z.record(z.string(), MeasurementsSchema),
    sizeChartName: z.string().optional(),
  })
  // Same failure mode issue #58 describes for Pattern: patternFromSloper
  // resolves baseSize against sizeTable, and an out-of-sync pair would
  // silently draft from an empty measurements object instead of throwing.
  .refine((d) => d.baseSize in d.sizeTable, {
    message: "baseSize must be a key of sizeTable",
    path: ["baseSize"],
  });
