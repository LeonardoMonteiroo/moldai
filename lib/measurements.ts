import { Gender, SizeLabel } from "./types";

export interface Measurements {
  bust: number; // bust circumference (cm)
  waist: number; // waist circumference (cm)
  hip: number; // hip circumference (cm)
  hipHeight: number; // waist → hip (cm)
  backLength: number; // nape → waist (cm)
  shoulder: number; // width of one shoulder (cm)
  skirtLength: number; // default skirt length (cm)
  shortSleeveLength: number; // (cm)
  longSleeveLength: number; // (cm)
  // #132: widened vocabulary beyond the original nine proportional keys —
  // each of these is optional because a size chart may not set it, and
  // every drafter that reads one falls back to today's hardcoded proportion
  // (documented at each call site in lib/draft/body.ts/sleeve.ts) when it's
  // absent. That's what keeps an existing chart or a pattern's already-frozen
  // sizeTable snapshot (which predates these fields and will never have
  // them) drafting byte-identically forever, while a chart that DOES set one
  // — a duplicated/edited system chart, an imported spreadsheet, or an AI
  // measurementOverride — gets real, personalized geometry instead of the
  // proportion. #269 promoted four of the original eight (bicep,
  // bustPointHeight, neckGirth, bustSpan, just below) out of this optional
  // tier and into CORE — a FreeSewing design needs each of them outright, so
  // "optional, falls back to a proportion" stopped being true for every
  // engine. The four still here (highBust/shoulderSlope/backWidth/rise)
  // remain genuinely optional: no FreeSewing design this repo registers
  // reads any of them, so their moldai-side fallback keeps being the only
  // thing that ever needs one.
  highBust?: number; // chest circumference above the bust, below the armpits (cm) — see #132's "cup size" decision below
  shoulderSlope?: number; // vertical drop from the neck/top edge to the shoulder tip (cm) — a real body proportion, not an angle
  backWidth?: number; // across-back width, armhole to armhole (cm)
  rise?: number; // trouser rise: waist to crotch seam (cm) — no drafter reads this yet (see #128), added here so a chart can already carry it
  bicep: number; // upper-arm circumference, at its widest point (cm)
  neckGirth: number; // neck circumference, at the base where a collar sits (cm)
  // bust-dart-shaping feature: locate the bust apex for a dart that points at
  // it instead of running straight vertical. Both are frame/torso traits with
  // no cited source tying them proportionally to bust circumference (unlike
  // backWidth) — see lib/draft/body.ts's own use for the sourcing and the
  // "flat, not bust-scaled" fallback this shares with shoulderSlope.
  bustPointHeight: number; // shoulder seam → bust apex, vertical (cm)
  bustSpan: number; // apex-to-apex, horizontal (cm)
  // #269: FreeSewing registration -- 14 keys a FreeSewing design requires
  // outright, with no moldai-side proportion to fall back to (unlike the
  // EXTENDED keys above, each of which reproduces a formula an existing
  // drafter already used). Required on every base row (CORE_MEASUREMENT_KEYS
  // below), the same footing as the original nine -- see
  // docs/decisions/drafting.md for why this shipped as a hard requirement
  // rather than an engine-scoped one, and scripts/backfill-freesewing-
  // measurements.ts for how every already-persisted row was filled before
  // this became enforced.
  waistToArmpit: number; // waist → armpit, vertical (cm)
  shoulderToWrist: number; // shoulder tip → wrist bone, full arm length (cm) — a BODY measurement, distinct from shortSleeveLength/longSleeveLength (finished garment lengths)
  wrist: number; // wrist circumference (cm)
  underbust: number; // circumference directly below the bust (cm)
  bustPointToUnderbust: number; // bust apex → underbust line, vertical (cm)
  bustFront: number; // half bust arc measured over the front only, side seam to side seam (cm)
  waistToUnderbust: number; // waist → underbust, vertical (cm)
  seat: number; // circumference at the fullest part of the seat (cm) — distinct from `hip`, which is the waist-adjacent girth
  waistToSeat: number; // waist → seat level, vertical (cm)
  waistToKnee: number; // waist → knee, vertical (cm)
  waistToFloor: number; // waist → floor, vertical (cm)
  inseam: number; // inner leg length, crotch → ankle (cm)
  shoulderToElbow: number; // shoulder tip → elbow (cm)
  head: number; // head circumference (cm) — a hood's own sizing input
  // #269 (trousers/Titan follow-up): a fitted trouser block (Titan, and
  // every other trouser design in the FreeSewing collection — this family
  // isn't a Titan quirk) splits front and back at the waist/seat and needs
  // the total crotch curve, not just moldai's own single flat `rise` —
  // none of these six had a moldai-side proportion to fall back to, so
  // (like the 14+4 above) they're required outright. See
  // scripts/backfill-freesewing-measurements.ts for how every
  // already-persisted row was filled before this became enforced.
  crossSeam: number; // full crotch curve, waist to waist, front + back over the crotch (cm)
  crossSeamFront: number; // crossSeam's own front half (cm)
  knee: number; // knee circumference (cm)
  seatBack: number; // back half of the seat circumference (cm) — a real body asymmetry moldai's own trousers.ts simplifies away
  waistBack: number; // back half of the waist circumference (cm)
  waistToUpperLeg: number; // waist → upper-thigh crease, vertical (cm)
  // #269 (coat/Jett follow-up): a placket-front coat needs the FRONT
  // bodice length independently of `backLength` (nape → waist, via the
  // back) — a real body asymmetry (the front torso is a different length
  // than the back) moldai's own body.ts has never needed to distinguish,
  // since every archetype it drafts derives front panel length from the
  // SAME backLength figure. No moldai-side proportion to fall back to, so
  // required outright, same footing as the trousers-follow-up six above.
  //
  // A migration-safety review caught a real data-quality bug in this
  // field's first version: seeded by interpolating @freesewing/models'
  // own `hpsToWaistFront` at each row's bust girth (the same sourcing the
  // trousers-follow-up keys used successfully), it turned out NOT to
  // track backLength consistently — the female table's own front-minus-
  // back delta drifted from -2.4cm (PP) to +0.1cm (GG), flipping sign
  // partway through the size run, which no real body does. Traced to the
  // upstream source itself: @freesewing/models' own neckstimate.mjs
  // literally comments `hpsToWaistFront: [400, 460], // FIXME: Estimate`
  // — flagged as rough by FreeSewing's own maintainers, unlike every
  // other key this repo has sourced from that package. Every SIZE_TABLE/
  // SIZE_TABLE_MALE value below is instead `backLength +
  // FRONT_BACK_LENGTH_DELTA_CM` (a flat, per-gender constant, the same
  // "flat, not bust-scaled" footing bustPointHeight/bustSpan/shoulderSlope
  // already use) -- monotonic by construction, since it grows in exact
  // lockstep with backLength's own per-size grading.
  hpsToWaistFront: number; // shoulder seam → waist, vertical, over the front (cm)
}

