import type {
  GarmentSpec,
  GarmentStyle,
  GarmentType,
  Gender,
} from "@/lib/types";
import { TYPES, GENDERS, validateSpec } from "@/lib/draft/garment";
import { STYLE_FIELDS_BY_TYPE } from "@/lib/draft/formFields";

// The trust boundary for the `formSpec` a generate request may carry, plus
// the merge rule that makes "the user's explicit choice wins" structural
// rather than hoped-for. Pure and DB-free, so lib/ai's split-by-
// responsibility shape holds (prompt/schema/history/decision/formSpec, with
// index.ts still the only file importing the SDK).
//
// The whole module rests on one rule: a field survives into the form spec
// ONLY when the request already named a value validateSpec recognizes. A
// field validateSpec had to substitute a default for is dropped instead,
// because mergeFormSpec re-applies whatever survives OVER the model's own
// inference -- so a defaulted-away value would become an explicit user
// choice the user never made and cannot see. That is the failure the
// explicit-`type` guard exists for, applied to every other field for the
// same reason rather than only to the one field that surfaced it.

/**
 * `null` unless `raw` is an object whose `type` is an explicit, recognized
 * `GarmentType`; otherwise the validated spec narrowed to what a form can
 * legitimately have decided.
 *
 * Why `type` must be explicit: `validateSpec` defaults an absent or
 * unrecognized `type` to `"blouse"`. A `formSpec: {}` would therefore merge
 * a hard `"blouse"` over whatever the model correctly inferred, silently
 * rewriting the garment. Answering `null` (and, at the route, 400) rather
 * than guessing is the only shape where the merge cannot do that.
 */
export function validateFormSpec(raw: unknown): GarmentSpec | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (!TYPES.includes(r.type as GarmentType)) return null;

  const validated = validateSpec(r);
  const rawStyle = (r.style ?? {}) as Record<string, unknown>;

  // Only the fields this garment type actually applies, and only where the
  // request already named a recognized member. STYLE_FIELDS_BY_TYPE is the
  // same map the form renders from, so a field the form never showed can
  // never arrive as an explicit choice: a blouse's `collar` left set while
  // the type has since become `skirt` is dropped here, not passed through.
  // `sleeveRefit` is unreachable by construction -- it is not a
  // FormStyleField, and validateSpec never emits it either -- which is what
  // makes a forged sleeve refit impossible rather than merely unlikely.
  //
  // One cast, on a Record built key-by-key from `validated.style[field]`
  // itself: every value written is already that exact field's validated
  // value, and the only reason TS cannot see it is that `field` is a union.
  const style: Record<string, unknown> = {};
  for (const field of STYLE_FIELDS_BY_TYPE[validated.type]) {
    const value = validated.style[field];
    if (value === undefined) continue;
    if (value !== rawStyle[field]) continue;
    style[field] = value;
  }

  const spec: GarmentSpec = {
    type: validated.type,
    // Dropped outright: the form has no measurement fields, so anything
    // here is forged. Dropping it is also what keeps mergeFormSpec from
    // spreading an empty object over an override the model extracted from
    // the details text ("cintura 4 cm mais folgada").
    measurementOverrides: {},
    style: style as GarmentStyle,
  };
  // Absent unless the request named a recognized Gender. GarmentSpec.gender
  // is optional precisely so "the form did not decide this" is
  // representable: the drafted gender comes from the chosen size chart, and
  // a defaulted "female" here would override a correct male inference
  // exactly the way a defaulted `type` would.
  if (GENDERS.includes(r.gender as Gender)) spec.gender = validated.gender;
  return spec;
}

/**
 * Re-applies the form's validated choices over the spec the model returned.
 * Runs after `resolveDecision` and before `applyGarmentSpec`, so a field the
 * form left alone keeps the model's inference while the drafted geometry
 * reflects the merge.
 *
 * Telling the model in the prompt is necessary (its own reply text has to be
 * coherent, and it must not ask about an already-answered field) but it is
 * not the defence -- the same reasoning `applyGarmentSpec` uses when it
 * clamps every measurement regardless of what the model claims prompted it.
 */
export function mergeFormSpec(ai: GarmentSpec, form: GarmentSpec): GarmentSpec {
  const style: Record<string, unknown> = { ...ai.style };
  for (const [key, value] of Object.entries(form.style)) {
    if (value === undefined) continue;
    style[key] = value;
  }
  return {
    type: form.type,
    gender: form.gender ?? ai.gender,
    // Taken from the model untouched, never spread over: the form has no
    // measurement fields, so `form.measurementOverrides` is always empty and
    // spreading it would wipe a real override the model extracted from the
    // details text.
    measurementOverrides: ai.measurementOverrides,
    style: style as GarmentStyle,
  };
}
