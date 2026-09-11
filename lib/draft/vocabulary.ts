import type {
  Neckline,
  GarmentType,
  SleeveLength,
  SkirtSilhouette,
  CollarType,
  CuffType,
  WaistbandType,
  FrontClosureType,
  PleatType,
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

// #269: "hoodie", "coat" and "shirt" are drafted by the freesewing engine
// ONLY -- no moldai drafter exists for any of them (a raglan sleeve, a
// 3-piece hood, ribbed cuffs/waistband for hoodie; a placket-front lined
// jacket with a yoke, welt pocket and full lining for coat; a button-front
// shirt with a two-piece placket, a yoke and a two-piece collar for shirt
// -- constructions moldai's own body.ts/sleeve.ts have no equivalent for,
// and building any of them from scratch was explicitly out of scope for
// this registration). MOLDAI_CAPABILITY.types (capability.ts) deliberately
// does NOT include any of these -- an honest, permanent gap, not a "later
// phase" -- so they stay in this app-wide vocabulary (validateSpec must
// still accept them as legitimate requests) while never being offered to
// moldai's own draftAll (which throws if ever asked to draft any of them).
export const TYPES: GarmentType[] = [
  "blouse",
  "dress",
  "skirt",
  "tshirt",
  "trousers",
  "hoodie",
  "coat",
  "shirt",
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
// #244: same footing again -- rendered into the prompt/schema from this one
// export, never a hardcoded duplicate. See lib/types.ts's own PleatType doc
// for why there is no third, asymmetric "knife" value.
export const PLEATS: PleatType[] = ["none", "box", "inverted-box"];

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
  // #259: a waist-RISE STYLE offset, never a body measurement -- see
  // lib/measurements.ts's own `rise` (waist-to-crotch, EXTENDED_MEASUREMENT_
  // KEYS) for the body dimension this is deliberately kept separate from.
  // Signed, centered on 0 = "drafted at the resolved body rise/natural
  // waist, unchanged": positive raises the waistline above that ("cintura
  // alta"/high-waisted -- more fabric between crotch and waistband for
  // trousers, a taller panel for a skirt), negative lowers it ("gancho
  // baixo"/low-rise). Applied as an OFFSET on top of whatever the body
  // measurement/natural waist already resolves to (lib/draft/trousers.ts,
  // lib/draft/skirt.ts) -- never a replacement for either.
  riseCm: { min: -10, max: 15 },
} as const;
