import { Pattern, Girth, FitClass } from "@/lib/types";
import { draftPiecesCm, measureSeamGraph } from "./engine/facade";
import { engineFor } from "./engine/capability";
import {
  DraftedPiece,
  dartIntakeAtYCm,
  polygonSpanAt,
  presentedEdgeLenCm,
} from "./core";
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

// The piece's own FINISHED (post-suppression) width at height `y`: the raw
// outline span there, minus whatever any internal dart removes at that same
// height, minus any pleat take-up the drafter declared (#319/#320) -- both
// via lib/draft/core.ts's dartIntakeAtYCm/DraftedPiece.pleatTakeUpCm, the
// same shared arithmetic presentedEdgeLenCm uses for an edge-range question
// instead of this module's own scanline one. This is what lets ONE generic
// function report the sewn width for a piece a drafter shaped with a dart
// or a pleat, without this module needing to know either drafter's own
// suppression formula -- it only reads geometry (or a number) the drafter
// already emitted.
//
// `includeSuppression: false` is the one deliberate opt-out
// (lib/draft/trousers.ts's hip level, see buildEaseReport below): a waist
// dart shapes the WAIST, it doesn't remove hip fabric, and the trousers
// block happens to draft both hip and waist at the exact same height (the
// panel's own top edge) -- subtracting the suppression there would collapse
// hip into waist instead of reporting the two genuinely different numbers
// the drafter intends. (A trousers panel never declares `pleatTakeUpCm`, so
// this opt-out's behaviour is unchanged by #319/#320 -- it was always,
// and remains, dart-only in practice.)
function widthAtCm(
  piece: DraftedPiece,
  y: number,
  includeSuppression = true,
): number {
  const span = polygonSpanAt(piece.outlineCm, y);
  if (!span) return 0;
  const raw = span.hi - span.lo;
  if (!includeSuppression) return Math.max(0, raw);
  const suppression =
    dartIntakeAtYCm(piece.internalsCm, y) + (piece.pleatTakeUpCm ?? 0);
  return Math.max(0, raw - suppression);
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

  // #267: the pattern's own FROZEN engine, never a fresh default -- a
  // pattern drafted with a second engine must redraft with that same
  // engine on every subsequent read, not silently fall back to moldai.
  const engine = engineFor(pattern.engine);
  let pieces: DraftedPiece[];
  let seamGraph: ReturnType<typeof measureSeamGraph>;
  try {
    pieces = draftPiecesCm(engine, spec, bodyRow, t);
    seamGraph = measureSeamGraph(engine, spec, bodyRow, t);
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
    // The underarm height -- one end of each panel's own armhole edge -- is
    // where the bodice is widest at chest level, front and back alike
    // (lib/draft/body.ts: armholeDepth doesn't depend on `frontish`). Read
    // off each piece's own geometry rather than recomputed, so this never
    // needs to know body.ts's own armhole-depth formula. #263: the underarm
    // is always the DEEPER (larger-y) of the two endpoints -- shoulder sits
    // near the neckline, well above it -- which is order-agnostic against
    // which specific index (`armhole[0]` vs `armhole[1]`) core.ts's
    // normalizeWinding happened to remap it to, unlike reading a fixed
    // position in the pair.
    const frontY = Math.max(
      front.outlineCm[front.seamEdges.armhole[0]][1],
      front.outlineCm[front.seamEdges.armhole[1]][1],
    );
    const backY = Math.max(
      back.outlineCm[back.seamEdges.armhole[0]][1],
      back.outlineCm[back.seamEdges.armhole[1]][1],
    );
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
    // A skirt panel has no dart, but MAY have a declared pleat take-up
    // (#319/#320) -- its own waist seam's real PRESENTED arc length (any
    // silhouette, including the radial circle/gore/half-circle ones a
    // height scan can't read, see HIP below) is exact and silhouette-
    // agnostic, the same edge lib/draft/garment.ts's own waistband sizing
    // already measures off, netted through the identical
    // presentedEdgeLenCm so a pleated skirt's ease report and its actual
    // waistband always agree on the same finished waist.
    const waistCm =
      presentedEdgeLenCm(skirt, skirt.seamEdges.waist) * skirt.qty;
    record("waist", waistCm, bodyRow.waist);
  } else {
    unavailable.push({ girth: "waist", reason: "noPanel" });
  }

  // HIP
  if (skirt) {
    // A dress's skirt panel shares this exact branch with a standalone
    // skirt -- both start their own outline at y=0 (waist), so hipHeight
    // below that is hip level either way. widthAtCm nets `pleatTakeUpCm`
    // here too (#319/#320) -- a pleat widens waist AND hem by the same
    // amount, so the hip scan would otherwise report the same inflated
    // surplus the waist did before this fix.
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
