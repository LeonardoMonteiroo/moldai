import { Pattern } from "@/lib/types";
import { seamCheck } from "./garment";
import { draftPiecesCm, measureSeamGraph } from "./engine/facade";
import { engineFor } from "./engine/capability";
import type { SeamMeasurement } from "./seams";
import { DraftedPiece, dartsOf, pleatsOf, curveArcLengthCm } from "./core";
import type { Translate } from "@/lib/i18n/translate";

// #138: sewing-order / assembly instructions -- derived, never persisted,
// from the same seam graph #134 built for conflict detection (lib/draft/
// seams.ts's walkSeamPairs) plus each drafted piece's own dart/hem-edge
// data. This module produces STRUCTURED DATA ONLY: which step comes before
// which, and which pieces/lengths/ease each one names. lib/ai/prompt.ts
// hands this JSON to the model and instructs it to narrate each step in the
// user's own language without inventing, skipping, or reordering anything
// -- the same "derive the numbers, let the model only phrase them" split
// lib/draft/easeReport.ts already established for fit questions.

// ---- ordering ------------------------------------------------------------

// Which stage of construction a mated pair belongs to -- a property of the
// PAIR'S OWN IDENTITY (its `key`, declared once in garment.ts beside the
// pair itself), never of which garment archetype produced it. Sorting the
// walked graph by this is what lets buildAssemblyOrder "walk the graph,
// don't hardcode a sequence per archetype" (#138's own instruction): a
// future archetype's new pair only needs an entry added to PHASE_BY_KEY
// below, never a new branch keyed on spec.type.
const SEAM_PHASE_ORDER = [
  "primary", // first structural closure: a bodice's shoulder seam; a trouser leg's own rise (fly/back seam), sewn to its own mirrored copy
  "sleeve", // set-in sleeve: cap into armhole, and the sleeve's own underarm closing it into a tube
  "side", // side seam; a trouser leg's inseam/outseam
  "attach", // a sub-piece sewn onto an already-shaped edge: collar, cuff
  "waistJoin", // a dress bodice sewn directly to its skirt panel at the natural waist
  "band", // a waistband, sewn on last, over an already-finished waist edge
  "other", // a pair key this table has not been extended for yet -- sewn last among seams, never dropped silently (see assembly.test.ts's exhaustiveness guard)
] as const;
type SeamPhase = (typeof SEAM_PHASE_ORDER)[number];

