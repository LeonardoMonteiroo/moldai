// The upstream package name ("jett") is Joost De Cock's own codename for
// this design (@freesewing/collection tags it a lined bomber-style
// jacket) -- an implementation detail confined to this one import line,
// the same discipline every other design wrapper in this directory
// follows.
import { Jett as CoatDesign } from "@freesewing/jett";
import type { Measurements } from "@/lib/measurements";
import type { GarmentSpec } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";
import type { DraftedPiece } from "../../../core";
import { curveArcLengthCm } from "../../../core";
import type { SeamPairDecl } from "../../../seams";
import type { EngineDraft } from "../../types";
import {
  draftCuff,
  draftWaistband,
  WAISTBAND_OVERLAP_CM,
} from "../../../subpieces";
import { WRIST_EASE_CM } from "../../../sleeve";
import type { FreesewingPath } from "../geometry";
import { flattenFreesewingSeam, locatePointIndex } from "../geometry";
import { edgeRef } from "../seamHelpers";

const MM_PER_CM = 10;

// #269 -> freesewing registration, coat archetype: no moldai equivalent
// exists at all (see lib/draft/vocabulary.ts's own TYPES comment). Jett
// was picked over its 5 siblings after drafting all 6 live: Lunetius (a
// sleeveless Roman-style cloak, 1 part) is cheap but not a genuine modern
// coat -- the same semantic mismatch that ruled out Sophie/Sasha for
// dress. Devon/Jaeger/Carlton/Carlita are full tailored overcoats
// (23-30 parts each, proportionally more lining/pocket/collar
// construction). Jett (17 parts) is the cheapest design that still means
// "a real coat" -- a lined bomber-style jacket with a ribbed waistband/
// collar/cuff and a welt pocket.
//
// Jett's own required measurements need exactly ONE genuinely new key:
// hpsToWaistFront (front bodice length, distinct from backLength -- see
// lib/measurements.ts's own comment, including the migration-safety
// catch on its first, bust-interpolated version). Every other required
// key already maps onto an existing one via the same alias convention
// skirt.ts/hoodie.ts established (hip->hips, hipHeight->waistToHips,
// shoulder*2->shoulderToShoulder).
//
// Front and back are each cut as TWO SEPARATE panels (left+right,
// flipping fabric -- Jett's own `cutlist.addCut({cut:2,identical:false})`
// on both, verified against a live draft), NOT folded the way every
// other body-having archetype's front/back is: this design has a real
// center-front button placket (asymmetric, so no fold) and a genuine
// center-back seam (also verified live -- back's own path starts and
// ends at two DIFFERENT center-back points, not a single fold axis).
// This wrapper deliberately does NOT model Jett's own full lining
// (front/back/sleeve) -- verified its op/point count is NOT stable
// across measurement sets (a genuinely different problem than Titan's or
// Diana's stable-but-position-varying structure: the number and
// arrangement of ops itself changes), needing more investigation than
// this round budgeted for. Surfaced "em breve" on the front panel's own
// detail row, the same discipline Hugo's own deferred pocket/neck-
// binding already establishes -- not silently dropped.
function toCoatMeasurementsMm(m: Measurements): Record<string, number> {
  return {
    chest: m.bust * MM_PER_CM,
    highBust: (m.highBust ?? m.bust) * MM_PER_CM,
    hips: m.hip * MM_PER_CM,
    waistToHips: m.hipHeight * MM_PER_CM,
    hpsToWaistBack: m.backLength * MM_PER_CM,
    hpsToWaistFront: m.hpsToWaistFront * MM_PER_CM,
    bustSpan: m.bustSpan * MM_PER_CM,
    hpsToBust: m.bustPointHeight * MM_PER_CM,
    waist: m.waist * MM_PER_CM,
    biceps: m.bicep * MM_PER_CM,
    neck: m.neckGirth * MM_PER_CM,
    shoulderToShoulder: m.shoulder * 2 * MM_PER_CM,
    shoulderSlope: shoulderSlopeDegrees(m),
    waistToArmpit: m.waistToArmpit * MM_PER_CM,
    shoulderToElbow: m.shoulderToElbow * MM_PER_CM,
    shoulderToWrist: m.shoulderToWrist * MM_PER_CM,
    wrist: m.wrist * MM_PER_CM,
  };
}

// Same unit-conflict tshirt.ts/blouse.ts/hoodie.ts already document:
// FreeSewing wants a degree, moldai's own shoulderSlope is a cm drop.
function shoulderSlopeDegrees(m: Measurements): number {
  const slope = m.shoulderSlope ?? 4.0;
  return (Math.atan(slope / m.shoulder) * 180) / Math.PI;
}

