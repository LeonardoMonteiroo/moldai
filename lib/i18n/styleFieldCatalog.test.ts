import { describe, it, expect } from "vitest";
import messages from "@/messages/pt-BR.json";
import type { GarmentStyle } from "@/lib/types";
import type { CapabilityStyleField } from "@/lib/draft/engine/capability";
import type { AdjustedField } from "@/lib/draft/specAdjustments";
import { STYLE_VALUE_CATALOG } from "@/lib/draft/specParams";
import {
  NECKLINES,
  SLEEVES,
  SKIRTS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  FRONT_CLOSURES,
  PLEATS,
} from "@/lib/draft/vocabulary";
import { FIT_CLASSES, STRETCH_CLASSES } from "@/lib/draft/ease";

/**
 * #325: three call sites build a PatternData label key from a FIELD NAME at
 * runtime rather than a literal `t("...")`, so
 * `.claude/hooks/check-conventions.mjs`'s CHECK 4 reports them only as
 * non-blocking "unresolvable" findings, and next-intl does not throw on a
 * missing key -- it renders the literal key path and logs IntlError:
 * MISSING_MESSAGE while the surrounding code keeps running:
 *
 *   app/api/patterns/[id]/generate/route.ts:582  t(`styleField.${g.field}`)
 *     over EngineGaps, into chat.engineStyleUnsupported
 *   app/api/patterns/[id]/generate/route.ts:645-648  fieldLabel over every
 *     SpecAdjustment, into chat.specAdjusted
 *   components/editor/ChatBubble.tsx:18-21  changedFieldLabel over
 *     diffSpec's "type"/"gender"/"style.<key>" path strings
 *
 * `pleats` and `riseCm` shipped without labels and rendered their raw key
 * paths into a user-visible chat bubble. This guards the mechanical thing:
 * every field name those three sites can produce has a non-empty pt-BR
 * label. Per CLAUDE.md, it asserts against the imported messages object
 * itself, never a pasted pt-BR literal -- a substring assertion would be
 * vacuous, since a MISSING_MESSAGE fallback renders the key path and would
 * satisfy it.
 *
 * `sleeveRefit` is deliberately absent from CapabilityStyleField
 * (capability.ts:88) and from the chat path (lib/editor/state.ts:457 drops
 * it): validateSpec discards it, only "Corrigir manga" sets it, and a user
 * never chose it -- so it correctly has no label.
 *
 * Note: the exhaustiveness sentinels below are evaluated by `npm run build`
 * (the repo's typecheck), not by `vitest run` -- vitest transpiles via
 * esbuild, which strips types without checking them. Same established
 * tradeoff `errorCatalog.test.ts`'s own sentinels already live with.
 */

type Labels = Record<string, string>;

function patternDataCatalog(name: "specField" | "styleField"): Labels {
  const ns = (messages as Record<string, unknown>).PatternData;
  const catalog =
    ns && typeof ns === "object"
      ? (ns as Record<string, unknown>)[name]
      : undefined;
  return catalog && typeof catalog === "object" ? (catalog as Labels) : {};
}

// `satisfies` catches a listed name that is not a real field (a typo, or a
// field since renamed); the sentinel below catches the reverse -- a real
// field missing from the list. A new GarmentStyle member is therefore a
// TYPE ERROR here (at `npm run build`), not a silent gap that only surfaces
// as a raw key path in a shipped chat bubble.
const STYLE_FIELDS = [
  "neckline",
  "necklineDepthCm",
  "sleeve",
  "skirt",
  "skirtLengthCm",
  "darts",
  "seamAllowanceCm",
  "fit",
  "stretch",
  "armholeDeepenCm",
  "collar",
  "cuff",
  "waistband",
  "frontClosure",
  "trouserLengthCm",
  "pleats",
  "riseCm",
  "gorePanels",
] as const satisfies readonly CapabilityStyleField[];
type _StyleFieldsExhaustive =
  Exclude<CapabilityStyleField, (typeof STYLE_FIELDS)[number]> extends never
    ? true
    : never;
const _styleFieldsExhaustive: _StyleFieldsExhaustive = true;
void _styleFieldsExhaustive;

// The non-style half of AdjustedField (lib/draft/specAdjustments.ts:36) --
// exactly the branch route.ts:646-648 and ChatBubble.tsx:18 route to
// specField instead of styleField. DERIVED, not hand-declared as
// `"type" | "gender"`, so a third top-level adjustable field added to
// AdjustedField fails here rather than shipping unlabeled.
type SpecFieldName = Exclude<AdjustedField, keyof GarmentStyle>;
const SPEC_FIELDS = [
  "type",
  "gender",
] as const satisfies readonly SpecFieldName[];
type _SpecFieldsExhaustive =
  Exclude<SpecFieldName, (typeof SPEC_FIELDS)[number]> extends never
    ? true
    : never;
