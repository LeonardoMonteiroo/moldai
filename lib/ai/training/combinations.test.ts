import { describe, it, expect } from "vitest";
import {
  enumerateApplyCombinations,
  coverageReport,
  specPayloadFor,
  DECLINE_CASES,
} from "./combinations";
import { draftsCleanly } from "./verify";
import { validateSpec } from "@/lib/draft/garment";
import { DEFAULT_ENGINE_ID } from "@/lib/draft/engine/capability";
import { getEngine } from "@/lib/draft/engine/registry";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import type { Gender } from "@/lib/types";

// #269 Fase 5 (dataset): combinations.ts is a leaf and cannot itself call
// draftSucceeds (that would pull the whole drafting engine into a pure-data
// enumerator) -- this is where the "every enumerated spec is provably
// in-scope" guarantee the design calls for is actually checked, doubling as
// a real capability regression test: if a future MOLDAI_CAPABILITY change
// ever makes one of these combinations stop drafting, this fails here,
// before scripts/generate-training-data.ts would otherwise silently filter
// it out at runtime.

const capability = getEngine(DEFAULT_ENGINE_ID).capability;

function baseRowFor(gender: Gender) {
  return gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
}

describe("enumerateApplyCombinations", () => {
  const combos = enumerateApplyCombinations(capability);

  it("produces at least one combination per moldai type", () => {
    const types = new Set(combos.map((c) => c.type));
    for (const type of capability.types) {
      expect(types.has(type)).toBe(true);
    }
  });

  it("every (type, field, value) triple is covered at least twice", () => {
    const report = coverageReport(capability, combos);
    expect(report.underCovered).toEqual([]);
  });

  it("every enumerated combination drafts cleanly", () => {
    const failures: string[] = [];
    for (const combo of combos) {
      const spec = validateSpec(specPayloadFor(combo));
      const ok = draftsCleanly(
        DEFAULT_ENGINE_ID,
        capability,
        combo,
        spec,
        baseRowFor(combo.gender),
        t,
      );
      if (!ok) failures.push(combo.key);
    }
    expect(failures).toEqual([]);
  });

  it("respects the cuff-needs-long-sleeve legality rule", () => {
    for (const combo of combos) {
      if (combo.fields.cuff === "straight") {
        expect(combo.fields.sleeve).toBe("long");
      }
    }
  });

  it("never invents a field a type doesn't support", () => {
    for (const combo of combos) {
      const supported = new Set(capability.styleFieldsByType[combo.type]);
      for (const field of Object.keys(combo.fields)) {
        expect(supported.has(field as never)).toBe(true);
      }
    }
  });

  it("arity is always 1-4 and matches the fields actually set", () => {
    for (const combo of combos) {
      const fieldCount = Object.keys(combo.fields).length;
      expect(combo.arity).toBe(fieldCount);
      expect(combo.arity).toBeGreaterThanOrEqual(1);
      expect(combo.arity).toBeLessThanOrEqual(4);
    }
  });

  it("is deterministic for a given seed", () => {
    const again = enumerateApplyCombinations(capability, { seed: 269 });
    expect(again.map((c) => c.key)).toEqual(combos.map((c) => c.key));
  });
});

describe("DECLINE_CASES", () => {
  it("never names a garment type MOLDAI_CAPABILITY actually supports", () => {
    for (const decline of DECLINE_CASES) {
      if (decline.type !== null) {
        // A decline case whose `type` IS supported must be about a
        // shape/silhouette gap on that type, never the type itself.
        expect(capability.types.includes(decline.type)).toBe(true);
      }
    }
  });

  it("every key is unique", () => {
    const keys = DECLINE_CASES.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
