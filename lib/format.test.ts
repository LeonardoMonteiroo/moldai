import { describe, it, expect } from "vitest";
import {
  relativeTime,
  formatList,
  initialsFromEmail,
  formatCm,
} from "./format";

// A fake translator that echoes the key and its values, so these tests assert
// the seam (which key, which interpolation) and never a pt-BR string.
const t = (key: string, values?: Record<string, unknown>) => {
  // dateLocale must echo a VALID BCP-47 tag: toLocaleDateString throws
  // RangeError on an invalid one, which would error the test rather than fail it.
  if (key === "dateLocale") return "en-US";
  return values ? `${key}:${JSON.stringify(values)}` : key;
};

describe("relativeTime", () => {
  const now = new Date("2026-08-21T12:00:00Z");

  it("emits the now key under a minute", () => {
    expect(relativeTime(t, "2026-08-21T11:59:30Z", now)).toBe("relativeNow");
  });

  it("emits minutes with an n value", () => {
    expect(relativeTime(t, "2026-08-21T11:45:00Z", now)).toBe(
      'relativeMinutes:{"n":15}',
    );
  });

  it("emits hours with an n value", () => {
    expect(relativeTime(t, "2026-08-21T09:00:00Z", now)).toBe(
      'relativeHours:{"n":3}',
    );
  });

  it("emits days with an n value", () => {
    expect(relativeTime(t, "2026-08-19T12:00:00Z", now)).toBe(
      'relativeDays:{"n":2}',
    );
  });

  it("falls back to a locale date past a week, using the catalog locale", () => {
    const out = relativeTime(t, "2026-07-01T12:00:00Z", now);
    expect(out).not.toContain("relative");
    // Pins that the tag came from t("dateLocale"): a hardcoded "pt-BR" in the
    // implementation yields "01/07/2026", not the en-US "7/1/2026".
    expect(out).toBe(
      new Date("2026-07-01T12:00:00Z").toLocaleDateString("en-US"),
    );
  });
});

describe("formatList", () => {
  it("returns a lone item unchanged", () => {
    expect(formatList(t, ["P"])).toBe("P");
  });

  it("returns an empty string for no items", () => {
    expect(formatList(t, [])).toBe("");
  });

  it("joins two items with the catalog conjunction", () => {
    expect(formatList(t, ["P", "M"])).toBe("PlistConjunctionM");
  });

  it("comma-separates all but the last, then uses the conjunction", () => {
    expect(formatList(t, ["P", "M", "G"])).toBe("P, MlistConjunctionG");
  });
});

describe("initialsFromEmail", () => {
  it("takes the first two letters of the local part", () => {
    expect(initialsFromEmail("leonardo@moldai.dev")).toBe("LE");
  });
});

// #107: six independent local copies of `.toFixed(1).replace(".", ",")` had
// drifted across drafters, canvas overlays and detail panels -- one of them
// (components/editor/MeasureLayer.tsx) was missing the comma replace
// entirely, rendering "12.3 cm" in a pt-BR interface.
describe("formatCm", () => {
  it("formats one decimal place with a pt-BR comma", () => {
    expect(formatCm(4.1)).toBe("4,1");
  });

  it("keeps a trailing .0 rather than dropping it", () => {
    expect(formatCm(4)).toBe("4,0");
  });

  it("rounds to one decimal place", () => {
    expect(formatCm(4.15)).toBe("4,2");
  });
});
