import { describe, it, expect } from "vitest";
import { toolFor } from "./schema";
import {
  NECKLINES,
  SLEEVES,
  SKIRTS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  FRONT_CLOSURES,
  GENDERS,
  STYLE_LIMITS,
  FIT_CLASSES,
  STRETCH_CLASSES,
  NECKLINE_DEPTH_TOKENS,
  SKIRT_LENGTH_TOKENS,
  SEAM_ALLOWANCE_TOKENS,
  ARMHOLE_DEEPEN_TOKENS,
  TROUSER_LENGTH_TOKENS,
} from "@/lib/draft/garment";
import { MEASUREMENT_RANGES } from "@/lib/measurements";
import { DEFAULT_ENGINE_ID } from "@/lib/draft/engine/capability";
import { getEngine } from "@/lib/draft/engine/registry";

interface Prop {
  enum?: string[];
  minimum?: number;
  maximum?: number;
  properties?: Record<string, Prop>;
}

const TOOL = toolFor(DEFAULT_ENGINE_ID);
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

  // #269: iterates the ACTIVE ENGINE's own declared measurement keys
  // (required+optional), not the whole global MEASUREMENT_RANGES table --
  // MOLDAI_CAPABILITY.measurements deliberately excludes 14 keys no moldai
  // drafter reads (freesewing-only), so asserting against every
  // MEASUREMENT_RANGES entry would fail for those, which is correct: the
  // AI must not be told a moldai-drafted garment can override a field
  // moldai silently ignores.
  it("bounds every measurement override with MEASUREMENT_RANGES", () => {
    const overrides = spec.measurementOverrides.properties!;
    const capability = getEngine(DEFAULT_ENGINE_ID).capability;
    const keys = [
      ...capability.measurements.required,
      ...capability.measurements.optional,
    ];
    for (const k of keys) {
      const r = MEASUREMENT_RANGES[k];
      expect(overrides[k].minimum).toBe(r.min);
      expect(overrides[k].maximum).toBe(r.max);
    }
  });

  // #269: spec.type is the ACTIVE ENGINE's own declared `types`, not the
  // whole app-wide TYPES vocabulary -- moldai's own capability deliberately
  // excludes "hoodie" (no moldai drafter exists for it), so asserting
  // against the full TYPES list would wrongly demand the AI be offered a
  // type moldai can't draft. Same "engine capability, not app vocabulary"
  // precedent the measurement-bounds test above already follows.
  it("enums match the validator's catalogs", () => {
    const capability = getEngine(DEFAULT_ENGINE_ID).capability;
    expect(spec.type.enum).toEqual(capability.types);
    expect(spec.gender.enum).toEqual(GENDERS);
    expect(style.neckline.enum).toEqual(NECKLINES);
    expect(style.sleeve.enum).toEqual(SLEEVES);
    expect(style.skirt.enum).toEqual(SKIRTS);
    expect(style.fit.enum).toEqual(FIT_CLASSES);
    expect(style.stretch.enum).toEqual(STRETCH_CLASSES);
    // #129/#130/#131: the sub-piece enums -- exactly what's actually
    // drafted (plus "none"), never a wider aspirational list the AI could
    // select but validateSpec would silently clamp away.
    expect(style.collar.enum).toEqual(COLLARS);
    expect(style.cuff.enum).toEqual(CUFFS);
    expect(style.waistband.enum).toEqual(WAISTBANDS);
    expect(style.frontClosure.enum).toEqual(FRONT_CLOSURES);
  });

  // #260: the descriptive-token twin of each free numeric style scalar is
  // rendered as a string enum from the SAME exported table validateSpec
  // projects a chosen token through -- never a second, hand-duplicated list.
  it("renders each descriptive-length-token field as a string enum of its table's keys", () => {
    expect(style.necklineDepth.enum).toEqual(
      Object.keys(NECKLINE_DEPTH_TOKENS),
    );
    expect(style.skirtLength.enum).toEqual(Object.keys(SKIRT_LENGTH_TOKENS));
    expect(style.seamAllowance.enum).toEqual(
      Object.keys(SEAM_ALLOWANCE_TOKENS),
    );
    expect(style.armholeDeepen.enum).toEqual(
      Object.keys(ARMHOLE_DEEPEN_TOKENS),
    );
    expect(style.trouserLength.enum).toEqual(
      Object.keys(TROUSER_LENGTH_TOKENS),
    );
  });

  it("offers all four decisions", () => {
    expect(input.properties.decision.enum).toEqual([
      "apply",
      "decline",
      "ask",
      "explain",
    ]);
  });
});
