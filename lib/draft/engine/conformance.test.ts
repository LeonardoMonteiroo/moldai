import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ENGINE_IDS, checkEngineSupport } from "./capability";
import { getEngine } from "./registry";
import { walkSeamPairs } from "../seams";
import { DECORATION_CASES } from "../fixtures";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";

// #267: registry-wide conformance guards over the DECORATION_CASES matrix
// every other drafting test file already reuses -- these pin the contract
// lib/draft/engine/types.ts's EngineDraft doc comment states in prose, so a
// future engine (or a regression in "moldai" itself) that violates it fails
// here rather than surfacing as a wrong seam graph or a misaligned graded
// overlay downstream.

function baseRowFor(spec: GarmentSpec) {
  return spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
}

// #269: an engine's `capability.types` may be a strict subset of every
// archetype DECORATION_CASES covers (freesewing declares only "tshirt"
// today) -- checked the same way tshirtBenchmark.test.ts already does,
// via checkEngineSupport's own `type` gap, so an unsupported case is
// skipped rather than failing on a "no design wired" throw that isn't
// this suite's concern. A `spec` this rejects for a REGISTERED-and-
// supported type would still fail loudly (this only skips the type gap).
function supports(engineId: (typeof ENGINE_IDS)[number], spec: GarmentSpec) {
  const capability = getEngine(engineId).capability;
  return !checkEngineSupport(capability, spec, baseRowFor(spec)).some(
    (g) => g.kind === "type",
  );
}

describe("engine conformance", () => {
  for (const engineId of ENGINE_IDS) {
    const engine = getEngine(engineId);

    describe(engineId, () => {
      for (const [label, spec] of DECORATION_CASES) {
        if (!supports(engineId, spec)) continue;

        it(`${label}: every declared seam pair names a piece that was actually drafted`, () => {
          const { drafted, seamPairs } = engine.draft(
            spec,
            baseRowFor(spec),
            t,
          );
          const ids = new Set(drafted.map((p) => p.id));
          for (const pair of seamPairs) {
            for (const ref of [...pair.a, ...pair.b]) {
              expect(ids.has(ref.pieceId)).toBe(true);
            }
          }
        });

        it(`${label}: walkSeamPairs measures every declared pair -- none silently dropped`, () => {
          const { drafted, seamPairs } = engine.draft(
            spec,
            baseRowFor(spec),
            t,
          );
          const graph = walkSeamPairs(drafted, seamPairs);
          expect(graph).toHaveLength(seamPairs.length);
        });

        it(`${label}: every drafted piece has at least 3 finite outline points`, () => {
          const { drafted } = engine.draft(spec, baseRowFor(spec), t);
          for (const piece of drafted) {
            expect(piece.outlineCm.length).toBeGreaterThanOrEqual(3);
            for (const [x, y] of piece.outlineCm) {
              expect(Number.isFinite(x)).toBe(true);
              expect(Number.isFinite(y)).toBe(true);
            }
          }
        });
      }

      // The draftGradedOverlays index-pairing contract (lib/draft/engine/
      // facade.ts): for a FIXED spec, piece order/ids/count must depend
      // only on the spec, never on the measurements row -- draftPiecesCm at
      // one size and at another must line up 1:1 by array index for the
      // graded-overlay alignment to be meaningful at all. Uses whichever
      // DECORATION_CASES spec this engine actually supports (its own first
      // supported case), rather than a hardcoded "blouse" every engine may
      // not draft.
      it("piece id/order/count for a fixed spec depends only on the spec, not the measurements row", () => {
        const spec =
          DECORATION_CASES.map(([, s]) => s).find((s) =>
            supports(engineId, s),
          ) ?? DECORATION_CASES[0][1];
        const rows = [SIZE_TABLE.PP, SIZE_TABLE.M, SIZE_TABLE.GG];
        const idSequences = rows.map((row) =>
          engine.draft(spec, row, t).drafted.map((p) => p.id),
        );
        for (const seq of idSequences.slice(1)) {
          expect(seq).toEqual(idSequences[0]);
        }
      });
    });
  }
});

