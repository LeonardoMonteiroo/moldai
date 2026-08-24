import { z } from "zod";

const PointSchema = z.object({ x: z.number(), y: z.number() });

const LineSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});

const PieceOutlineSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("polygon"), points: z.string() }),
  z.object({ kind: z.literal("path"), d: z.string() }),
]);

const DetailRowSchema = z.object({ label: z.string(), value: z.string() });

// #124: the three notch types are told apart purely by tick depth, not by
// separate geometry -- see lib/draft/core.ts's NOTCH_DEPTH_CM.
const PieceNotchSchema = z.object({
  type: z.enum(["single", "double", "triple"]),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});

// Mirrors lib/types.ts's Piece interface. Fields the interface marks
// optional stay .optional() here too -- vertices absent on a piece drafted
// before the measure tool's snap, foldEdge/notches absent on one drafted
// before #126/#124 existed -- these are legacy shapes to tolerate, not
// reject, per the issue's own guidance. Unrecognised keys (an inert leftover
// like a piece-level version of savedAgo) are stripped by z.object's default
// mode rather than rejected.
export const PieceSchema = z.object({
  id: z.string(),
  name: z.string(),
  qty: z.number(),
  outline: PieceOutlineSchema,
  guideOutline: PieceOutlineSchema.optional(),
  grainline: LineSchema.optional(),
  darts: z.array(z.object({ d: z.string() })).optional(),
  label: PointSchema,
  vertices: z.array(PointSchema).optional(),
  foldEdge: z.tuple([z.number(), z.number()]).optional(),
  notches: z.array(PieceNotchSchema).optional(),
  detailRows: z.array(DetailRowSchema),
});
