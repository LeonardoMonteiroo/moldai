import { describe, it, expect } from "vitest";
import { slug } from "./download";

describe("slug (#88)", () => {
  it("lowercases, folds diacritics and collapses non-alphanumerics to a dash", () => {
    expect(slug("Vestido Floral Verão")).toBe("vestido-floral-verao");
  });

  it("turns a combined size label into a filename-safe token", () => {
    expect(slug("38/40")).toBe("38-40");
  });

  it("falls back to a non-empty string when nothing alphanumeric survives", () => {
    expect(slug("///")).toBe("pattern");
  });

  // #85: a CJK-only name has plenty of "letters" to a human but none of them
  // are in [a-z0-9] after NFD-fold, so it hits the exact same `|| "pattern"`
  // fallback as punctuation-only input above -- distinct input, same path,
  // both worth asserting since the bug (an unbounded raw name reaching the
  // filename) could regress either one independently.
  it('falls back to "pattern" for a non-Latin name with nothing ASCII to keep', () => {
    expect(slug("設計圖")).toBe("pattern");
  });

  it("collapses a run of punctuation to a single dash and trims both leading and trailing dashes", () => {
    expect(slug("--Vestido / Floral--")).toBe("vestido-floral");
  });

  it("caps the result so an unbounded label can't produce an unbounded filename", () => {
    const result = slug("a".repeat(200));
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it("cleans up a trailing dash left by truncation", () => {
    const result = slug(`${"a".repeat(59)}-bbb`);
    expect(result.endsWith("-")).toBe(false);
  });
});
