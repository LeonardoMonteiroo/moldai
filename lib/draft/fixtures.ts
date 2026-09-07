import type { GarmentSpec } from "@/lib/types";
import { STYLE_LIMITS } from "./garment";

// A representative spread of garment/style combinations -- every neckline,
// sleeve length, dart/no-dart, and skirt silhouette family the drafters
// support -- used across multiple test files as "the drafting test matrix"
// (containment invariants in garment.test.ts, the fold-edge invariant, and
// the seam-allowance cut-line invariants in lib/export/model.test.ts). One
// exported source rather than duplicating the array per file, the same rule
// the drafting/AI enums follow.
export const DECORATION_CASES: [string, GarmentSpec][] = [
  [
    "blouse round short",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      // #129: exercises the convertible collar across every DECORATION_CASES
      // consumer (containment, byte-identical-fallback, seam graph, ...).
      style: {
        neckline: "round",
        sleeve: "short",
        darts: true,
        collar: "convertible",
      },
    },
  ],
  [
    // #221: exercises the band (stand/mandarin) collar across every
    // DECORATION_CASES consumer -- containment (the lowered neckline stays
    // inside the panel), the seam graph (collar-neckline pair, its own
    // easeCm), and every export format's straight-band cut-line/nesting
    // suite, alongside "blouse round short"'s pre-existing convertible case.
    "blouse round short band collar",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "round",
        sleeve: "short",
        darts: true,
        collar: "band",
      },
    },
  ],
  [
    // #222: exercises the classic two-piece shirt collar (stand + fall)
    // across every DECORATION_CASES consumer -- containment (both pieces'
    // grainlines stay inside their own outlines, including the stand's own
    // shortened+curved top edge), the seam graph (collar-neckline AND the
    // new collar-stand-fall pair), assembly's exhaustiveness guard, and
    // every export format's cut-line/nesting suite.
    "blouse round short shirt collar",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "round",
        sleeve: "short",
        darts: true,
        collar: "shirt",
      },
    },
  ],
  [
    "blouse deep V long",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "V",
        necklineDepthCm: STYLE_LIMITS.necklineDepthCm.max,
        sleeve: "long",
        darts: true,
        // #130: exercises the cuff + placket across the same matrix.
        cuff: "straight",
      },
    },
  ],
  [
    "blouse straight sleeveless",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { neckline: "straight", sleeve: "none", darts: false },
    },
  ],
  [
    // #223: exercises the button-stand front split (qty:2, no fold, a real
    // centerFront edge) across every DECORATION_CASES consumer --
    // containment, the seam graph, assembly's exhaustiveness guard, and
    // every export format's cut-line/nesting suite.
    "blouse buttonstand",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "round",
        sleeve: "short",
        darts: true,
        frontClosure: "buttonStand",
      },
    },
  ],
  [
    "tshirt male",
    { type: "tshirt", gender: "male", measurementOverrides: {}, style: {} },
  ],
  [
    "dress a-line",
    {
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "round",
        sleeve: "short",
        darts: true,
        skirt: "a-line",
      },
    },
  ],
  [
    // #177: a dress's bodice hem and its circle skirt's own waist edge now
    // derive from the same dressWaistHalfCm -- exercises that shared
    // derivation across containment/seam-graph/cut-line suites, alongside
    // the pre-existing straight/a-line "dress a-line" case above.
    "dress circle",
    {
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "round",
        sleeve: "short",
        darts: true,
        skirt: "circle",
      },
    },
  ],
  [
    "dress gore",
    {
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: { neckline: "round", sleeve: "short", darts: true, skirt: "gore" },
    },
  ],
  [
    "dress half-circle",
    {
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "round",
        sleeve: "short",
        darts: true,
        skirt: "half-circle",
      },
    },
  ],
  [
    "skirt circle",
    {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "circle" },
    },
  ],
  [
    "skirt straight",
    {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "straight" },
    },
  ],
  [
    // #244: exercises the box pleat (widened panel + its own fold/placement
    // internals) across every DECORATION_CASES consumer -- containment (the
    // pleat's fold/placement lines stay inside the panel), the seam graph
    // (the waistband still matches the widened waist edge), and every
    // export format's cut-line/nesting suite.
    "skirt straight box pleat",
    {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "straight", pleats: "box" },
    },
  ],
  [
    // #244: the inverted-box variant, on the a-line (flared) silhouette --
    // exercises the OTHER fold-direction geometry alongside the box case
    // above, and the flare's non-vertical side edges (the straight
    // silhouette's own side edges are vertical, a degenerate case the
    // containment check handles differently -- see garment.test.ts).
    "skirt a-line inverted box pleat",
    {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "a-line", pleats: "inverted-box" },
    },
  ],
  [
    "trousers straight",
    {
      type: "trousers",
      gender: "female",
      measurementOverrides: {},
      style: {},
    },
  ],
  [
    "trousers male cropped",
    {
      type: "trousers",
      gender: "male",
      measurementOverrides: {},
      // #128: exercises the AI/user-settable trouserLengthCm across the same
      // matrix every other style field already gets exercised in.
      style: { trouserLengthCm: STYLE_LIMITS.trouserLengthCm.min },
    },
  ],
];