// A typical bust-curvature allowance: shoulder-to-waist measured over the
// front (across the bust) runs longer than the same measurement over the
// back, more so for a female figure than a male one. Flat per gender, not
// scaled by bust circumference — see hpsToWaistFront's own interface
// comment for why a scaled/interpolated version was rejected.
export const FRONT_BACK_LENGTH_DELTA_CM: Record<Gender, number> = {
  female: 3.0,
  male: 1.0,
};

// Every Measurements field, in the order the size-chart table renders its
// rows. Exported so the table, the validator and any future consumer
// iterate one list instead of each restating the shape.
//
// Split into CORE (the original nine, always required on a resolved
// Measurements row — see assertResolvedMeasurements) and EXTENDED (#132's
// six additions, optional everywhere: a Measurements value, a SizeChartData
// row, a Pattern's frozen sizeTable, all of it). MEASUREMENT_KEYS itself
// stays the single flat list every screen/validator/schema iterates — the
// CORE/EXTENDED split exists only for the few places (this file's own
// runtime guard, lib/schemas/measurements.ts's Zod schema) that need to
// know which keys a legacy row is allowed to omit.
export const CORE_MEASUREMENT_KEYS: (keyof Measurements)[] = [
  "bust",
  "waist",
  "hip",
  "hipHeight",
  "backLength",
  "shoulder",
  "skirtLength",
  "shortSleeveLength",
  "longSleeveLength",
  // #269: promoted from EXTENDED -- a FreeSewing design requires each of
  // these outright (Teagan/Simone/Sophie all read at least one), so "falls
  // back to a moldai proportion when absent" is no longer true for every
  // engine. See scripts/backfill-freesewing-measurements.ts.
  "bicep",
  "bustPointHeight",
  "neckGirth",
  "bustSpan",
  // #269: 14 genuinely new keys, never optional -- no drafter has a
  // fallback formula for any of these.
  "waistToArmpit",
  "shoulderToWrist",
  "wrist",
  "underbust",
  "bustPointToUnderbust",
  "bustFront",
  "waistToUnderbust",
  "seat",
  "waistToSeat",
  "waistToKnee",
  "waistToFloor",
  "inseam",
  "shoulderToElbow",
  "head",
  // #269 (trousers/Titan follow-up): see the interface comment above.
  "crossSeam",
  "crossSeamFront",
  "knee",
  "seatBack",
  "waistBack",
  "waistToUpperLeg",
  // #269 (coat/Jett follow-up): see the interface comment above.
  "hpsToWaistFront",
];

