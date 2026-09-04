// The upstream package name ("diana") is Nadia Rakita's own codename for
// this design (@freesewing/collection tags it "tops", a draped woven top)
// -- an implementation detail confined to this one import line, the same
// discipline lib/draft/engine/freesewing/designs/tshirt.ts's own top
// comment already established.
import { Diana as BlouseDesign } from "@freesewing/diana";
import type { Measurements } from "@/lib/measurements";
import type { GarmentSpec } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";
import { formatCm } from "@/lib/format";
import type { DraftedPiece } from "../../../core";
import { curveArcLengthCm } from "../../../core";
import type { SeamPairDecl } from "../../../seams";
import type { EngineDraft } from "../../types";
import type { FreesewingPath } from "../geometry";
import {
  flattenFreesewingSeam,
  mirrorFoldedPanel,
  locatePointIndex,
} from "../geometry";
import { edgeRef } from "../seamHelpers";

const cm = (v: number) => `${formatCm(v)} cm`;
const MM_PER_CM = 10;

// #269 -> freesewing registration, blouse archetype: Diana required the
// SAME 13 measurements Teagan does (verified via @freesewing/collection's
// own requiredMeasurements, before picking it), the cheapest of any
// tops-tagged design with a real sleeve and no yoke/collar/button-stand
// parts (simon/simone -- a genuine button-down shirt -- have those, but
// at 13 total parts vs Diana's 3; deferred, not silently dropped, to a
// later round that actually builds collar/cuff/frontClosure sub-piece
// adapters). shoulderSlope's unit conflict is identical to tshirt.ts's own
// (see that file for the sourcing); the conversion is duplicated here
// rather than shared, since the two adapters have no common module yet
// and a premature shared abstraction over two data points would be
// exactly what CLAUDE.md's "don't add abstractions beyond what's needed"
// warns against.
function shoulderSlopeDegrees(m: Measurements): number {
  const slope = m.shoulderSlope ?? 4.0;
  return (Math.atan(slope / m.shoulder) * 180) / Math.PI;
}

function toBlouseMeasurementsMm(m: Measurements): Record<string, number> {
  return {
    biceps: m.bicep * MM_PER_CM,
    chest: m.bust * MM_PER_CM,
    hpsToBust: m.bustPointHeight * MM_PER_CM,
    hpsToWaistBack: m.backLength * MM_PER_CM,
    neck: m.neckGirth * MM_PER_CM,
    shoulderToShoulder: m.shoulder * 2 * MM_PER_CM,
    shoulderSlope: shoulderSlopeDegrees(m),
    waistToArmpit: m.waistToArmpit * MM_PER_CM,
    waistToHips: m.hipHeight * MM_PER_CM,
    hips: m.hip * MM_PER_CM,
    waist: m.waist * MM_PER_CM,
    shoulderToWrist: m.shoulderToWrist * MM_PER_CM,
    wrist: m.wrist * MM_PER_CM,
    highBust: (m.highBust ?? m.bust) * MM_PER_CM,
  };
}

// Diana's own `sleeveLengthBonus` option (a fraction ADDED to full arm
// length, unlike Teagan's own 0..1 fraction OF full arm length) has a
// declared range of -40%..+10% (@freesewing/library's sleeve.mjs) --
// meaning even at its shortest, Diana's sleeve is at least 60% of the
// full shoulderToWrist, nowhere near a true short/cap sleeve. This is why
// FREESEWING_CAPABILITY's blouse entry declares styleEnums.sleeve as
// ["long"] only -- a "short" request is a real, reportable capability gap
// for this design, not something to silently approximate at the option's
// floor. This function still must not throw if it's ever called with
// "short" anyway (the same "checkEngineSupport gates, draft() trusts its
// caller" contract every other engine wrapper relies on), so it clamps
// into the option's own valid range rather than producing an out-of-range
// value FreeSewing itself would reject.
function sleeveLengthBonus(m: Measurements): number {
  const fraction = m.longSleeveLength / m.shoulderToWrist - 1;
  return Math.min(0.1, Math.max(-0.4, fraction));
}

function buildBodyPanel(
  half: ReturnType<typeof flattenFreesewingSeam>,
  points: Record<string, { x: number; y: number }>,
  id: string,
  name: string,
  t: Translate,
): { piece: DraftedPiece; seamEdges: Record<string, [number, number]> } {
  if (half.curvedSpans.length !== 2) {
    throw new Error(
      `freesewing blouse design: expected exactly 2 curved runs (side+armhole, neckline) on ${id}, got ${half.curvedSpans.length}`,
    );
  }
  const [sideArmholeRun, necklineRun] = half.curvedSpans;
  // Diana's own op count between `hem` and `armhole` is NOT constant
  // across bodies (its `hips` point can coincide with `hem`, collapsing a
  // line op) -- located by matching the real named-point coordinate
  // (lib/draft/engine/freesewing/geometry.ts's locatePointIndex) rather
  // than assumed from a fixed sample count the way tshirt.ts's own
  // SIDE_SAMPLES safely can (Teagan's equivalent op count IS provably
  // constant there -- see that file's own comment).
  const armholeIdx = locatePointIndex(
    half.outlineCm,
    points.armhole,
    sideArmholeRun[0],
    sideArmholeRun[1] + 1,
  );
  const mirrored = mirrorFoldedPanel(half);
  const seamEdges: Record<string, [number, number]> = {
    hem: [0, 1],
    side: [sideArmholeRun[0], armholeIdx],
    armhole: [armholeIdx, sideArmholeRun[1]],
    shoulder: [sideArmholeRun[1], necklineRun[0]],
    neckline: necklineRun,
  };
  const armholeLenCm = curveArcLengthCm(
    half.outlineCm,
    half.curvedSpans,
    armholeIdx,
    sideArmholeRun[1],
  );
  const piece: DraftedPiece = {
    id,
    name,
    qty: 1,
    outlineCm: mirrored.outlineCm,
    curvedSpans: mirrored.curvedSpans,
    foldEdge: mirrored.foldEdge,
    seamEdges,
    detailRows: [{ label: t("rows.armhole"), value: cm(armholeLenCm) }],
    armholeLenCm,
  };
  return { piece, seamEdges };
}

