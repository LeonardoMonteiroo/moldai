import {
  MEASUREMENT_RANGES,
  Measurements,
  resolveMeasurements,
} from "@/lib/measurements";
import {
  ClarifyQuestion,
  Neckline,
  GarmentSpec,
  GarmentStyle,
  GarmentType,
  SleeveLength,
  SkirtSilhouette,
  CollarType,
  CuffType,
  WaistbandType,
  Gender,
  Piece,
  PieceOutline,
} from "@/lib/types";
import {
  autoLayout,
  curveArcLengthCm,
  DraftedPiece,
  PX,
  outlinePath,
  polyPath,
  translateOutline,
} from "./core";
import { BlockOpts, draftBody } from "./body";
import { draftSleeve, CAP_EASE_CM, WRIST_EASE_CM } from "./sleeve";
import { draftSkirt, skirtWaistHalfCm } from "./skirt";
import {
  draftCollar,
  draftCuff,
  draftPlacket,
  draftWaistband,
  WAISTBAND_OVERLAP_CM,
} from "./subpieces";
import { FIT_CLASSES, STRETCH_CLASSES, wearingEaseCm } from "./ease";
import {
  SeamEdgeRef,
  SeamMeasurement,
  SeamPairDecl,
  SEAM_TOLERANCE_CM,
  walkSeamPairs,
} from "./seams";
import type { Translate } from "@/lib/i18n/translate";

export type { SeamMeasurement } from "./seams";

export const TYPES: GarmentType[] = ["blouse", "dress", "skirt", "tshirt"];
export const GENDERS: Gender[] = ["female", "male"];
export const NECKLINES: Neckline[] = ["straight", "V", "round"];
export const SLEEVES: SleeveLength[] = ["none", "short", "long"];
export const SKIRTS: SkirtSilhouette[] = [
  "straight",
  "a-line",
  "gore",
  "half-circle",
  "circle",
];
// #129/#130/#131: one exported source per sub-piece enum, the same rule
// every other AI-facing catalog here follows -- schema.ts/prompt.ts render
// from these, never a hardcoded duplicate list.
export const COLLARS: CollarType[] = ["none", "convertible"];
export const CUFFS: CuffType[] = ["none", "straight"];
export const WAISTBANDS: WaistbandType[] = ["none", "straight"];
// #125: FIT_CLASSES/STRETCH_CLASSES/FIT_EASE_CM/STRETCH_EASE_PCT/wearingEaseCm
// live in ./ease, a leaf module with no dependency on this file or on
// body.ts — body.ts needs them too (the actual drafting), and it's a
// drafter this file already imports, so defining them here would cycle.
// Re-exported so every existing importer (lib/ai's prompt/schema, this
// file's own validateSpec, TechSheetTab) keeps reading one place, matching
// how STYLE_LIMITS below is quoted verbatim by the AI layer.
export {
  FIT_CLASSES,
  STRETCH_CLASSES,
  FIT_EASE_CM,
  STRETCH_EASE_PCT,
  wearingEaseCm,
} from "./ease";

// Clamp bounds validateSpec applies to numeric style fields. Exported so the
// AI layer (lib/ai) quotes the same numbers in its prompt and tool schema —
// they must never drift from what actually gets enforced here.
export const STYLE_LIMITS = {
  necklineDepthCm: { min: 0, max: 15 },
  skirtLengthCm: { min: 25, max: 120 },
  seamAllowanceCm: { min: 0, max: 4 },
  armholeDeepenCm: { min: 0, max: 6 },
} as const;

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

