import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #109: app/layout.tsx set one static title ("MoldAI — Editor de molde")
// and no route overrode it, so every tab/bookmark/history entry claimed to
// be the pattern editor -- indistinguishable with several patterns open,
// the exact workflow the dashboard exists to support. These live under
// app/ (the `node` vitest project, no jsdom, and generateMetadata calls
// next-intl/server's request-scoped getTranslations which only resolves
// inside an actual Next.js request) -- guarding the source text is this
// repo's existing precedent for exactly that case (app/auth-screen-scroll
// .test.ts, app/error-boundaries.test.ts).
function source(file: string): string {
  return readFileSync(join(process.cwd(), "app", file), "utf-8");
}

describe("root layout title template (#109)", () => {
  it("suffixes every route's title with the brand instead of repeating a static one", () => {
    const layout = source("layout.tsx");
    expect(layout).toMatch(/template:\s*"%s — MoldAI"/);
  });
});

describe("every full-page route sets its own title (#109)", () => {
  const staticRoutes: [file: string, namespace: string, key: string][] = [
    ["login/page.tsx", "Login", "heading"],
    ["signup/page.tsx", "Signup", "heading"],
    ["verify/page.tsx", "Verify", "heading"],
    ["password-reset/page.tsx", "PasswordReset", "requestHeading"],
    ["password-reset/page.tsx", "PasswordReset", "confirmHeading"],
    ["settings/page.tsx", "SettingsShell", "title"],
    ["size-charts/page.tsx", "SizeCharts", "title"],
    ["slopers/page.tsx", "Slopers", "title"],
  ];

  it.each(staticRoutes)(
    "app/%s resolves its title from the %s catalog",
    (file, namespace, key) => {
      const src = source(file);
      expect(src).toMatch(/export async function generateMetadata/);
      expect(src).toContain(`getTranslations("${namespace}")`);
      expect(src).toContain(`t("${key}")`);
    },
  );

  // #109 review: a token present means PasswordResetCard renders the
  // confirm-new-password form, not the request form -- the tab title has to
  // follow that same branch or a mailed reset link opens a tab that
  // disagrees with the form actually shown.
  it("app/password-reset/page.tsx titles the tab by which form the token selects", () => {
    const src = source("password-reset/page.tsx");
    expect(src).toMatch(
      /token\s*\?\s*t\("confirmHeading"\)\s*:\s*t\("requestHeading"\)/,
    );
  });

  // "/" is the one exception: root layout.tsx's title.template does not
  // apply to a title set by a page.tsx in that SAME route segment (only to
  // a child segment's page, per Next.js's own documented rule) -- every
  // other route above lives one directory below the layout, so it composes
  // automatically. This is the only route that has to spell out the suffix.
  it("app/page.tsx spells out the brand suffix itself, since layout.tsx's template can't reach it", () => {
    const src = source("page.tsx");
    expect(src).toMatch(/export async function generateMetadata/);
    expect(src).toContain(`getTranslations("Sidebar")`);
    expect(src).toContain(`t("myPatternsLabel")`);
    expect(src).toMatch(/—\s*MoldAI/);
  });

  // The one dynamic route: the tab carries the pattern's own name, not a
  // catalog string -- and must never resolve (or leak via a redirect
  // side-effect) for a request that can't prove ownership of the pattern.
  it("app/pattern/[id]/page.tsx titles the tab with the pattern's name, ownership-scoped", () => {
    const src = source("pattern/[id]/page.tsx");
    expect(src).toMatch(/export async function generateMetadata/);
    expect(src).toContain("loaded.state.pattern.name");
    expect(src).toMatch(/if \(!session\?\.user\?\.id\) return \{\};/);
    expect(src).toMatch(/if \(!loaded\) return \{\};/);
  });
});