// Exported so assembly.test.ts can assert every pair key any DECORATION_CASES
// spec's seam graph actually produces has a real entry here (never silently
// falls to "other") -- a regression guard the same shape prompt.test.ts's
// "every rendered cost corresponds to a real debit site" already is.
//
// #323: covers BOTH registered engines (lib/draft/engine/registry.ts), not
// just moldai -- a pair key is a property of the PAIR'S OWN IDENTITY
// regardless of which engine's wrapper declared it (the comment above this
// table already says so), and the cross-engine exhaustiveness guard in
// assembly.test.ts now enforces that every key either engine's own
// capability.types can produce has a real entry below.
export const PHASE_BY_KEY: Record<string, SeamPhase> = {
  // ---- moldai (lib/draft/garment.ts) ----
  shoulder: "primary",
  "trouser-front-rise": "primary",
  "trouser-back-rise": "primary",
  "armhole-cap": "sleeve",
  "sleeve-underarm": "sleeve",
  side: "side",
  "trouser-inseam": "side",
  "trouser-outseam": "side",
  // #330: the skirt panel's own two straight side edges, sewn together --
  // same phase as a bodice's plain side seam.
  "skirt-side": "side",
  "collar-neckline": "attach",
  // #222: the fall sews onto the stand's own already-attached upper seam --
  // still the same "attach" phase as collar-neckline itself (a sub-piece
  // sewn onto an already-shaped edge), just one step later for the same
  // garment; phaseRank is a stable sort, so seamGraph's own declaration
  // order (collar-neckline pushed before collar-stand-fall in garment.ts)
  // breaks the tie correctly without a second phase.
  "collar-stand-fall": "attach",
  "cuff-hem": "attach",
  "button-stand-center-front": "attach",
  "waist-join-front": "waistJoin",
  "waist-join-back": "waistJoin",
  "waistband-waist": "band",
  "trouser-waistband-waist": "band",

  // ---- freesewing: hoodie (Hugo, lib/draft/engine/freesewing/designs/
  // hoodie.ts) -- a raglan design, no shoulder seam at all. ----
  // The hood's own 3-panel center seam: a component closed on itself before
  // it is ever joined to the body, same footing as a dart/pleat in spirit
  // but expressed here as a "primary" seam since it IS a real mated pair
  // (hoodie-hood-center, #341: now BOTH of the hood's two physical seams),
  // not an internal fold.
  "hoodie-hood-center": "primary",
  // The raglan seam REPLACES the shoulder seam -- it is the garment's first
  // structural closure between body and sleeve, not a set-in-sleeve
  // operation. Classifying it "sleeve" (like armhole-cap) would place it
  // after a "primary" phase this design never has, and a raglan is sewn
  // before the side seam, matching moldai's own shoulder-before-side order.
  "hoodie-raglan-front": "primary",
  "hoodie-raglan-back": "primary",
  // Closes the sleeve into a tube, same role as moldai's sleeve-underarm.
  "hoodie-sleeve-underarm": "sleeve",
  "hoodie-side": "side",
  // #341: the hood's own neck edge sewn onto the body's already-closed neck
  // opening -- a sub-piece attached onto an already-shaped edge, the same
  // "attach" footing as collar-neckline, and declared before the cuff in
  // hoodie.ts's own array so the stable sort keeps this step first among
  // hoodie's "attach" pairs.
  "hoodie-hood-neckline": "attach",
  // A cuff pregado on an already-closed sleeve hem -- same phase as
  // moldai's own cuff-hem.
  "hoodie-cuff-wrist": "attach",
  // The waistband/ribana, sewn onto the already-finished hem last.
  "hoodie-waistband-hem": "band",
  // #341: the neck-binding trim strip, applied over the neckline last --
  // same "finishing strip over an already-closed seam" footing as the
  // waistband above, just at the neck instead of the hem.
  "hoodie-neck-binding": "band",

  // ---- freesewing: coat (Jett, lib/draft/engine/freesewing/designs/
  // jett.ts) -- a classic set-in-sleeve coat with a center-back seam. ----
  // The back's own center seam closes a component before any cross-piece
  // join, same reasoning as hoodie-hood-center above.
  "coat-center-back": "primary",
  "coat-shoulder": "primary",
  "coat-armhole-cap": "sleeve",
  "coat-sleeve-underarm": "sleeve",
  "coat-side": "side",
  "coat-cuff-wrist": "attach",
  "coat-waistband-hem": "band",

  // ---- freesewing: shirt (Simon, lib/draft/engine/freesewing/designs/
  // shirt.ts) -- yoke-backed, flat-set sleeves, split front. ----
  // The yoke-to-back seam is this design's first structural closure --
  // both front panels are sewn to the yoke's own shoulder edge next, the
  // same "primary" footing as a plain shoulder seam.
  "shirt-yoke-back": "primary",
  "shirt-shoulder-right": "primary",
  "shirt-shoulder-left": "primary",
  "shirt-armhole-cap-right": "sleeve",
  "shirt-armhole-cap-left": "sleeve",
  "shirt-sleeve-underarm": "sleeve",
  "shirt-side-right": "side",
  "shirt-side-left": "side",
  // The stand pregado at the neckline, then the fall pregado onto the
  // stand's own already-attached upper seam -- the same collar-neckline /
  // collar-stand-fall two-step moldai's own blouse collar already uses
  // (#222's comment above). Declared in that order in shirt.ts, so the
  // stable sort keeps stand-before-fall without a second phase.
  "shirt-collar-neckline": "attach",
  "shirt-collar-stand-fall": "attach",
  // A cuff on an already-closed sleeve hem, same phase as coat/hoodie's own.
  //
  // Not perfectly ordered against the collar pair above: shirt.ts declares
  // this BEFORE shirt-collar-neckline (both are "attach", so the stable
  // sort cites the cuff first), even though a collar is conventionally set
  // before a cuff. Neither finishing operation depends on the other having
  // happened first, so this is a real but harmless imprecision -- fixing it
  // would need either a new phase between "attach"'s two sub-cases or
  // reordering shirt.ts's own seamPairs array, and #323's own audit found
  // no garment where the two orders produce a wrong instruction, only an
  // unconventional one.
  "shirt-cuff-wrist": "attach",
};

