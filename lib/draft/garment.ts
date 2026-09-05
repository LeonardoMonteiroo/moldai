import {
  MEASUREMENT_RANGES,
  Measurements,
  resolveMeasurements,
} from "@/lib/measurements";
import {
  ClarifyQuestion,
  GarmentSpec,
  GarmentStyle,
  Gender,
  PieceOutline,
} from "@/lib/types";
import { curveArcLengthCm, DraftedPiece } from "./core";
import { BlockOpts, draftBody } from "./body";
import { draftSleeve, CAP_EASE_CM, WRIST_EASE_CM } from "./sleeve";
import { draftSkirt, dressWaistHalfCm } from "./skirt";
import { draftTrousers, TROUSER_DEFAULT_LENGTH_CM } from "./trousers";
import {
  draftCollar,
  draftBandCollar,
  draftShirtCollar,
  draftCuff,
  draftPlacket,
  draftWaistband,
  draftButtonStand,
  WAISTBAND_OVERLAP_CM,
  BAND_COLLAR_FRONT_EXTENSION_CM,
  BUTTON_STAND_WIDTH_CM,
} from "./subpieces";
// #267: the AI-facing vocabulary (TYPES/GENDERS/NECKLINES/SLEEVES/SKIRTS/
// COLLARS/CUFFS/WAISTBANDS/FRONT_CLOSURES/STYLE_LIMITS, plus the ./ease
// re-exports) moved to lib/draft/vocabulary.ts, a leaf module with no
// dependency on this file or any drafter -- lib/draft/engine/capability.ts
// builds the "moldai" engine's declared capability from it. Imported here
// (validateSpec below still reads every one of these directly) AND
// re-exported verbatim, so every existing importer (lib/ai's prompt/schema,
// TechSheetTab, the dashboard/sloper components) keeps reading
// `@/lib/draft/garment` with no import-path change.
import {
  TYPES,
  GENDERS,
  NECKLINES,
  SLEEVES,
  SKIRTS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  FRONT_CLOSURES,
  STYLE_LIMITS,
  FIT_CLASSES,
  STRETCH_CLASSES,
  FIT_EASE_CM,
  STRETCH_EASE_PCT,
  wearingEaseCm,
} from "./vocabulary";
import {
  SeamEdgeRef,
  SeamMeasurement,
  SeamPairDecl,
  SEAM_TOLERANCE_CM,
} from "./seams";
import type { Translate } from "@/lib/i18n/translate";

export type { SeamMeasurement } from "./seams";

export {
  TYPES,
  GENDERS,
  NECKLINES,
  SLEEVES,
  SKIRTS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  FRONT_CLOSURES,
  STYLE_LIMITS,
  FIT_CLASSES,
  STRETCH_CLASSES,
  FIT_EASE_CM,
  STRETCH_EASE_PCT,
  wearingEaseCm,
};

// tshirt-fit-calibration: a men's crew-neck tee's own hem drop below the
// nape-to-waist point (backLength), replacing the blouse hip-length reuse
// (backLength + hipHeight + 5) that this archetype had no dedicated formula
// of its own before. Solved against a real graded crew-neck tee reference
// (docs/reference/tshirt-benchmark/measurements.json): that reference's
// size-M back/front panel height is 58.007cm, and with SIZE_TABLE_MALE.M's
// backLength (44) and the male shoulderSlope default (4.5) —
// heightCm = (backLength + drop) - shoulderSlope, so
// drop = 58.007 - 44 + 4.5 = 18.507, rounded to 18.5. This is a single flat
// constant (not graded per size), the same shape CAP_EASE_CM/WRIST_EASE_CM
// already use — per-size variation comes from backLength's own grading, not
// a second table here.
const TSHIRT_HEM_DROP_CM = 18.5;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const pick = <T>(v: unknown, allowed: T[], def: T): T =>
  allowed.includes(v as T) ? (v as T) : def;
