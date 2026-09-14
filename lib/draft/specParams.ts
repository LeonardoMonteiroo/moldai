import type { GarmentSpec, GarmentStyle } from "@/lib/types";
import {
  CAPABILITIES,
  STYLE_ENUM_FIELDS,
  STYLE_LIMIT_FIELDS,
  type CapabilityStyleField,
  type EngineId,
} from "@/lib/draft/engine/capability";

/**
 * #332: the read-only "Parâmetros" panel's own model -- which style fields a
 * drafted pattern's spec actually carries, in the order the engine declares
 * them, with enough shape for a renderer to format each value without
 * re-deriving any of it.
 *
 * The buildEaseReport (lib/draft/easeReport.ts) precedent: a pure builder in
 * lib/, framework-free, feeding TechSheetTab. Unlike buildEaseReport it takes
 * NO injected Translate and emits no text -- it returns the EN codes, and the
 * component resolves them through the catalog, per CLAUDE.md's "UI labels come
 * from catalog lookups keyed by the EN enum value."
 *
 * A leaf module on the lib/draft/formFields.ts precedent: it imports only
 * types and lib/draft/engine/capability.ts (itself a leaf, see its own header
 * comment), never garment.ts or any drafter, so a client component takes it
 * without pulling a drafting engine into its bundle.
 */

export type SpecParamKind = "enum" | "cm" | "boolean";

export interface SpecParam {
  field: CapabilityStyleField;
  kind: SpecParamKind;
  // The EN code for "enum", the raw number for "cm", the flag for "boolean" --
  // never display text.
  value: string | number | boolean;
}

// The three kinds partition CapabilityStyleField exactly: the ten enum fields
// and six cm fields capability.ts already declares, plus `darts`, the only
// boolean GarmentStyle has. The sentinel below makes a new style field a TYPE
// ERROR here (at `npm run build`) rather than a field that silently renders as
// nothing -- the styleFieldCatalog.test.ts sentinel shape.
const BOOLEAN_STYLE_FIELDS = [
  "darts",
] as const satisfies readonly CapabilityStyleField[];
type _KindsExhaustive =
  Exclude<
    CapabilityStyleField,
    | (typeof STYLE_ENUM_FIELDS)[number]
    | (typeof STYLE_LIMIT_FIELDS)[number]
    | (typeof BOOLEAN_STYLE_FIELDS)[number]
  > extends never
    ? true
    : never;
const _kindsExhaustive: _KindsExhaustive = true;
void _kindsExhaustive;

const BOOLEAN_FIELDS: ReadonlySet<string> = new Set(BOOLEAN_STYLE_FIELDS);
const CM_FIELDS: ReadonlySet<string> = new Set(STYLE_LIMIT_FIELDS);

function kindOf(field: CapabilityStyleField): SpecParamKind {
  if (BOOLEAN_FIELDS.has(field)) return "boolean";
  if (CM_FIELDS.has(field)) return "cm";
  // Everything left is enum-valued -- _KindsExhaustive above proves the three
  // groups partition CapabilityStyleField, so this needs no fourth branch.
  return "enum";
}

/**
 * The catalog namespace each enum-valued field's VALUES are named in, since
 * the field name and its catalog name differ for six of the ten
 * (`sleeve` -> PatternData.sleeveType, `skirt` -> PatternData.skirtSilhouette,
 * …). This is NOT a label map -- it holds no pt-BR text, only the namespace a
 * value's EN code is looked up in, so CLAUDE.md's catalog-lookup rule still
 * holds. Shared with lib/i18n/styleFieldCatalog.test.ts's coverage guard, so a
 * namespace and the values guarded in it can never disagree.
 */
export const STYLE_VALUE_CATALOG = {
  neckline: "neckline",
  sleeve: "sleeveType",
  skirt: "skirtSilhouette",
  collar: "collarType",
  cuff: "cuffType",
  waistband: "waistbandType",
  frontClosure: "frontClosure",
  fit: "fit",
  stretch: "stretch",
  pleats: "pleatType",
} as const satisfies Record<(typeof STYLE_ENUM_FIELDS)[number], string>;

/**
 * The style fields `spec` carries that `engineId` actually READS for
 * `spec.type`, in the order that engine declares them.
 *
 * Two filters, both deliberate:
 *
 * - A field absent from the engine's own `styleFieldsByType[spec.type]` is
 *   OMITTED, never listed as inert. A skirt can legitimately carry
 *   `fit: "loose"` -- lib/draft/skirt.ts reads neither fit nor stretch -- and
 *   showing it would present a value that shaped nothing as if it had.
 *
 *   The filter is per TYPE, the only granularity any engine declares today.
 *   It is NOT cross-field: a blouse carrying `cuff` with a short sleeve still
 *   lists the punho, since garment.ts's "only for a long sleeve" rule lives in
 *   the drafter and is declared nowhere. Declaring it -- and reporting a
 *   violated coupling as an engine gap -- is #333's job; this panel inherits
 *   that gap until then.
 * - A field the spec never set is omitted too: `undefined` means "the user left
 *   this to the AI", not "off".
 *
 * `sleeveRefit` cannot appear: it is excluded from CapabilityStyleField
 * (capability.ts) precisely because validateSpec discards it and only
 * "Corrigir manga" sets it -- so it is in no engine's field list to begin with.
 *
 * Pure; never mutates `spec`.
 */
export function buildSpecParams(
  spec: GarmentSpec,
  engineId: EngineId,
): SpecParam[] {
  const fields = CAPABILITIES[engineId].styleFieldsByType[spec.type];
  const out: SpecParam[] = [];
  for (const field of fields) {
    const value = spec.style[field as keyof GarmentStyle];
    if (value === undefined) continue;
    out.push({ field, kind: kindOf(field), value });
  }
  return out;
}
