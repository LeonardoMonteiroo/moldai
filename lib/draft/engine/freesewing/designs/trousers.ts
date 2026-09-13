// The upstream package name ("titan") is Joost De Cock's own codename for
// this design (@freesewing/collection tags it a straight-leg trouser
// BLOCK -- no pockets, fly or waistband, matching moldai's own
// lib/draft/trousers.ts scope decision) -- an implementation detail
// confined to this one import line, the same discipline every other
// design wrapper in this directory follows.
import { Titan as TrousersDesign } from "@freesewing/titan";
import type { Measurements } from "@/lib/measurements";
import type { GarmentSpec, Gender } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";
import type { DraftedPiece } from "../../../core";
// #326: the SAME fraction-of-reference-row math the moldai engine's
// trousers drafter uses (lib/draft/trousers.ts) -- an explicit or defaulted
// style.trouserLengthCm has no engine-specific meaning, so both engines
// normalize it against the pattern's actual base-size row identically.
// Reused, not re-derived -- see core.ts's own doc and designs/skirt.ts's
// identical precedent (#249).
import {
  curveArcLengthCm,
  gradedLengthCm,
  NO_PLACEMENT_TRANSFORM,
} from "../../../core";
import type { SeamPairDecl } from "../../../seams";
import type { EngineDraft } from "../../types";
import { draftWaistband, WAISTBAND_OVERLAP_CM } from "../../../subpieces";
import { TROUSER_DEFAULT_LENGTH_CM } from "../../../trousers";
import { flattenFreesewingSeam, locatePointIndex } from "../geometry";
import { edgeRef } from "../seamHelpers";

const MM_PER_CM = 10;

// #269 -> freesewing registration, trousers archetype: Titan was chosen
// over waralee (12 parts: wrap-specific straps/cutout/facings), charlie
// (15 parts: full pocket/fly/beltloop construction) and cornelius (a
// self-intersecting front panel in a live draft, and a waistband that
// never closed) after drafting all four live -- Titan is the only one
// that's a genuine 2-part (front+back) BLOCK, matching this repo's own
// trousers.ts scope. Its own required-measurement list splits front/back
// at the waist and seat (crossSeam/crossSeamFront/seatBack/waistBack) --
// a real body asymmetry moldai's own straight-leg drafter simplifies
// away by construction (see that file's own top comment) -- which is why
// 6 of its 12 required measurements had no moldai equivalent and were
// added to CORE_MEASUREMENT_KEYS (see lib/measurements.ts and
// docs/decisions/drafting.md). The 12th, waistToHips, is NOT a 7th new
// key -- it's the same body measurement moldai already calls hipHeight
// (waist -> hip, vertical), the same substitution
// lib/draft/engine/freesewing/designs/skirt.ts already makes.
function toTrousersMeasurementsMm(m: Measurements): Record<string, number> {
  return {
    crossSeam: m.crossSeam * MM_PER_CM,
    crossSeamFront: m.crossSeamFront * MM_PER_CM,
    knee: m.knee * MM_PER_CM,
    seat: m.seat * MM_PER_CM,
    seatBack: m.seatBack * MM_PER_CM,
    waist: m.waist * MM_PER_CM,
    waistBack: m.waistBack * MM_PER_CM,
    waistToFloor: m.waistToFloor * MM_PER_CM,
    waistToKnee: m.waistToKnee * MM_PER_CM,
    waistToHips: m.hipHeight * MM_PER_CM,
    waistToSeat: m.waistToSeat * MM_PER_CM,
    waistToUpperLeg: m.waistToUpperLeg * MM_PER_CM,
  };
}

// Titan's own `lengthBonus` option is a fraction ADDED to the real
// waistToFloor measurement (range -20%..+10%, @freesewing/titan's own
// back.mjs) -- fed from the ratio of our own target trouser length to the
// body's real waistToFloor, so the drafted hem lands where our own
// trouserLengthCm asks for, not at Titan's own default (a full-length
// trouser). Same shape as skirt.ts's own lengthBonus.
function lengthBonus(targetLengthCm: number, waistToFloorCm: number): number {
  const fraction = targetLengthCm / waistToFloorCm - 1;
  return Math.min(0.1, Math.max(-0.2, fraction));
}

