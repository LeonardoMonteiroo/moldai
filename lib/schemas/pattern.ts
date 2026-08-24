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
