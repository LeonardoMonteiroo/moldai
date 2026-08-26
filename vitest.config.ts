import { defineConfig } from "vitest/config";

// #75: under Vitest 2, `coverage` is a ROOT-level option only -- a
// `test.coverage` block inside one of vitest.workspace.ts's project entries
// is silently ignored. This file exists solely to hold that block; the two
// projects themselves (node/dom) stay defined in vitest.workspace.ts. One
// coverage report merges both projects, which is what we want -- it is not
// split per project.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: [
        "components/ui/**",
        "*.config.*",
        "vitest.setup.ts",
        "prisma/**",
        "scripts/**",
        ".claude/**",
        "app/**/layout.tsx",
        // Without this, istanbul's report step tries to resolve a source
        // map for a Turbopack-compiled chunk name (e.g.
        // `[root-of-the-server]__<hash>.js`) and throws ENOENT on the
        // percent-encoded, nonexistent path -- reproduced once a local
        // `npm run build` has populated .next/.
        ".next/**",
      ],
      // #75: a ratchet, not an aspiration -- set a few points below the
      // measured baseline (statements/lines 87.34%, branches 93.62%,
      // functions 78.06%, `npx vitest run --coverage` on this tree) so a
      // small, legitimate fluctuation doesn't fail CI, while a real drop
      // (a deleted test, a large unreached new branch) still does.
      thresholds: {
        statements: 85,
        branches: 90,
        functions: 75,
        lines: 85,
      },
    },
  },
});