const num = (v: unknown, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

export function validateSpec(raw: unknown): GarmentSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  const style = (r.style ?? {}) as Record<string, unknown>;
  const ovRaw = (r.measurementOverrides ?? {}) as Record<string, unknown>;
  const overrides: Record<string, number> = {};
  for (const k of Object.keys(MEASUREMENT_RANGES)) {
    const v = ovRaw[k];
    if (typeof v === "number" && Number.isFinite(v)) overrides[k] = v; // range is applied in resolveMeasurements
  }
  const outStyle: GarmentStyle = {
    neckline:
      style.neckline !== undefined
        ? pick(style.neckline, NECKLINES, "straight")
        : undefined,
    sleeve:
      style.sleeve !== undefined
        ? pick(style.sleeve, SLEEVES, "none")
        : undefined,
    skirt:
      style.skirt !== undefined
        ? pick(style.skirt, SKIRTS, "straight")
        : undefined,
    necklineDepthCm:
      style.necklineDepthCm !== undefined
        ? clamp(
            num(style.necklineDepthCm, 0),
            STYLE_LIMITS.necklineDepthCm.min,
            STYLE_LIMITS.necklineDepthCm.max,
          )
        : undefined,
    skirtLengthCm:
      style.skirtLengthCm !== undefined
        ? clamp(
            num(style.skirtLengthCm, 60),
            STYLE_LIMITS.skirtLengthCm.min,
            STYLE_LIMITS.skirtLengthCm.max,
          )
        : undefined,
    seamAllowanceCm:
      style.seamAllowanceCm !== undefined
        ? clamp(
            num(style.seamAllowanceCm, 1),
            STYLE_LIMITS.seamAllowanceCm.min,
            STYLE_LIMITS.seamAllowanceCm.max,
          )
        : undefined,
    darts: typeof style.darts === "boolean" ? style.darts : undefined,
    fit:
      style.fit !== undefined
        ? pick(style.fit, FIT_CLASSES, "fitted")
        : undefined,
    stretch:
      style.stretch !== undefined
        ? pick(style.stretch, STRETCH_CLASSES, "none")
        : undefined,
    armholeDeepenCm:
      style.armholeDeepenCm !== undefined
        ? clamp(
            num(style.armholeDeepenCm, 0),
            STYLE_LIMITS.armholeDeepenCm.min,
            STYLE_LIMITS.armholeDeepenCm.max,
          )
        : undefined,
    // sleeveRefit is internal (only the conflict resolver sets it); never comes from the AI.
    collar:
      style.collar !== undefined
        ? pick(style.collar, COLLARS, "none")
        : undefined,
    cuff:
      style.cuff !== undefined ? pick(style.cuff, CUFFS, "none") : undefined,
    waistband:
      style.waistband !== undefined
        ? pick(style.waistband, WAISTBANDS, "straight")
        : undefined,
    frontClosure:
      style.frontClosure !== undefined
        ? pick(style.frontClosure, FRONT_CLOSURES, "none")
        : undefined,
    trouserLengthCm:
      style.trouserLengthCm !== undefined
        ? clamp(
            num(style.trouserLengthCm, 100),
            STYLE_LIMITS.trouserLengthCm.min,
            STYLE_LIMITS.trouserLengthCm.max,
          )
        : undefined,
  };
  return {
    type: pick(r.type, TYPES, "blouse"),
    gender: pick(r.gender, GENDERS, "female"),
    measurementOverrides: overrides,
    style: outStyle,
  };
}

export function validateQuestions(raw: unknown): ClarifyQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ClarifyQuestion[] = [];
  for (const item of raw.slice(0, 4)) {
    const q = (item ?? {}) as Record<string, unknown>;
    const label = typeof q.label === "string" ? q.label.trim() : "";
    if (!label) continue;
    const optsRaw = Array.isArray(q.options) ? q.options : [];
    const options: string[] = [];
    for (const o of optsRaw) {
      const s = typeof o === "string" ? o.trim() : "";
      if (s && !options.includes(s)) options.push(s);
      if (options.length === 6) break;
    }
    if (options.length < 2) continue;
    out.push({
      id: `q${out.length}`,
      label,
      options,
      allowOther: q.allowOther === true,
    });
  }
  return out;
}

// #134: seamCheck used to BE the comparison -- exactly two numbers, the body
// armhole against the sleeve cap. It is now a CONSUMER of the full seam
// graph walkSeamPairs (lib/draft/seams.ts) produces: every mated pair this
// garment declared, not only that one. Narrows the graph down to the pairs
// whose actual gap misses their own intended ease by more than
// SEAM_TOLERANCE_CM -- i.e. the real conflicts, in the same shape #138's own
// sewing-order graph will consume (every pair, divergent or not).
export function seamCheck(graph: SeamMeasurement[]): SeamMeasurement[] {
  // diffCm is already a magnitude (lib/draft/seams.ts's walkSeamPairs) --
  // no second Math.abs needed here.
  return graph.filter((m) => m.diffCm > SEAM_TOLERANCE_CM);
}

