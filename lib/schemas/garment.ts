import { z } from "zod";
import {
  TYPES,
  GENDERS,
  NECKLINES,
  SLEEVES,
  SKIRTS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  FRONT_CLOSURES,
  PLEATS,
  FIT_CLASSES,
  STRETCH_CLASSES,
} from "@/lib/draft/garment";
import { CLARIFY_QUESTION_FIELDS } from "@/lib/types";

// Reuses the same exported enum arrays lib/ai's prompt/schema and
// validateSpec already read, per CLAUDE.md's one-exported-source rule --
// this schema can never drift from the values the drafter actually accepts.
//
// Every key of lib/types.ts's GarmentStyle must be named here: z.object
// strips unnamed keys, and lib/db/pattern.ts's toState/savePattern writes
// the parsed (stripped) object straight back into the row -- an unnamed
// field is deleted from persistence on the pattern's next mutating turn,
// the exact failure CLAUDE.md documents for ChatMessage's hasImage/assembly.
// collar/cuff/waistband/frontClosure/trouserLengthCm were missing this way
// until a #267 audit found it: any shirt collar, cuff, waistband, button
// stand or non-default trouser length was silently erased from every
// pattern (and every PatternVersion.spec recorded after it) the first time
// the chat turn round-tripped through this schema. Pinned by
// lib/db/pattern.test.ts's style-field round-trip cases. #244's own
// `pleats` field is added here too, for the identical reason -- caught in
// review before it repeated the #267 class rather than after.
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
  collar: z.enum(COLLARS).optional(),
  cuff: z.enum(CUFFS).optional(),
  waistband: z.enum(WAISTBANDS).optional(),
  frontClosure: z.enum(FRONT_CLOSURES).optional(),
  trouserLengthCm: z.number().optional(),
  pleats: z.enum(PLEATS).optional(),
  riseCm: z.number().optional(),
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
  // #262: must be named here or z.object strips it -- the same
  // hasImage/assembly/collar trap lib/schemas/pattern.ts's own
  // ChatMessageSchema comment documents, applied to a field added after
  // ClarifyQuestion first shipped.
  field: z.enum(CLARIFY_QUESTION_FIELDS).optional(),
});
