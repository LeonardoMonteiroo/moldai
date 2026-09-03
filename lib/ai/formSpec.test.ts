import { describe, it, expect } from "vitest";
import { validateFormSpec, mergeFormSpec } from "./formSpec";
import type { GarmentSpec } from "@/lib/types";

function aiSpec(overrides: Partial<GarmentSpec> = {}): GarmentSpec {
  return {
    type: "dress",
    gender: "male",
    measurementOverrides: {},
    style: {},
    ...overrides,
  };
}

// PFORM-28: validateSpec defaults an absent/unrecognized type to "blouse",
// and the merge re-applies whatever survives over the model's own spec --
// so a form spec with no usable type has to be refused outright rather than
// resolved to a default garment the user never chose.
describe("validateFormSpec: an explicit, recognized type or nothing", () => {
  it("rejects undefined and null", () => {
    expect(validateFormSpec(undefined)).toBeNull();
    expect(validateFormSpec(null)).toBeNull();
  });

  it("rejects a non-object", () => {
    expect(validateFormSpec("blouse")).toBeNull();
    expect(validateFormSpec(42)).toBeNull();
    expect(validateFormSpec(["blouse"])).toBeNull();
  });

  it("rejects an object with no type at all", () => {
    expect(validateFormSpec({})).toBeNull();
    expect(validateFormSpec({ style: { neckline: "round" } })).toBeNull();
  });

  it("rejects an unrecognized type instead of defaulting it to blouse", () => {
    expect(validateFormSpec({ type: "corset" })).toBeNull();
    expect(validateFormSpec({ type: 7 })).toBeNull();
  });

  it("accepts a recognized type and returns it unchanged", () => {
    expect(validateFormSpec({ type: "trousers" })?.type).toBe("trousers");
  });
});

describe("validateFormSpec: style fields", () => {
  it("keeps every recognized value on a field the type applies", () => {
    const spec = validateFormSpec({
      type: "blouse",
      style: {
        neckline: "V",
        sleeve: "long",
        cuff: "straight",
        collar: "shirt",
        frontClosure: "buttonStand",
        fit: "loose",
      },
    });
    expect(spec?.style).toEqual({
      neckline: "V",
      sleeve: "long",
      cuff: "straight",
      collar: "shirt",
      frontClosure: "buttonStand",
      fit: "loose",
    });
  });

  // PFORM-24: an unrecognized enum value is discarded rather than reaching
  // a drafter -- dropped, not turned into validateSpec's default, which the
  // merge would then apply as an explicit choice.
  it("drops an unrecognized value on an applicable field and still returns the rest", () => {
    const spec = validateFormSpec({
      type: "blouse",
      style: { neckline: "banana", sleeve: "long" },
    });
    expect(spec).not.toBeNull();
    expect("neckline" in spec!.style).toBe(false);
    expect(spec!.style.sleeve).toBe("long");
  });

  it("drops an unrecognized waistband rather than substituting its 'straight' default", () => {
    const spec = validateFormSpec({
      type: "skirt",
      style: { waistband: "elastic", skirt: "gore" },
    });
    expect("waistband" in spec!.style).toBe(false);
    expect(spec!.style.skirt).toBe("gore");
  });

  // PFORM-22, server half: the same map the form renders from decides what
  // the route keeps, so a field the type does not apply cannot arrive as an
  // explicit choice.
  it("drops a field the garment type does not apply, leaving no key at all", () => {
    const spec = validateFormSpec({
      type: "skirt",
      style: { collar: "shirt", skirt: "a-line" },
    });
    expect("collar" in spec!.style).toBe(false);
    expect(spec!.style).toEqual({ skirt: "a-line" });
  });

  it("drops a style field no form control offers, such as a numeric or darts", () => {
    const spec = validateFormSpec({
      type: "blouse",
      style: { necklineDepthCm: 8, darts: true, stretch: "medium" },
    });
    expect(spec!.style).toEqual({});
  });

  // PFORM-27: a request can never fake a sleeve refit.
  it("never returns sleeveRefit, even when the request sets it", () => {
    const spec = validateFormSpec({
      type: "blouse",
      style: { sleeveRefit: true, sleeve: "long" },
    });
    expect("sleeveRefit" in spec!.style).toBe(false);
    expect(spec!.style.sleeveRefit).toBeUndefined();
  });
});

