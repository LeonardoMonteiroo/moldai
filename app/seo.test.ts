import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CRAWLER_DISALLOWED_PREFIXES,
  INDEXABLE_ROUTES,
  NOINDEX_ROUTES,
} from "@/lib/seo/site";

// Source guards, the app/page-titles.test.ts precedent: generateMetadata
// calls next-intl/server's request-scoped getTranslations, which only
// resolves inside a real Next.js request, so the resolved <head> cannot be
// asserted from the `node` project. What CAN be pinned is that each route
// declares the directive at all -- and, more usefully, that the declaration
// exists for every route the shared lists in lib/seo/site.ts name. Add a
// route to one of those lists without touching its page and this suite fails.
function source(file: string): string {
  return readFileSync(join(process.cwd(), "app", file), "utf-8");
}

/** "/" -> "page.tsx"; "/planos" -> "planos/page.tsx". */
function pageFile(route: string): string {
  return route === "/" ? "page.tsx" : `${route.slice(1)}/page.tsx`;
}

describe("metadataBase (social images resolved against a real origin)", () => {
  // Without this, Next falls back to http://localhost:3000 on a self-hosted
  // deploy and every og:image/twitter:image points at the deployer's own
  // machine -- tags present, build green, previews blank.
  it("app/layout.tsx sets metadataBase from the shared site origin", () => {
    const layout = source("layout.tsx");
    expect(layout).toContain('from "@/lib/seo/site"');
    expect(layout).toMatch(/metadataBase:\s*siteUrl\(\)/);
  });
});

describe("robots.txt", () => {
  const src = source("robots.ts");

  it("exists and reads the shared disallow list rather than its own copy", () => {
    expect(src).toContain("CRAWLER_DISALLOWED_PREFIXES");
    expect(src).toMatch(/export default function robots/);
  });

  it("points at an absolute sitemap URL", () => {
    expect(src).toMatch(/sitemap:\s*absoluteUrl\("\/sitemap\.xml"/);
  });

  // APP_URL only exists at runtime in this deployment, so a cached build-time
  // render would bake the localhost fallback into the Sitemap: line.
  it("renders per request, so it sees the runtime APP_URL", () => {
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
  });
});

describe("sitemap.xml", () => {
  const src = source("sitemap.ts");

  it("exists and walks the shared indexable-route list", () => {
    expect(src).toContain("INDEXABLE_ROUTES");
    expect(src).toMatch(/export default function sitemap/);
  });

  it("renders per request, so it sees the runtime APP_URL", () => {
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
  });

  // Deliberate: `new Date()` would claim all four pages changed on every
  // crawl, forever, and Google ignores a lastmod it cannot trust.
  it("emits no invented lastModified", () => {
    // The property, not the word -- the doc comment above it in sitemap.ts
    // explains at length why it is absent.
    expect(src).not.toMatch(/lastModifieds*:/);
  });
});

describe("noindex routes", () => {
  it.each([...NOINDEX_ROUTES])("app%s declares robots index:false", (route) => {
    const file = pageFile(route);
    expect(existsSync(join(process.cwd(), "app", file))).toBe(true);
    expect(source(file)).toMatch(/robots:\s*\{[^}]*index:\s*false/);
  });

  // The two token-carrying screens are reached only from a mailed link, so
  // nothing should be crawled onward from them either.
  it.each(["/verify", "/password-reset"])(
    "app%s also declares follow:false, since its URL carries a token",
    (route) => {
      expect(source(pageFile(route))).toMatch(/follow:\s*false/);
    },
  );
});

describe("canonical URLs", () => {
  it.each([...INDEXABLE_ROUTES])(
    "app%s declares its own canonical",
    (route) => {
      const file = pageFile(route);
      expect(existsSync(join(process.cwd(), "app", file))).toBe(true);
      expect(source(file)).toContain(`canonical: "${route}"`);
    },
  );

  it.each([...INDEXABLE_ROUTES])("app%s is not also noindex", (route) => {
    expect(source(pageFile(route))).not.toMatch(/index:\s*false/);
  });
});

describe("structured data", () => {
  it("the landing page emits one @graph built from the shared node builders", () => {
    const src = source("page.tsx");
    expect(src).toContain("jsonLdGraph");
    expect(src).toContain("organizationNode");
    expect(src).toContain("webSiteNode");
    // Unchanged in substance from the pre-existing block: still walks the
    // same FAQ_KEYS the section renders.
    expect(src).toContain("faqPageNode");
    expect(src).toContain("FAQ_KEYS.map");
  });

  it("/planos prices its offers from lib/billing/plans.ts, never a literal", () => {
    const src = source("planos/page.tsx");
    expect(src).toContain("softwareApplicationNode");
    expect(src).toContain("SELF_SERVE_PLAN_IDS.map");
    expect(src).toContain("priceDecimalString(PLAN_PRICE_CENTS[id])");
    // A price literal here would be a second copy of a number Stripe charges.
    expect(src).not.toMatch(/price:\s*"\d/);
  });
});

describe("the disallow list matches the routes that actually redirect", () => {
  // Every prefix here 307s to /login or answers JSON for an anonymous
  // request, so none of them can serve a noindex of its own. A prefix naming
  // a route that no longer exists is dead weight that quietly stops
  // protecting anything.
  it.each([...CRAWLER_DISALLOWED_PREFIXES])(
    "%s corresponds to a real app directory",
    (prefix) => {
      const dir = prefix.replace(/^\/|\/$/g, "");
      expect(existsSync(join(process.cwd(), "app", dir))).toBe(true);
    },
  );
});
