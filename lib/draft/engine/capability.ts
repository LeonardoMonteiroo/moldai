import type {
  GarmentSpec,
  GarmentStyle,
  GarmentType,
  Neckline,
  SleeveLength,
  SkirtSilhouette,
  CollarType,
  CuffType,
  WaistbandType,
  FrontClosureType,
  FitClass,
  StretchClass,
} from "@/lib/types";
import type { Measurements } from "@/lib/measurements";
import { EXTENDED_MEASUREMENT_KEYS } from "@/lib/measurements";
import {
  TYPES,
  NECKLINES,
  SLEEVES,
  SKIRTS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  FRONT_CLOSURES,
  FIT_CLASSES,
  STRETCH_CLASSES,
  STYLE_LIMITS,
} from "@/lib/draft/vocabulary";
import { reportError } from "@/lib/observability/report";

// #267: the declared capability of one drafting engine -- what
// docs/decisions/drafting.md's #266->#267 entry calls "a stated contract for what our
// own drafters actually support", so a gap is REPORTABLE (checkEngineSupport
// below) instead of silently defaulted. A leaf module: imports only types
// and the leaf lib/draft/vocabulary/lib/measurements catalogs, nothing from
// garment.ts or any drafter -- pinned by capability.test.ts's own source
// scan, the lib/draft/formFields.ts/vocabulary.ts precedent. This is what
// lets a client component (NewPatternForm, disabling an unsupported garment
// type in its Select) read an engine's capability without pulling the whole
// drafting engine into its bundle.

export const ENGINE_IDS = ["moldai", "freesewing"] as const;
export type EngineId = (typeof ENGINE_IDS)[number];
export const DEFAULT_ENGINE_ID: EngineId = "moldai";

// The isPurchaseType (lib/billing/wallet.ts) trust boundary, applied to a
// value read off a persisted blob or a wire body: an unrecognised engine id
// must never reach a drafter, the same reason an unrecognised PurchaseType
// must never reach applyPurchase.
export function isEngineId(value: unknown): value is EngineId {
  return (ENGINE_IDS as readonly unknown[]).includes(value);
}

/**
 * Narrows `Pattern.engine`/`SloperData.engine`/`PatternVersion.engine` --
 * each a plain wire `string | undefined`, never `EngineId` itself, since a
 * value read back off a persisted blob is untrusted the same way any other
 * stored field is -- to the engine that value actually names. `undefined`
 * (the additive-blob, no-migration case) resolves to `DEFAULT_ENGINE_ID`
 * silently, since that IS the documented meaning of absent. A recognised
 * but no-longer-registered id would be a real data problem (an engine this
 * app once supported and has since retired) and is reported via
 * reportError before falling back -- the db.sizeChart.parse precedent
 * (lib/db/sizeChart.ts) for "an unexpected persisted value degrades
 * gracefully but is not silently swallowed."
 */
export function engineFor(value: string | undefined): EngineId {
  if (value === undefined) return DEFAULT_ENGINE_ID;
  if (isEngineId(value)) return value;
  reportError("draft.engine.unknown", new Error(`unknown engine id: ${value}`));
  return DEFAULT_ENGINE_ID;
}

export interface Range {
  min: number;
  max: number;
}

/**
 * A style field this engine reads for at least one garment type it
 * declares support for. Deliberately excludes `sleeveRefit`: it is
 * internal-only (validateSpec discards it; only "Corrigir manga" sets it),
 * never a capability the AI or a user can request, so it has no place in a
 * declared, AI-facing contract.
 */
export type CapabilityStyleField = Exclude<keyof GarmentStyle, "sleeveRefit">;

export interface StyleEnums {
  neckline: readonly Neckline[];
  sleeve: readonly SleeveLength[];
  skirt: readonly SkirtSilhouette[];
  collar: readonly CollarType[];
  cuff: readonly CuffType[];
  waistband: readonly WaistbandType[];
  frontClosure: readonly FrontClosureType[];
  fit: readonly FitClass[];
  stretch: readonly StretchClass[];
}

