import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reportError } from "./report";

describe("reportError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the scope-prefixed error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    reportError("generate", err);
    expect(spy).toHaveBeenCalledWith("[generate]", err);
  });

  it("logs the context object when given", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    reportError("generate", err, { patternId: "p1" });
    expect(spy).toHaveBeenCalledWith("[generate]", err, { patternId: "p1" });
  });
});

// #100: the generate route's catch, the two error boundaries, and the cron
// script all used to swallow their error entirely (generate) or log it via a
// bare console.error with no scope prefix (the boundaries) -- these four are
// scripts/app files vitest.workspace.ts's `node` project doesn't otherwise
// exercise the same way a component render would, so this asserts each
// site's source actually imports and calls reportError rather than trusting
// that the earlier edit stuck.
describe("reportError call sites (#100)", () => {
  const read = (...segments: string[]) =>
    readFileSync(join(process.cwd(), ...segments), "utf-8");

  it("the generate route's catch reports instead of swallowing the error", () => {
    const source = read(
      "app",
      "api",
      "patterns",
      "[id]",
      "generate",
      "route.ts",
    );
    expect(source).toMatch(/catch \(err\)/);
    expect(source).toMatch(/reportError\("generate", err/);
  });

  it.each(["error.tsx", "global-error.tsx"])(
    "app/%s reports through reportError, not a bare console.error",
    (file) => {
      const source = read("app", file);
      expect(source).toMatch(/reportError\(/);
      expect(source).not.toMatch(/^\s*console\.error\(error\);?\s*$/m);
    },
  );

  it("cron-renew reports its failure through reportError", () => {
    const source = read("scripts", "cron-renew.ts");
    expect(source).toMatch(/reportError\("cron-renew"/);
  });
});
