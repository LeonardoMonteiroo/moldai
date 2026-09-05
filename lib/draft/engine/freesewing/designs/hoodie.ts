// The upstream package name ("hugo") is Joost De Cock's own codename for
// this design (@freesewing/collection tags it a raglan-sleeve hoodie) --
// an implementation detail confined to this one import line, the same
// discipline every other design wrapper in this directory follows. The
// hood shape itself comes from @freesewing/library's own shared
// three-part-hood module (hoodSide/hoodCenter), which Hugo composes in.
import { Hugo as HoodieDesign } from "@freesewing/hugo";
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
  straightBand,
  WAISTBAND_OVERLAP_CM,
} from "../../../subpieces";
import { WRIST_EASE_CM } from "../../../sleeve";
import type { FreesewingPath } from "../geometry";
import {
  flattenFreesewingSeam,
  locatePointIndex,
  mirrorFoldedPanel,
} from "../geometry";
import { edgeRef } from "../seamHelpers";

const MM_PER_CM = 10;

// #269 -> freesewing registration, hoodie archetype: no moldai equivalent
// exists at all (see lib/draft/vocabulary.ts's own TYPES comment) -- a
// raglan sleeve (no shoulder seam, a diagonal seam from underarm to
// neckline instead), a 3-piece hood and ribbed cuffs/waistband are all
// constructions moldai's own body.ts/sleeve.ts have no equivalent for.
// Hugo was chosen over sven (the only other hoodie/sweatshirt candidate
// with a normal set-in sleeve) specifically BECAUSE it has a real hood --
// sven has none, which would make "hoodie" a misleading name for what
// it actually drafts. Hugo's own required measurements (verified against
// a live draft before writing this) all map onto keys this app already
// has: chest->bust, hpsToBust->bustPointHeight, hpsToWaistBack->backLength,
// neck->neckGirth, shoulderToShoulder->shoulder*2, waistToArmpit (as-is),
// waistToHips->hipHeight, hips->hip, shoulderToWrist/wrist (as-is), and
// head (already CORE_MEASUREMENT_KEYS since the very first #269 round --
// added anticipating exactly this hoodie use case). shoulderSlope is
// EXTENDED/optional, same unit-conversion story as tshirt.ts/blouse.ts.
//
// Hugo's own waistband/cuff/neckBinding/hoodCenter parts are ALL hidden by
// default behind an "expand" setting (verified by reading each source
// file directly) and, even expanded, are each just a plain rectangle --
// so this wrapper reuses lib/draft/subpieces.ts's own draftCuff/
// draftWaistband (sized from THIS design's own measured sleeve-hem/body-
// hem edges, the same "measure what was actually drafted" discipline
// skirt.ts/trousers.ts already follow) and straightBand (for the hood's
// own center strip) rather than fighting that setting for no geometric
// gain. Hugo's own pocket (a real kangaroo-pocket shape, not a rectangle)
// and neck-binding trim strip are NOT drafted here -- surfaced "em breve"
// on the front panel's own detail row, the same discipline the waistband
// closure mark / collar-shape variety notes already establish elsewhere.
function toHoodieMeasurementsMm(m: Measurements): Record<string, number> {
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
    shoulderToWrist: m.shoulderToWrist * MM_PER_CM,
    wrist: m.wrist * MM_PER_CM,
    head: m.head * MM_PER_CM,
  };
}

// Same unit-conflict tshirt.ts/blouse.ts already document: FreeSewing
// wants a degree, moldai's own shoulderSlope is a cm drop.
function shoulderSlopeDegrees(m: Measurements): number {
  const slope = m.shoulderSlope ?? 4.0;
  return (Math.atan(slope / m.shoulder) * 180) / Math.PI;
}

