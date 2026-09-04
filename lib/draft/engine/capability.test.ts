import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENGINE_IDS,
  isEngineId,
  DEFAULT_ENGINE_ID,
  MOLDAI_CAPABILITY,
  checkEngineSupport,
} from "./capability";
import {
  TYPES,
  NECKLINES,
  SLEEVES,
  SKIRTS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  FRONT_CLOSURES,
  FIT_CLASSES,
  STRETCH_CLASSES,
  STYLE_LIMITS,
} from "@/lib/draft/vocabulary";
import { MEASUREMENT_KEYS } from "@/lib/measurements";
import { SIZE_TABLE } from "@/lib/measurements";
import type { GarmentSpec } from "@/lib/types";

describe("isEngineId", () => {
  it("accepts every registered engine id", () => {
    for (const id of ENGINE_IDS) expect(isEngineId(id)).toBe(true);
  });

  // #269: "freesewing" moved from "the unrecognised example" to a real,
  // registered engine id -- "garmentcode" replaces it here (#269's own
  // decision log declined registering it, so it names something this app
  // genuinely does not recognise, the same role "freesewing" used to play).
  it("rejects an unrecognised value -- the isPurchaseType precedent", () => {
    expect(isEngineId("garmentcode")).toBe(false);
    expect(isEngineId(undefined)).toBe(false);
    expect(isEngineId(null)).toBe(false);
    expect(isEngineId(42)).toBe(false);
  });
});

describe("DEFAULT_ENGINE_ID", () => {
  it("is a registered engine id", () => {
    expect(isEngineId(DEFAULT_ENGINE_ID)).toBe(true);
  });
});

// The safety net for keeping validateSpec app-level (lib/draft/garment.ts)
// rather than engine-parameterized: every registered engine's declared
// capability must be a subset of the app-level vocabulary, or validateSpec
// could hand a legitimate app-level value to an engine whose own capability
// disagrees with the very trust boundary that produced it.
describe("every registered engine's capability is a subset of the app-level vocabulary", () => {
  const capabilities = [MOLDAI_CAPABILITY];

  for (const cap of capabilities) {
    describe(cap.id, () => {
      it("types ⊆ TYPES", () => {
        for (const t of cap.types) expect(TYPES).toContain(t);
      });

      it("every measurement key ∈ MEASUREMENT_KEYS", () => {
        for (const k of [
          ...cap.measurements.required,
          ...cap.measurements.optional,
        ]) {
          expect(MEASUREMENT_KEYS).toContain(k);
        }
      });

      it("every style enum ⊆ its app-level list", () => {
        for (const v of cap.styleEnums.neckline) expect(NECKLINES).toContain(v);
        for (const v of cap.styleEnums.sleeve) expect(SLEEVES).toContain(v);
        for (const v of cap.styleEnums.skirt) expect(SKIRTS).toContain(v);
        for (const v of cap.styleEnums.collar) expect(COLLARS).toContain(v);
        for (const v of cap.styleEnums.cuff) expect(CUFFS).toContain(v);
        for (const v of cap.styleEnums.waistband)
          expect(WAISTBANDS).toContain(v);
        for (const v of cap.styleEnums.frontClosure)
          expect(FRONT_CLOSURES).toContain(v);
        for (const v of cap.styleEnums.fit) expect(FIT_CLASSES).toContain(v);
        for (const v of cap.styleEnums.stretch)
          expect(STRETCH_CLASSES).toContain(v);
      });

      it("every numeric limit range ⊆ the matching app-level STYLE_LIMITS range", () => {
        for (const key of Object.keys(
          cap.styleLimits,
        ) as (keyof typeof STYLE_LIMITS)[]) {
          const appRange = STYLE_LIMITS[key];
          const engineRange = cap.styleLimits[key];
          expect(engineRange.min).toBeGreaterThanOrEqual(appRange.min);
          expect(engineRange.max).toBeLessThanOrEqual(appRange.max);
        }
      });

      it("every declared style field, for every declared type, is a real GarmentStyle key", () => {
        for (const type of cap.types) {
          expect(cap.styleFieldsByType[type]).toBeDefined();
        }
      });
    });
  }
});

