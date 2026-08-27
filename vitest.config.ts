import { defineConfig, coverageConfigDefaults } from "vitest/config";

// #75: under Vitest 2, `coverage` is a ROOT-level option only -- a
// `test.coverage` block inside one of vitest.workspace.ts's project entries
// is silently ignored. This file exists solely to hold that block; the two
// projects themselves (node/dom) stay defined in vitest.workspace.ts. One
// coverage report merges both projects, which is what we want -- it is not
// split per project. In CI the two projects run as separate parallel jobs
// and their blob reports are merged back into one report before these
// thresholds are applied (.github/workflows/ci.yml's `coverage` job), so
// the number gated on is the same one a local `npx vitest run --coverage`
// prints.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],

      // Only first-party application source is measured. Restricting
      // `include` (rather than listing more excludes) is what keeps the
      // denominator honest and stable: without it, `all: true` walks the
      // whole working tree, so a gitignored local directory that exists on
      // a developer's machine but never in CI silently changes the
      // percentage. Measured on this tree: /ds-bundle and /.ds-sync (both
      // gitignored design-sync artifacts) contributed 44,864 statements --
      // more than the entire application -- and dragged a real 85.87%
      // statement coverage down to a reported 38.44%. The three directories
      // below are the same set `npm run lint` scans.
      include: ["app/**", "lib/**", "components/**"],

      exclude: [
        // `exclude` REPLACES Vitest's defaults rather than extending them,
        // and dropping them was a live measurement bug: `**/*.test.*` is a
        // default, so every test file in the repo was being counted as
        // covered application source. Test files are ~100% executed by
        // construction, so they inflated the report by ~8 points of
        // statement coverage (93.73% with them in, 85.87% with them out) --
        // the thresholds below looked like a real bar while sitting well
        // under the true number.
        ...coverageConfigDefaults.exclude,

        // shadcn primitives: vendored, retuned but not authored here.
        "components/ui/**",
        // Next.js layout shells -- markup and provider wiring, no logic.
        "app/**/layout.tsx",
        // Test-only modules that live beside the source they support:
        // `lib/draft/fixtures.ts` is the shared DECORATION_CASES matrix and
        // `components/test-utils.tsx` is the renderWithIntl wrapper.
        "lib/draft/fixtures.ts",
        "components/test-utils.tsx",
      ],

      // A ratchet, not an aspiration -- but a much tighter one than before,
      // because the measurement underneath it is now honest. Baseline on
      // this tree (`npx vitest run --coverage`, both projects):
      // statements 85.87%, branches 90.13%, functions 78.55%, lines 85.87%.
      // Each threshold sits a fraction of a point under its measured value,
      // so an ordinary rounding fluctuation passes while a real drop -- a
      // deleted test, a large unreached new branch, a whole new screen
      // shipped untested -- fails the `coverage` job. Raising a threshold
      // after coverage genuinely improves is the intended way to use this:
      // move the floor up, never down.
      thresholds: {
        statements: 85,
        branches: 89.5,
        functions: 78,
        lines: 85,
      },
    },
  },
});
