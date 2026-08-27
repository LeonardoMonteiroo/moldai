import { describe, it, expect } from "vitest";
import { buildSystemSizeChart, buildSystemSizeChartData } from "./seed";
import { buildSizeTable, resolveSizeChartSize } from "./compute";
import {
  CORE_MEASUREMENT_KEYS,
  EXTENDED_MEASUREMENT_KEYS,
  MEASUREMENT_RANGES,
  SIZE_TABLE,
  SIZE_TABLE_MALE,
} from "@/lib/measurements";
import type { Translate } from "@/lib/i18n/translate";

const SIZES = ["PP", "P", "M", "G", "GG"] as const;

describe("buildSystemSizeChart", () => {
  // #132: exact reproduction is only claimed for the original nine keys —
  // SIZE_TABLE/SIZE_TABLE_MALE themselves carry only those nine (see their
  // own comment in lib/measurements.ts for why the six new fields
  // deliberately don't live there), so a straight `toEqual` against a
  // SIZE_TABLE row would fail on the resolved table's extra keys alone.
  it("female chart's resolved size table exactly reproduces SIZE_TABLE for the original nine keys", () => {
    const table = buildSizeTable(buildSystemSizeChart("female"));
    for (const size of SIZES) {
      for (const key of CORE_MEASUREMENT_KEYS) {
        expect(table[size][key]).toBe(SIZE_TABLE[size][key]);
      }
    }
  });

  it("male chart's resolved size table exactly reproduces SIZE_TABLE_MALE for the original nine keys", () => {
    const table = buildSizeTable(buildSystemSizeChart("male"));
    for (const size of SIZES) {
      for (const key of CORE_MEASUREMENT_KEYS) {
        expect(table[size][key]).toBe(SIZE_TABLE_MALE[size][key]);
      }
    }
  });

  // #132: the six new fields aren't stored on SIZE_TABLE, but every seeded
  // chart still resolves a finite, in-range value for every size — a chart
  // this feature ships to every account, old and new, should never present
  // a blank/undefined cell for one of its own headline fields.
  it.each(["female", "male"] as const)(
    "#132: %s chart's resolved size table has every extended field, in range, at every size",
    (gender) => {
      const table = buildSizeTable(buildSystemSizeChart(gender));
      for (const size of SIZES) {
        for (const key of EXTENDED_MEASUREMENT_KEYS) {
          const value = table[size][key];
          expect(value, `${gender}/${size}/${key}`).toBeTypeOf("number");
          expect(Number.isFinite(value)).toBe(true);
          const range = MEASUREMENT_RANGES[key];
          expect(value).toBeGreaterThanOrEqual(range.min);
          expect(value).toBeLessThanOrEqual(range.max);
        }
      }
    },
  );

  it("marks the seeded chart as isSystem with the base size at index 2 (M)", () => {
    const chart = buildSystemSizeChart("female");
    expect(chart.isSystem).toBe(true);
    expect(chart.sizes[chart.baseSizeIndex]).toBe("M");
  });

  // #3: buildSystemSizeChart is the split-out, name-free core -- seedPattern
  // (lib/editor/state.ts) builds a chart from it without ever holding a
  // SizeCharts-scoped translator. If a `name` key ever crept back in, that
  // caller's PatternData-scoped `t` would silently discard it (or, if it
  // read it, would resolve the wrong namespace) -- this keeps the name-free
  // shape a compile-time guarantee, not just an unreachable-in-practice one.
  it("carries no name field", () => {
    expect("name" in buildSystemSizeChart("female")).toBe(false);
  });

  it.each(["female", "male"] as const)(
    "#118: %s chart's progression rule grades every original CORE measurement key, none left at 0",
    (gender) => {
      const chart = buildSystemSizeChart(gender);
      for (const key of CORE_MEASUREMENT_KEYS) {
        expect(chart.progressionRule[key]).not.toBe(0);
      }
    },
  );

  // #132: five of the six EXTENDED keys are bust-derived proportions, so
  // they grade along with bust exactly like the CORE keys above.
  // shoulderSlope is the one deliberate exception -- body.ts's own fallback
  // is a flat per-gender constant, not a bust-scaled proportion, so grading
  // it here would fabricate a precision the underlying model doesn't have.
  // 0 is what a legitimately non-graded field's progression looks like (the
  // same "0 is a meaningful rule value" principle CLAUDE.md already applies
  // to a user's own progression-rule edits).
  it.each(["female", "male"] as const)(
    "#132: %s chart grades every EXTENDED key except the size-invariant shoulderSlope",
    (gender) => {
      const chart = buildSystemSizeChart(gender);
      for (const key of EXTENDED_MEASUREMENT_KEYS) {
        if (key === "shoulderSlope") {
          expect(chart.progressionRule[key]).toBe(0);
        } else {
          expect(chart.progressionRule[key]).not.toBe(0);
        }
      }
    },
  );

  // Locks in the specific formula-reproducing relationships documented on
  // extendedMeasurementsFor (seed.ts) -- a regression here means a system
  // chart no longer drafts what the fallback proportion draws today.
  // backWidth is deliberately excluded: it is NOT a fallback-reproducing
  // value (see extendedMeasurementsFor's own note) -- it seeds a realistic
  // across-back proportion instead, checked separately below.
  it.each(["female", "male"] as const)(
    "%s chart's extended base values reproduce today's hardcoded proportions",
    (gender) => {
      const chart = buildSystemSizeChart(gender);
      const base = resolveSizeChartSize(
        chart,
        chart.sizes[chart.baseSizeIndex],
      );
      const bust = base.bust;
      expect(base.neckGirth).toBeCloseTo((bust * 3) / 7, 9);
      expect(base.highBust).toBe(bust);
      expect(base.shoulderSlope).toBe(gender === "male" ? 4.5 : 4.0);
      expect(base.bicep).toBeCloseTo(bust * 0.3, 9);
    },
  );

  // #132 (post-review fix): backWidth seeds a REAL across-back proportion
  // (bust*0.4, matching the guide text's "measure armpit to armpit across
  // the back" -- ~36-38cm at a 92cm bust), not one chosen to cancel out in
  // body.ts's formula the way the other four (bust-derived) extended fields
  // are. This means populating the system charts' backWidth is a genuine
  // (small, more anatomically accurate) geometry change for a brand-new
  // account's default draft, unlike those four -- rise (#128) is the other
  // field that isn't a fallback-reproducing value either, but for a
  // different reason (see extendedMeasurementsFor's own note in seed.ts).
  it.each(["female", "male"] as const)(
    "%s chart's backWidth is a realistic across-back proportion, not bust/2",
    (gender) => {
      const chart = buildSystemSizeChart(gender);
      const base = resolveSizeChartSize(
        chart,
        chart.sizes[chart.baseSizeIndex],
      );
      expect(base.backWidth).toBeCloseTo(base.bust * 0.4, 9);
      expect(base.backWidth).not.toBeCloseTo(base.bust / 2, 1);
    },
  );
});