export interface EngineCapability {
  id: EngineId;
  measurements: {
    required: readonly (keyof Measurements)[];
    optional: readonly (keyof Measurements)[];
  };
  types: readonly GarmentType[];
  // #269: keyed by GarmentType, not one engine-wide list -- #267's original
  // design didn't need this (moldai's own enum values happen to be
  // identical for every type that supports a given field), but a second
  // engine can genuinely support DIFFERENT values per type for the SAME
  // field: FreeSewing's blouse design (Diana) can only lengthen its sleeve
  // down to 60% of full arm length (no true short/cap sleeve), while its
  // tshirt design (Teagan) drafts a real short sleeve -- one shared
  // `sleeve` enum could not honestly say "long" for blouse and "short,
  // long" for tshirt at once. A type not in `types` still needs an entry
  // (TypeScript's Record requires every GarmentType key) -- give it all-
  // empty arrays, the same convention `styleFieldsByType` below already
  // uses for an unsupported type.
  styleEnumsByType: Record<GarmentType, StyleEnums>;
  styleLimits: Record<
    | "necklineDepthCm"
    | "skirtLengthCm"
    | "seamAllowanceCm"
    | "armholeDeepenCm"
    | "trouserLengthCm",
    Range
  >;
  // Which style fields each supported GarmentType's drafters actually read.
  // Ground truth (derived from reading every drafter, not from what looks
  // plausible on a form): e.g. tshirt is the one knit archetype and reads
  // `stretch`, never `fit` -- wearingEaseCm (lib/draft/ease.ts) branches on
  // `knit` to read one or the other. This DELIBERATELY disagrees with
  // lib/draft/formFields.ts's own FORM_STYLE_FIELDS-derived map in three
  // known, pre-existing places (tshirt/skirt/trousers each offer a "fit"
  // form control today that no drafter reads for that type) -- that is an
  // existing, separate defect this issue's audit surfaced but does not fix;
  // capability.test.ts documents the three cases rather than silently
  // "fixing" NewPatternForm's rendered fields as a side effect.
  styleFieldsByType: Record<GarmentType, readonly CapabilityStyleField[]>;
}

// Ground truth per drafter, verified by reading body.ts/sleeve.ts/skirt.ts/
// trousers.ts/subpieces.ts directly rather than inferred:
// - seamAllowanceCm is read by every archetype's own drafter (body.ts,
//   skirt.ts, trousers.ts) for its detail row; the geometry offset itself
//   happens at export time (lib/export/offset.ts), universally.
// - blouse/dress/tshirt (the three "isBody" archetypes) share neckline/
//   necklineDepthCm/sleeve/armholeDeepenCm/collar/cuff; frontClosure is
//   BLOUSE ONLY (body.ts gates it off dress's waist-join hem and tshirt's
//   knit branch); darts and fit are gated off tshirt (`!opts.knit`);
//   tshirt reads `stretch` instead of `fit` (ease.ts's wearingEaseCm).
// - dress additionally reads skirt/skirtLengthCm (its bodice-to-waist
//   panel plus an attached skirt panel, draftSkirt called the same way a
//   standalone skirt is).
// - skirt/trousers share waistband; skirt reads skirt/skirtLengthCm,
//   trousers reads trouserLengthCm. Neither reads fit/stretch: skirt.ts's
//   own SKIRT_WEARING_EASE_CM is a fixed constant, never style-driven.
// #269: NOT simply CORE_MEASUREMENT_KEYS. That list grew to include 14 keys
// (waistToArmpit, seat, inseam, ...) no moldai drafter reads at all -- only
// FreeSewing designs need them (lib/draft/engine/freesewing/). Declaring
// them here would violate the standing "never tell the model a range the
// validator does not enforce" rule (docs/architecture/generation-flow.md):
// lib/ai/prompt.ts's measurementLines renders every key in this list into
// the prompt/tool schema verbatim, so an over-declared list would invite
// the AI to set a measurementOverride moldai's own drafters silently
// ignore. Ground truth, the same way styleFieldsByType below is: the
// original nine CORE_MEASUREMENT_KEYS, plus the four #269 promoted that
// body.ts/sleeve.ts genuinely read (bicep, bustPointHeight, neckGirth,
// bustSpan) -- verified by grepping body.ts/sleeve.ts directly, not
// assumed from the shared list. A chart's base row still needs every
// CORE_MEASUREMENT_KEYS field present (assertResolvedMeasurements is
// engine-agnostic), this constant only controls what the AI is TOLD is
// relevant to ask about for a moldai-drafted garment.
const MOLDAI_REQUIRED_MEASUREMENTS: readonly (keyof Measurements)[] = [
  "bust",
  "waist",
  "hip",
  "hipHeight",
  "backLength",
  "shoulder",
  "skirtLength",
  "shortSleeveLength",
  "longSleeveLength",
  "bicep",
  "bustPointHeight",
  "neckGirth",
  "bustSpan",
];

