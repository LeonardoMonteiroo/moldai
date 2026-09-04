import { Pattern, Girth, FitClass } from "@/lib/types";
import { draftPiecesCm, measureSeamGraph } from "./engine/facade";
import { DEFAULT_ENGINE_ID } from "./engine/capability";
import { DraftedPiece, Pt, curveArcLengthCm, dartsOf } from "./core";
import { classifyGirthFit } from "./ease";
import type { Translate } from "@/lib/i18n/translate";

// #137: "drafted-ease report" -- the ONLY geometric fit answer in the app
// used to be seamCheck's armhole-vs-cap comparison. This is the second one:
// how much ease the FINISHED garment actually has at bust/waist/hip,
// measured from the drafted flat-pattern geometry itself and compared
// against the frozen sizeTable row it was drafted from. This is
// deliberately NOT the same number as lib/draft/ease.ts's wearingEaseCm --
// that is the ease the drafter was ASKED for (the style.fit/stretch input);
// a style adjustment, a dart, or a silhouette can make the drafted geometry
// diverge from it, and this module measures what actually came out, never
// what was requested.

export const GIRTHS: Girth[] = ["bust", "waist", "hip"];

export interface GirthEase {
  girth: Girth;
  finishedCm: number; // measured off the drafted geometry
  bodyCm: number; // from the frozen sizeTable row (never the chat-overridden measurements -- see buildEaseReport)
  diffCm: number; // finishedCm - bodyCm; negative is a real, intentional value for a knit
  diffPct: number; // diffCm / bodyCm * 100
  fitClass: FitClass;
}

// A garment type that has no matching panel (bust on a skirt or trousers)
// gets an honest "not applicable" entry rather than a misleading zero --
// CLAUDE.md's "surface a scope boundary where the user meets it" rule.
// "unsupportedSilhouette" is the other kind: a radial skirt panel (circle/
// gore/half-circle) is drafted from polar coordinates, so a plain
// horizontal height scan (what straight/a-line hip measurement uses, see
// below) can't read a meaningful width off it -- reporting a number anyway
// would be exactly the "approximate/wrong measurement labelled as ease"
// HONESTY RULE 2 rules out.
export type EaseUnavailableReason = "noPanel" | "unsupportedSilhouette";

export interface EaseUnavailable {
  girth: Girth;
  reason: EaseUnavailableReason;
}

// The cap/armhole comparison the issue also asks the report to state, once
// it reads off the real seam graph (#134) rather than a bespoke number --
// see buildEaseReport below.
export interface CapEase {
  armholeArcCm: number;
  capArcCm: number;
  easeCm: number; // capArcCm - armholeArcCm -- the ease sewn into the cap
}

export interface EaseReport {
  girths: GirthEase[];
  unavailable: EaseUnavailable[];
  cap?: CapEase; // absent for a garment with no sleeve (skirt, trousers, sleeveless)
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---- geometry helpers ----------------------------------------------------

// Horizontal extent of a closed cm-space polygon at height `y`, treating
// every edge as a straight chord -- the same approximation
// lib/canvas/pieceLabel.ts's horizontalSpanAt already uses on a piece's own
// outline for the identical reason (the drafters sample curves densely
// enough, #86, that the deviation is a fraction of a millimetre). Reused
// here for both a piece's own outline AND a dart's own leg polygon, see
// widthAtCm below.
function polygonSpanAt(
  pts: Pt[],
  y: number,
): { lo: number; hi: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a[1] === b[1]) continue;
    if (y < Math.min(a[1], b[1]) || y > Math.max(a[1], b[1])) continue;
    const x = a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  return hi >= lo ? { lo, hi } : null;
}

