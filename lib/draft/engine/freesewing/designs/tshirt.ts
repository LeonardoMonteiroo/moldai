// The upstream package name ("teagan") is Joost De Cock's own codename for
// this design (@freesewing/collection tags it "tops") -- an implementation
// detail confined to this one import line. Every other identifier in this
// file (and its own file name) is named after the GarmentType it drafts,
// not the designer's arbitrary name for their block, the same "code
// identifiers are ours, never a transliterated third-party term"
// discipline CLAUDE.md applies to domain terms generally.
import { Teagan as TshirtDesign } from "@freesewing/teagan";
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
  CURVE_SAMPLES_PER_OP,
} from "../geometry";
import { edgeRef } from "../seamHelpers";

const cm = (v: number) => `${formatCm(v)} cm`;
const MM_PER_CM = 10;

// #269 -> freesewing registration: Teagan is the tshirt archetype's mapped
// design (docs/reference/freesewing-spike measured it against
// docs/reference/tshirt-benchmark; @freesewing/collection's own
// requiredMeasurements gave the cheapest new-vocabulary cost of any
// tops-tagged design that also has a real sleeve).
//
// `shoulderSlope` is the one measurement with a genuine unit conflict, not a
// naming one: ours is a vertical drop in cm (lib/measurements.ts), Teagan's
// is degrees (confirmed by source in BOTH the freesewing and GarmentCode
// spikes independently: np.deg2rad on the GarmentCode side). Converted here,
// at the adapter boundary, never by adding a second shoulderSlope field to
// Measurements -- that would be the "second copy of a fact that already has
// an owner" CLAUDE.md names as a non-negotiable. The horizontal reference
// for the angle is the shoulder's own half-width (lib/measurements.ts's
// `shoulder`, the run a shoulder seam actually covers) -- an approximation
// (a real shoulder seam isn't perfectly straight), but sourced from the two
// quantities this repo actually asks a user to measure, not invented.
function shoulderSlopeDegrees(m: Measurements): number {
  const slope = m.shoulderSlope ?? 4.0;
  return (Math.atan(slope / m.shoulder) * 180) / Math.PI;
}