export const EXTENDED_MEASUREMENT_KEYS: (keyof Measurements)[] = [
  "highBust",
  "shoulderSlope",
  "backWidth",
  "rise",
];

export const MEASUREMENT_KEYS: (keyof Measurements)[] = [
  ...CORE_MEASUREMENT_KEYS,
  ...EXTENDED_MEASUREMENT_KEYS,
];

// #118: skirtLength/shortSleeveLength/longSleeveLength used to be held
// constant across every size, so a GG garment got the exact same hemline and
// sleeve as a PP one. Both correlate with stature the same way backLength
// and hipHeight already do, so they now step linearly from the base (M) by
// the same kind of per-size increment, not derived from any single
// standard — chosen so a longer body segment gets more absolute growth per
// size than a shorter one, same relationship as backLength (0.5) vs.
// hipHeight (0.3): skirtLength +2.0 cm/size (full-length hem drop tracks
// stature the most directly of the three), longSleeveLength +1.5 cm/size
// (an arm segment, so less than the skirt), shortSleeveLength +0.5 cm/size
// (the same arm, but a much shorter cut of it, so it grows proportionally
// less in absolute cm). Both genders share these increments, matching how
// every other row here already uses identical steps for female and male
// and differs only in the base values.
//
// #132's original design deliberately kept SIZE_TABLE/SIZE_TABLE_MALE to
// exactly the nine core fields, seeding the (then-optional) EXTENDED six
// only via lib/sizeCharts/seed.ts's buildSystemSizeChart, specifically so a
// test call site building a one-off row via `{...SIZE_TABLE.M, bust: X}`
// (components/editor/Proof3DTab.test.tsx, garment.test.ts's #82 repro,
// several others) never got a stale, un-scaled extended value alongside an
// overridden bust.
//
// #269 changes this for bicep/bustPointHeight/neckGirth/bustSpan (promoted
// to CORE above) and the 14 genuinely new keys: once a field is CORE,
// "doesn't auto-scale under a partial override" is the SAME limitation the
// original nine core fields (waist, hip, shoulder, ...) already have and
// this codebase already accepts — it stops being a reason to omit the field
// from this table and starts being the ordinary cost of adding a required
// measurement, same as it always was for bust/waist/hip. The four promoted
// values below reproduce EXACTLY the formulas
// lib/sizeCharts/seed.ts's extendedMeasurementsFor already used (bust*0.3,
// bust*3/7, and the two flat "cited standard range midpoint" constants) —
// a deliberate no-op for moldai's own drafted geometry, not a second,
// competing set of numbers. The 14 new keys have no moldai formula to
// reproduce, so their values are interpolated from @freesewing/models' own
// cisFemaleAdult/cisMaleAdult reference bodies at each size's own bust
// girth — the same sourcing scripts/backfill-freesewing-measurements.ts
// uses to fill every already-persisted row, so a brand-new system chart and
// a freshly-backfilled old one land on the same numbers at the same size.
export const SIZE_TABLE: Record<SizeLabel, Measurements> = {
  PP: {
    bust: 84,
    waist: 66,
    hip: 92,
    hipHeight: 20.0,
    backLength: 40.0,
    shoulder: 17.5,
    skirtLength: 56,
    shortSleeveLength: 17,
    longSleeveLength: 55,
    bicep: 25.2,
    bustPointHeight: 26.5,
    neckGirth: 36.0,
    bustSpan: 18.5,
    waistToArmpit: 16.0,
    shoulderToWrist: 57.4,
    wrist: 15.7,
    underbust: 70.8,
    bustPointToUnderbust: 9.5,
    bustFront: 45.8,
    waistToUnderbust: 7.5,
    seat: 95.4,
    waistToSeat: 23.5,
    waistToKnee: 56.4,
    waistToFloor: 101.1,
    inseam: 74.8,
    shoulderToElbow: 32.4,
    head: 54.7,
    crossSeam: 69.9,
    crossSeamFront: 35.0,
    knee: 35.7,
    seatBack: 49.1,
    waistBack: 35.0,
    waistToUpperLeg: 26.8,
    hpsToWaistFront: 43.0,
  },
  P: {
    bust: 88,
    waist: 70,
    hip: 96,
    hipHeight: 20.3,
    backLength: 40.5,
    shoulder: 18.0,
    skirtLength: 58,
    shortSleeveLength: 17.5,
    longSleeveLength: 56.5,
    bicep: 26.4,
    bustPointHeight: 26.5,
    neckGirth: 37.7,
    bustSpan: 18.5,
    waistToArmpit: 16.5,
    shoulderToWrist: 58.2,
    wrist: 16.1,
    underbust: 74.2,
    bustPointToUnderbust: 9.8,
    bustFront: 46.8,
    waistToUnderbust: 7.8,
    seat: 98.0,
    waistToSeat: 24.2,
    waistToKnee: 58.1,
    waistToFloor: 102.9,
    inseam: 75.6,
    shoulderToElbow: 33.2,
    head: 55.5,
    crossSeam: 71.8,
    crossSeamFront: 35.9,
    knee: 36.8,
    seatBack: 50.5,
    waistBack: 36.4,
    waistToUpperLeg: 27.6,
    hpsToWaistFront: 43.5,
  },
  M: {
    bust: 92,
    waist: 74,
    hip: 100,
    hipHeight: 20.6,
    backLength: 41.0,
    shoulder: 18.5,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
    bicep: 27.6,
    bustPointHeight: 26.5,
    neckGirth: 39.4,
    bustSpan: 18.5,
    waistToArmpit: 16.9,
    shoulderToWrist: 58.9,
    wrist: 16.5,
    underbust: 77.6,
    bustPointToUnderbust: 10.0,
    bustFront: 47.9,
    waistToUnderbust: 8.0,
    seat: 100.7,
    waistToSeat: 24.9,
    waistToKnee: 59.8,
    waistToFloor: 104.8,
    inseam: 76.4,
    shoulderToElbow: 33.9,
    head: 56.4,
    crossSeam: 73.8,
    crossSeamFront: 36.9,
    knee: 37.9,
    seatBack: 51.8,
    waistBack: 37.8,
    waistToUpperLeg: 28.4,
    hpsToWaistFront: 44.0,
  },
  G: {
    bust: 96,
    waist: 78,
    hip: 104,
    hipHeight: 21.0,
    backLength: 41.5,
    shoulder: 19.0,
    skirtLength: 62,
    shortSleeveLength: 18.5,
    longSleeveLength: 59.5,
    bicep: 28.8,
    bustPointHeight: 26.5,
    neckGirth: 41.1,
    bustSpan: 18.5,
    waistToArmpit: 17.5,
    shoulderToWrist: 59.6,
    wrist: 16.8,
    underbust: 81.0,
    bustPointToUnderbust: 10.2,
    bustFront: 48.9,
    waistToUnderbust: 8.2,
    seat: 103.3,
    waistToSeat: 25.6,
    waistToKnee: 61.5,
    waistToFloor: 106.6,
    inseam: 77.2,
    shoulderToElbow: 34.6,
    head: 57.3,
    crossSeam: 75.7,
    crossSeamFront: 37.8,
    knee: 39.0,
    seatBack: 53.2,
    waistBack: 39.2,
    waistToUpperLeg: 29.2,
    hpsToWaistFront: 44.5,
  },
  GG: {
    bust: 100,
    waist: 82,
    hip: 108,
    hipHeight: 21.3,
    backLength: 42.0,
    shoulder: 19.5,
    skirtLength: 64,
    shortSleeveLength: 19,
    longSleeveLength: 61,
    bicep: 30.0,
    bustPointHeight: 26.5,
    neckGirth: 42.9,
    bustSpan: 18.5,
    waistToArmpit: 17.9,
    shoulderToWrist: 60.4,
    wrist: 17.2,
    underbust: 84.4,
    bustPointToUnderbust: 10.4,
    bustFront: 49.9,
    waistToUnderbust: 8.4,
    seat: 105.9,
    waistToSeat: 26.3,
    waistToKnee: 63.2,
    waistToFloor: 108.4,
    inseam: 78.1,
    shoulderToElbow: 35.4,
    head: 58.1,
    crossSeam: 77.6,
    crossSeamFront: 38.8,
    knee: 40.0,
    seatBack: 54.5,
    waistBack: 40.6,
    waistToUpperLeg: 30.0,
    hpsToWaistFront: 45.0,
  },
};

