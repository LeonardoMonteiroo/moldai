import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The landing-page-design skill's Part B, enforced against the source rather
// than the rendered DOM.
//
// This REPLACES the old "LandingPage spacing (redesign reference)" block,
// which pinned one-off pixel values out of docs/design/screens/*.dc.html
// (pt-[60px], gap-[34px], pb-[34px] ...). Those assertions could only ever
// catch a change to the one element they named. These check the RULE across
// every file on the marketing surface, so a new section is covered the day
// it is written instead of needing its own hand-written pin.
//
// Reading the source is deliberate. A rendered-DOM check cannot tell a class
// this surface wrote from one that arrived inside a shared components/ui
// primitive, and the shared primitives are shared with the authenticated
// app -- they keep the app's own scale on purpose and are not this rule's
// target.

const ROOTS = ["components/landing", "components/pricing", "components/legal"];

/** B2's spacing table, as the Tailwind step that produces each value. */
const SPACING_STEPS = new Map<string, number>([
  ["0", 0],
  ["0.5", 2],
  ["1", 4],
  ["2", 8],
  ["3", 12],
  ["4", 16],
  ["6", 24],
  ["8", 32],
  ["10", 40],
  ["12", 48],
  ["16", 64],
  ["20", 80],
  ["24", 96],
]);

/** The project's own named type scale -- the app's system, not this one. */
const APP_TEXT_TOKENS = [
  "tick",
  "meta",
  "ui",
  "control",
  "body",
  "title",
  "display",
  "hero",
];

function sourceFiles(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  for (const root of ROOTS) {
    let names: string[];
    try {
      names = readdirSync(join(process.cwd(), root));
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".tsx") && !name.endsWith(".ts")) continue;
      if (name.includes(".test.")) continue;
      out.push({
        rel: `${root}/${name}`,
        // Comments explain the rules and quote the very values the rules
        // forbid, so they would produce nothing but false positives.
        text: stripComments(
          readFileSync(join(process.cwd(), root, name), "utf8"),
        ),
      });
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const SPACING_RE =
  /(?:^|[\s"'`{])(?:[a-z-]+:)*((?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy])-(\[[^\]]+\]|[\d.]+))/g;

describe("marketing surface · Part B design system", () => {
  const files = sourceFiles();

  it("covers the whole marketing surface", () => {
    // A guard on the guard: if a rename ever empties ROOTS, every assertion
    // below would pass vacuously.
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  // B2: "Only these values. Nothing between them, nothing outside them."
  it("uses only B2's spacing values", () => {
    const offenders: string[] = [];
    for (const { rel, text } of files) {
      for (const match of text.matchAll(SPACING_RE)) {
        const util = match[1];
        const value = match[2];
        if (value.startsWith("[")) {
          offenders.push(`${rel}: ${util} (arbitrary spacing)`);
          continue;
        }
        if (!SPACING_STEPS.has(value)) {
          offenders.push(`${rel}: ${util} (not on B2's table)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // B1: every font size lands on Tailwind's default scale. That means no
  // arbitrary text-[Npx] AND no reach into the app's named --text-* scale,
  // which is the other type system in this repo.
  it("sizes type only on Tailwind's default scale", () => {
    const offenders: string[] = [];
    for (const { rel, text } of files) {
      for (const match of text.matchAll(/(?:^|[\s"'`{])text-\[([^\]]+)\]/g)) {
        offenders.push(`${rel}: text-[${match[1]}]`);
      }
      for (const token of APP_TEXT_TOKENS) {
        const re = new RegExp(`(?:^|[\\s"'\`{])text-${token}(?![\\w-])`, "g");
        for (const _ of text.matchAll(re)) {
          offenders.push(`${rel}: text-${token} (app scale, not Tailwind's)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // B1: one typeface per site. font-display is the app's Bricolage token;
  // reaching for it here would put a second family on this surface.
  it("uses one typeface, never the app's display font", () => {
    const offenders = files
      .filter(({ text }) => /(?:^|[\s"'`{])font-display(?![\w-])/.test(text))
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  // B4: "Never use gradients in backgrounds." The single permitted gradient
  // is B5's, on the hero heading TEXT, which is why it is a named class
  // (.marketing-hero-title) rather than a bg-* utility.
  it("never puts a gradient in a background", () => {
    const offenders = files
      .filter(({ text }) => /\b(bg-gradient-|bg-linear-|bg-radial)/.test(text))
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  // B7: "Never use window.addEventListener('scroll')" -- it reflows
  // continuously and is what kills the page on mobile. Reveals go through
  // IntersectionObserver.
  it("never drives motion from a scroll listener", () => {
    const offenders = files
      .filter(({ text }) => /addEventListener\(\s*["']scroll["']/.test(text))
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  // B7: no default transitions -- every one carries the fluid curve.
  it("gives every transition the B7 easing curve", () => {
    const offenders: string[] = [];
    for (const { rel, text } of files) {
      const hasTransition = /(?:^|[\s"'`{])transition-/.test(text);
      const hasEase = /ease-\[cubic-bezier\(0\.32,\s*0\.72,\s*0,\s*1\)\]/.test(
        text,
      );
      if (hasTransition && !hasEase) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
