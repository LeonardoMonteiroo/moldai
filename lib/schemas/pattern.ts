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
  // The three flags below are listed because a key this object does not name
  // is STRIPPED, and the strip is not confined to the response: lockPattern
  // returns the parsed state and savePattern writes that same object
  // straight back, so an unlisted message field is deleted from the row by
  // the next mutating turn. Writing one at the route and omitting it here
  // gives it a one-turn lifetime -- long enough to pass a "the persisted
  // message carries it" assertion and still be gone by the time anyone
  // reloads. All three are pinned by lib/db/pattern.test.ts's per-key
  // round-trip tests rather than left to the read path's own silence.
  //
  // `hasImage` and `assembly` were missing here for as long as they have
  // existed, and were being destroyed exactly that way: measured against the
  // real schema, and in a live database only 4 of 157 persisted messages
  // still carried `hasImage` -- every one of them the newest generation's
  // own user turn, none having survived a later turn. That cost `hasImage`
  // its attachment chip on reload and `assembly` the disclaimer that marks
  // an answer as AI-generated sewing guidance (#138), which is a label the
  // reader is owed rather than a decoration.
  imageCount: z.number().int().nonnegative().optional(),
  hasImage: z.boolean().optional(),
  assembly: z.boolean().optional(),
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
// itself (missing_message/message_too_long); `images` is re-validated by
// lib/editor/attachment.ts's validateAttachmentInputs, which already takes
// `unknown`; `answering` is read with `=== true`. None of that moves here.
// All of them are `.optional()`, not just wrong-typed-tolerant: zod v4
// treats a bare z.unknown() key as required-but-any-value, so an entirely
// absent key (e.g. `{}`) would 400 as the generic bad_body here rather than
// reaching the route's own more specific missing_message -- the opposite of
// the "readJsonObject caller keeps its own check" precedent this schema is
// supposed to follow (verified against this repo's zod version).
//
// `images` replaced the singular `image` outright rather than joining it: a
// wire field that is never persisted is the cheap direction of a wire
// change, and keeping both shapes would mean two validators and two prompt
// paths. Because z.object strips a key it does not name, a caller still
// sending `image` is indistinguishable from a text-only request: it is
// charged as one and drafts with no image blocks, NOT refused. That is
// exactly why the rename had to make every caller a compile error rather
// than accept both shapes -- a stale caller loses its reference silently,
// so the compiler is the only thing that can catch one.
// `formSpec` stays z.unknown() for the same reason every other key here
// does: validateFormSpec (lib/ai/formSpec.ts) is its real trust boundary,
// and it needs the RAW value -- it decides field by field whether the
// request already named a value validateSpec recognizes, which a schema
// that had already coerced or defaulted anything would have destroyed.
export const GenerateBodySchema = z.object({
  message: z.unknown().optional(),
  images: z.unknown().optional(),
  answering: z.unknown().optional(),
  importContext: z.unknown().optional(),
  formSpec: z.unknown().optional(),
  sizeChartId: z.unknown().optional(),
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