const _specFieldsExhaustive: _SpecFieldsExhaustive = true;
void _specFieldsExhaustive;

describe("template-built PatternData.<catalog>.${field} coverage (#325)", () => {
  it.each([
    ["styleField", STYLE_FIELDS],
    ["specField", SPEC_FIELDS],
  ] as const)(
    "PatternData.%s has a non-empty pt-BR label for every field the chat can name",
    (catalog, fields) => {
      const labels = patternDataCatalog(catalog);
      for (const field of fields) {
        expect(labels[field], `PatternData.${catalog}.${field}`).toBeTruthy();
      }
    },
  );

  // The reverse direction, which the type system cannot see: a key left
  // behind in the JSON after a field was renamed or removed is dead weight
  // that quietly diverges from the code. Compared against the same derived
  // lists above, never a pasted literal.
  it.each([
    ["styleField", STYLE_FIELDS],
    ["specField", SPEC_FIELDS],
  ] as const)(
    "PatternData.%s carries no key for a field that no longer exists",
    (catalog, fields) => {
      expect(Object.keys(patternDataCatalog(catalog)).sort()).toEqual(
        [...fields].sort(),
      );
    },
  );
});

/**
 * #332: one level below the guard above. The "Parâmetros" panel
 * (components/editor/TechSheetTab.tsx's SpecParamsCard) builds a VALUE key at
 * runtime too -- `tData(\`${STYLE_VALUE_CATALOG[field]}.${value}\`)` -- and the
 * same MISSING_MESSAGE silence applies: an enum value with no entry renders
 * its raw key path into the sheet instead of throwing.
 *
 * Five catalogs shipped without their neutral "none" (a sleeveless garment, a
 * collarless one, a skirt with no pleat) and `frontClosure` had no value
 * catalog at all, because until this panel every one of these values reached
 * the screen only through a DRAFTER's own detailRow -- and a drafter that
 * drafts no collar emits no collar row, so "none" was never asked for. A
 * read-only view of the spec asks for all of them.
 *
 * Both directions again, and derived from lib/draft/vocabulary.ts / ease.ts
 * -- the exact arrays validateSpec's own pick() checks membership against --
 * never a pasted list, so a new enum value cannot ship unlabeled.
 */
const STYLE_VALUES: Record<
  keyof typeof STYLE_VALUE_CATALOG,
  readonly string[]
> = {
  neckline: NECKLINES,
  sleeve: SLEEVES,
  skirt: SKIRTS,
  collar: COLLARS,
  cuff: CUFFS,
  waistband: WAISTBANDS,
  frontClosure: FRONT_CLOSURES,
  pleats: PLEATS,
  fit: FIT_CLASSES,
  stretch: STRETCH_CLASSES,
};

function valueCatalog(name: string): Labels {
  const ns = (messages as Record<string, unknown>).PatternData;
  const catalog =
    ns && typeof ns === "object"
      ? (ns as Record<string, unknown>)[name]
      : undefined;
  return catalog && typeof catalog === "object" ? (catalog as Labels) : {};
}

describe("template-built PatternData.<value catalog>.${value} coverage (#332)", () => {
  it.each(
    Object.entries(STYLE_VALUES) as [
      keyof typeof STYLE_VALUE_CATALOG,
      readonly string[],
    ][],
  )(
    "every %s value the app can draft has a non-empty pt-BR label",
    (field, values) => {
      const name = STYLE_VALUE_CATALOG[field];
      const labels = valueCatalog(name);
      for (const value of values) {
        expect(labels[value], `PatternData.${name}.${value}`).toBeTruthy();
      }
    },
  );

  // The reverse: a value left behind in the JSON after the vocabulary dropped
  // it is dead weight the type system cannot see.
  it.each(
    Object.entries(STYLE_VALUES) as [
      keyof typeof STYLE_VALUE_CATALOG,
      readonly string[],
    ][],
  )(
    "PatternData.%s carries no value the vocabulary no longer has",
    (field, values) => {
      const name = STYLE_VALUE_CATALOG[field];
      expect(Object.keys(valueCatalog(name)).sort()).toEqual(
        [...values].sort(),
      );
    },
  );
});