// The piece's own FINISHED (post-suppression) width at height `y`: the raw
// outline span there, minus whatever any internal dart removes at that same
// height. A dart's own ptsCm polygon (public since #127's internalsCm
// channel), scanned the identical way, gives exactly the fabric width its
// own fold takes up -- full width at its open (seam) end, tapering to zero
// at its apex, whether the dart's open end sits ON the piece's own boundary
// (lib/draft/body.ts's dress-hem dart, lib/draft/trousers.ts's waist dart)
// or is fully internal (lib/draft/body.ts's fisheye dart on a non-dress
// piece). This is what lets ONE generic function report the sewn width for
// a piece a drafter shaped with a dart without this module needing to know
// either drafter's own suppression formula -- it only reads geometry the
// drafter already emitted.
//
// `includeDarts: false` is the one deliberate opt-out (lib/draft/trousers.ts's
// hip level, see buildEaseReport below): a waist dart shapes the WAIST, it
// doesn't remove hip fabric, and the trousers block happens to draft both
// hip and waist at the exact same height (the panel's own top edge) --
// subtracting the dart there would collapse hip into waist instead of
// reporting the two genuinely different numbers the drafter intends.
function widthAtCm(
  piece: DraftedPiece,
  y: number,
  includeDarts = true,
): number {
  const span = polygonSpanAt(piece.outlineCm, y);
  if (!span) return 0;
  let width = span.hi - span.lo;
  if (includeDarts) {
    for (const dartPts of dartsOf(piece.internalsCm)) {
      const dartSpan = polygonSpanAt(dartPts, y);
      if (dartSpan) width -= dartSpan.hi - dartSpan.lo;
    }
  }
  return Math.max(0, width);
}

function findPiece(
  pieces: DraftedPiece[],
  id: string,
): DraftedPiece | undefined {
  return pieces.find((p) => p.id === id);
}

// ---- report ---------------------------------------------------------------