function buildSleeve(
  t: Translate,
  sleevePart: {
    paths: Record<string, FreesewingPath>;
    points: Record<string, { x: number; y: number }>;
  },
): {
  piece: DraftedPiece;
  seamEdges: Record<string, [number, number]>;
  capLenCm: number;
} {
  const flat = flattenFreesewingSeam(sleevePart.paths.seam);
  if (flat.curvedSpans.length !== 1) {
    throw new Error(
      `freesewing blouse design: expected exactly 1 curved run (the cap) on sleeve, got ${flat.curvedSpans.length}`,
    );
  }
  const [cap] = flat.curvedSpans;
  const n = flat.outlineCm.length;
  // Diana's own sleeve traces the loop starting at wristRight (not at a
  // hem corner the way Teagan's does: its own source moves to wristRight
  // first, verified against a live draft, not assumed), so the cap's own
  // two neighbouring straight edges land at different rotational
  // positions around the outline -- located from the actual wrist points
  // rather than assumed from Teagan's own layout. wristRight landing at
  // index 0 (rather than some other index) is what lets `hem` use the
  // existing "`to` === outlineCm.length wraps to index 0" convention
  // (lib/draft/body.ts's own seamEdges comment) -- asserted, not just
  // assumed, since the wrap convention has nowhere else to wrap TO.
  const wristRightIdx = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.wristRight,
  );
  if (wristRightIdx !== 0) {
    throw new Error(
      `freesewing blouse design: expected sleeve wristRight at outline index 0, got ${wristRightIdx}`,
    );
  }
  const wristLeftIdx = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.wristLeft,
  );
  const seamEdges: Record<string, [number, number]> = {
    underarmRight: [wristRightIdx, cap[0]],
    cap,
    underarmLeft: [cap[1], wristLeftIdx],
    hem: [wristLeftIdx, n],
  };
  const capLenCm = curveArcLengthCm(
    flat.outlineCm,
    flat.curvedSpans,
    cap[0],
    cap[1],
  );
  const piece: DraftedPiece = {
    id: "sleeve",
    name: t("pieceNames.sleeve"),
    qty: 2,
    outlineCm: flat.outlineCm,
    curvedSpans: flat.curvedSpans,
    seamEdges,
    detailRows: [{ label: t("rows.armhole"), value: cm(capLenCm) }],
  };
  return { piece, seamEdges, capLenCm };
}

export function draftBlouse(
  spec: GarmentSpec,
  base: Measurements,
  t: Translate,
): EngineDraft {
  const measurements = toBlouseMeasurementsMm(base);
  const pattern = new BlouseDesign({
    measurements,
    options: { sleeveLengthBonus: sleeveLengthBonus(base) },
  });
  pattern.draft();
  const parts = pattern.parts[0];

  const frontPart = parts["diana.front"];
  const backPart = parts["diana.back"];
  const frontHalf = flattenFreesewingSeam(frontPart.paths.seam);
  const backHalf = flattenFreesewingSeam(backPart.paths.seam);
  const { piece: front, seamEdges: frontEdges } = buildBodyPanel(
    frontHalf,
    frontPart.points,
    "body-front",
    t("pieceNames.front"),
    t,
  );
  const { piece: back, seamEdges: backEdges } = buildBodyPanel(
    backHalf,
    backPart.points,
    "body-back",
    t("pieceNames.back"),
    t,
  );
  const {
    piece: sleeve,
    seamEdges: sleeveEdges,
    capLenCm,
  } = buildSleeve(t, parts["diana.sleeve"]);

  const armholeLenCm = (front.armholeLenCm ?? 0) + (back.armholeLenCm ?? 0);

  const seamPairs: SeamPairDecl[] = [
    {
      key: "shoulder",
      labelKey: "shoulder",
      a: [edgeRef(front.id, frontEdges.shoulder)],
      b: [edgeRef(back.id, backEdges.shoulder)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "side",
      labelKey: "side",
      a: [edgeRef(front.id, frontEdges.side)],
      b: [edgeRef(back.id, backEdges.side)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "armhole-cap",
      labelKey: "armholeCap",
      a: [
        edgeRef(front.id, frontEdges.armhole),
        edgeRef(back.id, backEdges.armhole),
      ],
      // Diana's front/back inherit brian.base's own store-set
      // frontArmholeLength/backArmholeLength (verified against a live
      // draft: neither diana's own front.mjs/back.mjs sets them
      // explicitly), so the cap is genuinely fitted the same way
      // Teagan's is -- 0 reports that same sub-millimetre residual, not
      // an invented figure.
      b: [edgeRef(sleeve.id, sleeveEdges.cap)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "sleeve-underarm",
      labelKey: "sleeveUnderarm",
      a: [edgeRef(sleeve.id, sleeveEdges.underarmRight)],
      b: [edgeRef(sleeve.id, sleeveEdges.underarmLeft)],
      easeCm: 0,
      fixable: false,
    },
  ];

  return {
    drafted: [front, back, sleeve],
    measurements: base,
    seamPairs,
    armholeLenCm,
    sleeveArmholeCm: capLenCm,
    garmentLengthCm: base.backLength,
  };
}