// The leaf-module property is why capability.ts doesn't live in garment.ts:
// a client component reading an engine's capability (NewPatternForm) must
// not pull the whole drafting engine into its bundle. A stray import
// wouldn't fail any behavior test, so pin it on the source itself -- the
// lib/draft/formFields.ts/vocabulary.ts precedent.
describe("module boundary", () => {
  it("imports nothing from garment.ts or any drafter", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/draft/engine/capability.ts"),
      "utf-8",
    );
    const specifiers = [...src.matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)].map(
      (m) => m[1],
    );
    for (const s of specifiers) {
      expect(s).not.toMatch(/\/garment$/);
      expect(s).not.toMatch(/\/(body|sleeve|skirt|trousers|subpieces)$/);
    }
  });
});

describe("checkEngineSupport", () => {
  const base = SIZE_TABLE.M;

  function spec(overrides: Partial<GarmentSpec> = {}): GarmentSpec {
    return {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {},
      ...overrides,
    };
  }

  it("returns [] for a fully supported spec", () => {
    expect(
      checkEngineSupport(
        MOLDAI_CAPABILITY,
        spec({ style: { neckline: "round", collar: "band" } }),
        base,
      ),
    ).toEqual([]);
  });

  it("reports an unsupported type and nothing else", () => {
    const gaps = checkEngineSupport(
      MOLDAI_CAPABILITY,
      spec({ type: "unicorn-cape" as never }),
      base,
    );
    expect(gaps).toEqual([{ kind: "type", type: "unicorn-cape" }]);
  });

  it("reports every missing required measurement as one grouped gap", () => {
    const gaps = checkEngineSupport(MOLDAI_CAPABILITY, spec(), {
      ...base,
      bust: NaN,
      waist: undefined as unknown as number,
    });
    expect(gaps).toEqual([
      {
        kind: "measurements",
        missing: expect.arrayContaining(["bust", "waist"]),
      },
    ]);
  });

  it("reports an unsupported style field for the given type", () => {
    // trousers has no `collar` field at all
    const gaps = checkEngineSupport(
      MOLDAI_CAPABILITY,
      spec({ type: "trousers", style: { collar: "band" } }),
      base,
    );
    expect(gaps).toEqual([{ kind: "styleField", field: "collar" }]);
  });

  it("reports an out-of-capability enum value for a supported field", () => {
    const narrowed = {
      ...MOLDAI_CAPABILITY,
      styleEnums: {
        ...MOLDAI_CAPABILITY.styleEnums,
        collar: ["none"] as const,
      },
    };
    const gaps = checkEngineSupport(
      narrowed,
      spec({ style: { collar: "band" } }),
      base,
    );
    expect(gaps).toEqual([
      { kind: "styleValue", field: "collar", value: "band" },
    ]);
  });

  it("reports an out-of-range numeric limit for a supported field", () => {
    const narrowed = {
      ...MOLDAI_CAPABILITY,
      styleLimits: {
        ...MOLDAI_CAPABILITY.styleLimits,
        armholeDeepenCm: { min: 0, max: 2 },
      },
    };
    const gaps = checkEngineSupport(
      narrowed,
      spec({ style: { armholeDeepenCm: 5 } }),
      base,
    );
    expect(gaps).toEqual([
      {
        kind: "styleLimit",
        field: "armholeDeepenCm",
        range: { min: 0, max: 2 },
      },
    ]);
  });

  it("never mutates the spec it's given", () => {
    const s = spec({ style: { collar: "band" } });
    const before = JSON.parse(JSON.stringify(s));
    checkEngineSupport(MOLDAI_CAPABILITY, s, base);
    expect(s).toEqual(before);
  });

  it("ignores sleeveRefit -- internal, never a reportable gap", () => {
    const gaps = checkEngineSupport(
      MOLDAI_CAPABILITY,
      spec({ type: "trousers", style: { sleeveRefit: true } }),
      base,
    );
    expect(gaps).toEqual([]);
  });
});
