import type { GarmentSpec, Piece } from "@/lib/types";
import type { Measurements } from "@/lib/measurements";
import type { Translate } from "@/lib/i18n/translate";
import {
  autoLayout,
  PX,
  outlinePath,
  polyPath,
  translateOutline,
  DraftedPiece,
} from "../core";
import { walkSeamPairs, SeamMeasurement } from "../seams";
import type { GradedOverlay } from "../garment";
import { getEngine } from "./registry";
import type { EngineId } from "./capability";

// #267: the five declared entry points every consumer must go through --
// EngineId is a REQUIRED first parameter (not an optional trailing one
// defaulting to "moldai"), so every existing call site had to become a
// compile error until updated, the same "rename forces every caller to be
// a compile error" reasoning lib/schemas/pattern.ts already uses for
// money-shaped renames. No consumer may import garment.ts's five functions
// directly any more (enforced by lib/draft/engine/conformance.test.ts's
// source scan) -- this file is the one and only public surface.
//
// Every one of these is engine-agnostic post-processing over
// DraftingEngine.draft(): walkSeamPairs (lib/draft/seams.ts) and autoLayout
// (lib/draft/core.ts) are shared infrastructure, not moldai-specific, so
// none of this logic lives in lib/draft/engine/moldai.ts.

export function draftPiecesCm(
  engine: EngineId,
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
  // #249: optional, additive -- the pattern's actual base-size row, passed
  // only by a caller drafting a size OTHER than that base (buildExportModel
  // exporting a graded size, draftGradedOverlays below). Omitted, every
  // existing call site sees byte-identical output (see
  // DraftingEngine.draft's own doc, lib/draft/engine/types.ts).
  referenceMeasurements?: Measurements,
): DraftedPiece[] {
  return getEngine(engine).draft(
    spec,
    baseMeasurements,
    t,
    referenceMeasurements,
  ).drafted;
}

// The pair of seam lengths seamCheck compares, without the pieces or the
// layout. Both are undefined for a garment with no armhole (a skirt). The
// conflict card and the canvas markers derive their numbers from here
// rather than reading them off a persisted ConflictInfo -- they follow from
// the spec, so storing them beside the armholeDeepenCm that moved them
// would be the same duplication CLAUDE.md already removed twice
// (Pattern.savedAgo, Wallet.planLabel) -- and deriving also gives the
// lengths to conflicts persisted before this existed.
export function measureSeams(
  engine: EngineId,
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
  // #249: optional, additive, same contract as draftPiecesCm's own param
  // above -- every current caller (CanvasArea) only ever measures the
  // pattern's own base size, so this stays unused today, but omitting it
  // from this entry point while draftPiecesCm/draftGradedOverlays already
  // thread it through would leave a caller that DOES measure a graded size
  // silently re-freezing an explicit style.skirtLengthCm's garmentLengthCm
  // at the base-size value -- exactly #249's own bug, through a facade
  // entry point this fix would otherwise have missed.
  referenceMeasurements?: Measurements,
): {
  armholeLenCm?: number;
  sleeveArmholeCm?: number;
  garmentLengthCm?: number;
} {
  const { armholeLenCm, sleeveArmholeCm, garmentLengthCm } = getEngine(
    engine,
  ).draft(spec, baseMeasurements, t, referenceMeasurements);
  return { armholeLenCm, sleeveArmholeCm, garmentLengthCm };
}

// #134: the FULL seam graph -- every mated pair this garment declares,
// whether or not it diverges -- measured off the engine's own DECLARATIONS
// via walkSeamPairs (lib/draft/seams.ts), never supplied by the engine
// itself (#267: an engine can only ever declare a pair, never measure one).
// This is what CanvasArea hands to ConflictInfoCard/PatternCanvas for the
// multi-entry conflict list, and the shape #138's assembly/sewing-order
// feature consumes directly.
export function measureSeamGraph(
  engine: EngineId,
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
  // #249: same optional, additive contract as measureSeams's own param above.
  referenceMeasurements?: Measurements,
): SeamMeasurement[] {
  const { drafted, seamPairs } = getEngine(engine).draft(
    spec,
    baseMeasurements,
    t,
    referenceMeasurements,
  );
  return walkSeamPairs(drafted, seamPairs);
}

// #59: graduation produces real per-size geometry, recomputed on demand
// from the pattern's own frozen sizeTable rather than persisted onto it --
// the same derive-don't-store precedent as measureSeams/fitPieceLabel. Each
// applied size is redrafted with draftPiecesCm and aligned onto the base
// piece's own already-placed position (read off its `vertices[0]`, not
// re-run through autoLayout), so the two outlines land in the same canvas
// coordinate space and are visually comparable.
//
// Relies on the DraftingEngine contract's own invariant (pinned by
// lib/draft/engine/conformance.test.ts): for a fixed spec, an engine's
// drafted piece order/ids/count depend only on the spec, never on the
// measurements row -- which is what makes pairing base/graded pieces BY
// ARRAY INDEX safe.
export function draftGradedOverlays(
  engine: EngineId,
  spec: GarmentSpec,
  pieces: Piece[],
  baseMeasurements: Measurements,
  sizeTable: Record<string, Measurements>,
  sizes: string[],
  t: Translate,
): GradedOverlay[] {
  if (sizes.length === 0) return [];
  const baseDrafted = draftPiecesCm(engine, spec, baseMeasurements, t);
  const overlays: GradedOverlay[] = [];
  for (const size of sizes) {
    const measurements = sizeTable[size];
    if (!measurements) continue;
    // #249: the base row is passed as the reference so an explicit
    // style.skirtLengthCm grades the overlay's own hem the same way the
    // export path does (lib/export/model.ts's buildExportModel) -- without
    // it, the overlay would keep showing every graded size at one identical
    // hem, misleading the user before they even export.
    const graded = draftPiecesCm(
      engine,
      spec,
      measurements,
      t,
      baseMeasurements,
    );
    graded.forEach((dp, i) => {
      const base = baseDrafted[i];
      const placed = pieces[i];
      // A piece with no vertices predates the measure tool's snap (#79's
      // legacy-blob case) -- there's no placed position to align onto.
      if (!base || !placed?.vertices?.length) return;
      const [bx, by] = base.outlineCm[0];
      const dxPx = placed.vertices[0].x - PX(bx);
      const dyPx = placed.vertices[0].y - PX(by);
      const rawOutline = dp.curvedSpans?.length
        ? outlinePath(dp.outlineCm, dp.curvedSpans)
        : polyPath(dp.outlineCm);
      overlays.push({
        pieceId: dp.id,
        size,
        outline: translateOutline(rawOutline, dxPx, dyPx),
      });
    });
  }
  return overlays;
}

export function draftGarment(
  engine: EngineId,
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
) {
  const {
    drafted,
    measurements,
    armholeLenCm,
    sleeveArmholeCm,
    garmentLengthCm,
    seamPairs,
  } = getEngine(engine).draft(spec, baseMeasurements, t);
  const { pieces, viewBox } = autoLayout(drafted, 8);
  return {
    pieces,
    viewBox,
    measurements,
    armholeLenCm,
    sleeveArmholeCm,
    garmentLengthCm,
    seamGraph: walkSeamPairs(drafted, seamPairs),
  };
}

export type { GradedOverlay };