// #267: the only thing that keeps "no consumer imports garment.ts's five
// functions directly" (acceptance criterion 1) true going forward -- the
// facade/registry/moldai wiring itself is exempt (moldai.ts and facade.ts
// are the sanctioned callers), everything else under app/, components/ and
// lib/ is scanned.
describe("no direct drafter import", () => {
  const FIVE_NAMES = [
    "draftPiecesCm",
    "measureSeams",
    "measureSeamGraph",
    "draftGradedOverlays",
    "draftGarment",
  ];
  const EXEMPT_DIRS = [
    join(process.cwd(), "lib", "draft", "engine"),
    join(process.cwd(), "lib", "draft"), // garment.ts itself, and its own tests
  ];

  function listSourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        listSourceFiles(full, out);
      } else if (
        /\.(ts|tsx)$/.test(entry) &&
        !/\.test\.(ts|tsx)$/.test(entry)
      ) {
        out.push(full);
      }
    }
    return out;
  }

  it("imports garment.ts's five drafting functions from the facade only", () => {
    const roots = ["app", "lib", "components"].map((d) =>
      join(process.cwd(), d),
    );
    const violations: string[] = [];
    // Matches an ES import statement whose source is garment.ts (relative
    // "./garment" or aliased "@/lib/draft/garment"), capturing the
    // specifier list between the braces -- deliberately NOT a whole-file
    // string search, which would false-positive on a doc comment merely
    // naming one of these functions (several files have exactly that,
    // explaining why they DON'T import it any more) or on a type-only
    // import of an unrelated re-export (SeamMeasurement, GradedOverlay).
    const IMPORT_RE =
      /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'](?:@\/lib\/draft\/garment|\.\.?\/(?:\.\.\/)*garment)["']/g;
    for (const root of roots) {
      for (const file of listSourceFiles(root)) {
        // garment.ts itself, lib/draft/engine/* (moldai.ts wraps draftAll;
        // facade.ts is the sanctioned public surface) are the only allowed
        // importers -- everything else is a real consumer.
        if (
          EXEMPT_DIRS.some(
            (d) => file.startsWith(d + "\\") || file.startsWith(d + "/"),
          )
        ) {
          continue;
        }
        const src = readFileSync(file, "utf-8");
        for (const match of src.matchAll(IMPORT_RE)) {
          const specifiers = match[1]
            .split(",")
            .map(
              (s) =>
                s
                  .trim()
                  .replace(/^type\s+/, "")
                  .split(/\s+as\s+/)[0],
            )
            .filter(Boolean);
          for (const name of FIVE_NAMES) {
            if (specifiers.includes(name)) {
              violations.push(`${relative(process.cwd(), file)}: ${name}`);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

// A pattern's own frozen `pattern.engine` must drive every redraft of it --
// the additive-blob precedent lib/types.ts's own Pattern.engine doc comment
// states. Before a second engine existed this was unenforceable (every
// facade call site necessarily read DEFAULT_ENGINE_ID, since there was
// nothing else to read); the moment a second engine is registered, any call
// site that still hardcodes DEFAULT_ENGINE_ID silently redrafts a
// freesewing-engine pattern with moldai instead. This scans for exactly that
// regression: a facade call whose first argument is the DEFAULT_ENGINE_ID
// identifier rather than something derived from the pattern
// (engineFor(pattern.engine) or an already-resolved `engine` variable).
describe("no hardcoded DEFAULT_ENGINE_ID at a facade call site", () => {
  const FIVE_NAMES = [
    "draftPiecesCm",
    "measureSeams",
    "measureSeamGraph",
    "draftGradedOverlays",
    "draftGarment",
  ];
  // app/api/patterns/[id]/generate/route.ts's seedPatternSizeSnapshot call is
  // the one legitimate creation-time use: a brand-new pattern has no frozen
  // engine yet to read, so DEFAULT_ENGINE_ID IS the correct value there --
  // that's a call to seedPatternSizeSnapshot, not to one of the FIVE_NAMES
  // facade functions, so the regex below never matches it anyway.
  const EXEMPT_DIRS = [
    join(process.cwd(), "lib", "draft", "engine"),
    join(process.cwd(), "lib", "draft"),
  ];

  function listSourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        listSourceFiles(full, out);
      } else if (
        /\.(ts|tsx)$/.test(entry) &&
        !/\.test\.(ts|tsx)$/.test(entry)
      ) {
        out.push(full);
      }
    }
    return out;
  }

  it("every facade call site resolves its engine from the pattern, not a hardcoded default", () => {
    const roots = ["app", "lib", "components"].map((d) =>
      join(process.cwd(), d),
    );
    const violations: string[] = [];
    const CALL_RE = new RegExp(
      `\\b(${FIVE_NAMES.join("|")})\\s*\\(\\s*DEFAULT_ENGINE_ID\\b`,
      "g",
    );
    for (const root of roots) {
      for (const file of listSourceFiles(root)) {
        if (
          EXEMPT_DIRS.some(
            (d) => file.startsWith(d + "\\") || file.startsWith(d + "/"),
          )
        ) {
          continue;
        }
        const src = readFileSync(file, "utf-8");
        for (const match of src.matchAll(CALL_RE)) {
          violations.push(`${relative(process.cwd(), file)}: ${match[1]}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

// vocabulary.ts and capability.ts pin their own leaf-ness in their own test
// files (vocabulary.test.ts, capability.test.ts) -- this covers the third
// module the design names, lib/types.ts, which every leaf and every drafter
// alike imports FROM (a dependency the other direction would be circular
// and simply couldn't compile), so this is a structural guarantee rather
// than a live risk. Included for completeness against the same drift the
// other two guard against.
describe("lib/types.ts stays a leaf", () => {
  it("imports nothing from lib/draft", () => {
    const src = readFileSync(join(process.cwd(), "lib", "types.ts"), "utf-8");
    const specifiers = [...src.matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)].map(
      (m) => m[1],
    );
    for (const s of specifiers) {
      expect(s).not.toMatch(/\/draft\//);
      expect(s).not.toMatch(/\/draft$/);
    }
  });
});
