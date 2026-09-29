import { describe, it, expect } from "vitest";
import type { GarmentSpec } from "@/lib/types";
import { buildSpecParams, STYLE_VALUE_CATALOG } from "./specParams";
import { CAPABILITIES, STYLE_ENUM_FIELDS } from "@/lib/draft/engine/capability";

function spec(overrides: Partial<GarmentSpec> = {}): GarmentSpec {
  return {
    type: "blouse",
    gender: "female",
    measurementOverrides: {},
    style: {},
    ...overrides,
  };
}

describe("buildSpecParams (#332)", () => {
  it("lists only the style fields the spec actually carries", () => {
    const params = buildSpecParams(
      spec({ style: { neckline: "V", darts: true } }),
      "moldai",
    );
    expect(params.map((p) => p.field)).toEqual(["neckline", "darts"]);
  });

  // #353: every drafter emits its own rows.seamAllowance detail row on every
  // piece (body.ts/skirt.ts/trousers.ts), so listing it here printed the same
  // number twice on one sheet -- the very duplication #332 removed the
  // chipSeamAllowance chip to avoid, missed one copy deeper.
  it("omits seamAllowanceCm, which the piece cards below already state", () => {
    const params = buildSpecParams(
      spec({ style: { neckline: "V", seamAllowanceCm: 1.5 } }),
      "moldai",
    );
    expect(params.map((p) => p.field)).toEqual(["neckline"]);
  });

  // #353: garment.ts drafts a cuff only when hasPlacketOpening holds, so a
  // short-sleeved blouse carrying cuff: "straight" is cut with no punho --
  // and #332 listed the punho anyway.
  it("omits a cuff that a short sleeve means was never drafted", () => {
    const shortSleeve = buildSpecParams(
      spec({ style: { sleeve: "short", cuff: "straight" } }),
      "moldai",
    );
    expect(shortSleeve.map((p) => p.field)).toEqual(["sleeve"]);

    const longSleeve = buildSpecParams(
      spec({ style: { sleeve: "long", cuff: "straight" } }),
      "moldai",
    );
    expect(longSleeve.map((p) => p.field)).toEqual(["sleeve", "cuff"]);
  });

  it("returns nothing for a spec whose style is still empty", () => {
    expect(buildSpecParams(spec(), "moldai")).toEqual([]);
  });

  // The order is the engine's own declaration order, never a second ordering
  // table -- the lib/draft/formFields.ts precedent.
  it("follows the engine's declared field order, not the spec object's key order", () => {
    const declared = CAPABILITIES.moldai.styleFieldsByType.blouse;
    const params = buildSpecParams(
      spec({
        style: {
          // Deliberately written in an order that disagrees with the
          // capability map's.
          collar: "band",
          fit: "loose",
          neckline: "round",
          sleeve: "long",
        },
      }),
      "moldai",
    );
    const fields = params.map((p) => p.field);
    expect(fields).toEqual([...declared].filter((f) => fields.includes(f)));
    expect(fields).toEqual(["neckline", "sleeve", "fit", "collar"]);
  });

  // The filter is per TYPE, which is the granularity any engine declares
  // today. It is NOT cross-field: a blouse carrying `cuff` with a short
  // sleeve still lists the punho, because garment.ts's "only draft a cuff for
  // a long sleeve" rule is written in the drafter and declared nowhere --
  // that declaration is #333's job, and this panel inherits its gap until
  // then.
  it("omits a field the engine does not read for this garment type", () => {
    const params = buildSpecParams(
      // A skirt carries no `fit`: skirt.ts reads neither fit nor stretch
      // (SKIRT_WEARING_EASE_CM is a fixed constant), so MOLDAI_CAPABILITY
      // does not list it for a skirt.
      spec({ type: "skirt", style: { fit: "loose", skirt: "a-line" } }),
      "moldai",
    );
    expect(params.map((p) => p.field)).toEqual(["skirt"]);
  });

  it("omits a field the engine does not read for a type it does draft", () => {
    // freesewing's blouse (Diana) reads only `sleeve` -- a neckline set on
    // that pattern shaped nothing, so it is not presented as if it had.
    const params = buildSpecParams(
      spec({ style: { neckline: "V", sleeve: "long" } }),
      "freesewing",
    );
    expect(params.map((p) => p.field)).toEqual(["sleeve"]);
  });

  it("reads the frozen engine, so the same spec yields different panels", () => {
    const s = spec({
      type: "skirt",
      style: { skirt: "circle", waistband: "straight" },
    });
    expect(buildSpecParams(s, "moldai").map((p) => p.field)).toEqual([
      "skirt",
      "waistband",
    ]);
    // FREESEWING_CAPABILITY.styleFieldsByType.skirt (Sandy) has no waistband.
    expect(buildSpecParams(s, "freesewing").map((p) => p.field)).toEqual([
      "skirt",
    ]);
  });

  it("classifies each field as enum, cm or boolean", () => {
    const params = buildSpecParams(
      spec({
        style: {
          neckline: "round",
          necklineDepthCm: 3,
          darts: true,
        },
      }),
      "moldai",
    );
    expect(params).toEqual([
      { field: "neckline", kind: "enum", value: "round" },
      { field: "necklineDepthCm", kind: "cm", value: 3 },
      { field: "darts", kind: "boolean", value: true },
    ]);
  });

  it("keeps a false boolean and a zero cm value -- only `undefined` means unset", () => {
    const params = buildSpecParams(
      spec({ style: { darts: false, armholeDeepenCm: 0 } }),
      "moldai",
    );
    expect(params).toEqual([
      { field: "armholeDeepenCm", kind: "cm", value: 0 },
      { field: "darts", kind: "boolean", value: false },
    ]);
  });

  // validateSpec discards sleeveRefit and only "Corrigir manga" sets it: the
  // user never chose it, so it must never appear as a parameter they asked
  // for. It is excluded from CapabilityStyleField, so no engine lists it.
  it("never surfaces the internal sleeveRefit flag", () => {
    const params = buildSpecParams(
      spec({ style: { sleeveRefit: true, neckline: "straight" } }),
      "moldai",
    );
    expect(params.map((p) => p.field)).toEqual(["neckline"]);
  });

  it("handles a type the engine drafts with almost no style surface", () => {
    // moldai drafts no hoodie at all -- an honest empty entry, not a crash.
    expect(
      buildSpecParams(
        spec({ type: "hoodie", style: { sleeve: "long" } }),
        "moldai",
      ),
    ).toEqual([]);
    expect(
      buildSpecParams(
        spec({ type: "hoodie", style: { sleeve: "long" } }),
        "freesewing",
      ).map((p) => p.field),
    ).toEqual(["sleeve"]);
  });

  // #351: a count, never rendered with a cm unit, and only for a gore skirt.
  it("lists gorePanels as a count on a gore skirt, and omits it on any other silhouette", () => {
    expect(
      buildSpecParams(
        spec({ type: "skirt", style: { skirt: "gore", gorePanels: 8 } }),
        "moldai",
      ),
    ).toEqual([
      { field: "skirt", kind: "enum", value: "gore" },
      { field: "gorePanels", kind: "count", value: 8 },
    ]);
    expect(
      buildSpecParams(
        spec({ type: "dress", style: { skirt: "circle", gorePanels: 8 } }),
        "moldai",
      ).map((p) => p.field),
    ).toEqual(["skirt"]);
  });

  it("does not mutate the spec it was given", () => {
    const s = spec({ style: { neckline: "V" } });
    const before = JSON.stringify(s);
    buildSpecParams(s, "moldai");
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("STYLE_VALUE_CATALOG (#332)", () => {
  it("names a catalog for every enum-valued style field, and only those", () => {
    expect(Object.keys(STYLE_VALUE_CATALOG).sort()).toEqual(
      [...STYLE_ENUM_FIELDS].sort(),
    );
  });
});