export const SIZE_TABLE_MALE: Record<SizeLabel, Measurements> = {
  PP: {
    bust: 92,
    waist: 80,
    hip: 92,
    hipHeight: 21.0,
    backLength: 43.0,
    shoulder: 21.0,
    skirtLength: 56,
    shortSleeveLength: 21,
    longSleeveLength: 59,
    bicep: 27.6,
    bustPointHeight: 26.5,
    neckGirth: 39.4,
    bustSpan: 18.5,
    waistToArmpit: 19.9,
    shoulderToWrist: 61.5,
    wrist: 16.8,
    underbust: 90.2,
    bustPointToUnderbust: 5.7,
    bustFront: 53.8,
    waistToUnderbust: 5.2,
    seat: 97.1,
    waistToSeat: 25.6,
    waistToKnee: 60.7,
    waistToFloor: 112.3,
    inseam: 76.4,
    shoulderToElbow: 34.6,
    head: 57.3,
    crossSeam: 82.8,
    crossSeamFront: 39.0,
    knee: 38.9,
    seatBack: 53.3,
    waistBack: 38.2,
    waistToUpperLeg: 32.2,
    hpsToWaistFront: 44.0,
  },
  P: {
    bust: 96,
    waist: 84,
    hip: 96,
    hipHeight: 21.3,
    backLength: 43.5,
    shoulder: 21.5,
    skirtLength: 58,
    shortSleeveLength: 21.5,
    longSleeveLength: 60.5,
    bicep: 28.8,
    bustPointHeight: 26.5,
    neckGirth: 41.1,
    bustSpan: 18.5,
    waistToArmpit: 20.5,
    shoulderToWrist: 62.2,
    wrist: 17.1,
    underbust: 94.1,
    bustPointToUnderbust: 5.8,
    bustFront: 54.9,
    waistToUnderbust: 5.3,
    seat: 99.6,
    waistToSeat: 26.3,
    waistToKnee: 62.3,
    waistToFloor: 114.2,
    inseam: 77.2,
    shoulderToElbow: 35.3,
    head: 58.2,
    crossSeam: 85.0,
    crossSeamFront: 40.0,
    knee: 39.9,
    seatBack: 54.6,
    waistBack: 39.6,
    waistToUpperLeg: 33.1,
    hpsToWaistFront: 44.5,
  },
  M: {
    bust: 100,
    waist: 88,
    hip: 100,
    hipHeight: 21.6,
    backLength: 44.0,
    shoulder: 22.0,
    skirtLength: 60,
    shortSleeveLength: 22,
    longSleeveLength: 62,
    bicep: 30.0,
    bustPointHeight: 26.5,
    neckGirth: 42.9,
    bustSpan: 18.5,
    waistToArmpit: 21.0,
    shoulderToWrist: 63.0,
    wrist: 17.5,
    underbust: 98.0,
    bustPointToUnderbust: 6.0,
    bustFront: 56.0,
    waistToUnderbust: 5.5,
    seat: 102.0,
    waistToSeat: 27.0,
    waistToKnee: 64.0,
    waistToFloor: 116.0,
    inseam: 78.0,
    shoulderToElbow: 36.0,
    head: 59.0,
    crossSeam: 87.0,
    crossSeamFront: 41.0,
    knee: 41.0,
    seatBack: 56.0,
    waistBack: 41.0,
    waistToUpperLeg: 34.0,
    hpsToWaistFront: 45.0,
  },
  G: {
    bust: 104,
    waist: 92,
    hip: 104,
    hipHeight: 22.0,
    backLength: 44.5,
    shoulder: 22.5,
    skirtLength: 62,
    shortSleeveLength: 22.5,
    longSleeveLength: 63.5,
    bicep: 31.2,
    bustPointHeight: 26.5,
    neckGirth: 44.6,
    bustSpan: 18.5,
    waistToArmpit: 21.5,
    shoulderToWrist: 63.8,
    wrist: 17.9,
    underbust: 101.9,
    bustPointToUnderbust: 6.2,
    bustFront: 57.1,
    waistToUnderbust: 5.7,
    seat: 104.4,
    waistToSeat: 27.7,
    waistToKnee: 65.7,
    waistToFloor: 117.8,
    inseam: 78.8,
    shoulderToElbow: 36.7,
    head: 59.8,
    crossSeam: 89.0,
    crossSeamFront: 42.0,
    knee: 42.1,
    seatBack: 57.4,
    waistBack: 42.4,
    waistToUpperLeg: 34.9,
    hpsToWaistFront: 45.5,
  },
  GG: {
    bust: 108,
    waist: 96,
    hip: 108,
    hipHeight: 22.3,
    backLength: 45.0,
    shoulder: 23.0,
    skirtLength: 64,
    shortSleeveLength: 23,
    longSleeveLength: 65,
    bicep: 32.4,
    bustPointHeight: 26.5,
    neckGirth: 46.3,
    bustSpan: 18.5,
    waistToArmpit: 22.1,
    shoulderToWrist: 64.5,
    wrist: 18.2,
    underbust: 105.8,
    bustPointToUnderbust: 6.3,
    bustFront: 58.2,
    waistToUnderbust: 5.8,
    seat: 106.9,
    waistToSeat: 28.4,
    waistToKnee: 67.3,
    waistToFloor: 119.7,
    inseam: 79.6,
    shoulderToElbow: 37.4,
    head: 60.7,
    crossSeam: 91.2,
    crossSeamFront: 43.0,
    knee: 43.1,
    seatBack: 58.7,
    waistBack: 43.8,
    waistToUpperLeg: 35.8,
    hpsToWaistFront: 46.0,
  },
};