describe("validateFormSpec: measurementOverrides and gender", () => {
  it("always returns an empty measurementOverrides, even when the request carries one", () => {
    const spec = validateFormSpec({
      type: "blouse",
      measurementOverrides: { bust: 500 },
    });
    expect(spec!.measurementOverrides).toEqual({});
  });

  it("keeps an explicitly named gender", () => {
    expect(validateFormSpec({ type: "blouse", gender: "male" })?.gender).toBe(
      "male",
    );
  });

  it("leaves gender absent when the request names none or an unrecognized one", () => {
    const noGender = validateFormSpec({ type: "blouse" })!;
    expect("gender" in noGender).toBe(false);
    const badGender = validateFormSpec({ type: "blouse", gender: "other" })!;
    expect("gender" in badGender).toBe(false);
  });
});

// PFORM-25: each type/gender/style field the form set explicitly overwrites
// the model's, and every field the form did not set keeps the model's value.
describe("mergeFormSpec", () => {
  it("overwrites a style field the form set", () => {
    const merged = mergeFormSpec(
      aiSpec({ style: { collar: "none", sleeve: "short" } }),
      { type: "blouse", measurementOverrides: {}, style: { collar: "band" } },
    );
    expect(merged.style.collar).toBe("band");
  });

  it("leaves a style field the form did not set at the model's value", () => {
    const merged = mergeFormSpec(
      aiSpec({ style: { collar: "none", sleeve: "short", fit: "close" } }),
      { type: "blouse", measurementOverrides: {}, style: { collar: "band" } },
    );
    expect(merged.style.sleeve).toBe("short");
    expect(merged.style.fit).toBe("close");
  });

  it("takes the type from the form, not the model", () => {
    const merged = mergeFormSpec(aiSpec({ type: "dress" }), {
      type: "skirt",
      measurementOverrides: {},
      style: {},
    });
    expect(merged.type).toBe("skirt");
  });

  it("takes the gender from the form when it set one, and from the model when it did not", () => {
    const form: GarmentSpec = {
      type: "blouse",
      measurementOverrides: {},
      style: {},
    };
    expect(mergeFormSpec(aiSpec({ gender: "male" }), form).gender).toBe("male");
    expect(
      mergeFormSpec(aiSpec({ gender: "male" }), { ...form, gender: "female" })
        .gender,
    ).toBe("female");
  });

  it("preserves the model's measurementOverrides verbatim, and mutates neither input", () => {
    const ai = aiSpec({ measurementOverrides: { waist: 78 } });
    const form: GarmentSpec = {
      type: "blouse",
      measurementOverrides: {},
      style: { fit: "loose" },
    };
    const merged = mergeFormSpec(ai, form);
    expect(merged.measurementOverrides).toEqual({ waist: 78 });
    expect(ai.measurementOverrides).toEqual({ waist: 78 });
    expect(ai.style).toEqual({});
    expect(form.style).toEqual({ fit: "loose" });
  });

  it("ignores an explicitly-undefined style key on the form spec", () => {
    const merged = mergeFormSpec(aiSpec({ style: { sleeve: "long" } }), {
      type: "blouse",
      measurementOverrides: {},
      style: { sleeve: undefined },
    });
    expect(merged.style.sleeve).toBe("long");
  });

  // The two halves compose: what validateFormSpec kept is exactly what wins.
  it("applied to a validated form spec, only the fields the form named win", () => {
    const form = validateFormSpec({
      type: "blouse",
      gender: "male",
      style: { collar: "band", neckline: "banana" },
    })!;
    const merged = mergeFormSpec(
      aiSpec({
        type: "dress",
        gender: "female",
        measurementOverrides: { bust: 96 },
        style: { collar: "none", neckline: "round", sleeve: "short" },
      }),
      form,
    );
    expect(merged).toEqual({
      type: "blouse",
      gender: "male",
      measurementOverrides: { bust: 96 },
      style: { collar: "band", neckline: "round", sleeve: "short" },
    });
  });
});