// One leg panel (front or back). Titan draws each as a WHOLE, asymmetric
// single-leg shape -- unlike a bodice/skirt panel there is no fold, so
// (matching lib/draft/trousers.ts's own convention) neither panel
// declares a foldEdge; the mirrored leg is the exact same cut piece
// flipped, qty 2.
//
// Titan's own path always starts and ends at the SAME point (`waistOut`
// on the front, `fork` on the back), which the flattening in
// geometry.ts's flattenFreesewingSeam already drops as the redundant
// closing duplicate -- so the piece's own index 0 IS that landmark, wrap
// (`to === outlineCm.length`) reaches back to it, and there is no need to
// locate it. What DOES need locating is the STYLED waist corners
// (`styleWaistIn`/`styleWaistOut`, not the anatomical `waistIn`/
// `waistOut`): Titan always draws its cut edge at the styled waist
// height (its own `waistbandWidth` option defaults to a nonzero
// percentage, per @freesewing/titan's own front.mjs/back.mjs), a few cm
// below the anatomical waist point -- verified against a live draft
// across two very different measurement sets before writing this, since
// the earlier tshirt.ts SIDE_SAMPLES-style hardcoded-offset shortcut is
// NOT safe here: Titan's own op count is not stable across bodies (an
// extra on-path point can appear or vanish depending on how its internal
// crotch-curve fitting loop settles), unlike Teagan's provably constant
// structure.
function trouserPanel(
  half: ReturnType<typeof flattenFreesewingSeam>,
  points: Record<string, { x: number; y: number }>,
  id: string,
  name: string,
  isFront: boolean,
  t: Translate,
): { piece: DraftedPiece; seamEdges: Record<string, [number, number]> } {
  const forkIdx = locatePointIndex(half.outlineCm, points.fork);
  const floorOutIdx = locatePointIndex(half.outlineCm, points.floorOut);
  const floorInIdx = locatePointIndex(half.outlineCm, points.floorIn);
  const waistInIdx = locatePointIndex(half.outlineCm, points.styleWaistIn);
  const waistOutIdx = locatePointIndex(half.outlineCm, points.styleWaistOut);
  const n = half.outlineCm.length;

  // Front walks waistOut(0) -> outseam -> floorOut -> hem -> floorIn ->
  // inseam -> fork -> rise -> waistIn -> wrap(waistOut). Back walks
  // fork(0) -> inseam -> floorIn -> hem -> floorOut -> outseam ->
  // waistOut -> waist -> waistIn -> wrap(fork). Both start at index 0 by
  // construction (Titan's own `.move()` call); asserted, not assumed.
  const startIdx = isFront ? waistOutIdx : forkIdx;
  if (startIdx !== 0) {
    throw new Error(
      `freesewing trousers design: expected ${id}'s own path to start at its own ${isFront ? "waistOut" : "fork"} (index 0), got index ${startIdx}`,
    );
  }

  const seamEdges: Record<string, [number, number]> = isFront
    ? {
        outseam: [0, floorOutIdx],
        hem: [floorOutIdx, floorInIdx],
        inseam: [floorInIdx, forkIdx],
        rise: [forkIdx, waistInIdx],
        waist: [waistInIdx, n],
      }
    : {
        inseam: [0, floorInIdx],
        hem: [floorInIdx, floorOutIdx],
        outseam: [floorOutIdx, waistOutIdx],
        waist: [waistOutIdx, waistInIdx],
        rise: [waistInIdx, n],
      };

  const piece: DraftedPiece = {
    id,
    name,
    qty: 2, // one leg mirrors the other -- cut 2, flipping the fabric
    outlineCm: half.outlineCm,
    curvedSpans: half.curvedSpans,
    seamEdges,
    detailRows: [
      {
        label: t("rows.trouserLeg"),
        value: t("trouserLeg.straight"),
      },
      // Following lib/draft/trousers.ts's own precedent: this is the
      // only leg shape this design wrapper drafts today.
      { label: t("rows.trouserOtherLegs"), value: t("comingSoonBadge") },
    ],
    // #254: the same Proof3DRole lib/draft/trousers.ts's own moldai panels
    // declare, so lib/proof3d/mesh.ts's findByRole finds this engine's own
    // leg panels too, regardless of which engine drafted the pattern.
    placementCm: {
      role: isFront ? "trouser-front" : "trouser-back",
      ...NO_PLACEMENT_TRANSFORM,
    },
  };
  return { piece, seamEdges };
}

