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
// separate geometry -- see lib/draft/core.ts's NOTCH_DEPTH_CM. Composes
// LineSchema rather than re-pasting its four keys.
const PieceNotchSchema = LineSchema.extend({
  type: z.enum(["single", "double", "triple"]),
});

// #318: mirrors lib/types.ts's PieceInternal, one member per kind -- the
// same z.discriminatedUnion("kind", ...) shape PieceOutlineSchema above
// already uses. `internals` was never named in PieceSchema below, for as
// long as the field has existed (#127), so z.object's default strip mode
// deleted every dart, fold line, drill hole and pleat from the parsed state
// on every read -- and lib/db/pattern.ts's withPattern writes that same
// parsed object straight back via savePattern, so the loss became
// permanent on the pattern's next mutating turn. Identical trap to the one
// ChatMessageSchema's own comment (lib/schemas/pattern.ts) documents for
// hasImage/assembly and GarmentStyleSchema's (lib/schemas/garment.ts) for
// collar/cuff/waistband, this time destroying drafted geometry rather than
// a chat flag or a style choice.
//
// `styleLine`/`placementMark` are named here even though no drafter emits
// either yet (#127 reserved both): naming them now is exactly what stops
// the day one does from repeating this same bug -- the pre-emptive reason
// internalLoops below is already named.
//
// The coordinate shapes compose the private PointSchema/LineSchema above
// rather than re-pasting {x,y}/{x1,y1,x2,y2}: a foldLine IS a line plus a
// kind tag, a drillHole IS a point plus a radius. lib/db/pattern.test.ts's
// INTERNALS_BY_KIND fixture is a Record keyed by PieceInternal["kind"], so
// adding a member there without adding it here is a compile error rather
// than a silent gap.
const PieceInternalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dart"), d: z.string() }),
  LineSchema.extend({ kind: z.literal("foldLine") }),
  PointSchema.extend({ kind: z.literal("drillHole"), r: z.number() }),
  z.object({ kind: z.literal("pleat"), d: z.string() }),
  z.object({ kind: z.literal("styleLine"), d: z.string() }),
  PointSchema.extend({ kind: z.literal("placementMark") }),
]);

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
  // #318: `darts`' successor channel (lib/types.ts's PieceInternal).
  // `.optional()`, deliberately NEVER `.default([])`: a default would
  // materialise `internals: []` onto EVERY piece, including a pre-#127 blob
  // that still carries only `darts` -- and resolvePieceInternals
  // (lib/types.ts) tests `piece.internals` for truthiness, so an empty
  // array would win over the legacy fallback and return []. That would
  // trade a silent strip for a silent blank canvas on exactly the old
  // patterns the fallback exists to keep rendering. place()
  // (lib/draft/core.ts) only ever assigns a non-empty array, so nothing
  // produces one today.
  internals: z.array(PieceInternalSchema).optional(),
  label: PointSchema,
  vertices: z.array(PointSchema).optional(),
  foldEdge: z.tuple([z.number(), z.number()]).optional(),
  notches: z.array(PieceNotchSchema).optional(),
  // #243: zero or more internal loops (holes) -- same PieceOutlineSchema
  // shape as the piece's own `outline` above, since round-tripping through
  // this schema (lockPattern/loadPattern -> PatternStateSchema.safeParse)
  // would otherwise silently strip the field the moment a drafter starts
  // emitting it (z.object's default mode drops unrecognised keys).
  internalLoops: z.array(PieceOutlineSchema).optional(),
  detailRows: z.array(DetailRowSchema),
});
