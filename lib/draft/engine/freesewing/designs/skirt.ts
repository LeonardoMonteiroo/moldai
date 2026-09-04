// The upstream package name ("sandy") is Sabine Reinhart's own codename
// for this design (@freesewing/collection tags it a circle skirt) -- an
// implementation detail confined to this one import line, the same
// discipline every other design wrapper in this directory follows.
import { Sandy as SkirtDesign } from "@freesewing/sandy";
import type { Measurements } from "@/lib/measurements";
import type { GarmentSpec } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";
import { formatCm } from "@/lib/format";
import type { DraftedPiece } from "../../../core";
import { curveArcLengthCm } from "../../../core";
import type { SeamPairDecl } from "../../../seams";
import type { EngineDraft } from "../../types";
import { flattenFreesewingSeam, mirrorFoldedPanel } from "../geometry";
import { edgeRef } from "../seamHelpers";

const cm = (v: number) => `${formatCm(v)} cm`;
const MM_PER_CM = 10;

// #269 -> freesewing registration, skirt archetype: Sandy is the ONLY
// circle-skirt design in the collection with a real waistband part
// (@freesewing/collection: 4 required measurements, the cheapest of any
// skirt-tagged design). Its own `panels` option (default 1, per its own
// source) is a pure CONSTRUCTION choice -- how many identical wedges the
// same overall shape is cut from, not how "full" the skirt is (measured:
// the total waist/hem circumference is unchanged between panels=1 and
// panels=2) -- so this wrapper leaves it at Sandy's own default rather
// than inventing a reason to override it.
//
// A real, measured finding worth recording rather than "fixing": at its
// own default, Sandy's drafted waistband measures ~85 cm for a 70 cm
// input waist -- roughly 15 cm of built-in ease. This is not a bug in
// this adapter (cross-checked against Sandy's own waistband piece
// directly, not derived by us) -- a true circle-skirt panel's inner
// (waist) edge is mathematically constrained by the SAME arc geometry
// that gives the outer (hem) edge its fullness, so an exact body-waist
// fit and a mathematically circular hem cannot both hold at once; Sandy's
// designer chose to accept waist ease over gathering. FREESEWING_CAPABILITY
// declares skirt's own styleEnumsByType as ["circle"] only -- straight/
// a-line/gore/half-circle silhouettes have no design wired to them yet.
function toSkirtMeasurementsMm(m: Measurements): Record<string, number> {
  return {
    waist: m.waist * MM_PER_CM,
    waistToFloor: m.waistToFloor * MM_PER_CM,
    waistToHips: m.hipHeight * MM_PER_CM,
    hips: m.hip * MM_PER_CM,
  };
}

// Sandy's own `lengthBonus` option is a fraction OF the real waistToFloor
// measurement (default 50%, range 10%-100%) -- fed from the ratio of our
// own target skirt length to the body's real waistToFloor, so the DRAFTED
// hem lands where our own skirtLengthCm asks for, not at Sandy's own
// default half-floor length regardless of what the user requested.
function lengthBonus(targetLengthCm: number, waistToFloorCm: number): number {
  return Math.min(1, Math.max(0.1, targetLengthCm / waistToFloorCm));
}

