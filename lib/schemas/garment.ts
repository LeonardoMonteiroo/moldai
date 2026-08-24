import { z } from "zod";
import {
  TYPES,
  GENDERS,
  NECKLINES,
  SLEEVES,
  SKIRTS,
  FIT_CLASSES,
  STRETCH_CLASSES,
} from "@/lib/draft/garment";

// Reuses the same exported enum arrays lib/ai's prompt/schema and
// validateSpec already read, per CLAUDE.md's one-exported-source rule --
// this schema can never drift from the values the drafter actually accepts.
export const GarmentStyleSchema = z.object({
  neckline: z.enum(NECKLINES).optional(),
  necklineDepthCm: z.number().optional(),
  sleeve: z.enum(SLEEVES).optional(),
  skirt: z.enum(SKIRTS).optional(),
  skirtLengthCm: z.number().optional(),
  darts: z.boolean().optional(),
  seamAllowanceCm: z.number().optional(),
  fit: z.enum(FIT_CLASSES).optional(),
  stretch: z.enum(STRETCH_CLASSES).optional(),
  armholeDeepenCm: z.number().optional(),
  sleeveRefit: z.boolean().optional(),
});

export const GarmentSpecSchema = z.object({
  type: z.enum(TYPES),
  gender: z.enum(GENDERS).optional(),
  measurementOverrides: z.record(z.string(), z.number()),
  style: GarmentStyleSchema,
});

export const ClarifyQuestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  options: z.array(z.string()),
  allowOther: z.boolean(),
});