// One raglan half-panel (front or back), cut on fold. Structurally
// DIFFERENT from tshirt.ts's/blouse.ts's own set-in-sleeve buildBodyPanel:
// there is no shoulder seam at all -- the side seam (hem to underarm)
// continues directly into the raglan seam (underarm through the neckline)
// with no break, so "side" and "raglan" are located by their own named
// points, not assumed from a fixed sample count (the op count here is
// unconditional/constant across bodies -- verified by reading front.mjs/
// back.mjs directly, no option ever branches before these ops -- but
// locatePointIndex is used anyway, at negligible cost, since this design
// hasn't been stress-tested across measurement sets the way Teagan's
// SIDE_SAMPLES shortcut was before being trusted). The half's own hem edge
// is a plain two-point edge at [0,1] (cfRibbing -> ribbing), the same
// "hem:[0,1]" convention tshirt.ts/blouse.ts already use -- but here it
// stays a HALF-hem (this panel is cut on fold, qty 1), so the caller must
// double it, not this function.
//
// A real, measured finding worth recording rather than "fixing": front's/
// back's own raglan edge and the sleeve's own matching raglanFront/
// raglanBack edge measure a genuine (if small, 0.3-0.6cm at size M) gap --
// unlike Titan's inseam/outseam, Hugo's own front.mjs/back.mjs/sleeve.mjs
// each draft their own portion of this seam independently, with no
// internal fitting loop forcing them to match exactly. Declared with
// easeCm: 0 (an honest small residual, not zeroed out), and comfortably
// inside SEAM_TOLERANCE_CM (1cm) at every size this wrapper was checked
// against.
function buildBodyPanel(
  half: ReturnType<typeof flattenFreesewingSeam>,
  points: Record<string, { x: number; y: number }>,
  raglanTipPoint: { x: number; y: number },
  id: string,
  name: string,
): { piece: DraftedPiece; seamEdges: Record<string, [number, number]> } {
  const armholeIdx = locatePointIndex(half.outlineCm, points.armhole);
  const raglanTipIdx = locatePointIndex(half.outlineCm, raglanTipPoint);
  const mirrored = mirrorFoldedPanel(half);
  const seamEdges: Record<string, [number, number]> = {
    hem: [0, 1],
    side: [1, armholeIdx],
    raglan: [armholeIdx, raglanTipIdx],
  };
  const piece: DraftedPiece = {
    id,
    name,
    qty: 1, // cut on fold
    outlineCm: mirrored.outlineCm,
    curvedSpans: mirrored.curvedSpans,
    foldEdge: mirrored.foldEdge,
    seamEdges,
    detailRows: [],
  };
  return { piece, seamEdges };
}