function toTshirtMeasurementsMm(m: Measurements): Record<string, number> {
  return {
    biceps: m.bicep * MM_PER_CM,
    chest: m.bust * MM_PER_CM,
    hpsToBust: m.bustPointHeight * MM_PER_CM,
    hpsToWaistBack: m.backLength * MM_PER_CM,
    neck: m.neckGirth * MM_PER_CM,
    // Teagan's own measurement is the FULL shoulder seam-to-seam width;
    // lib/measurements.ts's `shoulder` is documented as the HALF-width from
    // the body's centre line to the shoulder tip (see drafting.md) -- so
    // this is a unit doubling, not a different quantity.
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

// Teagan's own `sleeveLength` option is a 0..1 fraction of the arm (its
// `sleeve.mjs` scales the cap/sleeve height off it), min 0.2/max 1.0 by its
// own design -- fed from the RATIO of our own finished-length style target
// (shortSleeveLength/longSleeveLength, a garment length) to the body's own
// full arm length (shoulderToWrist), the same "our two length fields drive
// the proportion, never a second invented number" approach the rest of this
// adapter follows. Teagan has no sleeveless option (it's a t-shirt design,
// physically always sleeved) -- style.sleeve === "none" is a declared
// capability gap (FREESEWING_CAPABILITY.styleEnumsByType.tshirt.sleeve omits
// "none"), reported by checkEngineSupport before this ever runs; this
// function still must not throw on it, so it falls back to "short" the same
// way an unsupported style value drafts anyway with the field effectively
// dropped elsewhere in this codebase (docs/decisions/drafting.md's
// styleField-gap precedent).
function sleeveLengthFraction(spec: GarmentSpec, m: Measurements): number {
  const armCm = m.shoulderToWrist;
  const targetCm =
    spec.style.sleeve === "long" ? m.longSleeveLength : m.shortSleeveLength;
  const fraction = targetCm / armCm;
  return Math.min(1, Math.max(0.2, fraction));
}

// Verified against @freesewing/teagan's own source (front.mjs/back.mjs,
// identical structure in both) and a live draft's named points, not
// guessed from the raw op list: `paths.seam` is built as
// move(cfHem/cbHem) -> hemBase (1 line: hem-centre -> hem-side) ->
// sideSeam (1 curve: hem-side -> armhole, UNLESS `fitWaist` is set, which
// this adapter never does -- Teagan's own default is false) -> saBase (2
// curves: armhole -> armholeHollow -> shoulder, then 1 line: shoulder ->
// neck, then 1 curve: neck -> cfNeck/cbNeck) -> a closing line back to
// cfHem (dropped by flattenFreesewingSeam's own dedup). So the "3
// consecutive curve ops" flattenFreesewingSeam merges into ONE run is
// actually TWO named features back to back with no straight edge between
// them -- side (1 op) then armhole (2 ops) -- not one continuous
// "armhole" the way an earlier version of this file assumed (a bug this
// comment exists to keep from recurring: that assumption measured the
// WHOLE side+armhole run as "the armhole," off by roughly 3x, caught by
// tshirt.test.ts's own store-value cross-check against
// `library.sleeve.frontArmholeLength`/`backArmholeLength`).
const SIDE_SAMPLES = CURVE_SAMPLES_PER_OP; // exactly 1 curve op, hem -> armhole

function buildBodyPanel(
  half: ReturnType<typeof flattenFreesewingSeam>,
  id: string,
  name: string,
  t: Translate,
): { piece: DraftedPiece; seamEdges: Record<string, [number, number]> } {
  if (half.curvedSpans.length !== 2) {
    throw new Error(
      `freesewing tshirt design: expected exactly 2 curved runs (side+armhole, neckline) on ${id}, got ${half.curvedSpans.length}`,
    );
  }
  const [sideArmholeRun, necklineRun] = half.curvedSpans;
  const armholeStart = sideArmholeRun[0] + SIDE_SAMPLES;
  const mirrored = mirrorFoldedPanel(half);
  const seamEdges: Record<string, [number, number]> = {
    hem: [0, 1],
    side: [sideArmholeRun[0], armholeStart],
    armhole: [armholeStart, sideArmholeRun[1]],
    shoulder: [sideArmholeRun[1], necklineRun[0]],
    neckline: necklineRun,
  };
  const armholeLenCm = curveArcLengthCm(
    half.outlineCm,
    half.curvedSpans,
    armholeStart,
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
  sleevePart: { paths: Record<string, FreesewingPath> },
): {
  piece: DraftedPiece;
  seamEdges: Record<string, [number, number]>;
  capLenCm: number;
} {
  const flat = flattenFreesewingSeam(sleevePart.paths.seam);
  if (flat.curvedSpans.length !== 1) {
    throw new Error(
      `freesewing tshirt design: expected exactly 1 curved run (the cap) on sleeve, got ${flat.curvedSpans.length}`,
    );
  }
  const [cap] = flat.curvedSpans;
  const n = flat.outlineCm.length;
  const seamEdges: Record<string, [number, number]> = {
    hem: [0, 1],
    cap,
    underarmRight: [1, 2],
    underarmLeft: [n - 1, n],
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

export function draftTshirt(
  spec: GarmentSpec,
  base: Measurements,
  t: Translate,
): EngineDraft {
  const measurements = toTshirtMeasurementsMm(base);
  const pattern = new TshirtDesign({
    measurements,
    options: { sleeveLength: sleeveLengthFraction(spec, base) },
  });
  pattern.draft();
  const parts = pattern.parts[0];

  const frontHalf = flattenFreesewingSeam(parts["teagan.front"].paths.seam);
  const backHalf = flattenFreesewingSeam(parts["teagan.back"].paths.seam);
  const { piece: front, seamEdges: frontEdges } = buildBodyPanel(
    frontHalf,
    "body-front",
    t("pieceNames.front"),
    t,
  );
  const { piece: back, seamEdges: backEdges } = buildBodyPanel(
    backHalf,
    "body-back",
    t("pieceNames.back"),
    t,
  );
  const {
    piece: sleeve,
    seamEdges: sleeveEdges,
    capLenCm,
  } = buildSleeve(t, parts["teagan.sleeve"]);

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
      b: [edgeRef(sleeve.id, sleeveEdges.cap)],
      // Teagan's own cap-fitting loop (docs/reference/freesewing-spike)
      // solves for a cap length that already targets armhole + this
      // design's own sleevecapEase option (0 by Teagan's own default,
      // verified against a live draft) -- 0 here reports the SAME residual
      // gap the spike measured (well under a millimetre), not a second,
      // invented ease figure.
      easeCm: 0,
      // Unlike moldai's own armhole/cap pair, there is no "Corrigir manga"
      // affordance wired for this engine (lib/editor/state.ts's
      // refitSleeve isn't a recognized style field in
      // FREESEWING_CAPABILITY) -- and none is needed: Teagan's own
      // iterative solver already converges the cap to within the
      // sub-millimetre residual the spike measured, so offering a fix
      // button that does nothing would be dishonest.
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
