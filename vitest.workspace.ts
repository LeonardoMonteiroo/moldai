import { defineWorkspace } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, ".") };

/**
 * Two projects on purpose.
 *
 * "node" is the pre-existing suite (lib/**, app/api/**): pure logic, no DOM,
 * no setup file. Keeping it isolated means the RTL + jest-dom setup below is
 * never loaded for it. It also picks up `.claude/hooks/**\/*.test.mjs` — the
 * Claude Code hook scripts are plain Node ESM, so they share this project's
 * DOM-free "node" environment rather than needing a third project.
 */
export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: "node",
      environment: "node",
      include: [
        "lib/**/*.test.{ts,tsx}",
        "app/**/*.test.{ts,tsx}",
        ".claude/hooks/**/*.test.mjs",
      ],
    },
  },
  {
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