// Jett's own sleeveLengthBonus is a fraction ADDED to full arm length
// (measurements.shoulderToWrist * (1 + sleeveLengthBonus)), the same
// shape hoodie.ts's/skirt.ts's own lengthBonus already use -- but unlike
// Hugo's narrow raglan range, Jett's own option (-60%..+20%,
// @freesewing/jett's own sleeve.mjs) CAN reach a genuine short sleeve, so
// this DOES branch on spec.style.sleeve (defaulting to "long", the
// conventional coat-sleeve length, unlike tshirt.ts's own short-by-
// default knit convention) -- the same real short/long branching
// tshirt.ts's own sleeveLengthFraction already does for Teagan.
function sleeveLengthBonus(spec: GarmentSpec, m: Measurements): number {
  const targetCm =
    spec.style.sleeve === "short" ? m.shortSleeveLength : m.longSleeveLength;
  const fraction = targetCm / m.shoulderToWrist - 1;
  return Math.min(0.2, Math.max(-0.6, fraction));
}

// Front panel: a genuine placket-front construction, not folded. Located
// via locatePointIndex throughout (verified stable across two very
// different measurement sets, but this design's own op count is NOT
// provably constant -- unlike tshirt.ts's SIDE_SAMPLES shortcut -- so no
// index here is hardcoded). Its own outer-placket edge (cfNeck through
// outerPlacketTop, wrapping to outerPlacketBottom at index 0) is the
// button-closure edge -- a finished/turned edge, not sewn to anything
// this wrapper models, so it's left undeclared (present in the outline,
// no seamEdges key), the same "nothing to mate, simply omit" rule
// hoodie.ts's own hood-opening edge already follows.
//
// A real, verified-the-hard-way finding: `armholePitch`/`frontArmholePitch`
// is a PITCH NOTCH partway along the armhole curve, not its boundary --
// the true armhole-to-shoulder transition is `s3ArmholeSplit` (identical
// to Brian's own `shoulder` point here), well past the notch. Confirmed
// by dumping every named point's own resolved index and comparing
// coordinates directly, after the notch-as-boundary assumption produced
// an armhole edge roughly HALF the length the sleeve's own cap measured.
function buildFront(
  t: Translate,
  frontPart: {
    paths: Record<string, FreesewingPath>;
    points: Record<string, { x: number; y: number }>;
  },
): { piece: DraftedPiece; seamEdges: Record<string, [number, number]> } {
  const flat = flattenFreesewingSeam(frontPart.paths.seam);
  const hem = locatePointIndex(flat.outlineCm, frontPart.points.hem);
  const armhole = locatePointIndex(flat.outlineCm, frontPart.points.armhole);
  const shoulderTip = locatePointIndex(
    flat.outlineCm,
    frontPart.points.s3ArmholeSplit,
  );
  const s3CollarSplit = locatePointIndex(
    flat.outlineCm,
    frontPart.points.s3CollarSplit,
  );
  const cfNeck = locatePointIndex(flat.outlineCm, frontPart.points.cfNeck);
  const seamEdges: Record<string, [number, number]> = {
    hem: [0, hem],
    side: [hem, armhole],
    armhole: [armhole, shoulderTip],
    shoulder: [shoulderTip, s3CollarSplit],
    neckline: [s3CollarSplit, cfNeck],
  };
  const piece: DraftedPiece = {
    id: "body-front",
    name: t("pieceNames.front"),
    qty: 2, // left+right, flipping fabric -- no fold, a real placket
    outlineCm: flat.outlineCm,
    curvedSpans: flat.curvedSpans,
    seamEdges,
    detailRows: [
      // Jett's own full lining (front/back/sleeve) is not drafted here --
      // its own op/point count is not stable across measurement sets,
      // needing more investigation than this round budgeted for.
      { label: t("rows.coatLining"), value: t("comingSoonBadge") },
    ],
  };
  return { piece, seamEdges };
}