// moldai's own enum values are identical across every type that supports a
// given field (unlike freesewing's, see StyleEnums' own doc comment above),
// so one constant reused for every GarmentType key is honest, not a
// shortcut -- capability.test.ts's own subset check still runs per type.
const MOLDAI_STYLE_ENUMS: StyleEnums = {
  neckline: NECKLINES,
  sleeve: SLEEVES,
  skirt: SKIRTS,
  collar: COLLARS,
  cuff: CUFFS,
  waistband: WAISTBANDS,
  frontClosure: FRONT_CLOSURES,
  fit: FIT_CLASSES,
  stretch: STRETCH_CLASSES,
};

export const MOLDAI_CAPABILITY: EngineCapability = {
  id: "moldai",
  measurements: {
    required: MOLDAI_REQUIRED_MEASUREMENTS,
    optional: EXTENDED_MEASUREMENT_KEYS,
  },
  types: TYPES,
  styleEnumsByType: {
    blouse: MOLDAI_STYLE_ENUMS,
    dress: MOLDAI_STYLE_ENUMS,
    tshirt: MOLDAI_STYLE_ENUMS,
    skirt: MOLDAI_STYLE_ENUMS,
    trousers: MOLDAI_STYLE_ENUMS,
  },
  styleLimits: STYLE_LIMITS,
  styleFieldsByType: {
    blouse: [
      "neckline",
      "necklineDepthCm",
      "sleeve",
      "armholeDeepenCm",
      "darts",
      "fit",
      "seamAllowanceCm",
      "collar",
      "cuff",
      "frontClosure",
    ],
    dress: [
      "neckline",
      "necklineDepthCm",
      "sleeve",
      "armholeDeepenCm",
      "darts",
      "fit",
      "seamAllowanceCm",
      "collar",
      "cuff",
      "skirt",
      "skirtLengthCm",
    ],
    tshirt: [
      "neckline",
      "necklineDepthCm",
      "sleeve",
      "armholeDeepenCm",
      "stretch",
      "seamAllowanceCm",
      "collar",
      "cuff",
    ],
    skirt: ["skirt", "skirtLengthCm", "waistband", "seamAllowanceCm"],
    trousers: ["trouserLengthCm", "waistband", "seamAllowanceCm"],
  },
};