// #3/#133: the name used to be a hardcoded literal ("Feminino adulto · ABNT"
// / "Masculino adulto"); it now resolves through an injected Translate from
// SizeCharts.systemChartName.<gender>. Asserted against a fake deliberately
// unlike the real catalog (mirroring lib/db/sizeChart.test.ts's SUFFIX
// precedent) so this proves the name is threaded through from the caller,
// not restating whatever the real catalog happens to say today -- the real
// catalog value is covered separately by lib/i18n/sizeChartsSeed.test.ts,
// the only test that can catch a missing/misspelled key (an echo translator
// like this fake, or next-intl's own missing-key fallback, both "pass"
// whether or not the key actually exists).
describe("buildSystemSizeChartData", () => {
  const fake: Translate = (key) => "NAME:" + key;

  it("takes the female chart's name from the injected translator", () => {
    expect(buildSystemSizeChartData("female", fake).name).toBe(
      "NAME:systemChartName.female",
    );
  });

  it("takes the male chart's name from the injected translator", () => {
    expect(buildSystemSizeChartData("male", fake).name).toBe(
      "NAME:systemChartName.male",
    );
  });

  it("names the female and male charts distinctly", () => {
    expect(buildSystemSizeChartData("female", fake).name).not.toBe(
      buildSystemSizeChartData("male", fake).name,
    );
  });

  it("otherwise carries the same data as the name-free core", () => {
    const { name: _name, ...rest } = buildSystemSizeChartData("female", fake);
    expect(rest).toEqual(buildSystemSizeChart("female"));
  });
});
