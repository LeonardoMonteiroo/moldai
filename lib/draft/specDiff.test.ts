import { describe, it, expect } from "vitest";
import { diffSpec } from "./specDiff";
import { validateSpec } from "./garment";

describe("diffSpec", () => {
  it("returns nothing for two identical specs", () => {
    const spec = validateSpec({
      type: "blouse",
      gender: "female",
      style: { neckline: "V", sleeve: "long" },
    });
    expect(diffSpec(spec, spec)).toEqual([]);
  });

  it("reports a single changed style field", () => {
    const before = validateSpec({ type: "blouse", style: { sleeve: "long" } });
    const after = validateSpec({ type: "blouse", style: { sleeve: "short" } });
    expect(diffSpec(before, after)).toEqual([
      { field: "sleeve", before: "long", after: "short" },
    ]);
  });

  it("reports type and gender changes", () => {
    const before = validateSpec({ type: "blouse", gender: "female" });
    const after = validateSpec({ type: "dress", gender: "male" });
    const changes = diffSpec(before, after);
    expect(changes).toContainEqual({
      field: "type",
      before: "blouse",
      after: "dress",
    });
    expect(changes).toContainEqual({
      field: "gender",
      before: "female",
      after: "male",
    });
  });

  it("reports measurementOverrides as one entry when any key differs", () => {
    const before = validateSpec({ measurementOverrides: { bust: 90 } });
    const after = validateSpec({ measurementOverrides: { bust: 92 } });
    expect(diffSpec(before, after)).toEqual([
      {
        field: "measurementOverrides",
        before: { bust: 90 },
        after: { bust: 92 },
      },
    ]);
  });

  it("does not report measurementOverrides when the keys and values are identical", () => {
    const before = validateSpec({
      measurementOverrides: { bust: 90, waist: 70 },
    });
    const after = validateSpec({
      measurementOverrides: { waist: 70, bust: 90 },
    });
    expect(diffSpec(before, after)).toEqual([]);
  });

  it("reports a numeric style field change", () => {
    const before = validateSpec({ style: { skirtLengthCm: 60 } });
    const after = validateSpec({ style: { skirtLengthCm: 80 } });
    expect(diffSpec(before, after)).toEqual([
      { field: "skirtLengthCm", before: 60, after: 80 },
    ]);
  });

  // #244: STYLE_FIELDS is a manual keyof-GarmentStyle allowlist -- the same
  // shape that let #267 silently drop collar/cuff/waistband/frontClosure/
  // trouserLengthCm from this diff before they were added here too. Pins
  // that `pleats` was not missed the same way.
  it("reports a pleats style field change", () => {
    const before = validateSpec({
      type: "skirt",
      style: { skirt: "straight", pleats: "none" },
    });
    const after = validateSpec({
      type: "skirt",
      style: { skirt: "straight", pleats: "box" },
    });
    expect(diffSpec(before, after)).toEqual([
      { field: "pleats", before: "none", after: "box" },
    ]);
  });

  it("can report several changed fields at once, in field order", () => {
    const before = validateSpec({ style: { neckline: "V", collar: "none" } });
    const after = validateSpec({
      style: { neckline: "round", collar: "band" },
    });
    expect(diffSpec(before, after)).toEqual([
      { field: "neckline", before: "V", after: "round" },
      { field: "collar", before: "none", after: "band" },
    ]);
  });
});
