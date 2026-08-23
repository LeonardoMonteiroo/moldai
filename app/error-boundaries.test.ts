import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import messages from "@/messages/pt-BR.json";

// #98: with none of these three files present, a thrown Server Component or
// a wrong URL fell through to Next's own built-in English fallback --
// unstyled, no wordmark, no way back into a pt-BR app. These live under
// app/ (the `node` vitest project, no jsdom), so this can't render the
// components -- it instead guards the two ways this specific regression
// class comes back silently: the file (or its required "use client"
// directive, which error boundaries must carry) disappearing, and a catalog
// key a component reads via plain property access rather than a `t("…")`
// call the repo's i18n-key-existence hook (CHECK 4) can't see either.
describe("app-level error boundaries (#98)", () => {
  const cases = [
    { file: "error.tsx", namespace: "AppError", requiresUseClient: true },
    {
      file: "not-found.tsx",
      namespace: "NotFoundPage",
      requiresUseClient: false,
    },
    {
      file: "global-error.tsx",
      namespace: "GlobalError",
      requiresUseClient: true,
    },
  ] as const;

  it.each(cases)("app/$file exists", ({ file, requiresUseClient }) => {
    const source = readFileSync(join(process.cwd(), "app", file), "utf-8");
    expect(source.length).toBeGreaterThan(0);
    if (requiresUseClient) {
      // Error boundaries must be Client Components (Next 16 docs,
      // 01-app/01-getting-started/10-error-handling.md) -- losing this
      // directive breaks the file at build/runtime, not silently, but the
      // whole point of this file is to guard the boundary that would
      // otherwise catch that failure.
      expect(source.trimStart().startsWith('"use client"')).toBe(true);
    }
  });

  it("global-error.tsx renders its own <html>/<body> rather than relying on the root layout", () => {
    const source = readFileSync(
      join(process.cwd(), "app", "global-error.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/<html/);
    expect(source).toMatch(/<body/);
  });

  it.each(cases)(
    "the $namespace catalog namespace exists with heading and message",
    ({ namespace }) => {
      const ns = (messages as Record<string, unknown>)[namespace] as Record<
        string,
        string
      >;
      expect(ns).toBeDefined();
      expect(ns.heading).toBeTruthy();
      expect(ns.message).toBeTruthy();
    },
  );

  it("AppError and GlobalError carry a retry button label", () => {
    expect(messages.AppError.retryButton).toBeTruthy();
    expect(messages.GlobalError.retryButton).toBeTruthy();
  });

  it("AppError and NotFoundPage carry a way back to the app", () => {
    expect(messages.AppError.homeLink).toBeTruthy();
    expect(messages.NotFoundPage.homeLink).toBeTruthy();
  });
});