function draftAll(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
): {
  drafted: DraftedPiece[];
  measurements: Measurements;
  armholeLenCm?: number;
  sleeveArmholeCm?: number;
  seamGraph: SeamMeasurement[];
} {
  const gender: Gender = spec.gender ?? "female";
  const measurements: Measurements = resolveMeasurements(
    baseMeasurements,
    spec.measurementOverrides,
  );
  const drafted: DraftedPiece[] = [];
  let armholeLenCm: number | undefined;
  let sleeveArmholeCm: number | undefined;
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
  if (isBody) {
    const knit = spec.type === "tshirt";
    const lengthCm =
      spec.type === "dress"
        ? measurements.backLength
        : measurements.backLength + measurements.hipHeight + 5;
    // T-shirt base model: round neckline, no darts, short sleeve by default.
    const style: GarmentStyle =
      spec.type === "tshirt"
        ? {
            ...spec.style,
            neckline: spec.style.neckline ?? "round",
            darts: false,
            sleeve: spec.style.sleeve ?? "short",
          }
        : spec.style;
    const opts: BlockOpts = {
      gender,
      knit,
      lengthCm,
      wearingEaseCm: wearingEaseCm(style, knit, measurements.bust),
      // #79: a dress's bodice ends at the waist (lengthCm === backLength,
      // above), where it's joined to a separately-drafted skirt panel --
      // the hem must be drafted at that panel's own waist width, not the
      // hip-derived width a standalone blouse hem uses.
      ...(spec.type === "dress"
        ? { dressHemHalfCm: skirtWaistHalfCm(measurements.hip) }
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
    // #129: a convertible collar, drafted from the front+back neckline's
    // own measured arc -- computed directly off the already-drafted panels
    // (never persisted, never a proportion of the bust), the same
    // "measure the geometry that was actually emitted" rule the armhole/cap
    // pair already established.
    if (style.collar === "convertible" && front.seamEdges && back.seamEdges) {
      const necklineArcCm =
        curveArcLengthCm(
          front.outlineCm,
          front.curvedSpans ?? [],
          ...front.seamEdges.necklineLeft,
        ) +
        curveArcLengthCm(
          front.outlineCm,
          front.curvedSpans ?? [],
          ...front.seamEdges.necklineRight,
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
      const collar = draftCollar(necklineArcCm, t);
      drafted.push(collar);
      if (collar.seamEdges) {
        seamPairs.push({
          key: "collar-neckline",
          labelKey: "collarNeckline",
          a: [
            edgeRef(front.id, front.seamEdges.necklineLeft),
            edgeRef(front.id, front.seamEdges.necklineRight),
            edgeRef(back.id, back.seamEdges.necklineLeft),
            edgeRef(back.id, back.seamEdges.necklineRight),
          ],
          b: [edgeRef(collar.id, collar.seamEdges.neckline)],
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
    // #134: the dress bodice's hem/waist-join edge vs the skirt panel's own
    // waist edge -- one declaration per body panel (front, back), since each
    // sews to its own skirt panel copy (qty on the skirt piece), a real,
    // separate seam either way even though front/back are equal by
    // construction (see the shoulder/side note above). For a
    // straight/a-line skirt these are ALSO equal by construction
    // (skirtWaistHalfCm, #79). For a circle/gore/half-circle skirt they are
    // NOT: the bodice hem is hip-derived (skirtWaistHalfCm) while the waist
    // arc there is drafted straight from the actual waist measurement --
    // two different measurements of the same body, genuinely divergent for
    // most real proportions. This is a real, previously-undetected gap (see
    // the PR description), not a hypothetical one; #134 surfaces it rather
    // than papering over it with a fake ease.
    if (spec.type === "dress" && front?.seamEdges && skirtPiece.seamEdges) {
      seamPairs.push({
        key: "waist-join-front",
        labelKey: "waistJoinFront",
        a: [edgeRef(front.id, front.seamEdges.hem)],
        b: [edgeRef(skirtPiece.id, skirtPiece.seamEdges.waist)],
        easeCm: 0,
        fixable: false,
      });
    }
    if (spec.type === "dress" && back?.seamEdges && skirtPiece.seamEdges) {
      seamPairs.push({
        key: "waist-join-back",
        labelKey: "waistJoinBack",
        a: [edgeRef(back.id, back.seamEdges.hem)],
        b: [edgeRef(skirtPiece.id, skirtPiece.seamEdges.waist)],
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

  const seamGraph = walkSeamPairs(drafted, seamPairs);
  return { drafted, measurements, armholeLenCm, sleeveArmholeCm, seamGraph };
}

export function draftPiecesCm(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
): DraftedPiece[] {
  return draftAll(spec, baseMeasurements, t).drafted;
}

// The pair of seam lengths seamCheck compares, without the pieces or the layout.
// Both are undefined for a garment with no armhole (a skirt). The conflict card
// and the canvas markers derive their numbers from here rather than reading them
// off a persisted ConflictInfo: they follow from the spec, so storing them beside
// the armholeDeepenCm that moved them would be the same duplication CLAUDE.md
// already removed twice (Pattern.savedAgo, Wallet.planLabel) — and deriving also
// gives the lengths to conflicts persisted before this existed.
export function measureSeams(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
): { armholeLenCm?: number; sleeveArmholeCm?: number } {
  const { armholeLenCm, sleeveArmholeCm } = draftAll(spec, baseMeasurements, t);
  return { armholeLenCm, sleeveArmholeCm };
}

// #134: the FULL seam graph -- every mated pair this garment declares,
// whether or not it diverges -- derived the same way measureSeams derives
// its own narrower pair (draftAll, without the pieces or the layout). This
// is what CanvasArea hands to ConflictInfoCard/PatternCanvas for the
// multi-entry conflict list, and the shape #138's assembly/sewing-order
// feature consumes directly.
export function measureSeamGraph(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
): SeamMeasurement[] {
  return draftAll(spec, baseMeasurements, t).seamGraph;
}

export interface GradedOverlay {
  pieceId: string;
  size: string;
  outline: PieceOutline;
}

// #59: graduation produces real per-size geometry, recomputed on demand from
// the pattern's own frozen sizeTable rather than persisted onto it -- the
// same derive-don't-store precedent as measureSeams/fitPieceLabel. Each
// applied size is redrafted with draftPiecesCm and aligned onto the base
// piece's own already-placed position (read off its `vertices[0]`, not
// re-run through autoLayout), so the two outlines land in the same canvas
// coordinate space and are visually comparable. Piece order/ids are stable
// across measurements for the same spec (draftPiecesCm's per-piece id and
// count depend only on garment type/style), so pairing by index is safe.
export function draftGradedOverlays(
  spec: GarmentSpec,
  pieces: Piece[],
  baseMeasurements: Measurements,
  sizeTable: Record<string, Measurements>,
  sizes: string[],
  t: Translate,
): GradedOverlay[] {
  if (sizes.length === 0) return [];
  const baseDrafted = draftPiecesCm(spec, baseMeasurements, t);
  const overlays: GradedOverlay[] = [];
  for (const size of sizes) {
    const measurements = sizeTable[size];
    if (!measurements) continue;
    const graded = draftPiecesCm(spec, measurements, t);
    graded.forEach((dp, i) => {
      const base = baseDrafted[i];
      const placed = pieces[i];
      // A piece with no vertices predates the measure tool's snap (#79's
      // legacy-blob case) -- there's no placed position to align onto.
      if (!base || !placed?.vertices?.length) return;
      const [bx, by] = base.outlineCm[0];
      const dxPx = placed.vertices[0].x - PX(bx);
      const dyPx = placed.vertices[0].y - PX(by);
      const rawOutline = dp.curvedSpans?.length
        ? outlinePath(dp.outlineCm, dp.curvedSpans)
        : polyPath(dp.outlineCm);
      overlays.push({
        pieceId: dp.id,
        size,
        outline: translateOutline(rawOutline, dxPx, dyPx),
      });
    });
  }
  return overlays;
}

export function draftGarment(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
) {
  const { drafted, measurements, armholeLenCm, sleeveArmholeCm, seamGraph } =
    draftAll(spec, baseMeasurements, t);
  const { pieces, viewBox } = autoLayout(drafted, 8);
  return {
    pieces,
    viewBox,
    measurements,
    armholeLenCm,
    sleeveArmholeCm,
    seamGraph,
  };
}
