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
import {
  CORE_MEASUREMENT_KEYS,
  EXTENDED_MEASUREMENT_KEYS,
} from "@/lib/measurements";
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

export const ENGINE_IDS = ["moldai"] as const;
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

export interface EngineCapability {
  id: EngineId;
  measurements: {
    required: readonly (keyof Measurements)[];
    optional: readonly (keyof Measurements)[];
  };
  types: readonly GarmentType[];
  styleEnums: {
    neckline: readonly Neckline[];
    sleeve: readonly SleeveLength[];
    skirt: readonly SkirtSilhouette[];
    collar: readonly CollarType[];
    cuff: readonly CuffType[];
    waistband: readonly WaistbandType[];
    frontClosure: readonly FrontClosureType[];
    fit: readonly FitClass[];
    stretch: readonly StretchClass[];
  };
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
export const MOLDAI_CAPABILITY: EngineCapability = {
  id: "moldai",
  measurements: {
    required: CORE_MEASUREMENT_KEYS,
    optional: EXTENDED_MEASUREMENT_KEYS,
  },
  types: TYPES,
  styleEnums: {
    neckline: NECKLINES,
    sleeve: SLEEVES,
    skirt: SKIRTS,
    collar: COLLARS,
    cuff: CUFFS,
    waistband: WAISTBANDS,
    frontClosure: FRONT_CLOSURES,
    fit: FIT_CLASSES,
    stretch: STRETCH_CLASSES,
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
      const allowed = capability.styleEnums[
        field as keyof EngineCapability["styleEnums"]
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
