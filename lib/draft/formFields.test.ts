import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FORM_STYLE_FIELDS,
  STYLE_FIELDS_BY_TYPE,
  formStyleFieldsFor,
} from "./formFields";
import { TYPES, SLEEVES } from "@/lib/draft/garment";
import { MOLDAI_CAPABILITY } from "@/lib/draft/engine/capability";

// The design's own per-type table, asserted per type rather than as one
// blob: which fields a garment type offers is derived from which drafter
// reads them, so a wrong entry is a form field that silently does nothing.
describe("STYLE_FIELDS_BY_TYPE", () => {
  it("covers every GarmentType TYPES declares, and nothing else", () => {
    expect(Object.keys(STYLE_FIELDS_BY_TYPE).sort()).toEqual([...TYPES].sort());
  });

  it("blouse offers neckline, sleeve, cuff, collar, frontClosure and fit", () => {
    expect(STYLE_FIELDS_BY_TYPE.blouse).toEqual([
      "neckline",
      "sleeve",
      "cuff",
      "collar",
      "frontClosure",
      "fit",
    ]);
  });

  it("dress swaps the blouse's front closure for the skirt silhouette", () => {
    expect(STYLE_FIELDS_BY_TYPE.dress).toEqual([
      "neckline",
      "sleeve",
      "cuff",
      "collar",
      "skirt",
      "fit",
    ]);
  });

  // #327: tshirt is the one knit archetype -- ease.ts's wearingEaseCm
  // branches on `knit` and reads `style.stretch` for it, never `style.fit`.
  it("tshirt offers the blouse set without the front closure or fit", () => {
    expect(STYLE_FIELDS_BY_TYPE.tshirt).toEqual([
      "neckline",
      "sleeve",
      "cuff",
      "collar",
    ]);
  });

  // The reason those two drop it, pinned against the drafter rather than
  // restated: body.ts splits the front only for a non-knit garment with no
  // dress hem, so a tshirt or dress that asked for a button stand gets an
  // unsplit cut-on-fold front either way (body.test.ts's own two cases). A
  // form select cannot decline the way the model can, so offering it there
  // would be a control that silently does nothing -- PFORM-21.
  it("offers the front closure for the blouse alone", () => {
    const withClosure = TYPES.filter((type) =>
      STYLE_FIELDS_BY_TYPE[type].includes("frontClosure"),
    );
    expect(withClosure).toEqual(["blouse"]);
  });

  // #327: SKIRT_WEARING_EASE_CM (skirt.ts) is a fixed constant -- no
  // drafter reads style.fit for a skirt.
  it("skirt offers only skirt and waistband", () => {
    expect(STYLE_FIELDS_BY_TYPE.skirt).toEqual(["skirt", "waistband"]);
  });

  // #327: trousers.ts has no fit read at all, style-driven or otherwise.
  it("trousers offers only waistband", () => {
    expect(STYLE_FIELDS_BY_TYPE.trousers).toEqual(["waistband"]);
  });

  // #327: this table was built from which drafter actually reads each
  // field, the same discipline MOLDAI_CAPABILITY.styleFieldsByType (the
  // engine's own declared ground truth) was built from -- so the two must
  // never disagree on what a moldai-supported type's form may offer.
  // hoodie/coat/shirt are excluded: they are freesewing-only, so
  // MOLDAI_CAPABILITY declares them unsupported (an empty entry) for a
  // different, unrelated reason than "no field applies".
  it("agrees with MOLDAI_CAPABILITY.styleFieldsByType for every moldai-supported type", () => {
    for (const type of MOLDAI_CAPABILITY.types) {
      const declared = MOLDAI_CAPABILITY.styleFieldsByType[
        type
      ] as readonly string[];
      for (const field of STYLE_FIELDS_BY_TYPE[type]) {
        expect(declared).toContain(field);
      }
    }
  });

  it("lists every field in FORM_STYLE_FIELDS, in that display order", () => {
    for (const type of TYPES) {
      const fields = STYLE_FIELDS_BY_TYPE[type];
      for (const f of fields) expect(FORM_STYLE_FIELDS).toContain(f);
      const ordered = FORM_STYLE_FIELDS.filter((f) => fields.includes(f));
      expect(fields).toEqual(ordered);
    }
  });

  // sleeveRefit is internal (validateSpec discards it) and
  // measurementOverrides is not a style field at all -- neither may ever be
  // reachable from a form.
  it("never offers sleeveRefit", () => {
    expect(FORM_STYLE_FIELDS).not.toContain("sleeveRefit");
  });
});

describe("formStyleFieldsFor", () => {
  it("omits cuff while the sleeve is unset, none or short", () => {
    for (const sleeve of [undefined, "none", "short"] as const) {
      expect(formStyleFieldsFor("blouse", sleeve)).not.toContain("cuff");
    }
  });

  it("includes cuff once the sleeve is long", () => {
    expect(formStyleFieldsFor("blouse", "long")).toContain("cuff");
    expect(formStyleFieldsFor("dress", "long")).toContain("cuff");
    expect(formStyleFieldsFor("tshirt", "long")).toContain("cuff");
  });

  it("never adds cuff to a type whose map does not list it, at any sleeve length", () => {
    for (const sleeve of [...SLEEVES, undefined]) {
      expect(formStyleFieldsFor("skirt", sleeve)).toEqual([
        "skirt",
        "waistband",
      ]);
      expect(formStyleFieldsFor("trousers", sleeve)).toEqual(["waistband"]);
    }
  });

  it("changes nothing but cuff relative to the type's own list", () => {
    for (const type of TYPES) {
      expect(formStyleFieldsFor(type, "long")).toEqual(
        STYLE_FIELDS_BY_TYPE[type],
      );
      expect(formStyleFieldsFor(type, "short")).toEqual(
        STYLE_FIELDS_BY_TYPE[type].filter((f) => f !== "cuff"),
      );
    }
  });
});

// The leaf-module property is the whole reason this map does not live in
// garment.ts: the form's client bundle must not pull in a drafter. A stray
// import would not fail any behavior test, so pin it on the source itself.
describe("module boundary", () => {
  it("imports nothing from garment.ts or any drafter", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/draft/formFields.ts"),
      "utf-8",
    );
    const specifiers = [...src.matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)].map(
      (m) => m[1],
    );
    expect(specifiers).toEqual(["@/lib/types"]);
  });
});
