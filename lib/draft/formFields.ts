// The single exported answer to "which style fields does this garment type
// have?", consumed by both the new-pattern form's rendering and the server's
// own drop step in lib/ai/formSpec.ts -- one map, so a field the form offers
// and a field the route keeps can never disagree.
//
// A leaf module on the lib/export/formats.ts precedent: it imports TYPES
// (types only) and nothing from garment.ts or any drafter, so the client
// bundle and the pure `node` test project both take it freely. formFields
// .test.ts pins that structurally, since an accidental drafter import would
// only show up as a bundle-size or environment failure much later.

import type { GarmentStyle, GarmentType, SleeveLength } from "@/lib/types";

// Every GarmentStyle key the type declares as optional -- i.e. one
// validateSpec leaves `undefined` when nothing set it, which is exactly the
// "the user left this to the AI" signal the form's selects depend on. Used
// only to prove at compile time that each name below is a real style key: a
// typo ("neckLine") would otherwise be a field the form renders, sends, and
// the drafter silently ignores.
type OptionalGarmentStyleField = NonNullable<
  {
    [K in keyof GarmentStyle]: undefined extends GarmentStyle[K] ? K : never;
  }[keyof GarmentStyle]
>;

// Display order, top to bottom in the form. Every per-type list below is a
// subsequence of this one, so the form renders whichever fields apply in a
// stable order without a second ordering table.
//
// The numeric style fields (necklineDepthCm, skirtLengthCm, trouserLengthCm,
// seamAllowanceCm, armholeDeepenCm), `darts` and `stretch` are deliberately
// absent: a cm value with a STYLE_LIMITS range is not something a select can
// express honestly, and stretch is a fabric property the user picks after
// the molde exists. The details textarea reaches all of them through the
// model. `sleeveRefit` is absent because it is internal -- validateSpec
// discards it, and a form must never be able to fake a sleeve refit.
export const FORM_STYLE_FIELDS = [
  "neckline",
  "sleeve",
  "cuff",
  "collar",
  "frontClosure",
  "skirt",
  "waistband",
  "fit",
] as const satisfies readonly OptionalGarmentStyleField[];

export type FormStyleField = (typeof FORM_STYLE_FIELDS)[number];

// Derived from which drafter actually reads each field, not from what looks
// plausible on a form: a blouse has no skirt panel to shape and no waistband
// (lib/draft/body.ts), trousers have neither a neckline nor a sleeve
// (lib/draft/trousers.ts), and frontClosure is gated off dress and tshirt
// inside body.ts -- but it stays listed for both here because the AI-facing
// catalog does too and the drafter, not this map, owns that gate.
export const STYLE_FIELDS_BY_TYPE: Record<
  GarmentType,
  readonly FormStyleField[]
> = {
  blouse: ["neckline", "sleeve", "cuff", "collar", "frontClosure", "fit"],
  dress: [
    "neckline",
    "sleeve",
    "cuff",
    "collar",
    "frontClosure",
    "skirt",
    "fit",
  ],
  tshirt: ["neckline", "sleeve", "cuff", "collar", "frontClosure", "fit"],
  skirt: ["skirt", "waistband", "fit"],
  trousers: ["waistband", "fit"],
};

/**
 * The style controls to actually render for `type` at the currently selected
 * `sleeve` length. Identical to STYLE_FIELDS_BY_TYPE[type] except that
 * `cuff` is dropped unless the sleeve is `"long"`: no drafter reads
 * `style.cuff` for a short or sleeveless garment (lib/draft/sleeve.ts), so
 * offering the control there would be a field that silently does nothing.
 */
export function formStyleFieldsFor(
  type: GarmentType,
  sleeve: SleeveLength | undefined,
): readonly FormStyleField[] {
  const fields = STYLE_FIELDS_BY_TYPE[type];
  if (sleeve === "long") return fields;
  return fields.filter((f) => f !== "cuff");
}