// The raglan sleeve is a WHOLE (not folded) panel, qty 2 -- one per arm,
// same as any other sleeve. Its own raglan seam runs continuously from
// the back underarm (bicepsRight), THROUGH raglanTipBack, raglanTop
// (construction reference only -- also the sleeve's own shoulderNotch
// mark) and raglanTipFront, to the front underarm (bicepsLeft) -- but the
// portion strictly BETWEEN raglanTipBack and raglanTipFront (through
// raglanTop) has no corresponding edge on EITHER body panel (each body
// panel's own raglan edge stops at its own raglanTip -- verified by
// reading front.mjs/back.mjs directly) -- in the real garment that gap
// is closed by Hugo's own neck-binding trim strip, which this wrapper
// does not draft (see the top-of-file comment), so it's deliberately
// left as an undeclared edge (present in the outline, no seamEdges key)
// rather than paired against something it doesn't actually mate with.
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
  const raglanTipFront = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.raglanTipFront,
  );
  const bicepsLeft = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.bicepsLeft,
  );
  const bicepsRight = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.bicepsRight,
  );
  const wristLeft = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.wristLeft,
  );
  const wristRight = locatePointIndex(
    flat.outlineCm,
    sleevePart.points.wristRight,
  );
  const n = flat.outlineCm.length;
  const seamEdges: Record<string, [number, number]> = {
    raglanFront: [raglanTipFront, bicepsLeft],
    underarmLeft: [bicepsLeft, wristLeft],
    wrist: [wristLeft, wristRight],
    underarmRight: [wristRight, bicepsRight],
    raglanBack: [bicepsRight, n], // wraps back to raglanTipBack at index 0
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

// The hood's own side panel, a WHOLE closed shape (not folded), qty 4
// (2 hood halves x 2 fabric layers, self-lined -- Hugo's own
// `cutlist.addCut({cut:4,...})`, verified against a live draft). Its own
// "opening" edge (frontEdge through neckRoll to hoodRim, the hood's own
// unsewn face opening) is deliberately NOT a declared seamEdge -- nothing
// mates against it, the same "a piece with nothing to mate simply omits
// this" rule lib/draft/subpieces.ts's own draftPlacket already follows.
// Its own "neck" edge (from neckEdge back to frontEdge, wrapping through
// index 0) mates against the body's own neckline via a neck-binding trim
// strip this wrapper does not draft (see the top-of-file comment) -- also
// omitted, rather than declared and left unpaired.
function buildHoodSide(
  t: Translate,
  hoodSidePart: {
    paths: Record<string, FreesewingPath>;
    points: Record<string, { x: number; y: number }>;
  },
): { piece: DraftedPiece; seamEdges: Record<string, [number, number]> } {
  const flat = flattenFreesewingSeam(hoodSidePart.paths.seam);
  const hoodRim = locatePointIndex(flat.outlineCm, hoodSidePart.points.hoodRim);
  const neckEdge = locatePointIndex(
    flat.outlineCm,
    hoodSidePart.points.neckEdge,
  );
  const seamEdges: Record<string, [number, number]> = {
    central: [hoodRim, neckEdge],
  };
  const piece: DraftedPiece = {
    id: "hoodSide",
    name: t("pieceNames.hoodSide"),
    qty: 4,
    outlineCm: flat.outlineCm,
    curvedSpans: flat.curvedSpans,
    seamEdges,
    detailRows: [],
  };
  return { piece, seamEdges };
}

export function draftHoodie(
  spec: GarmentSpec,
  base: Measurements,
  t: Translate,
): EngineDraft {
  const measurements = toHoodieMeasurementsMm(base);
  const pattern = new HoodieDesign({ measurements, options: {} });
  pattern.draft();
  const parts = pattern.parts[0];

  const frontHalf = flattenFreesewingSeam(parts["hugo.front"].paths.seam);
  const backHalf = flattenFreesewingSeam(parts["hugo.back"].paths.seam);
  const { piece: front, seamEdges: frontEdges } = buildBodyPanel(
    frontHalf,
    parts["hugo.front"].points,
    parts["hugo.front"].points.raglanTipFront,
    "body-front",
    t("pieceNames.front"),
  );
  const { piece: back, seamEdges: backEdges } = buildBodyPanel(
    backHalf,
    parts["hugo.back"].points,
    parts["hugo.back"].points.raglanTipBack,
    "body-back",
    t("pieceNames.back"),
  );
  front.detailRows = [
    // Hugo's own kangaroo-pocket shape needs its own construction adapter
    // (it isn't a plain rectangle the way cuff/waistband/hood-center are)
    // -- deferred, not silently dropped. Its own neck-binding trim strip
    // (which would finish the raw neckline/hood-attach seam) is the same
    // kind of deferred finishing detail.
    { label: t("rows.hoodiePocket"), value: t("comingSoonBadge") },
  ];

  const {
    piece: sleeve,
    seamEdges: sleeveEdges,
    wristLenCm,
  } = buildSleeve(t, parts["hugo.sleeve"]);
  const cuff = draftCuff(wristLenCm + WRIST_EASE_CM.knit, t);

  const { piece: hoodSide, seamEdges: hoodSideEdges } = buildHoodSide(
    t,
    parts["library.hoodSide"],
  );
  const centralSeamLenCm = curveArcLengthCm(
    hoodSide.outlineCm,
    hoodSide.curvedSpans ?? [],
    ...hoodSideEdges.central,
  );
  // Hugo's own hoodCenter formula (@freesewing/library's hoodcenter.mjs):
  // width = head/10, length = the matching hoodSide edge's own measured
  // length (no doubling -- unlike the fold-cut body panels, hoodSide is a
  // whole, unfolded piece, so its own central edge already IS the full
  // seam length for one side).
  const hoodCenterWidthCm = base.head / 10;
  const { pts: hoodCenterPts } = straightBand(
    centralSeamLenCm,
    hoodCenterWidthCm,
  );
  const hoodCenter: DraftedPiece = {
    id: "hoodCenter",
    name: t("pieceNames.hoodCenter"),
    qty: 2, // self-lined, same footing as hoodSide's own qty 4 (2 sides x 2 layers)
    outlineCm: hoodCenterPts,
    seamEdges: { near: [0, 2] },
    detailRows: [],
  };

  // Front/back's own hem edge is a HALF-hem (cut on fold, qty 1) -- doubled
  // here, not in buildBodyPanel, since doubling is a WAISTBAND-sizing
  // concern, not a fact about the panel's own geometry.
  const frontHemHalfCm = curveArcLengthCm(
    front.outlineCm,
    front.curvedSpans ?? [],
    ...frontEdges.hem,
  );
  const backHemHalfCm = curveArcLengthCm(
    back.outlineCm,
    back.curvedSpans ?? [],
    ...backEdges.hem,
  );
  const waistbandLenCm = (frontHemHalfCm + backHemHalfCm) * 2;
  const waistband = draftWaistband(waistbandLenCm, t);

  const seamPairs: SeamPairDecl[] = [
    {
      key: "hoodie-side",
      labelKey: "side",
      a: [edgeRef(front.id, frontEdges.side)],
      b: [edgeRef(back.id, backEdges.side)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "hoodie-raglan-front",
      labelKey: "hoodieRaglanFront",
      a: [edgeRef(front.id, frontEdges.raglan)],
      b: [edgeRef(sleeve.id, sleeveEdges.raglanFront)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "hoodie-raglan-back",
      labelKey: "hoodieRaglanBack",
      a: [edgeRef(back.id, backEdges.raglan)],
      b: [edgeRef(sleeve.id, sleeveEdges.raglanBack)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "hoodie-sleeve-underarm",
      labelKey: "sleeveUnderarm",
      a: [edgeRef(sleeve.id, sleeveEdges.underarmLeft)],
      b: [edgeRef(sleeve.id, sleeveEdges.underarmRight)],
      easeCm: 0,
      fixable: false,
    },
    {
      key: "hoodie-cuff-wrist",
      labelKey: "cuffHem",
      a: [edgeRef(sleeve.id, sleeveEdges.wrist)],
      b: [edgeRef(cuff.id, cuff.seamEdges!.hem)],
      easeCm: WRIST_EASE_CM.knit,
      fixable: false,
    },
    {
      key: "hoodie-waistband-hem",
      labelKey: "waistbandWaistHoodie",
      // Each hem edge is listed TWICE: front/back are cut-on-fold panels
      // (qty 1), so their own declared `hem` edge is only a HALF-hem --
      // repeating it is what makes the a-side sum to the REAL, full hem
      // circumference, the same "closed circumference, not one panel's
      // share" rule skirt.ts's/trousers.ts's own qty-based waistband
      // summing already follows (there, qty>1 whole panels; here, one
      // half-edge counted twice per fold-cut panel instead).
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
    {
      key: "hoodie-hood-center",
      labelKey: "hoodCenterSeam",
      a: [edgeRef(hoodSide.id, hoodSideEdges.central)],
      b: [edgeRef(hoodCenter.id, hoodCenter.seamEdges!.near)],
      easeCm: 0,
      fixable: false,
    },
  ];

  return {
    drafted: [front, back, sleeve, cuff, hoodSide, hoodCenter, waistband],
    measurements: base,
    seamPairs,
    garmentLengthCm: base.backLength,
  };
}