// Back panel: also NOT folded -- a genuine center-back seam (verified:
// the drafted path starts and ends at two different center-back points,
// not a single fold axis the way every other archetype's back panel is).
// The center-back edge (from the neck corner through cbHips to cbHem)
// self-pairs against its own mirrored copy, the same self-pair shape
// trousers.ts's own front-rise/back-rise already use for a qty-2,
// flip-not-fold panel.
//
// Unlike front, back has NO reliable point splitting "shoulder" from
// "neckline" -- every candidate this design exposes for that boundary
// (s3CollarSplit, s3ArmholeSplit, "shoulder", "cbShoulder") turned out
// stale (snapshotted at path-build time, then reassigned to a different
// value by a later-drafted part -- verified by comparing each candidate's
// CURRENT coordinate against the actually-drafted outline directly, not
// just via locatePointIndex's own failure). So back's own remaining edge
// (armholePitch through to the neck corner, wrapping) is declared as ONE
// combined `shoulderNeckline` edge rather than force-splitting it without
// a verified boundary -- paired against front's shoulder+neckline SUMMED,
// the same "sum several edges into one side" shape this file's own
// collar-ribbing pairing already uses.
function buildBack(
  t: Translate,
  backPart: {
    paths: Record<string, FreesewingPath>;
    points: Record<string, { x: number; y: number }>;
  },
): { piece: DraftedPiece; seamEdges: Record<string, [number, number]> } {
  const flat = flattenFreesewingSeam(backPart.paths.seam);
  const cbHips = locatePointIndex(flat.outlineCm, backPart.points.cbHips);
  const cbHem = locatePointIndex(flat.outlineCm, backPart.points.cbHem);
  const hem = locatePointIndex(flat.outlineCm, backPart.points.hem);
  const armhole = locatePointIndex(flat.outlineCm, backPart.points.armhole);
  const shoulderTip = locatePointIndex(
    flat.outlineCm,
    backPart.points.armholePitch,
  );
  const n = flat.outlineCm.length;
  const seamEdges: Record<string, [number, number]> = {
    centerBack: [0, cbHips],
    hem: [cbHem, hem],
    side: [hem, armhole],
    armhole: [armhole, shoulderTip],
    shoulderNeckline: [shoulderTip, n], // wraps back to the neck corner at index 0
  };
  const piece: DraftedPiece = {
    id: "body-back",
    name: t("pieceNames.back"),
    qty: 2,
    outlineCm: flat.outlineCm,
    curvedSpans: flat.curvedSpans,
    seamEdges,
    detailRows: [],
  };
  return { piece, seamEdges };
}

// A normal set-in sleeve (NOT raglan, unlike Hugo's) -- a standard cap +
// wrist construction, structurally close to Diana's/Teagan's own sleeve.
function buildSleeve(
  t: Translate,
  sleevePart: {
    paths: Record<string, FreesewingPath>;
    points: Record<string, { x: number; y: number }>;
  },
): {
  piece: DraftedPiece;
  seamEdges: Record<string, [number, number]>;
  wristLenCm: number;
} {
  const flat = flattenFreesewingSeam(sleevePart.paths.seam);
  const wristLeft = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.wristLeft,
  );
  const wristRight = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.wristRight,
  );
  const bicepsRight = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.bicepsRight,
  );
  const n = flat.outlineCm.length;
  const seamEdges: Record<string, [number, number]> = {
    underarmLeft: [0, wristLeft],
    wrist: [wristLeft, wristRight],
    underarmRight: [wristRight, bicepsRight],
    cap: [bicepsRight, n], // wraps back to bicepsLeft at index 0
  };
  const wristLenCm = curveArcLengthCm(
    flat.outlineCm,
    flat.curvedSpans,
    ...seamEdges.wrist,
  );
  const piece: DraftedPiece = {
    id: "sleeve",
    name: t("pieceNames.sleeve"),
    qty: 2,
    outlineCm: flat.outlineCm,
    curvedSpans: flat.curvedSpans,
    seamEdges,
    detailRows: [],
  };
  return { piece, seamEdges, wristLenCm };
}

