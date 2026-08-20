import { describe, it, expect } from "vitest";
import { TOOL } from "./schema";
import {
  NECKLINES,
  SLEEVES,
  SKIRTS,
  TYPES,
  GENDERS,
  STYLE_LIMITS,
} from "@/lib/draft/garment";
import { MEASUREMENT_RANGES } from "@/lib/measurements";

interface Prop {
  enum?: string[];
  minimum?: number;
  maximum?: number;
  properties?: Record<string, Prop>;
}

const input = TOOL.input_schema as unknown as {
  properties: Record<string, Prop>;
};
const spec = input.properties.spec.properties!;
const style = spec.style.properties!;

describe("propose_garment tool schema", () => {
  it("bounds every numeric style field with STYLE_LIMITS", () => {
    for (const k of Object.keys(
      STYLE_LIMITS,
    ) as (keyof typeof STYLE_LIMITS)[]) {
      expect(style[k].minimum).toBe(STYLE_LIMITS[k].min);
      expect(style[k].maximum).toBe(STYLE_LIMITS[k].max);
    }
  });

  it("bounds every measurement override with MEASUREMENT_RANGES", () => {
    const overrides = spec.measurementOverrides.properties!;
    for (const [k, r] of Object.entries(MEASUREMENT_RANGES)) {
      expect(overrides[k].minimum).toBe(r.min);
      expect(overrides[k].maximum).toBe(r.max);
    }
  });

  it("enums match the validator's catalogs", () => {
    expect(spec.type.enum).toEqual(TYPES);
    expect(spec.gender.enum).toEqual(GENDERS);
    expect(style.neckline.enum).toEqual(NECKLINES);
    expect(style.sleeve.enum).toEqual(SLEEVES);
    expect(style.skirt.enum).toEqual(SKIRTS);
  });
});