// #269: the freesewing engine's declared capability. `tshirt`
// (lib/draft/engine/freesewing/designs/tshirt.ts, backed by
// @freesewing/teagan), `blouse` (designs/blouse.ts, backed by
// @freesewing/diana) and `skirt` (designs/skirt.ts, backed by
// @freesewing/sandy) are wired today -- dress/trousers are a later phase,
// tracked in docs/decisions/drafting.md, not silently claimed here.
// Ground truth from reading each design wrapper's own conversion function
// directly, the same "grep the drafter, don't assume" discipline
// MOLDAI_CAPABILITY above follows:
// - required: the UNION of every Measurements field some wired design
//   reads unconditionally. tshirt/blouse need the identical 13
//   (@freesewing/collection's own requiredMeasurements, verified before
//   either was picked); skirt needs a disjoint, much smaller set (waist,
//   hip, hipHeight, waistToFloor, skirtLength) -- the union is simply both
//   lists concatenated, since a chart's base row already carries every
//   CORE key regardless of which type it'll be drafted as.
//   shortSleeveLength/longSleeveLength are both listed even though only one
//   is read per draft (whichever style.sleeve picks) -- both are already-
//   required CORE fields regardless.
// - optional: highBust/shoulderSlope -- each design's own `?? bust`/`?? 4.0`
//   fallback, mirroring EXTENDED_MEASUREMENT_KEYS' shape for moldai.
// - styleFieldsByType lists ONLY "sleeve" for tshirt/blouse, and "skirt"
//   ("skirt" silhouette) + "skirtLengthCm" for skirt: neither tshirt/blouse
//   wrapper reads neckline/collar/cuff/darts/fit yet (each design drafts
//   its own fixed neckline regardless of spec.style.neckline, and neither
//   has a collar/cuff subpiece wired -- Diana's own construction has none
//   at all; Teagan's has none per docs/reference/freesewing-spike's own
//   finding). skirt.ts doesn't actually BRANCH on style.skirt (Sandy is
//   always a circle skirt) -- but it's declared supported anyway
//   (styleEnumsByType.skirt.skirt below is ["circle"] only), because the
//   alternative -- treating an explicit "circle" request as an
//   unsupported FIELD -- would be a false gap for the one value this
//   wrapper genuinely does honor; a request for a different silhouette
//   still gets a real styleValue gap. Declaring more here than a wrapper
//   actually reads would violate the same "never tell the model a range
//   the validator does not enforce" rule MOLDAI_CAPABILITY's own comment
//   cites.
// - styleEnumsByType.sleeve genuinely DIFFERS by type: Teagan drafts a real
//   short sleeve; Diana's own sleeveLengthBonus option cannot go below 60%
//   of full arm length (@freesewing/library's sleeve.mjs), so blouse.ts
//   declares "long" only -- a "short" blouse request via freesewing is a
//   real, reportable gap, not a silent near-long approximation.
//   styleEnumsByType.skirt.skirt is ["circle"] only -- Sandy cannot draft
//   straight/a-line/gore/half-circle.
const FREESEWING_REQUIRED_MEASUREMENTS: readonly (keyof Measurements)[] = [
  "bust",
  "waist",
  "hip",
  "hipHeight",
  "backLength",
  "shoulder",
  "bicep",
  "bustPointHeight",
  "neckGirth",
  "waistToArmpit",
  "shoulderToWrist",
  "wrist",
  "shortSleeveLength",
  "longSleeveLength",
  "waistToFloor",
  "skirtLength",
];

const FREESEWING_EMPTY_STYLE_ENUMS: StyleEnums = {
  neckline: [],
  sleeve: [],
  skirt: [],
  collar: [],
  cuff: [],
  waistband: [],
  frontClosure: [],
  fit: [],
  stretch: [],
};

export const FREESEWING_CAPABILITY: EngineCapability = {
  id: "freesewing",
  measurements: {
    required: FREESEWING_REQUIRED_MEASUREMENTS,
    optional: ["highBust", "shoulderSlope"],
  },
  types: ["tshirt", "blouse", "skirt"],
  styleEnumsByType: {
    blouse: { ...FREESEWING_EMPTY_STYLE_ENUMS, sleeve: ["long"] },
    dress: FREESEWING_EMPTY_STYLE_ENUMS,
    tshirt: { ...FREESEWING_EMPTY_STYLE_ENUMS, sleeve: ["short", "long"] },
    skirt: { ...FREESEWING_EMPTY_STYLE_ENUMS, skirt: ["circle"] },
    trousers: FREESEWING_EMPTY_STYLE_ENUMS,
  },
  styleLimits: STYLE_LIMITS,
  styleFieldsByType: {
    blouse: ["sleeve"],
    dress: [],
    tshirt: ["sleeve"],
    skirt: ["skirt", "skirtLengthCm"],
    trousers: [],
  },
};

