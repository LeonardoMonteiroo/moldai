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
  // #351: how many wedge panels ("gomos") a `skirt: "gore"` silhouette is
  // cut into -- a COUNT, not a cm value, and always even (see
  // evenGorePanels below). 4 is the fewest that still reads as a gored
  // skirt rather than circle's own two halves; past 12 each wedge gets too
  // narrow at the waist to sew accurately for a small size.
  gorePanels: { min: 4, max: 12 },
} as const;

// #351: the panel count a `gore` skirt drafts when style.gorePanels is
// unset -- the common "saia de 6 gomos". Every godê saved before #351 has no
// gorePanels at all, so this is also what those patterns redraw as.
export const GORE_PANELS_DEFAULT = 6;

// #351: snaps a requested gore count onto the even numbers inside
// STYLE_LIMITS.gorePanels. It has to be even because a dress splits the
// skirt's panels evenly between the front and back bodice halves
// (garment.ts's waist-join pairs), and an odd count would leave one wedge
// straddling a side seam. Rounds to the NEAREST even number (5 -> 6,
// 7 -> 8), then clamps.
export function evenGorePanels(n: number): number {
  const { min, max } = STYLE_LIMITS.gorePanels;
  return Math.min(max, Math.max(min, Math.round(n / 2) * 2));
}

// #351: every count evenGorePanels keeps unchanged, as the new-pattern
// form's own option strings ("4", "6", ... "12").
export const GORE_PANEL_OPTIONS: readonly string[] = Array.from(
  {
    length: (STYLE_LIMITS.gorePanels.max - STYLE_LIMITS.gorePanels.min) / 2 + 1,
  },
  (_, i) => String(STYLE_LIMITS.gorePanels.min + i * 2),
);

// #260: Design2GarmentCode found the multimodal agent "performed
// significantly better on multiple-choice questions compared to numerical
// estimation questions" and replaced free numeric-estimate fields with
// descriptive multiple-choice tokens projected through a deterministic
// table. Same idea, in reverse, for the five free numeric style scalars
// above: each gets a parallel descriptive-token catalog, belonging here
// (not garment.ts) for the exact reason every other AI-facing catalog in
// this file does -- lib/ai/prompt.ts and lib/ai/schema.ts render from these
// exports (never a hardcoded duplicate list), and lib/draft/specAdjustments.ts
// (a leaf with no dependency on garment.ts) needs to recognize a token field
// too, to tell a deliberate token choice apart from an unrecognized one --
// see its own checkScalarToken. Every value below must fall inside this
// field's own STYLE_LIMITS range -- asserted by garment.test.ts's own sweep
// over these tables.
export const NECKLINE_DEPTH_TOKENS = {
  shallow: 3,
  medium: 7,
  deep: 12,
} as const;

export const SKIRT_LENGTH_TOKENS = {
  mini: 40,
  knee: 60,
  midi: 90,
  maxi: 115,
} as const;

export const SEAM_ALLOWANCE_TOKENS = {
  narrow: 0.6,
  standard: 1,
  wide: 1.5,
} as const;

export const ARMHOLE_DEEPEN_TOKENS = {
  none: 0,
  slight: 2,
  deep: 4.5,
} as const;

// #326: unlike the other four tables above, this one is anchored to a real
// body measurement rather than a free-standing guess -- each figure is a
// fraction of the seeded FEMALE system chart's own base-size (M)
// waistToFloor (104.8cm, lib/measurements.ts), the tighter of the two
// seeded charts (male M is 116.0cm). Anchoring to the tighter chart matters
// because a token is projected to cm BEFORE gender is known here
// (resolveScalarField/validateSpec runs before the route overrides
// spec.gender with the chosen size chart's own gender, garment.ts) -- a
// male-calibrated "full" would land below the floor on a female chart the
// same way the pre-#326 flat 110cm figure did. cropped=0.72, ankle=0.91,
// full=0.97 of that base -- "full" changed from 110 (above the female
// floor at every seeded size) to 102 (updated for #326; a full-length
// trouser genuinely stops short of a male M's own floor at 88%, the same
// looseness TROUSER_DEFAULT_LENGTH_CM's own male default already accepts,
// 104/116.0 = 89.7%). Every figure grades per size/gender exactly like any
// other resolved trouserLengthCm, via gradedLengthCm against the row's own
// waistToFloor (lib/draft/trousers.ts, lib/draft/engine/freesewing/designs/
// trousers.ts) -- these are base-row anchors, not final drafted lengths.
export const TROUSER_LENGTH_TOKENS = {
  cropped: 75,
  ankle: 95,
  full: 102,
} as const;

// One entry per free numeric style scalar, pairing its token field name
// with its projection table -- the SINGLE source both validateSpec
// (garment.ts's resolveScalarField) and describeSpecAdjustments
// (specAdjustments.ts's checkScalarToken) key off of, so a token field can
// never be recognized as valid by one and silently invisible to the other.
// Deliberately not five separate (cmKey, tokenKey, table) argument lists at
// each call site, which would let a copy-paste mistake pair the wrong table
// with the wrong field with nothing to catch it.
export const SCALAR_TOKEN_FIELDS = {
  necklineDepthCm: { tokenKey: "necklineDepth", table: NECKLINE_DEPTH_TOKENS },
  skirtLengthCm: { tokenKey: "skirtLength", table: SKIRT_LENGTH_TOKENS },
  seamAllowanceCm: {
    tokenKey: "seamAllowance",
    table: SEAM_ALLOWANCE_TOKENS,
  },
  armholeDeepenCm: {
    tokenKey: "armholeDeepen",
    table: ARMHOLE_DEEPEN_TOKENS,
  },
  trouserLengthCm: {
    tokenKey: "trouserLength",
    table: TROUSER_LENGTH_TOKENS,
  },
} as const;

// #260 code-review: validateSpec (garment.ts's resolveScalarField) and
// describeSpecAdjustments (specAdjustments.ts's checkScalar/
// checkScalarToken) each independently re-implementing "was this raw value
// actually sent" and "does this token resolve" is exactly what let their
// null-handling drift apart once already (a `null` *Cm value alongside a
// valid token produced a fabricated "clamped" adjustment; a `null` token
// value produced a fabricated "substituted" adjustment) -- both real bugs
// caught only because a second review pass ran the two functions against
// the same input and compared results. These two predicates are now the
// SINGLE definition of both questions, used by every one of those call
// sites, so the two modules cannot silently desync again.

// Some providers (see lib/ai/provider/openaiCompat.ts) fill every optional
// schema property with `null` rather than omitting it -- `null` must be
// treated identically to "the property was never sent" everywhere a raw
// *Cm value or a raw descriptive-token value is read from untrusted AI/user
// input.
export function isValueSent(v: unknown): boolean {
  return v !== undefined && v !== null;
}

// Projects a raw token value through one of the tables above, or
// `undefined` when the value isn't a recognized key of that table --
// including when it wasn't really sent at all (not a string, or `null`/
// `undefined`; see isValueSent). Deliberately does not distinguish
// "wasn't sent" from "was sent but invalid" -- a caller that needs that
// distinction (describeSpecAdjustments's checkScalarToken) checks
// isValueSent on the raw token itself first.
export function resolveScalarToken(
  table: Record<string, number>,
  tokenRaw: unknown,
): number | undefined {
  if (typeof tokenRaw !== "string") return undefined;
  return Object.prototype.hasOwnProperty.call(table, tokenRaw)
    ? table[tokenRaw]
    : undefined;
}