function phaseRank(key: string): number {
  return SEAM_PHASE_ORDER.indexOf(PHASE_BY_KEY[key] ?? "other");
}

// A piece's own `seamEdges.hem`, if declared, is only a free edge needing a
// finishing step when nothing ELSE in the graph already sews it to another
// piece -- a dress's bodice hem is the body/skirt waist join, and a cuffed
// sleeve's hem is the cuff seam.
//
// #323: derived from the seam graph's own per-edge data
// (SeamMeasurement.aEdges/bEdges, lib/draft/seams.ts), not a second,
// hand-maintained table of pieceId -> consuming pair key. A hand-written
// table only knew moldai's own three cases (body-front/body-back/sleeve)
// and was silently wrong for the freesewing engine: hoodie and coat both
// reuse the piece ids "body-front"/"body-back" (hoodie.ts, jett.ts) and
// both declare seamEdges.hem, but their own waist is consumed by
// hoodie-waistband-hem/coat-waistband-hem -- pair keys the old table didn't
// know, so it silently minted two spurious "free hem" steps per garment
// even though the waistband already sews those exact edges. Reading the
// graph directly is exact for every engine at once: every pair declaration
// references the piece's own seamEdges.hem object verbatim (garment.ts's
// edgeRef(front.id, front.seamEdges.hem) for waist-join-front, hoodie.ts's/
// jett.ts's identical pattern for the waistband pairs), so the indices
// always match -- this is CLAUDE.md's "derive, don't store" rule, not a
// simplification of the old table's intent.
function hemEdgeIsConsumed(
  pieceId: string,
  hemEdge: [number, number],
  seamGraph: SeamMeasurement[],
): boolean {
  return seamGraph.some((m) =>
    [...m.aEdges, ...m.bEdges].some(
      (e) =>
        e.pieceId === pieceId && e.from === hemEdge[0] && e.to === hemEdge[1],
    ),
  );
}

// ---- structure -------------------------------------------------------------

export interface AssemblyDartStep {
  kind: "dart";
  pieceId: string;
  pieceName: string;
  count: number;
}

// #244: a pleat's own fold-and-press step -- same footing as a dart, sewn
// (folded/pressed, in this case) before any seam that joins the piece to
// another one.
export interface AssemblyPleatStep {
  kind: "pleat";
  pieceId: string;
  pieceName: string;
  count: number;
}

export interface AssemblySeamStep {
  kind: "seam";
  // The pair's own stable identifier (e.g. "armhole-cap", "waist-join-front")
  // -- deliberately NOT a resolved catalog label. This structure is prompt
  // context for the model (lib/ai/prompt.ts), which already has the
  // pattern-making vocabulary to phrase "armhole-cap" naturally in the
  // user's own language, the same "hand the model an English semantic
  // label and let it translate/phrase it" precedent lib/ai/prompt.ts's own
  // COST_DESCRIPTIONS/EXPORT_FORMATS already use -- a resolved pt-BR label
  // would also need a real Translate threaded in here, and this pair's own
  // aLabel/bLabel already exist for on-SCREEN use (the seamPairs.<labelKey>
  // catalog entries lib/editor/state.ts's ConflictEntry reads).
  key: string;
  aPieceId: string;
  aPieceName: string;
  bPieceId: string;
  bPieceName: string;
  aLenCm: number;
  bLenCm: number;
  easeCm: number; // intended ease to distribute -- 0 for a seam meant to close exactly
  diffCm: number; // real divergence beyond easeCm/gatherRatio, magnitude, 0 when the seam matches as designed
  // #253: a pair's TOTAL can close (diffCm 0) while its front/back split
  // still doesn't project onto the mate side correctly -- 0 unless the pair
  // opted into that check (lib/draft/seams.ts's expectEqualSplit). Exposed
  // here (not folded into diffCm) so a `diverges: true` step whose diffCm
  // happens to read near-0 still carries the real, non-zero magnitude of
  // whatever actually triggered seamCheck.
  subSegmentDiffCm: number;
  fixable: boolean;
  // #255: the pair's own declared gather/ruffle ratio -- 1 (no ratio) for
  // every pair that doesn't declare one, carried through unchanged from
  // SeamMeasurement (lib/draft/seams.ts). A ratio other than 1 means side b
  // is DELIBERATELY drafted longer/shorter than side a (a gathered waist, a
  // puff sleeve) -- diffCm already nets this out (so a correctly-drafted
  // gathered pair reports 0, not a false conflict), and a consumer phrasing
  // this step can use aLenCm/bLenCm/gatherRatio to describe "distribute
  // N cm of fullness" rather than a divergence.
  gatherRatio: number;
  // True when this specific seam is a live conflict (from seamCheck, not a
  // second threshold of this module's own) -- the order still includes it
  // (still real, still useful to know the sequence), but a consumer must
  // say so rather than presenting a plausible-looking, fully-closing seam.
  diverges: boolean;
}

