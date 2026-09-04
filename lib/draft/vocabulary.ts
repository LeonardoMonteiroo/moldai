import type {
  Neckline,
  GarmentType,
  SleeveLength,
  SkirtSilhouette,
  CollarType,
  CuffType,
  WaistbandType,
  FrontClosureType,
  Gender,
} from "@/lib/types";
import {
  FIT_CLASSES,
  STRETCH_CLASSES,
  FIT_EASE_CM,
  STRETCH_EASE_PCT,
  wearingEaseCm,
} from "./ease";

// The AI-facing garment vocabulary: every enum catalog and numeric clamp
// bound the drafters accept today. A LEAF module -- it imports only types
// and the leaf ./ease table, nothing from garment.ts or any drafter
// (body.ts, sleeve.ts, skirt.ts, trousers.ts, subpieces.ts) -- the same
// "leaf, imports nothing from garment.ts or a drafter" shape
// lib/draft/formFields.ts already established for "which style fields does
// a garment type have", so a client component (e.g. NewPatternForm,
// disabling an unsupported garment type in its Select) or a server-only
// leaf like lib/draft/engine/capability.ts can read these without pulling
// the whole drafting engine into its bundle. Pinned by
// vocabulary.test.ts's own source scan.
//
// #267: extracted out of garment.ts so the engine capability declaration
// (lib/draft/engine/capability.ts) has a leaf to build MOLDAI_CAPABILITY
// from -- garment.ts re-exports every one of these verbatim, so no existing
// importer (lib/ai's prompt/schema, validateSpec, TechSheetTab, the
// dashboard/sloper components) needed its import path changed by this move.

export const TYPES: GarmentType[] = [
  "blouse",
  "dress",
  "skirt",
  "tshirt",
  "trousers",
];
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
// #129/#130/#131/#221/#222: one exported source per sub-piece enum, the same
// rule every other AI-facing catalog here follows -- schema.ts/prompt.ts
// render from these, never a hardcoded duplicate list.
export const COLLARS: CollarType[] = ["none", "convertible", "band", "shirt"];
export const CUFFS: CuffType[] = ["none", "straight"];
export const WAISTBANDS: WaistbandType[] = ["none", "straight"];
// #223: same footing as the three above -- the AI-facing catalog, rendered
// into the prompt/schema from this one export, never a hardcoded duplicate.
export const FRONT_CLOSURES: FrontClosureType[] = ["none", "buttonStand"];

// #125: FIT_CLASSES/STRETCH_CLASSES/FIT_EASE_CM/STRETCH_EASE_PCT/wearingEaseCm
// live in ./ease, a leaf module with no dependency on this file or on
// body.ts -- body.ts needs them too (the actual drafting) and imports
// ./ease directly. Re-exported here so every AI-facing-vocabulary consumer
// (garment.ts, lib/draft/engine/capability.ts) reads one place, matching
// how STYLE_LIMITS below is quoted verbatim by the AI layer.
export {
  FIT_CLASSES,
  STRETCH_CLASSES,
  FIT_EASE_CM,
  STRETCH_EASE_PCT,
  wearingEaseCm,
};

// Clamp bounds validateSpec applies to numeric style fields. Exported so the
// AI layer (lib/ai) quotes the same numbers in its prompt and tool schema —
// they must never drift from what actually gets enforced in garment.ts.
export const STYLE_LIMITS = {
  necklineDepthCm: { min: 0, max: 15 },
  skirtLengthCm: { min: 25, max: 120 },
  seamAllowanceCm: { min: 0, max: 4 },
  armholeDeepenCm: { min: 0, max: 6 },
  // #128: total waist-to-hem trouser length -- shorts/capri at the low end
  // up to a full-length ankle trouser at the high end.
  trouserLengthCm: { min: 60, max: 115 },
} as const;
