import { describe, it, expect } from "vitest";
import { buildSystemSizeChart, buildSystemSizeChartData } from "./seed";
import { buildSizeTable } from "./compute";
import {
  MEASUREMENT_KEYS,
  SIZE_TABLE,
  SIZE_TABLE_MALE,
} from "@/lib/measurements";
import type { Translate } from "@/lib/i18n/translate";

const SIZES = ["PP", "P", "M", "G", "GG"] as const;

describe("buildSystemSizeChart", () => {
  it("female chart's resolved size table exactly reproduces SIZE_TABLE", () => {
    const table = buildSizeTable(buildSystemSizeChart("female"));
    for (const size of SIZES) {
      expect(table[size]).toEqual(SIZE_TABLE[size]);
    }
  });

  it("male chart's resolved size table exactly reproduces SIZE_TABLE_MALE", () => {
    const table = buildSizeTable(buildSystemSizeChart("male"));
    for (const size of SIZES) {
      expect(table[size]).toEqual(SIZE_TABLE_MALE[size]);
    }
  });

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
    "#118: %s chart's progression rule grades all nine measurement keys, none left at 0",
    (gender) => {
      const chart = buildSystemSizeChart(gender);
      for (const key of MEASUREMENT_KEYS) {
        expect(chart.progressionRule[key]).not.toBe(0);
      }
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
