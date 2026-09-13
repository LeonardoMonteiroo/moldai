import type { GarmentSpec, GarmentStyle, GarmentType } from "@/lib/types";
import type { Measurements } from "@/lib/measurements";
import type { DraftedPiece } from "../core";
import type { SeamPairDecl } from "../seams";
import type { Translate } from "@/lib/i18n/translate";
import type { EngineCapability, EngineId } from "./capability";

// #267: the declared, pluggable drafting-engine contract. A leaf module --
// every import here is `import type`, so it costs nothing at runtime and
// pulls no drafter into a client bundle; `DraftedPiece`/`SeamPairDecl` are
// shared geometry infrastructure (lib/draft/core.ts, lib/draft/seams.ts),
// not per-garment drafters, so referencing their types here doesn't violate
// the leaf property the same way importing body.ts/sleeve.ts/etc. would.

/**
 * What one call to `DraftingEngine.draft` returns.
 *
 * `seamPairs` are DECLARATIONS, never measurements: an engine states which
 * edge ranges on which drafted pieces are meant to mate, and
 * lib/draft/seams.ts's `walkSeamPairs` (already pure and engine-agnostic)
 * measures the real arc lengths off `drafted` in OUR code. This is what
 * makes "the seam graph stays ours and engine-agnostic" (CLAUDE.md, #267)
 * structural rather than a convention an engine implementation could
 * violate -- an engine physically cannot hand back a measurement, only a
 * declaration.
 *
 * `armholeLenCm`/`sleeveArmholeCm` stay first-class fields (not derived from
 * `seamPairs` once walked) on purpose: `walkSeamPairs` rounds every measured
 * length to 0.1 cm, while these two are today's raw, unrounded drafter
 * output, read by `lib/editor/state.ts`'s legacy singular `ConflictInfo`
 * fields, `VersionCompare`'s Cava delta, and `CanvasArea`'s marker fallback.
 * Deriving them from the rounded graph would be a real, if small, behavior
 * change to every one of those -- verified by reading garment.ts's own
 * `draftAll` (armholeLenCm/sleeveArmholeCm are assigned straight from
 * draftBody/draftSleeve's return, never through walkSeamPairs's rounding).
 *
 * Contract every engine must uphold (pinned by
 * lib/draft/engine/conformance.test.ts): for a fixed `spec`, `drafted`'s
 * length, order and piece ids depend only on the spec -- never on the
 * measurements row. `draftGradedOverlays` pairs a base draft against a
 * graded one BY ARRAY INDEX and relies on this.
 */
export interface EngineDraft {
  drafted: DraftedPiece[];
  measurements: Measurements;
  seamPairs: SeamPairDecl[];
  armholeLenCm?: number;
  sleeveArmholeCm?: number;
  garmentLengthCm?: number;
}

/**
 * One registered drafting engine. `"moldai"` (lib/draft/engine/moldai.ts)
 * is the only one registered by #267 -- see lib/draft/engine/registry.ts.
 *
 * `capability` MUST be the same object `lib/draft/vocabulary`-derived leaf
 * constant the engine's own capability.ts export builds (never a private
 * copy): a client component reading an engine's capability without
 * importing the engine itself (e.g. NewPatternForm disabling an
 * unsupported garment type) depends on capability being reachable through
 * the leaf `capability.ts` alone.
 */
export interface DraftingEngine {
  id: EngineId;
  capability: EngineCapability;
  // #249/#326: `referenceMeasurements` is OPTIONAL and additive -- a caller
  // drafting the pattern's own base size (or written before #249) omits it
  // entirely, and every existing engine implementation keeps compiling
  // unchanged (a function with fewer declared parameters is still a valid
  // implementer of a type with a trailing optional one). Both engines read
  // it today (lib/draft/garment.ts's draftAll and lib/draft/engine/
  // freesewing/index.ts's own draft(), to normalize an explicit
  // style.skirtLengthCm/trouserLengthCm against the pattern's actual
  // base-size row rather than the row currently being drafted -- see
  // lib/draft/core.ts's gradedLengthCm).
  draft(
    spec: GarmentSpec,
    base: Measurements,
    t: Translate,
    referenceMeasurements?: Measurements,
  ): EngineDraft;
}

// Re-exported so a consumer importing only ./types still sees the shape
// GarmentType/GarmentStyle play in EngineCapability, without a second
// import line -- kept here rather than duplicated, since both are already
// leaf, type-only imports.
export type { GarmentType, GarmentStyle };
