import { defineWorkspace } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, ".") };

/**
 * Two projects on purpose.
 *
 * "node" is the pre-existing suite (lib/**, app/api/**): pure logic, no DOM,
 * no setup file. Keeping it isolated means the RTL + jest-dom setup below is
 * never loaded for it.
 *
 * "dom" is the component suite. jsdom + a setup file that installs the
 * matchers, auto-cleanup, and the handful of browser APIs jsdom lacks but the
 * Radix primitives in components/ui/ call.
 */
export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: "node",
      environment: "node",
      include: ["lib/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}"],
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