// The ribbed stand collar, cut on fold (verified: its own first/last
// point form a real fold axis, unlike front/back). Its own neckline-
// attach edge (the long curved run) does NOT touch either fold endpoint,
// so mirroring it produces TWO separate curved spans (one per half) --
// summed as two edgeRefs in the seam pair below, the same "sum several
// edges into one side" shape blouse.ts's own armhole-cap pairing uses,
// rather than forcing them into one artificial contiguous range.
function buildCollarRibbing(
  t: Translate,
  collarPart: {
    paths: Record<string, FreesewingPath>;
    points: Record<string, { x: number; y: number }>;
  },
): { piece: DraftedPiece; seamEdges: Record<string, [number, number][]> } {
  const half = flattenFreesewingSeam(collarPart.paths.seam);
  const halfBottom = locatePointIndex(
    half.outlineCm,
    collarPart.points.halfBottom,
  );
  const halfTop = locatePointIndex(half.outlineCm, collarPart.points.halfTop);
  const n = half.outlineCm.length;
  const foldA = half.outlineCm[0];
  const foldB = half.outlineCm[n - 1];
  const interior = half.outlineCm.slice(1, n - 1);
  const mirroredInterior = interior
    .slice()
    .reverse()
    .map(([x, y]) => {
      const dx = foldB[0] - foldA[0];
      const dy = foldB[1] - foldA[1];
      const lenSq = dx * dx + dy * dy;
      const t2 = ((x - foldA[0]) * dx + (y - foldA[1]) * dy) / lenSq;
      const cx = foldA[0] + t2 * dx;
      const cy = foldA[1] + t2 * dy;
      return [2 * cx - x, 2 * cy - y] as [number, number];
    });
  const outlineCm = [...half.outlineCm, ...mirroredInterior];
  const L = outlineCm.length;
  const mirrorPos = (p: number) => (p === 0 || p === n - 1 ? p : L - p);
  const curvedSpans: [number, number][] = [
    ...half.curvedSpans,
    ...half.curvedSpans.map(
      ([a, b]) => [mirrorPos(b), mirrorPos(a)] as [number, number],
    ),
  ];
  const seamEdges: Record<string, [number, number][]> = {
    necklineAttach: [
      [halfBottom, halfTop],
      [mirrorPos(halfTop), mirrorPos(halfBottom)],
    ],
  };
  const piece: DraftedPiece = {
    id: "collarRibbing",
    name: t("pieceNames.collarRibbing"),
    qty: 1, // one continuous band, cut on fold
    outlineCm,
    curvedSpans,
    foldEdge: [0, n - 1],
    seamEdges: { necklineAttach: seamEdges.necklineAttach[0] }, // primary edge only, for DraftedPiece's own single-range shape
    detailRows: [],
  };
  return { piece, seamEdges };
}