export interface AssemblyHemStep {
  kind: "hem";
  pieceId: string;
  pieceName: string;
  lengthCm: number;
}

export type AssemblyStep =
  AssemblyDartStep | AssemblyPleatStep | AssemblySeamStep | AssemblyHemStep;

export interface AssemblyOrder {
  steps: AssemblyStep[];
  // True when at least one seam step diverges. An empty `steps` array is
  // its own honest signal (nothing could be derived for this piece set --
  // no darts, no mated pair, no free hem edge); this module never
  // fabricates a step to avoid reporting either case. #188: a standalone
  // skirt/trousers with `waistband: "none"` used to be the reachable
  // example of this (neither archetype declared any other mated pair, and
  // neither declared a `hem` edge either) -- now that both declare their
  // own `seamEdges.hem` (see HEM_CONSUMED_BY below), that same spec derives
  // one real "hem" step instead, and an empty order is no longer reachable
  // from any spec the drafting matrix produces. The shape is kept, not
  // deleted, for a future piece that genuinely has no darts, no mated pair
  // and no free hem edge.
  hasConflict: boolean;
}

// Resolves a piece's DISPLAY name from the pattern's own already-persisted,
// already-locale-resolved piece list (`pattern.pieces`) rather than from a
// fresh redraft -- the "draft-time-locale snapshot" precedent CLAUDE.md's
// i18n section documents for piece labels/conflict text. This is what keeps
// a step's `pieceName` byte-identical to what TechSheetTab/the canvas
// already show for the same piece, and it means this module needs no
// Translate of its own for display text -- `t` below is only for the
// geometry redraft (draftPiecesCm/measureSeamGraph), whose own resolved
// piece.name/detailRows are never read back out of it. Falls back to the
// bare pieceId on a genuine miss (never crashes, never fabricates a name).
function pieceDisplayName(pattern: Pattern, id: string): string {
  return pattern.pieces.find((p) => p.id === id)?.name ?? id;
}

