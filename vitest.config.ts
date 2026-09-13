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
        // #168 recorded a decision for `app/**/page.tsx`, and it is TESTED,
        // not excluded -- so there is deliberately no entry for it here.
        // Those shells looked like markup-only wiring (which is why they sat
        // at 0%), but they are where a page render's authorization actually
        // lives: each re-checks the session, most re-check that the account
        // still exists (#62), and the pattern-scoped ones re-check ownership
        // -- none of which `requireUser()` covers, since that guards API
        // routes only. `app/page-guards.test.tsx` asserts that as one
        // property over one table (so a new screen shipped without its guard
        // is a missing row rather than an undetected hole),
        // `app/auth-pages.test.tsx` covers the four centered-card shells and
        // their token/metadata branching, and `app/planos/page.test.tsx`
        // predates both.
        // Test-only modules that live beside the source they support:
        // `lib/draft/fixtures.ts` is the shared DECORATION_CASES matrix,
        // `lib/draft/geometryPredicates.ts` (#330) is the shared
        // self-intersection/containment/degeneracy predicate module three
        // test files (spaceSampling, garment, export/model) import instead
        // of each re-deriving its own copy, and `components/test-utils.tsx`
        // is the renderWithIntl wrapper.
        "lib/draft/fixtures.ts",
        "lib/draft/geometryPredicates.ts",
        "components/test-utils.tsx",
      ],

      // A ratchet, not an aspiration. Each threshold sits a fraction of a
      // point under its measured value, so an ordinary rounding fluctuation
      // passes while a real drop -- a deleted test, a large unreached new
      // branch, a whole new screen shipped untested -- fails the `coverage`
      // job. Raising a threshold after coverage genuinely improves is the
      // intended way to use this: move the floor up, never down.
      //
      // #168 moved every floor past 90%. Measured on this tree
      // (`npx vitest run --coverage`, both projects): statements 96.73%,
      // branches 92.41%, functions 93.03%, lines 96.73% -- up from
      // 85.87/90.13/78.55/85.87. The functions axis was the one that
      // mattered most and moved furthest (+14.5 points): an entirely
      // unexecuted function is the shape an AI-authored regression takes,
      // and 111 of them were unexecuted, concentrated in whole modules at
      // 0% (the three auth cards, the app/**/page.tsx shells, the error
      // boundaries, lib/mail/send.ts, most of lib/api-client.ts).
      thresholds: {
        statements: 96,
        branches: 92,
        functions: 92.5,
        lines: 96,
      },
    },
  },
});
