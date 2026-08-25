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

  it("caps the result so an unbounded label can't produce an unbounded filename", () => {
    const result = slug("a".repeat(200));
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it("cleans up a trailing dash left by truncation", () => {
    const result = slug(`${"a".repeat(59)}-bbb`);
    expect(result.endsWith("-")).toBe(false);
  });
});
