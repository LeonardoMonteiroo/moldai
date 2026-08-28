import { z } from "zod";
import { MeasurementsSchema } from "./measurements";
import { GarmentSpecSchema, ClarifyQuestionSchema } from "./garment";
import { PieceSchema } from "./piece";

const ChatChipSchema = z.object({
  label: z.string(),
  tone: z.enum(["neutral", "credit"]),
});

const ChatMessageSchema = z.object({
  id: z.string(),
  author: z.enum(["user", "ai"]),
  text: z.string(),
  chips: z.array(ChatChipSchema).optional(),
  questions: z.array(ClarifyQuestionSchema).optional(),
  tone: z.enum(["neutral", "conflict", "notice"]).optional(),
  createdAt: z.number(),
});

const ConflictInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  diffCm: z.number(),
  suggestion: z.string(),
  pieceAId: z.string(),
  pieceBId: z.string(),
  markers: z.array(z.object({ cx: z.number(), cy: z.number(), r: z.number() })),
});

// Mirrors lib/types.ts's Pattern interface. `sizeChartName` stays .optional()
// (CLAUDE.md: absent on patterns drafted before it existed, omitted rather
// than guessed) and `spec`/`viewBox`/`baseMeasurements` stay optional for the
// same reason a blank, never-generated pattern legitimately has none.
const PatternSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    version: z.number(),
    baseSize: z.string(),
    unit: z.string(),
    sizes: z.array(z.string()),
    sizesApplied: z.array(z.string()),
    sizesPending: z.array(z.string()),
    sizeTable: z.record(z.string(), MeasurementsSchema),
    sizeChartName: z.string().optional(),
    pieces: z.array(PieceSchema),
    spec: GarmentSpecSchema.optional(),
    viewBox: z.object({ w: z.number(), h: z.number() }).optional(),
    baseMeasurements: MeasurementsSchema.optional(),
  })
  // #58: the exact failure this issue reports -- a sizeTable that no longer
  // has a row under baseSize reads as `undefined` at
  // lib/editor/state.ts:158, and resolveMeasurements's `{...undefined}`
  // silently becomes `{}` instead of throwing, turning every drafted
  // coordinate into NaN. Rejecting it here, once, at the read boundary means
  // every downstream consumer of a parsed Pattern can trust baseSize always
  // resolves.
  .refine((p) => p.baseSize in p.sizeTable, {
    message: "baseSize must be a key of sizeTable",
    path: ["baseSize"],
  });

export const PatternStateSchema = z.object({
  pattern: PatternSchema,
  chat: z.array(ChatMessageSchema),
  conflict: ConflictInfoSchema.nullable(),
});

// #152: request-body schemas for the three pattern-action routes still on
// readJsonObject. Each stays as loose as the route's own existing
// post-parse checks require -- the same "readJsonObject caller keeps its
// own more specific domain check" precedent as AccountProfilePatchSchema.

// generate: `message` is trimmed/length-checked/NUL-checked by the route
// itself (missing_message/message_too_long); `image` is re-validated by
// lib/editor/attachment.ts's validateAttachmentInput, which already takes
// `unknown`; `answering` is read with `=== true`. None of that moves here.
// All three are `.optional()`, not just wrong-typed-tolerant: zod v4 treats
// a bare z.unknown() key as required-but-any-value, so an entirely absent
// key (e.g. `{}`) would 400 as the generic bad_body here rather than
// reaching the route's own more specific missing_message -- the opposite of
// the "readJsonObject caller keeps its own check" precedent this schema is
// supposed to follow (verified against this repo's zod version).
export const GenerateBodySchema = z.object({
  message: z.unknown().optional(),
  image: z.unknown().optional(),
  answering: z.unknown().optional(),
  importContext: z.unknown().optional(),
});

// graduate: `sizes` is read with `Array.isArray(body.sizes) ? body.sizes :
// []`, then filtered against the pattern's own gradable list -- a
// non-array (or absent) value already resolves to the domain code
// no_gradable_sizes rather than a schema-level bad_body, and that
// distinction is asserted in the route's own tests. `.optional()` for the
// same absent-key reason as GenerateBodySchema above.
export const GraduateBodySchema = z.object({
  sizes: z.unknown().optional(),
});

// conflict/resolve: unlike the two above, `action` has no downstream
// fallback -- #54 made an unrecognised action a hard reject rather than a
// silent "ignore" -- so this is the one field in this file validated with a
// real enum instead of z.unknown(). A missing/wrong-typed/unrecognised
// action all fail identically, matching the route's pre-existing bad_body
// for all three cases.
export const ConflictResolveBodySchema = z.object({
  action: z.enum(["fix", "ignore"]),
});