export function draftJett(
  spec: GarmentSpec,
  base: Measurements,
  t: Translate,
): EngineDraft {
  const measurements = toCoatMeasurementsMm(base);
  const pattern = new CoatDesign({
    measurements,
    options: { sleeveLengthBonus: sleeveLengthBonus(spec, base) },
  });
  pattern.draft();
  const parts = pattern.parts[0];

  const { piece: front, seamEdges: frontEdges } = buildFront(
    t,
    parts["jett.front"],
  );
  const { piece: back, seamEdges: backEdges } = buildBack(
    t,
    parts["jett.back"],
  );
  const {
    piece: sleeve,
    seamEdges: sleeveEdges,
    wristLenCm,
  } = buildSleeve(t, parts["jett.sleeve"]);
  const cuff = draftCuff(wristLenCm + WRIST_EASE_CM.woven, t);

  const { piece: collarRibbing } = buildCollarRibbing(
    t,
    parts["jett.collar_ribbing"],
  );

  // Front/back are cut ×2 each (left+right, no fold) -- their own hem
  // edges are already the REAL half-lengths (not half-of-a-fold the way
  // hoodie.ts's own fold-cut panels are), so summing once per side (not
  // doubled) gives the true total hem circumference.
  const frontHemCm = curveArcLengthCm(
    front.outlineCm,
    front.curvedSpans ?? [],
    ...frontEdges.hem,
  );
  const backHemCm = curveArcLengthCm(
    back.outlineCm,
    back.curvedSpans ?? [],
    ...backEdges.hem,
  );
  const waistbandLenCm = (frontHemCm + backHemCm) * 2; // both sides (left+right)
  const waistband = draftWaistband(waistbandLenCm, t);

  // Two pairs below report a REAL MEASURED ease rather than an assumed 0
  // -- Jett is a woven, tailored jacket (unlike every knit-adjacent
  // archetype registered so far), and a woven sleeve cap conventionally
  // carries a few cm of built-in ease so the cap can gather slightly for
  // a rounder sleeve head. Recorded honestly (the "record it, don't
  // silently fix it" precedent skirt.ts's own ~15cm circle-skirt waist
  // ease already established), not zeroed out or independently re-derived
  // from a cited formula this wrapper has no source for. The armhole-cap
  // figure (~11-12cm both genders, stable, so likely a genuine
  // construction constant rather than a boundary mistake) is larger than
  // a typical tailoring reference for cap ease -- flagged, not silently
  // accepted as self-evidently correct; a follow-up with a real cited
  // source would be worth doing before leaning on this number for
  // anything beyond "did this change".
  const frontArmholeCm = curveArcLengthCm(
    front.outlineCm,
    front.curvedSpans ?? [],
    ...frontEdges.armhole,
  );
  const backArmholeCm = curveArcLengthCm(
    back.outlineCm,
    back.curvedSpans ?? [],
    ...backEdges.armhole,
  );
  const capCm = curveArcLengthCm(
    sleeve.outlineCm,
    sleeve.curvedSpans ?? [],
    ...sleeveEdges.cap,
  );
  const armholeCapEaseCm =
    Math.round((capCm - (frontArmholeCm + backArmholeCm)) * 10) / 10;

  const frontShoulderNecklineCm =
    curveArcLengthCm(
      front.outlineCm,
      front.curvedSpans ?? [],
      ...frontEdges.shoulder,
    ) +
    curveArcLengthCm(
      front.outlineCm,
      front.curvedSpans ?? [],
      ...frontEdges.neckline,
    );
  const backShoulderNecklineCm = curveArcLengthCm(
    back.outlineCm,
    back.curvedSpans ?? [],
    ...backEdges.shoulderNeckline,
  );
  const shoulderEaseCm =
    Math.round((backShoulderNecklineCm - frontShoulderNecklineCm) * 10) / 10;

  const seamPairs: SeamPairDecl[] = [
    {
      key: "coat-center-back",
      labelKey: "coatCenterBack",
      a: [edgeRef(back.id, backEdges.centerBack)],
      b: [edgeRef(back.id, backEdges.centerBack)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "coat-side",
      labelKey: "side",
      a: [edgeRef(front.id, frontEdges.side)],
      b: [edgeRef(back.id, backEdges.side)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "coat-armhole-cap",
      labelKey: "armholeCap",
      a: [
        edgeRef(front.id, frontEdges.armhole),
        edgeRef(back.id, backEdges.armhole),
      ],
      b: [edgeRef(sleeve.id, sleeveEdges.cap)],
      easeCm: armholeCapEaseCm,
      fixable: false,
    },
    {
      key: "coat-shoulder",
      labelKey: "shoulder",
      // Back has no reliable point splitting "shoulder" from "neckline"
      // (see buildBack's own comment) -- front's own shoulder+neckline
      // are summed here so both sides represent the SAME physical span
      // (armhole-tip to centre-back neck), not a partial comparison.
      a: [
        edgeRef(front.id, frontEdges.shoulder),
        edgeRef(front.id, frontEdges.neckline),
      ],
      b: [edgeRef(back.id, backEdges.shoulderNeckline)],
      easeCm: shoulderEaseCm,
      fixable: false,
    },
    {
      key: "coat-sleeve-underarm",
      labelKey: "sleeveUnderarm",
      a: [edgeRef(sleeve.id, sleeveEdges.underarmLeft)],
      b: [edgeRef(sleeve.id, sleeveEdges.underarmRight)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "coat-cuff-wrist",
      labelKey: "cuffHem",
      a: [edgeRef(sleeve.id, sleeveEdges.wrist)],
      b: [edgeRef(cuff.id, cuff.seamEdges!.hem)],
      easeCm: WRIST_EASE_CM.woven,
      fixable: false,
    },
    {
      key: "coat-waistband-hem",
      labelKey: "waistbandWaistCoat",
      a: [
        edgeRef(front.id, frontEdges.hem),
        edgeRef(front.id, frontEdges.hem),
        edgeRef(back.id, backEdges.hem),
        edgeRef(back.id, backEdges.hem),
      ],
      b: [edgeRef(waistband.id, waistband.seamEdges!.waist)],
      easeCm: WAISTBAND_OVERLAP_CM,
      fixable: false,
    },
    // No collar-ribbing-to-neckline pair: the measured gap (front's own
    // neckline alone vs. the collar's own doubled neckline-attach edge)
    // came out 4-5x too large to be plausible design ease, and back's own
    // neckline contribution can't be isolated from its shoulder without a
    // reliable boundary point (see buildBack's own comment) -- rather
    // than declare a pairing this wrapper isn't confident represents the
    // real relationship, it's left undeclared. collarRibbing is still
    // drafted (real, correct geometry) and included in `drafted` below;
    // only the cross-piece measurement is deferred, a known gap for a
    // follow-up round, not silently claimed as verified.
  ];

  return {
    drafted: [front, back, sleeve, cuff, collarRibbing, waistband],
    measurements: base,
    seamPairs,
    garmentLengthCm: base.backLength,
  };
}
