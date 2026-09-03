import { describe, it, expect } from "vitest";
import { OG_COLORS, OG_SIZE } from "./og";

// This module exists because an ImageResponse is rendered by satori, outside
// the browser and outside the stylesheet, so a var(--color-*) there resolves
// to nothing and the card comes out transparent. Two things about it are
// worth pinning.
describe("lib/brand/og", () => {
  // 1200x630 is what every social platform crops from; getting it wrong ships
  // a card that is silently letterboxed or cropped, and nothing else in the
  // build would notice.
  it("is the size social platforms crop from", () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });
  });

  // 2. Every value has to be a literal satori can parse. A var() or a token
  // name slipping in here is exactly the failure this module was created to
  // avoid, and it would render as "no colour" rather than as an error.
  it("holds only literal hex colours, never a CSS variable", () => {
    for (const [name, value] of Object.entries(OG_COLORS)) {
      expect(value, `${name} must be a literal hex colour`).toMatch(
        /^#[0-9a-f]{6}$/,
      );
    }
  });
});