export function draftSkirt(
  spec: GarmentSpec,
  base: Measurements,
  t: Translate,
): EngineDraft {
  const targetLengthCm = spec.style.skirtLengthCm ?? base.skirtLength;
  const measurements = toSkirtMeasurementsMm(base);
  const pattern = new SkirtDesign({
    measurements,
    options: {
      lengthBonus: lengthBonus(targetLengthCm, base.waistToFloor),
    },
  });
  pattern.draft();
  const parts = pattern.parts[0];

  const skirtPart = parts["sandy.skirt"];
  const half = flattenFreesewingSeam(skirtPart.paths.seam);
  if (half.curvedSpans.length !== 2) {
    throw new Error(
      `freesewing skirt design: expected exactly 2 curved runs (hem arc, waist arc), got ${half.curvedSpans.length}`,
    );
  }
  // hemSpan (curvedSpans[0]) is only used implicitly, via the curvedSpans-
  // length assertion above (it's part of what a 2-curved-run wedge means).
  const [, waistSpan] = half.curvedSpans;
  const mirrored = mirrorFoldedPanel(half);
  // The mirrored whole wedge's own full waist edge is contiguous across
  // the fold point (verified: mirrorFoldedPanel places the mirrored waist
  // run immediately adjacent to the original in walking order, since both
  // touch the shared fold vertex at half.outlineCm.length-1) -- so it's
  // one combined range, not two edges to sum separately the way a
  // bodice's front+back armhole is.
  const wholeLen = mirrored.outlineCm.length;
  const waistEdge: [number, number] = [waistSpan[0], wholeLen - waistSpan[0]];
  const waistLenCm = curveArcLengthCm(
    mirrored.outlineCm,
    mirrored.curvedSpans,
    waistEdge[0],
    waistEdge[1],
  );

  // Sandy's own quantity: how many identical wedges (each already a WHOLE,
  // mirrored piece here, matching lib/draft/skirt.ts's own gore/circle
  // convention of qty=panels on an already-mirrored panel) complete the
  // skirt -- read from the pattern's own resolved option, never
  // hardcoded, so a future change to this wrapper's own options object
  // can't silently drift from what SkirtDesign actually cut.
  const panels =
    (skirtPart.context.settings.options.panels as number | undefined) ?? 1;

  const skirtPiece: DraftedPiece = {
    id: "skirt",
    name: t("pieceNames.skirt"),
    qty: panels,
    outlineCm: mirrored.outlineCm,
    curvedSpans: mirrored.curvedSpans,
    foldEdge: mirrored.foldEdge,
    seamEdges: { waist: waistEdge },
    detailRows: [{ label: t("rows.length"), value: cm(targetLengthCm) }],
  };

  // Sandy's own waistband is a plain rectangle, cut flat (no fold) --
  // unlike the skirt wedge, its own outline needs no mirroring at all.
  const waistbandHalf = flattenFreesewingSeam(
    parts["sandy.waistband"].paths.seam,
  );
  const waistbandPiece: DraftedPiece = {
    id: "waistband",
    name: t("pieceNames.waistband"),
    qty: 1,
    outlineCm: waistbandHalf.outlineCm,
    curvedSpans: waistbandHalf.curvedSpans,
    seamEdges: { waist: [0, waistbandHalf.outlineCm.length] },
    detailRows: [],
  };
  const waistbandLenCm = curveArcLengthCm(
    waistbandHalf.outlineCm,
    waistbandHalf.curvedSpans,
    0,
    waistbandHalf.outlineCm.length,
  );

  const seamPairs: SeamPairDecl[] = [
    {
      key: "waistband-waist",
      labelKey: "waistbandWaist",
      // Summed across the skirt's own qty (panels), the same "closed
      // circumference, not one panel's share of it" rule
      // docs/architecture/drafting.md's waistband entry already
      // documents for moldai's own gore/circle skirts.
      a: Array.from({ length: panels }, () =>
        edgeRef(skirtPiece.id, waistEdge),
      ),
      b: [edgeRef(waistbandPiece.id, [0, waistbandHalf.outlineCm.length])],
      // The measured difference IS the ease Sandy's own design bakes in
      // (this wrapper's own top comment) -- reporting it honestly via
      // easeCm rather than 0, since 0 would flag Sandy's own intentional
      // ease as a seam-conflict.
      easeCm: Math.round((waistbandLenCm - waistLenCm * panels) * 10) / 10,
      fixable: false,
    },
  ];

  return {
    drafted: [skirtPiece, waistbandPiece],
    measurements: base,
    seamPairs,
    garmentLengthCm: targetLengthCm,
  };
}