// Pure: takes a Pattern (spec + the frozen sizeTable it was drafted from)
// and returns per-girth ease for bust/waist/hip. Works for a pattern
// drafted before this feature existed -- it derives everything from the
// already-stored spec + sizeTable, no new blob key. Returns null when there
// is nothing to measure (no spec yet, no matching sizeTable row, or a blank
// pattern) -- the TechSheetTab "no valid spec" precedent (buildExportModel).
export function buildEaseReport(
  pattern: Pattern,
  t: Translate,
): EaseReport | null {
  const spec = pattern.spec;
  // #137: optional chaining here, not a plain index -- unlike
  // buildExportModel (only ever called once `spec`/`pieces` already gate
  // it), this is now also called from lib/ai/prompt.ts's buildSystem on
  // EVERY generate request, including against test/legacy fixtures whose
  // `pattern` carries no sizeTable at all -- an unguarded index throws
  // before the `!bodyRow` check below ever runs.
  const bodyRow = pattern.sizeTable?.[pattern.baseSize];
  if (!spec || !bodyRow || pattern.pieces.length === 0) return null;

  // #267: DEFAULT_ENGINE_ID until pattern.engine (frozen per pattern) lands.
  let pieces: DraftedPiece[];
  let seamGraph: ReturnType<typeof measureSeamGraph>;
  try {
    pieces = draftPiecesCm(DEFAULT_ENGINE_ID, spec, bodyRow, t);
    seamGraph = measureSeamGraph(DEFAULT_ENGINE_ID, spec, bodyRow, t);
  } catch {
    return null;
  }

  const front = findPiece(pieces, "body-front");
  const back = findPiece(pieces, "body-back");
  const skirt = findPiece(pieces, "skirt");
  const trouserFront = findPiece(pieces, "trouser-front");
  const trouserBack = findPiece(pieces, "trouser-back");

  const girths: GirthEase[] = [];
  const unavailable: EaseUnavailable[] = [];

  const record = (girth: Girth, finishedCm: number, bodyCm: number) => {
    const diffCm = round1(finishedCm - bodyCm);
    const diffPct = bodyCm !== 0 ? round1((diffCm / bodyCm) * 100) : 0;
    girths.push({
      girth,
      finishedCm: round1(finishedCm),
      bodyCm: round1(bodyCm),
      diffCm,
      diffPct,
      fitClass: classifyGirthFit(girth, diffCm),
    });
  };

  // BUST -- only a bodice (blouse/dress/tshirt) has one. A skirt or a
  // trousers block has no bust panel at all; per the issue's own decision
  // for trousers (generalised to any bust-less garment), that's reported as
  // "not applicable", never a misleading zero.
  if (front && back && front.seamEdges?.armhole && back.seamEdges?.armhole) {
    // The underarm height -- the "to" vertex of each panel's own armhole
    // edge -- is where the bodice is widest at chest level, front and back
    // alike (lib/draft/body.ts: armholeDepth doesn't depend on `frontish`).
    // Read off each piece's own geometry rather than recomputed, so this
    // never needs to know body.ts's own armhole-depth formula.
    const frontY = front.outlineCm[front.seamEdges.armhole[1]][1];
    const backY = back.outlineCm[back.seamEdges.armhole[1]][1];
    const bustCm =
      widthAtCm(front, frontY) * front.qty + widthAtCm(back, backY) * back.qty;
    record("bust", bustCm, bodyRow.bust);
  } else {
    unavailable.push({ girth: "bust", reason: "noPanel" });
  }

  // WAIST
  if (front && back) {
    // The bodice's own waist height, read straight off Measurements.
    // backLength rather than an internal body.ts constant -- for a dress
    // this coincides exactly with the bodice's own hem (a dress bodice ends
    // at the waist, #79), for a blouse/tshirt it's partway down the panel.
    // Either way this module never needs to know which case it's in, and
    // the dart subtraction in widthAtCm applies identically to both.
    const waistY = bodyRow.backLength;
    const waistCm =
      widthAtCm(front, waistY) * front.qty + widthAtCm(back, waistY) * back.qty;
    record("waist", waistCm, bodyRow.waist);
  } else if (trouserFront && trouserBack) {
    // Both panels' own top edge (y=0), post-dart -- exactly the true waist
    // lib/draft/trousers.ts's own waist dart is sized to produce (see HIP
    // below for the pre-dart reading at the same height).
    const waistCm =
      widthAtCm(trouserFront, 0) * trouserFront.qty +
      widthAtCm(trouserBack, 0) * trouserBack.qty;
    record("waist", waistCm, bodyRow.waist);
  } else if (skirt?.seamEdges?.waist) {
    // A skirt panel has no dart -- its own waist seam's real arc length (any
    // silhouette, including the radial circle/gore/half-circle ones a
    // height scan can't read, see HIP below) is exact and silhouette-
    // agnostic, the same edge lib/draft/garment.ts's own waistband sizing
    // already measures off.
    const waistCm =
      curveArcLengthCm(
        skirt.outlineCm,
        skirt.curvedSpans ?? [],
        ...skirt.seamEdges.waist,
      ) * skirt.qty;
    record("waist", waistCm, bodyRow.waist);
  } else {
    unavailable.push({ girth: "waist", reason: "noPanel" });
  }

  // HIP
  if (skirt) {
    // A dress's skirt panel shares this exact branch with a standalone
    // skirt -- both start their own outline at y=0 (waist), so hipHeight
    // below that is hip level either way.
    const silhouette = spec.style.skirt ?? "straight";
    if (silhouette === "straight" || silhouette === "a-line") {
      const hipCm = widthAtCm(skirt, bodyRow.hipHeight) * skirt.qty;
      record("hip", hipCm, bodyRow.hip);
    } else {
      unavailable.push({ girth: "hip", reason: "unsupportedSilhouette" });
    }
  } else if (front && back) {
    // A skirt-less bodice (a plain blouse/tshirt): hip level is still
    // inside the same panel, backLength+hipHeight down from its own top --
    // the blouse hem sits another 5cm below that (lib/draft/body.ts's own
    // lengthCm), so this height is always within the drafted outline.
    const hipY = bodyRow.backLength + bodyRow.hipHeight;
    const hipCm =
      widthAtCm(front, hipY) * front.qty + widthAtCm(back, hipY) * back.qty;
    record("hip", hipCm, bodyRow.hip);
  } else if (trouserFront && trouserBack) {
    // Pre-dart, at the same height WAIST reads post-dart (see above): a
    // waist dart shapes the waist, it doesn't remove hip fabric, and
    // lib/draft/trousers.ts drafts both at the panel's own top edge.
    const hipCm =
      widthAtCm(trouserFront, 0, false) * trouserFront.qty +
      widthAtCm(trouserBack, 0, false) * trouserBack.qty;
    record("hip", hipCm, bodyRow.hip);
  } else {
    unavailable.push({ girth: "hip", reason: "noPanel" });
  }

  // CAP EASE -- reads the existing seam graph (#134) rather than a bespoke
  // number: the "armhole-cap" pair's own aLenCm/bLenCm ARE the full
  // armhole arc and the cap arc, already measured off the actually-drafted
  // geometry (refit or not). Absent when there is no sleeve at all.
  const armholeCap = seamGraph.find((s) => s.key === "armhole-cap");
  const cap: CapEase | undefined = armholeCap
    ? {
        armholeArcCm: armholeCap.aLenCm,
        capArcCm: armholeCap.bLenCm,
        easeCm: round1(armholeCap.bLenCm - armholeCap.aLenCm),
      }
    : undefined;

  return { girths, unavailable, cap };
}
