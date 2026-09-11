import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TYPES,
  GENDERS,
  NECKLINES,
  SLEEVES,
  SKIRTS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  FRONT_CLOSURES,
  PLEATS,
  STYLE_LIMITS,
  FIT_CLASSES,
  STRETCH_CLASSES,
  NECKLINE_DEPTH_TOKENS,
  SKIRT_LENGTH_TOKENS,
  SEAM_ALLOWANCE_TOKENS,
  ARMHOLE_DEEPEN_TOKENS,
  TROUSER_LENGTH_TOKENS,
} from "./vocabulary";

// #267: garment.ts re-exports every one of these verbatim -- this pins the
// values themselves so a future edit to either file can't let the two
// silently diverge (the re-export means TypeScript alone can't catch that).
describe("vocabulary re-exported by garment.ts", () => {
  it("matches garment.ts's own re-exported values", async () => {
    const g = await import("./garment");
    expect(g.TYPES).toEqual(TYPES);
    expect(g.GENDERS).toEqual(GENDERS);
    expect(g.NECKLINES).toEqual(NECKLINES);
    expect(g.SLEEVES).toEqual(SLEEVES);
    expect(g.SKIRTS).toEqual(SKIRTS);
    expect(g.COLLARS).toEqual(COLLARS);
    expect(g.CUFFS).toEqual(CUFFS);
    expect(g.WAISTBANDS).toEqual(WAISTBANDS);
    expect(g.FRONT_CLOSURES).toEqual(FRONT_CLOSURES);
    expect(g.PLEATS).toEqual(PLEATS);
    expect(g.STYLE_LIMITS).toEqual(STYLE_LIMITS);
    expect(g.FIT_CLASSES).toEqual(FIT_CLASSES);
    expect(g.STRETCH_CLASSES).toEqual(STRETCH_CLASSES);
    expect(g.NECKLINE_DEPTH_TOKENS).toEqual(NECKLINE_DEPTH_TOKENS);
    expect(g.SKIRT_LENGTH_TOKENS).toEqual(SKIRT_LENGTH_TOKENS);
    expect(g.SEAM_ALLOWANCE_TOKENS).toEqual(SEAM_ALLOWANCE_TOKENS);
    expect(g.ARMHOLE_DEEPEN_TOKENS).toEqual(ARMHOLE_DEEPEN_TOKENS);
    expect(g.TROUSER_LENGTH_TOKENS).toEqual(TROUSER_LENGTH_TOKENS);
  });
});

// The leaf-module property is the whole reason this catalog doesn't live in
// garment.ts: lib/draft/engine/capability.ts (and, transitively, any client
// component reading an engine's declared capability) must not pull the
// whole drafting engine into its bundle. A stray import would not fail any
// behavior test, so pin it on the source itself -- the
// formFields.test.ts precedent.
describe("module boundary", () => {
  it("imports nothing from garment.ts or any drafter", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/draft/vocabulary.ts"),
      "utf-8",
    );
    const specifiers = [...src.matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)].map(
      (m) => m[1],
    );
    expect(specifiers.sort()).toEqual(["./ease", "@/lib/types"].sort());
  });
});
