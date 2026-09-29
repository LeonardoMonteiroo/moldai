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

import type {
  GarmentStyle,
  GarmentType,
  SkirtSilhouette,
  SleeveLength,
} from "@/lib/types";

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
// seamAllowanceCm, armholeDeepenCm, riseCm), `darts` and `stretch` are
// deliberately absent: a cm value with a STYLE_LIMITS range is not something
// a select can express honestly, and stretch is a fabric property the user
// picks after the molde exists. The details textarea reaches all of them
// through the model. #351's `gorePanels` is the one number that IS here: a
// count restricted to five even values (4-12) is exactly what a select can
// express, and unlike a cm range it has no in-between values to hide. Its
// options are strings on the form and become numbers only at submit.
// `sleeveRefit` is absent because it is internal --
// validateSpec discards it, and a form must never be able to fake a sleeve
// refit.
export const FORM_STYLE_FIELDS = [
  "neckline",
  "sleeve",
  "cuff",
  "collar",
  "frontClosure",
  "skirt",
  "gorePanels",
  "waistband",
  "fit",
] as const satisfies readonly OptionalGarmentStyleField[];

export type FormStyleField = (typeof FORM_STYLE_FIELDS)[number];

// Derived from which drafter actually reads each field, not from what looks
// plausible on a form: a blouse has no skirt panel to shape and no waistband
// (lib/draft/body.ts), and trousers have neither a neckline nor a sleeve
// (lib/draft/trousers.ts).
//
// `frontClosure` is listed for the BLOUSE ONLY, unlike the AI-facing catalog
// in garment.ts, which offers it for every body-having type and lets the
// drafter decide. body.ts:163-167 splits the front only when
// `!opts.knit && opts.dressHemHalfCm === undefined`, i.e. never for a tshirt
// (knit) and never for a dress (whose bodice hem doubles as the waist-join
// seam and assumes the front's full width) -- body.test.ts pins both. The
// model can answer an impossible request with decline or ask; a form select
// cannot, so offering it there would be a control that silently does
// nothing, the same reason `cuff` is gated below.
//
// `fit` is listed for BLOUSE AND DRESS ONLY, for the identical reason
// (#327). The single place any drafter reads `style.fit` is ease.ts's
// wearingEaseCm (called from garment.ts), which branches on `knit`: a tshirt
// reads `style.stretch` instead and never `fit`. skirt.ts/trousers.ts read
// neither -- SKIRT_WEARING_EASE_CM is a fixed constant and neither drafter
// takes a BlockOpts at all. Before #327 this table disagreed with the
// ground-truth capability map (MOLDAI_CAPABILITY.styleFieldsByType in
// lib/draft/engine/capability.ts, which only ever listed "fit" for blouse
// and dress) in exactly these three cells -- formFields.test.ts's own
// "STYLE_FIELDS_BY_TYPE agrees with MOLDAI_CAPABILITY" case is what now
// keeps the two from drifting apart again.
export const STYLE_FIELDS_BY_TYPE: Record<
  GarmentType,
  readonly FormStyleField[]
> = {
  blouse: ["neckline", "sleeve", "cuff", "collar", "frontClosure", "fit"],
  dress: ["neckline", "sleeve", "cuff", "collar", "skirt", "gorePanels", "fit"],
  tshirt: ["neckline", "sleeve", "cuff", "collar"],
  skirt: ["skirt", "gorePanels", "waistband"],
  trousers: ["waistband"],
  // #269: freesewing-only (see lib/draft/vocabulary.ts's own TYPES comment)
  // -- Hugo's hood/cuff/waistband are all FIXED parts of the design, never
  // optional sub-pieces the way moldai's own collar/cuff/waistband are, so
  // only "sleeve" is a real, form-renderable choice (and even then only
  // "long" is honestly supported -- see FREESEWING_CAPABILITY.styleEnumsByType
  // .hoodie in lib/draft/engine/capability.ts).
  hoodie: ["sleeve"],
  // #269: freesewing-only (see lib/draft/vocabulary.ts's own TYPES
  // comment). Jett's own sleeveLengthBonus option (-60%..+20% of full
  // arm length, @freesewing/jett's own sleeve.mjs) can produce a genuine
  // short sleeve, unlike Hugo's narrow raglan range -- "sleeve" is a
  // real, honestly-supported form field here.
  coat: ["sleeve"],
  // #269: freesewing-only (see lib/draft/vocabulary.ts's own TYPES
  // comment). Simon's own sleeveStyle option is a real short/long branch
  // (short skips the cuff entirely for a folded hem, verified live) --
  // "sleeve" is a real, honestly-supported form field here, the same
  // footing as coat's own entry above.
  shirt: ["sleeve"],
};

/**
 * The style controls to actually render for `type` at the currently selected
 * `sleeve` length. Identical to STYLE_FIELDS_BY_TYPE[type] except that
 * `cuff` is dropped unless the sleeve is `"long"`: no drafter reads
 * `style.cuff` for a short or sleeveless garment (lib/draft/sleeve.ts), so
 * offering the control there would be a field that silently does nothing.
 * #351: `gorePanels` is dropped unless the skirt silhouette is `"gore"`, for
 * the same reason -- lib/draft/skirt.ts reads it for no other silhouette.
 */
export function formStyleFieldsFor(
  type: GarmentType,
  sleeve: SleeveLength | undefined,
  skirt?: SkirtSilhouette,
): readonly FormStyleField[] {
  return STYLE_FIELDS_BY_TYPE[type].filter(
    (f) =>
      (f !== "cuff" || sleeve === "long") &&
      (f !== "gorePanels" || skirt === "gore"),
  );
}