export function draftTrousers(
  spec: GarmentSpec,
  base: Measurements,
  t: Translate,
  // #326: the pattern's actual base-size row -- defaults to `base` itself,
  // so a caller drafting the base size (or predating #326) sees
  // byte-identical output (gradedLengthCm collapses to the explicit value
  // unchanged when both rows are the same one). Only
  // lib/draft/engine/freesewing/index.ts's own `draft()` passes a
  // genuinely different row, for a graded (non-base) size. Same contract as
  // designs/skirt.ts's own referenceMeasurements param (#249).
  referenceMeasurements: Measurements = base,
): EngineDraft {
  // Same default moldai's own drafter uses (TROUSER_DEFAULT_LENGTH_CM: a
  // per-gender ankle-length figure at the reference row -- not
  // base.waistToFloor, which is a real full-length-to-the-floor body
  // measurement and would draft a noticeably longer trouser than moldai's
  // own default for the exact same "no length specified" spec). #326: the
  // resolved value -- explicit or defaulted -- now grades against
  // waistToFloor the same way an explicit skirtLengthCm already grades
  // against skirtLength (#249), instead of printing flat across every size.
  const gender: Gender = spec.gender ?? "female";
  const targetLengthCm = gradedLengthCm(
    spec.style.trouserLengthCm ?? TROUSER_DEFAULT_LENGTH_CM[gender],
    base.waistToFloor,
    referenceMeasurements.waistToFloor,
  );
  const measurements = toTrousersMeasurementsMm(base);
  const pattern = new TrousersDesign({
    measurements,
    options: {
      lengthBonus: lengthBonus(targetLengthCm, base.waistToFloor),
    },
  });
  pattern.draft();
  const parts = pattern.parts[0];

  const frontPart = parts["titan.front"];
  const backPart = parts["titan.back"];
  const frontHalf = flattenFreesewingSeam(frontPart.paths.seam);
  const backHalf = flattenFreesewingSeam(backPart.paths.seam);
  const { piece: front, seamEdges: frontEdges } = trouserPanel(
    frontHalf,
    frontPart.points,
    "trouser-front",
    t("pieceNames.front"),
    true,
    t,
  );
  const { piece: back, seamEdges: backEdges } = trouserPanel(
    backHalf,
    backPart.points,
    "trouser-back",
    t("pieceNames.back"),
    false,
    t,
  );

  const waistLenCm =
    curveArcLengthCm(
      front.outlineCm,
      front.curvedSpans ?? [],
      ...frontEdges.waist,
    ) *
      front.qty +
    curveArcLengthCm(
      back.outlineCm,
      back.curvedSpans ?? [],
      ...backEdges.waist,
    ) *
      back.qty;
  const waistband = draftWaistband(waistLenCm, t);

  const seamPairs: SeamPairDecl[] = [
    // The front/back rise each mate against their OWN mirrored copy (the
    // fly seam for the front, the back rise seam for the back) -- the
    // same self-pair shape lib/draft/trousers.ts's own rise entries use.
    {
      key: "trouser-front-rise",
      labelKey: "trouserFrontRise",
      a: [edgeRef(front.id, frontEdges.rise)],
      b: [edgeRef(front.id, frontEdges.rise)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "trouser-back-rise",
      labelKey: "trouserBackRise",
      a: [edgeRef(back.id, backEdges.rise)],
      b: [edgeRef(back.id, backEdges.rise)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "trouser-inseam",
      labelKey: "trouserInseam",
      a: [edgeRef(front.id, frontEdges.inseam)],
      b: [edgeRef(back.id, backEdges.inseam)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "trouser-outseam",
      labelKey: "trouserOutseam",
      a: [edgeRef(front.id, frontEdges.outseam)],
      b: [edgeRef(back.id, backEdges.outseam)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "trouser-waistband-waist",
      labelKey: "waistbandWaistTrousers",
      a: [
        ...Array.from({ length: front.qty }, () =>
          edgeRef(front.id, frontEdges.waist),
        ),
        ...Array.from({ length: back.qty }, () =>
          edgeRef(back.id, backEdges.waist),
        ),
      ],
      b: [edgeRef(waistband.id, waistband.seamEdges!.waist)],
      easeCm: WAISTBAND_OVERLAP_CM,
      fixable: false,
    },
  ];

  return {
    drafted: [front, back, waistband],
    measurements: base,
    seamPairs,
    garmentLengthCm: targetLengthCm,
  };
}