// Pure: takes a Pattern (spec + the frozen sizeTable it was drafted from)
// and returns the derived sewing order. Works for a pattern drafted before
// this feature existed -- no new blob key, everything comes from the
// already-stored spec + sizeTable, the measureSeams/measureSeamGraph/
// buildEaseReport precedent. Returns null when there is nothing to derive
// from (no spec yet, no matching sizeTable row, or a blank pattern).
export function buildAssemblyOrder(
  pattern: Pattern,
  t: Translate,
): AssemblyOrder | null {
  const spec = pattern.spec;
  // Optional chaining, not a plain index -- this is called from
  // lib/ai/prompt.ts's buildSystem on every generate request, including
  // against test/legacy fixtures whose `pattern` carries no sizeTable at
  // all (the same reason lib/draft/easeReport.ts's buildEaseReport does).
  const bodyRow = pattern.sizeTable?.[pattern.baseSize];
  if (!spec || !bodyRow || pattern.pieces.length === 0) return null;

  // #267: the pattern's own FROZEN engine, never a fresh default -- see
  // lib/draft/easeReport.ts's identical comment.
  const engine = engineFor(pattern.engine);
  let pieces: DraftedPiece[];
  let seamGraph: SeamMeasurement[];
  try {
    pieces = draftPiecesCm(engine, spec, bodyRow, t);
    seamGraph = measureSeamGraph(engine, spec, bodyRow, t);
  } catch {
    return null;
  }

  // #253: seamCheck may downgrade `fixable` to false for a pair that
  // diverges ONLY on its sub-segment split (refitSleeve can't correct a
  // front/back split imbalance) -- read that corrected value back by key,
  // rather than each seam step re-reading the RAW graph's own `fixable`,
  // so this module never advertises a fix the conflict UI itself wouldn't.
  const conflicts = seamCheck(seamGraph);
  const divergentKeys = new Set(conflicts.map((m) => m.key));
  const fixableByKey = new Map(conflicts.map((m) => [m.key, m.fixable]));

  const steps: AssemblyStep[] = [];

  // Darts first, always. A piece's darts are what SHAPE it, sewn before any
  // seam that joins it to another piece; putting every piece's darts ahead
  // of every seam step (rather than interleaving per-piece) is a stricter,
  // still-correct ordering -- real, standard construction advice, not a
  // simplification of it.
  for (const piece of pieces) {
    const darts = dartsOf(piece.internalsCm);
    if (darts.length > 0) {
      steps.push({
        kind: "dart",
        pieceId: piece.id,
        pieceName: pieceDisplayName(pattern, piece.id),
        count: darts.length,
      });
    }
  }

  // #244: a pleat's own fold-and-press step, same "shapes the piece before
  // any seam" priority as darts above -- a separate loop (not merged into
  // the one above) so a piece with both darts and a pleat still gets one
  // step per kind, never a single step conflating the two counts.
  for (const piece of pieces) {
    const pleats = pleatsOf(piece.internalsCm);
    if (pleats.length > 0) {
      steps.push({
        kind: "pleat",
        pieceId: piece.id,
        pieceName: pieceDisplayName(pattern, piece.id),
        count: pleats.length,
      });
    }
  }

  // One step per graph entry, no more, no fewer -- what assembly.test.ts's
  // matrix test asserts. Order among them comes only from phaseRank, a
  // stable sort so ties fall back to walkSeamPairs' own declaration order.
  const seamSteps: AssemblySeamStep[] = seamGraph.map((m) => ({
    kind: "seam",
    key: m.key,
    aPieceId: m.aPieceId,
    aPieceName: pieceDisplayName(pattern, m.aPieceId),
    bPieceId: m.bPieceId,
    bPieceName: pieceDisplayName(pattern, m.bPieceId),
    aLenCm: m.aLenCm,
    bLenCm: m.bLenCm,
    easeCm: m.easeCm,
    diffCm: m.diffCm,
    subSegmentDiffCm: m.subSegmentDiffCm,
    fixable: fixableByKey.get(m.key) ?? m.fixable,
    gatherRatio: m.gatherRatio,
    diverges: divergentKeys.has(m.key),
  }));
  seamSteps.sort((x, y) => phaseRank(x.key) - phaseRank(y.key));
  steps.push(...seamSteps);

  // Free hems last -- a finishing step on an edge nothing else in the graph
  // already claimed (see hemEdgeIsConsumed above).
  for (const piece of pieces) {
    const hemEdge = piece.seamEdges?.hem;
    if (!hemEdge) continue;
    if (hemEdgeIsConsumed(piece.id, hemEdge, seamGraph)) continue;
    const lengthCm =
      Math.round(
        curveArcLengthCm(piece.outlineCm, piece.curvedSpans ?? [], ...hemEdge) *
          10,
      ) / 10;
    steps.push({
      kind: "hem",
      pieceId: piece.id,
      pieceName: pieceDisplayName(pattern, piece.id),
      lengthCm,
    });
  }

  return { steps, hasConflict: divergentKeys.size > 0 };
}