export type EngineGap =
  | { kind: "type"; type: GarmentType }
  | { kind: "measurements"; missing: (keyof Measurements)[] }
  | { kind: "styleField"; field: CapabilityStyleField }
  | { kind: "styleValue"; field: CapabilityStyleField; value: string }
  | { kind: "styleLimit"; field: CapabilityStyleField; range: Range };

const STYLE_ENUM_FIELDS = [
  "neckline",
  "sleeve",
  "skirt",
  "collar",
  "cuff",
  "waistband",
  "frontClosure",
  "fit",
  "stretch",
] as const satisfies readonly CapabilityStyleField[];

const STYLE_LIMIT_FIELDS = [
  "necklineDepthCm",
  "skirtLengthCm",
  "seamAllowanceCm",
  "armholeDeepenCm",
  "trouserLengthCm",
] as const satisfies readonly CapabilityStyleField[];

/**
 * Narrows an already-VALID spec (validateSpec has already run) to what
 * `capability` can honestly honor. Pure, never mutates `spec`. This is the
 * "checkEngineSupport may only report" half of #267's two-verbs rule --
 * `validateSpec` narrows untrusted wire data to the APP's vocabulary and
 * may substitute a default for garbage; this narrows the app's vocabulary
 * to the ENGINE's and may only report, because a legitimate stated intent
 * (the caller already chose "shirt collar", not "gnorf") must never be
 * silently swapped for something else.
 *
 * `[]` means fully supported. One gap per distinct problem: an unsupported
 * `type` short-circuits (there's nothing else to check), a missing
 * required-measurement set is one grouped gap, and each style field the
 * spec actually sets is checked in order (field support, then its enum
 * value or numeric range) -- an unsupported field short-circuits its own
 * value/range check, since checking a value for a field the engine doesn't
 * read at all would be reporting a problem that doesn't exist.
 */
export function checkEngineSupport(
  capability: EngineCapability,
  spec: GarmentSpec,
  baseRow: Measurements,
): EngineGap[] {
  if (!capability.types.includes(spec.type)) {
    return [{ kind: "type", type: spec.type }];
  }

  const gaps: EngineGap[] = [];

  const missing = capability.measurements.required.filter((key) => {
    const v = baseRow[key];
    return typeof v !== "number" || !Number.isFinite(v);
  });
  if (missing.length > 0) {
    gaps.push({ kind: "measurements", missing });
  }

  const supportedFields = new Set<CapabilityStyleField>(
    capability.styleFieldsByType[spec.type],
  );
  for (const key of Object.keys(spec.style) as (keyof GarmentStyle)[]) {
    if (key === "sleeveRefit") continue; // internal, never AI/user-set
    const field = key as CapabilityStyleField;
    const value = spec.style[key];
    if (value === undefined) continue;

    if (!supportedFields.has(field)) {
      gaps.push({ kind: "styleField", field });
      continue;
    }
    if ((STYLE_ENUM_FIELDS as readonly string[]).includes(field)) {
      const allowed = capability.styleEnumsByType[spec.type][
        field as keyof StyleEnums
      ] as readonly string[];
      if (!allowed.includes(value as string)) {
        gaps.push({ kind: "styleValue", field, value: String(value) });
      }
    } else if ((STYLE_LIMIT_FIELDS as readonly string[]).includes(field)) {
      const range =
        capability.styleLimits[field as keyof EngineCapability["styleLimits"]];
      if (
        typeof value === "number" &&
        (value < range.min || value > range.max)
      ) {
        gaps.push({ kind: "styleLimit", field, range });
      }
    }
  }

  return gaps;
}
