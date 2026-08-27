import { defineWorkspace } from "vitest/config";
import path from "node:path";

// #166: this file's own directory, i.e. the checkout vitest is actually
// running from -- `.claude/worktrees/<name>/` for a nested git worktree, the
// repo root otherwise. `__dirname` is per-module in both CJS and vite-node's
// transform of this file, so it is NOT `process.cwd()` (which a caller could
// point elsewhere with `--root`) and it is not affected by the worktree
// being nested, filesystem-wise, inside the outer checkout.
const projectRoot = path.resolve(__dirname, ".");
const alias = { "@": projectRoot };

/**
 * Two projects on purpose.
 *
 * "node" is the pre-existing suite (lib/**, app/api/**): pure logic, no DOM,
 * no setup file. Keeping it isolated means the RTL + jest-dom setup below is
 * never loaded for it. It also picks up `.claude/hooks/**\/*.test.mjs` — the
 * Claude Code hook scripts are plain Node ESM, so they share this project's
 * DOM-free "node" environment rather than needing a third project.
 *
 * Each project below also pins `root: projectRoot` explicitly (#166) —
 * without it, Vitest's per-project root for an INLINE workspace entry (as
 * opposed to a project loaded from its own separate config file) is not
 * guaranteed to be this file's own directory in every invocation shape, so a
 * project's `include` globs and `resolve.alias` could in principle be
 * evaluated against two different bases. Pinning both to the identical
 * `projectRoot` value removes that ambiguity outright: whatever directory
 * this config file itself lives in is unambiguously both. See
 * `lib/db/aliasResolution.test.ts` for the regression test this closes out,
 * and CLAUDE.md's testing-conventions note on matching a `vi.mock` specifier
 * to the one the subject module actually imports.
 */
export default defineWorkspace([
  {
    root: projectRoot,
    resolve: { alias },
    test: {
      name: "node",
      environment: "node",
      include: [
        "lib/**/*.test.{ts,tsx}",
        "app/**/*.test.{ts,tsx}",
        "scripts/**/*.test.{ts,tsx}",
        ".claude/hooks/**/*.test.mjs",
      ],
    },
  },
  {
    root: projectRoot,
    // tsconfig says "jsx": "react-jsx", but stating it here keeps the test
    // transform independent of the app's tsconfig.
    esbuild: { jsx: "automatic" },
    resolve: { alias },
    test: {
      name: "dom",
      environment: "jsdom",
      include: ["components/**/*.test.{ts,tsx}"],
      setupFiles: ["./vitest.setup.ts"],
    },
  },
]);