const edgeRef = (
  pieceId: string,
  [from, to]: [number, number],
): SeamEdgeRef => ({
  pieceId,
  from,
  to,
});

// #267: the "moldai" engine's own raw draft implementation, wrapped by
// lib/draft/engine/moldai.ts into the declared DraftingEngine contract --
// exported for that wrapper alone, never imported by a consumer directly
// (enforced by lib/draft/engine/conformance.test.ts's source scan). Returns
// `seamPairs` (DECLARATIONS this garment's own topology names, built up as
// each piece is drafted below) rather than a walked graph: measuring them
// off `drafted` is lib/draft/seams.ts's walkSeamPairs's job, called by the
// facade, never here -- this is what keeps an engine's output structurally
// incapable of carrying a measurement, only a declaration.
export function draftAll(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
): {
  drafted: DraftedPiece[];
  measurements: Measurements;
  armholeLenCm?: number;
  sleeveArmholeCm?: number;
  garmentLengthCm?: number;
  seamPairs: SeamPairDecl[];
} {
  const gender: Gender = spec.gender ?? "female";
  const measurements: Measurements = resolveMeasurements(
    baseMeasurements,
    spec.measurementOverrides,
  );
  const drafted: DraftedPiece[] = [];
  let armholeLenCm: number | undefined;
  let sleeveArmholeCm: number | undefined;
  // #234: the garment's own overall length -- a bodice archetype's own
  // lengthCm below the shoulder, a dress's bodice-to-waist plus its skirt
  // panel's own length, a standalone skirt's own length, or a trouser's own
  // waist-to-hem length. Undefined for nothing today (every archetype drafts
  // a length), but kept optional to match armholeLenCm's own
  // undefined-for-what-doesn't-apply shape rather than a fabricated 0.
  let garmentLengthCm: number | undefined;
  // Hoisted out of the `isBody` block below so the dress waist-join pairs
  // (declared further down, alongside the skirt) can reference the same
  // front/back panels.
  let front: DraftedPiece | undefined;
  let back: DraftedPiece | undefined;
  // #134: every mated pair this garment's own topology declares -- built up
  // below as each piece is drafted (garment.ts is the one place that knows
  // which panel sews to which across the whole garment), then walked once,
  // at the end, against the pieces actually drafted.
  const seamPairs: SeamPairDecl[] = [];

  const isBody =
    spec.type === "blouse" || spec.type === "dress" || spec.type === "tshirt";
  // #269: "hoodie" is a real, app-level GarmentType (validateSpec accepts
  // it) that this drafter has no branch for at all -- MOLDAI_CAPABILITY's
  // own MOLDAI_TYPES deliberately excludes it (lib/draft/engine/
  // capability.ts), so a properly-gated caller (checkEngineSupport, the
  // generate route's own blockingGap check) never reaches this far for it
  // on the "moldai" engine. This is the same defensive backstop
  // lib/draft/engine/freesewing/index.ts's own dispatch throws for an
  // unwired type -- without it, a caller that skipped the gate (a future
  // test, a bug) would silently get back `drafted: []` instead of a loud
  // failure, the exact "silent gap" CLAUDE.md's own non-negotiable forbids.
  if (!isBody && spec.type !== "skirt" && spec.type !== "trousers") {
    throw new Error(
      `draftAll: no drafter wired for garment type "${spec.type}"`,
    );
  }
  if (isBody) {
    const knit = spec.type === "tshirt";
    const lengthCm =
      spec.type === "dress"
        ? measurements.backLength
        : spec.type === "tshirt"
          ? measurements.backLength + TSHIRT_HEM_DROP_CM
          : measurements.backLength + measurements.hipHeight + 5;
    // A dress's own bodice ends at the waist (lengthCm above) -- the skirt
    // block below adds its own panel length on top once it's drafted.
    garmentLengthCm = lengthCm;
    // T-shirt base model: round neckline, no darts, short sleeve, ribbed
    // collar band by default -- a bare crew neck with no collar at all
    // isn't how any real basic tee is constructed (tshirt-fit-calibration).
    const style: GarmentStyle =
      spec.type === "tshirt"
        ? {
            ...spec.style,
            neckline: spec.style.neckline ?? "round",
            darts: false,
            sleeve: spec.style.sleeve ?? "short",
            collar: spec.style.collar ?? "band",
          }
        : spec.style;
    const opts: BlockOpts = {
      gender,
      knit,
      lengthCm,
      wearingEaseCm: wearingEaseCm(style, knit, measurements.bust),
      // #79/#177: a dress's bodice ends at the waist (lengthCm ===
      // backLength, above), where it's joined to a separately-drafted skirt
      // panel -- the hem must be drafted at that panel's own waist width.
      // #177 (owner decision, refined post-#185 review): that width is now
      // derived from the actual WAIST measurement via dressWaistHalfCm(waist)
      // -- the SAME value regardless of which skirt silhouette this dress
      // has, since the bodice describes the body, not the skirt it happens
      // to be sewn to (see dressWaistHalfCm's own doc for why waistCm/4,
      // with no silhouette parameter, is what every silhouette's own
      // construction already agrees on). It used to read
      // skirtWaistHalfCm(hip) here, which was wrong independent of
      // silhouette -- a fitted bodice ends at the natural waist, not the
      // hip; the circle/gore/half-circle skirt only made the resulting
      // mismatch visible (#134's own finding).
      ...(spec.type === "dress"
        ? { dressHemHalfCm: dressWaistHalfCm(measurements.waist) }
        : {}),
    };
    const {
      front: f,
      back: c,
      armholeLenCm: a,
      armholeBaseLenCm,
      pitchNotchCm,
      basePitchNotchCm,
    } = draftBody(measurements, style, t, opts);
    front = f;
    back = c;
    armholeLenCm = a;
    drafted.push(front, back);
    // #134: the shoulder and side seams -- front vs back. Equal by
    // construction TODAY (see body.ts's own note beside armCtrlX: neither
    // shoulderHalf/neckHalf, halfChest, waistHalf, hemHalf nor waistY/len
    // depend on `frontish`), so these are regression guards, not live risk
    // -- but they're real seams #138's assembly graph needs regardless, and
    // "equal by construction" is exactly the kind of claim that deserves an
    // assertion instead of staying an unchecked comment.
    if (front.seamEdges && back.seamEdges) {
      seamPairs.push({
        key: "shoulder",
        labelKey: "shoulder",
        a: [edgeRef(front.id, front.seamEdges.shoulder)],
        b: [edgeRef(back.id, back.seamEdges.shoulder)],
        easeCm: 0,
        fixable: false,
      });
      seamPairs.push({
        key: "side",
        labelKey: "side",
        a: [edgeRef(front.id, front.seamEdges.side)],
        b: [edgeRef(back.id, back.seamEdges.side)],
        easeCm: 0,
        fixable: false,
      });
    }
    // The sleeve cap is sized from the BASE (un-adjusted) armhole — unless it's
    // already been refit (the sleeve-fix action sets style.sleeveRefit). This way
    // an armhole adjustment on the body alone makes the seams diverge → real conflict.
    const sleeveArmhole = style.sleeveRefit ? a : armholeBaseLenCm;
    // #124: whichever pitch-notch distance matches the armhole the cap was
    // ACTUALLY drafted against (refit or not) -- the same actual/base choice
    // as sleeveArmhole above, so the two pieces' pitch notches land at truly
    // matching positions.
    const sleevePitchNotchCm = style.sleeveRefit
      ? pitchNotchCm
      : basePitchNotchCm;
    const sleeve = draftSleeve(
      measurements,
      style,
      sleeveArmhole,
      t,
      opts,
      sleevePitchNotchCm,
    );
    if (sleeve) {
      drafted.push(sleeve);
      // The armhole the drafted cap actually fits, measured from its own
      // curve — not the target argument (#78) — so seamCheck stays able to
      // detect a real cap/armhole mismatch instead of comparing an input to
      // itself.
      sleeveArmholeCm = sleeve.armholeLenCm;
      // #134: the ONE pair that can genuinely diverge today -- an
      // armholeDeepenCm without a matching refit. Declared from the RAW
      // edges (front+back's own armhole curves vs the cap's own raw arc,
      // [0,4]) with easeCm = the same knit/woven CAP_EASE_CM the cap was
      // solved against, which reproduces seamCheck's original two-number
      // comparison exactly (see lib/draft/seams.ts's SeamPairDecl doc).
      if (front.seamEdges && back.seamEdges && sleeve.seamEdges) {
        seamPairs.push({
          key: "armhole-cap",
          labelKey: "armholeCap",
          a: [
            edgeRef(front.id, front.seamEdges.armhole),
            edgeRef(back.id, back.seamEdges.armhole),
          ],
          b: [edgeRef(sleeve.id, sleeve.seamEdges.cap)],
          easeCm: opts.knit ? CAP_EASE_CM.knit : CAP_EASE_CM.woven,
          fixable: true,
        });
        // #134: the sleeve's own two side seams (underarm), sewn to each
        // other when the piece is folded into a tube -- equal by
        // construction (the cap outline is symmetric about its own apex),
        // a regression guard like shoulder/side above.
        seamPairs.push({
          key: "sleeve-underarm",
          labelKey: "sleeveUnderarm",
          a: [edgeRef(sleeve.id, sleeve.seamEdges.underarmRight)],
          b: [edgeRef(sleeve.id, sleeve.seamEdges.underarmLeft)],
          easeCm: 0,
          fixable: false,
        });
      }
      // #130: a straight cuff (+ placket), drafted from the sleeve's own
      // measured hem edge -- only meaningful with a long sleeve; a short or
      // sleeveless garment simply never reaches this branch (`style.cuff` is
      // otherwise unused, the same "type-mismatched style field is a no-op"
      // precedent skirt-only fields already follow on a bodice-only spec).
      if (
        style.sleeve === "long" &&
        style.cuff === "straight" &&
        sleeve.seamEdges
      ) {
        const hemArcCm = curveArcLengthCm(
          sleeve.outlineCm,
          sleeve.curvedSpans ?? [],
          ...sleeve.seamEdges.hem,
        );
        const wristEase = opts.knit ? WRIST_EASE_CM.knit : WRIST_EASE_CM.woven;
        const cuff = draftCuff(hemArcCm + wristEase, t);
        const placket = draftPlacket(t);
        drafted.push(cuff, placket);
        if (cuff.seamEdges) {
          seamPairs.push({
            key: "cuff-hem",
            labelKey: "cuffHem",
            a: [edgeRef(sleeve.id, sleeve.seamEdges.hem)],
            b: [edgeRef(cuff.id, cuff.seamEdges.hem)],
            easeCm: wristEase,
            fixable: false,
          });
        }
      }
    }
    // #129/#221/#222: a convertible, band, OR shirt collar, drafted from the
    // front+back neckline's own measured arc -- computed directly off the
    // already-drafted panels (never persisted, never a proportion of the
    // bust), the same "measure the geometry that was actually emitted" rule
    // the armhole/cap pair already established. For "band"/"shirt", body.ts
    // has already lowered that neckline (its own BAND_COLLAR_*_DROP_CM
    // deltas) BEFORE these panels were drafted, so the arc summed here is
    // already the lowered one -- this branch itself only picks which
    // drafter/ease to use.
    if (
      (style.collar === "convertible" ||
        style.collar === "band" ||
        style.collar === "shirt") &&
      front.seamEdges &&
      back.seamEdges
    ) {
      // Narrowed into a local const -- `front` is a `let` (reassigned once,
      // earlier, from draftBody's own return), and TS resets that narrowing
      // inside the closures below (.reduce/.map) since it can't prove the
      // outer variable stays defined across a later reassignment it can't
      // see into.
      const frontPiece = front;
      const frontSeamEdges = front.seamEdges;
      // #223: a front-closure front (body.ts's frontClosure mode, signalled
      // by qty:2) drafts only one half and has no necklineRight at all --
      // both of its neckline-curve contributions come from necklineLeft,
      // counted twice (both mirrored halves draft the identical curve).
      const frontNeckEdges: [number, number][] =
        frontPiece.qty === 2
          ? [frontSeamEdges.necklineLeft, frontSeamEdges.necklineLeft]
          : [frontSeamEdges.necklineLeft, frontSeamEdges.necklineRight];
      const necklineArcCm =
        frontNeckEdges.reduce(
          (sum, edge) =>
            sum +
            curveArcLengthCm(
              frontPiece.outlineCm,
              frontPiece.curvedSpans ?? [],
              ...edge,
            ),
          0,
        ) +
        curveArcLengthCm(
          back.outlineCm,
          back.curvedSpans ?? [],
          ...back.seamEdges.necklineLeft,
        ) +
        curveArcLengthCm(
          back.outlineCm,
          back.curvedSpans ?? [],
          ...back.seamEdges.necklineRight,
        );
      // #221/#222: "band" drafts a straight-up stand instead of the
      // convertible fold shape -- same neckline arc, but its own finished
      // length adds the front-edge closure extension (draftBandCollar's own
      // BAND_COLLAR_FRONT_EXTENSION_CM). "shirt" drafts the SAME kind of
      // stand (draftShirtCollar) plus a separate fall mated to the stand's
      // own upper seam, and its stand's own extension is the button-stand
      // width (#223's BUTTON_STAND_WIDTH_CM, per the issue's own formula --
      // see draftShirtCollar's doc). Either way the pair's `easeCm` has to
      // match whichever extension the drafted piece actually added, so
      // walkSeamPairs' diffCm = |bLen - aLen - easeCm| still lands at zero
      // by construction.
      const necklinePairA = [
        ...frontNeckEdges.map((edge) => edgeRef(frontPiece.id, edge)),
        edgeRef(back.id, back.seamEdges.necklineLeft),
        edgeRef(back.id, back.seamEdges.necklineRight),
      ];
      if (style.collar === "shirt") {
        const { stand, fall } = draftShirtCollar(necklineArcCm, t);
        drafted.push(stand, fall);
        if (stand.seamEdges?.neckline) {
          seamPairs.push({
            key: "collar-neckline",
            labelKey: "collarNeckline",
            a: necklinePairA,
            b: [edgeRef(stand.id, stand.seamEdges.neckline)],
            easeCm: BUTTON_STAND_WIDTH_CM,
            fixable: false,
          });
        }
        // #222: the stand's own upper seam vs the fall's own neckline seam
        // -- both measured off the ACTUALLY-drafted pieces (draftShirtCollar
        // sizes the fall to the stand's own measured, shortened upper seam),
        // so this pair matches by construction, easeCm 0, the same
        // "measure what was really emitted" rule cuff-hem/waistband-waist
        // already established.
        if (stand.seamEdges?.fallSeam && fall.seamEdges?.neckline) {
          seamPairs.push({
            key: "collar-stand-fall",
            labelKey: "collarStandFall",
            a: [edgeRef(stand.id, stand.seamEdges.fallSeam)],
            b: [edgeRef(fall.id, fall.seamEdges.neckline)],
            easeCm: 0,
            fixable: false,
          });
        }
      } else {
        const isBand = style.collar === "band";
        const collar = isBand
          ? draftBandCollar(necklineArcCm, t)
          : draftCollar(necklineArcCm, t);
        drafted.push(collar);
        if (collar.seamEdges) {
          seamPairs.push({
            key: "collar-neckline",
            labelKey: "collarNeckline",
            a: necklinePairA,
            b: [edgeRef(collar.id, collar.seamEdges.neckline)],
            easeCm: isBand ? BAND_COLLAR_FRONT_EXTENSION_CM : 0,
            fixable: false,
          });
        }
      }
    }
    // #223: a button stand, drafted from the front bodice's own measured
    // center-front edge -- reachable only when body.ts's frontClosure mode
    // actually split the front (the piece's own seamEdges.centerFront is
    // the single source of truth for that, not a re-check of style here).
    if (front.seamEdges?.centerFront) {
      const centerFrontLenCm = curveArcLengthCm(
        front.outlineCm,
        front.curvedSpans ?? [],
        ...front.seamEdges.centerFront,
      );
      const stand = draftButtonStand(centerFrontLenCm, t);
      drafted.push(stand);
      if (stand.seamEdges) {
        seamPairs.push({
          key: "button-stand-center-front",
          labelKey: "buttonStandCenterFront",
          a: [edgeRef(front.id, front.seamEdges.centerFront)],
          b: [edgeRef(stand.id, stand.seamEdges.centerFront)],
          easeCm: 0,
          fixable: false,
        });
      }
    }
  }
  if (spec.type === "skirt" || spec.type === "dress") {
    const skirtPiece = draftSkirt(
      measurements,
      spec.style,
      t,
      spec.type === "dress",
    );
    drafted.push(skirtPiece);
    // #234: the skirt panel's own length -- the same formula draftSkirt
    // itself resolves internally (style.skirtLengthCm, falling back to the
    // chart's own skirtLength) but doesn't expose on the piece. A dress adds
    // this on top of its bodice-to-waist length (set above); a standalone
    // skirt has no bodice, so this IS the whole garment length.
    const skirtLenCm = spec.style.skirtLengthCm ?? measurements.skirtLength;
    garmentLengthCm =
      spec.type === "dress" ? (garmentLengthCm ?? 0) + skirtLenCm : skirtLenCm;
    // #134: the dress bodice's hem/waist-join edge vs the skirt panel's own
    // waist edge -- one declaration per body panel (front, back). #134 found
    // this pair GENUINELY diverged for a circle/gore/half-circle skirt: the
    // bodice hem was hip-derived (skirtWaistHalfCm(hip)) while the skirt's
    // own waist arc was already drafted from the actual waist measurement --
    // two different measurements of the same body. #177 (owner decision)
    // closed that gap by moving the bodice hem itself off the hip: both
    // sides now read dressWaistHalfCm (lib/draft/skirt.ts), which is
    // silhouette-independent (see its own doc), so the VALUE is equal by
    // construction for all five silhouettes.
    //
    // #185 (found while implementing #177, fixed in the same PR): equal
    // VALUES aren't enough on their own -- the TOPOLOGY of what each pair
    // compares also has to match how many physical copies the skirt piece
    // actually is. When `skirtPiece.qty > 1` (straight/a-line, circle/gore),
    // each bodice half sews to its own WHOLE, identical cut copy, so both
    // pairs compare against the same declared `waist` edge, unchanged from
    // before #185 -- this is #79's own original topology and #185 didn't
    // touch it. When `skirtPiece.qty === 1` (half-circle: one undivided
    // panel whose single waist arc already equals the FULL waist), that one
    // arc has to be shared between the two bodice halves, not matched by
    // each individually -- `waistFront`/`waistBack` (lib/draft/skirt.ts) are
    // the two halves of that same arc, split at the panel's own centre
    // vertex, and are what each pair compares against instead.
    const singlePanel = skirtPiece.qty === 1;
    const frontWaistEdge = singlePanel
      ? skirtPiece.seamEdges?.waistFront
      : skirtPiece.seamEdges?.waist;
    const backWaistEdge = singlePanel
      ? skirtPiece.seamEdges?.waistBack
      : skirtPiece.seamEdges?.waist;
    if (spec.type === "dress" && front?.seamEdges && frontWaistEdge) {
      seamPairs.push({
        key: "waist-join-front",
        labelKey: "waistJoinFront",
        a: [edgeRef(front.id, front.seamEdges.hem)],
        b: [edgeRef(skirtPiece.id, frontWaistEdge)],
        easeCm: 0,
        fixable: false,
      });
    }
    if (spec.type === "dress" && back?.seamEdges && backWaistEdge) {
      seamPairs.push({
        key: "waist-join-back",
        labelKey: "waistJoinBack",
        a: [edgeRef(back.id, back.seamEdges.hem)],
        b: [edgeRef(skirtPiece.id, backWaistEdge)],
        easeCm: 0,
        fixable: false,
      });
    }
    // #131: a straight waistband, drafted from the skirt panel's own
    // measured waist edge (summed across every cut panel -- the full closed
    // waist circumference, not one panel's share of it) plus a fixed
    // closure overlap. Standalone skirt archetype only: a dress joins its
    // skirt panel directly to the bodice at the natural waist instead (the
    // waist-join pairs just above, and #177's own tracked gap there) --
    // waistband and waist-join never both apply to the same garment.
    // Defaults ON for a skirt (unlike collar/cuff, which default "none"):
    // a skirt with no waistband is the exact defect this issue exists to
    // fix, so every skirt gets one unless explicitly turned off.
    if (
      spec.type === "skirt" &&
      (spec.style.waistband ?? "straight") !== "none" &&
      skirtPiece.seamEdges
    ) {
      const waistLenCm =
        curveArcLengthCm(
          skirtPiece.outlineCm,
          skirtPiece.curvedSpans ?? [],
          ...skirtPiece.seamEdges.waist,
        ) * skirtPiece.qty;
      const waistband = draftWaistband(waistLenCm, t);
      drafted.push(waistband);
      if (waistband.seamEdges) {
        const waistRefs = Array.from({ length: skirtPiece.qty }, () =>
          edgeRef(skirtPiece.id, skirtPiece.seamEdges!.waist),
        );
        seamPairs.push({
          key: "waistband-waist",
          labelKey: "waistbandWaist",
          a: waistRefs,
          b: [edgeRef(waistband.id, waistband.seamEdges.waist)],
          easeCm: WAISTBAND_OVERLAP_CM,
          fixable: false,
        });
      }
    }
  }
  // #128: the trousers block -- front + back panels (straight-leg only,
  // scope decision), each declaring its own rise/inseam/outseam/waist edges
  // (lib/draft/trousers.ts). Every seam gets a real graph entry, the same
  // way #129/#130/#131's sub-pieces do:
  //  - rise: front's own centre-front edge sewn to its own mirrored copy
  //    (the fly seam), and back's own centre-back edge likewise -- the same
  //    self-pair shape sleeve.ts's own two underarm edges already use.
  //  - inseam / outseam: front vs back, equal by construction (both panels
  //    share the same rise depth and total length -- see trousers.ts's
  //    top-of-file note).
  //  - waistband-waist: #131's own draftWaistband, REUSED verbatim (not
  //    forked) -- summed across both panels' own measured waist edges (each
  //    times its own qty), the same "closed circumference, not one panel's
  //    share of it" rule the skirt's own waistband already follows.
  if (spec.type === "trousers") {
    // #234: the same waist-to-hem formula draftTrousers resolves internally.
    garmentLengthCm =
      spec.style.trouserLengthCm ?? TROUSER_DEFAULT_LENGTH_CM[gender];
    const { front: tf, back: tb } = draftTrousers(
      measurements,
      spec.style,
      gender,
      t,
    );
    drafted.push(tf, tb);
    if (tf.seamEdges) {
      seamPairs.push({
        key: "trouser-front-rise",
        labelKey: "trouserFrontRise",
        a: [edgeRef(tf.id, tf.seamEdges.rise)],
        b: [edgeRef(tf.id, tf.seamEdges.rise)],
        easeCm: 0,
        fixable: false,
      });
    }
    if (tb.seamEdges) {
      seamPairs.push({
        key: "trouser-back-rise",
        labelKey: "trouserBackRise",
        a: [edgeRef(tb.id, tb.seamEdges.rise)],
        b: [edgeRef(tb.id, tb.seamEdges.rise)],
        easeCm: 0,
        fixable: false,
      });
    }
    if (tf.seamEdges && tb.seamEdges) {
      seamPairs.push({
        key: "trouser-inseam",
        labelKey: "trouserInseam",
        a: [edgeRef(tf.id, tf.seamEdges.inseam)],
        b: [edgeRef(tb.id, tb.seamEdges.inseam)],
        easeCm: 0,
        fixable: false,
      });
      seamPairs.push({
        key: "trouser-outseam",
        labelKey: "trouserOutseam",
        a: [edgeRef(tf.id, tf.seamEdges.outseam)],
        b: [edgeRef(tb.id, tb.seamEdges.outseam)],
        easeCm: 0,
        fixable: false,
      });
    }
    // #131: every trouser gets a waistband unless explicitly turned off --
    // same default-ON rationale as the skirt's own, generalised.
    if (
      (spec.style.waistband ?? "straight") !== "none" &&
      tf.seamEdges &&
      tb.seamEdges
    ) {
      const waistLenCm =
        curveArcLengthCm(
          tf.outlineCm,
          tf.curvedSpans ?? [],
          ...tf.seamEdges.waist,
        ) *
          tf.qty +
        curveArcLengthCm(
          tb.outlineCm,
          tb.curvedSpans ?? [],
          ...tb.seamEdges.waist,
        ) *
          tb.qty;
      const waistband = draftWaistband(waistLenCm, t);
      drafted.push(waistband);
      if (waistband.seamEdges) {
        const waistRefs = [
          ...Array.from({ length: tf.qty }, () =>
            edgeRef(tf.id, tf.seamEdges!.waist),
          ),
          ...Array.from({ length: tb.qty }, () =>
            edgeRef(tb.id, tb.seamEdges!.waist),
          ),
        ];
        seamPairs.push({
          key: "trouser-waistband-waist",
          labelKey: "waistbandWaistTrousers",
          a: waistRefs,
          b: [edgeRef(waistband.id, waistband.seamEdges.waist)],
          easeCm: WAISTBAND_OVERLAP_CM,
          fixable: false,
        });
      }
    }
  }

  return {
    drafted,
    measurements,
    armholeLenCm,
    sleeveArmholeCm,
    garmentLengthCm,
    seamPairs,
  };
}

// #267: draftPiecesCm/measureSeams/measureSeamGraph/draftGradedOverlays/
// draftGarment moved to lib/draft/engine/facade.ts -- each is now a generic
// wrapper taking an EngineId as its required first parameter and dispatching
// through lib/draft/engine/registry.ts's getEngine, not a moldai-specific
// function living here. `GradedOverlay` stays: it's a pure data shape (no
// drafter logic), reused by the facade's own draftGradedOverlays and by
// components/editor/PatternCanvas.tsx, which keeps importing it from this
// module unchanged.
export interface GradedOverlay {
  pieceId: string;
  size: string;
  outline: PieceOutline;
}
