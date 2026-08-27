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