export const MEASUREMENT_RANGES: Record<
  keyof Measurements,
  { min: number; max: number }
> = {
  bust: { min: 70, max: 140 },
  waist: { min: 55, max: 130 },
  hip: { min: 78, max: 150 },
  hipHeight: { min: 15, max: 28 },
  backLength: { min: 34, max: 50 },
  shoulder: { min: 14, max: 26 },
  skirtLength: { min: 25, max: 120 },
  shortSleeveLength: { min: 8, max: 35 },
  longSleeveLength: { min: 40, max: 70 },
  neckGirth: { min: 28, max: 48 },
  highBust: { min: 65, max: 135 },
  shoulderSlope: { min: 2, max: 7 },
  backWidth: { min: 26, max: 46 },
  bicep: { min: 18, max: 45 },
  rise: { min: 20, max: 36 },
  bustPointHeight: { min: 18, max: 34 },
  bustSpan: { min: 12, max: 26 },
  waistToArmpit: { min: 10, max: 28 },
  shoulderToWrist: { min: 45, max: 75 },
  wrist: { min: 12, max: 24 },
  underbust: { min: 60, max: 120 },
  bustPointToUnderbust: { min: 4, max: 14 },
  bustFront: { min: 38, max: 68 },
  waistToUnderbust: { min: 3, max: 11 },
  seat: { min: 80, max: 130 },
  waistToSeat: { min: 18, max: 34 },
  waistToKnee: { min: 48, max: 75 },
  waistToFloor: { min: 90, max: 130 },
  inseam: { min: 65, max: 90 },
  shoulderToElbow: { min: 26, max: 44 },
  head: { min: 48, max: 66 },
  crossSeam: { min: 60, max: 110 },
  crossSeamFront: { min: 28, max: 52 },
  knee: { min: 28, max: 50 },
  seatBack: { min: 40, max: 70 },
  waistBack: { min: 28, max: 52 },
  waistToUpperLeg: { min: 20, max: 42 },
  hpsToWaistFront: { min: 32, max: 55 },
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// #140: draftAll (lib/draft/garment.ts) calls this first, so it's the one
// choke point every drafted garment's base row passes through -- an
// incomplete/missing-field row (e.g. a corrupted `Pattern.sizeTable[size]`)
// used to sail through as `undefined`s, which the drafters' arithmetic turns
// into NaN outline coordinates. NaN comparisons are always false, so
// lib/export/bezier.ts's flattenCubic never meets its tolerance check and
// recurses to MAX_DEPTH on every curved span (65536 points each), which then
// feeds lib/export/offset.ts's O(n²) removeSelfCrossingLoops -- not a true
// infinite loop, but a combinatorial blowup indistinguishable from one
// (measured: 95+ seconds of spinning CPU before a forced kill). Failing fast
// here, before any geometry is touched, is cheaper than bounding every
// downstream loop against non-finite input individually.
//
// #132: only CORE_MEASUREMENT_KEYS are required to be present -- an
// EXTENDED key is allowed to be missing entirely (that's the fallback path
// every drafter reading one implements), but if it IS present it still has
// to be finite, for the same NaN-propagation reason as a core field.
function assertResolvedMeasurements(base: Measurements): void {
  const invalidCore = CORE_MEASUREMENT_KEYS.filter(
    (k) => !Number.isFinite(base[k]),
  );
  const invalidExtended = EXTENDED_MEASUREMENT_KEYS.filter(
    (k) => base[k] !== undefined && !Number.isFinite(base[k]),
  );
  const invalid = [...invalidCore, ...invalidExtended];
  if (invalid.length > 0) {
    throw new Error(
      `resolveMeasurements: base row is missing or has non-finite field(s): ${invalid.join(", ")}`,
    );
  }
}

// Applies chat-driven overrides on top of an already-resolved base row (from
// a size chart's sizeTable — see lib/sizeCharts/compute.ts's
// resolveSizeChartSize) and clamps to MEASUREMENT_RANGES. No longer does a
// size/gender table lookup itself — that responsibility moved to the size
// chart layer.
export function resolveMeasurements(
  base: Measurements,
  overrides: Partial<Measurements>,
): Measurements {
  assertResolvedMeasurements(base);
  const result = { ...base };
  for (const k of Object.keys(overrides) as (keyof Measurements)[]) {
    const v = overrides[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      const r = MEASUREMENT_RANGES[k];
      result[k] = clamp(v, r.min, r.max);
    }
  }
  return result;
}
