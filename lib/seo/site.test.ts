import { describe, it, expect, afterEach, vi } from "vitest";
import {
  CRAWLER_DISALLOWED_PREFIXES,
  DEFAULT_SITE_URL,
  INDEXABLE_ROUTES,
  NOINDEX_ROUTES,
  absoluteUrl,
  parseSiteUrl,
  siteRootUrl,
  siteUrl,
} from "./site";

describe("parseSiteUrl", () => {
  it("keeps a well-formed https origin", () => {
    expect(parseSiteUrl("https://moldai.app").toString()).toBe(
      "https://moldai.app/",
    );
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty", ""],
    // A Docker ARG that was never passed produces `ENV APP_URL=` -- an empty
    // string, not an unset variable, so whitespace has to fall back too.
    ["whitespace", "   "],
    ["unparseable", "not a url"],
    ["a bare host with no scheme", "moldai.app"],
  ])("falls back to the default for %s", (_label, raw) => {
    expect(parseSiteUrl(raw).toString()).toBe(`${DEFAULT_SITE_URL}/`);
  });

  it("refuses a non-HTTP(S) scheme rather than emitting it into a meta tag", () => {
    expect(parseSiteUrl("javascript:alert(1)").toString()).toBe(
      `${DEFAULT_SITE_URL}/`,
    );
    expect(parseSiteUrl("file:///etc/passwd").toString()).toBe(
      `${DEFAULT_SITE_URL}/`,
    );
  });

  it("drops query and hash, which cannot mean anything on an origin", () => {
    expect(parseSiteUrl("https://moldai.app/?a=1#b").toString()).toBe(
      "https://moldai.app/",
    );
  });

  it("preserves a sub-path deployment's prefix but strips its trailing slash", () => {
    expect(parseSiteUrl("https://example.com/app/").pathname).toBe("/app");
    expect(parseSiteUrl("https://example.com/app///").pathname).toBe("/app");
  });
});

describe("absoluteUrl", () => {
  it("joins a root-relative route onto the origin", () => {
    const base = parseSiteUrl("https://moldai.app");
    expect(absoluteUrl("/planos", base)).toBe("https://moldai.app/planos");
    expect(absoluteUrl("/", base)).toBe("https://moldai.app/");
  });

  // The reason this exists instead of `new URL(route, base)`: that call
  // discards the base's own pathname for any route starting with "/", which
  // would silently drop the prefix from every sitemap entry.
  it("keeps a sub-path prefix that new URL() would discard", () => {
    const base = parseSiteUrl("https://example.com/app");
    expect(absoluteUrl("/planos", base)).toBe("https://example.com/app/planos");
    expect(new URL("/planos", base).toString()).not.toBe(
      absoluteUrl("/planos", base),
    );
  });

  it("never produces a double slash", () => {
    for (const raw of ["https://a.com", "https://a.com/", "https://a.com/x/"]) {
      const base = parseSiteUrl(raw);
      for (const route of [...INDEXABLE_ROUTES]) {
        expect(absoluteUrl(route, base)).not.toMatch(/[^:]\/\//);
      }
    }
  });
});

describe("siteRootUrl", () => {
  it("has no trailing slash, so a schema.org @id has one spelling", () => {
    expect(siteRootUrl(parseSiteUrl("https://moldai.app"))).toBe(
      "https://moldai.app",
    );
    expect(siteRootUrl(parseSiteUrl("https://example.com/app/"))).toBe(
      "https://example.com/app",
    );
  });
});

describe("siteUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads APP_URL", () => {
    vi.stubEnv("APP_URL", "https://moldai.app");
    expect(siteUrl().origin).toBe("https://moldai.app");
  });

  it("falls back when APP_URL is unset", () => {
    vi.stubEnv("APP_URL", "");
    expect(siteUrl().origin).toBe(DEFAULT_SITE_URL);
  });
});

describe("route lists", () => {
  // THE invariant this module exists to protect. Disallowing a URL in
  // robots.txt stops the crawler fetching it, which stops it ever reading
  // that page's `noindex` -- the URL then stays indexable from any inbound
  // link, just without a snippet. Blocking and de-indexing are opposite
  // tools, and reaching for both at once achieves neither.
  it("never disallows a route that relies on a noindex meta tag", () => {
    for (const route of NOINDEX_ROUTES) {
      for (const prefix of CRAWLER_DISALLOWED_PREFIXES) {
        expect(
          route.startsWith(prefix),
          `${route} is noindex but robots.txt disallows ${prefix}, so the directive would never be read`,
        ).toBe(false);
      }
    }
  });

  it("never disallows a route it also asks to be indexed", () => {
    for (const route of INDEXABLE_ROUTES) {
      for (const prefix of CRAWLER_DISALLOWED_PREFIXES) {
        expect(
          route.startsWith(prefix),
          `${route} is in the sitemap but robots.txt disallows ${prefix}`,
        ).toBe(false);
      }
    }
  });

  it("keeps the indexable and noindex lists disjoint", () => {
    const overlap = INDEXABLE_ROUTES.filter((r) =>
      (NOINDEX_ROUTES as readonly string[]).includes(r),
    );
    expect(overlap).toEqual([]);
  });

  it("blocks the API surface", () => {
    expect(CRAWLER_DISALLOWED_PREFIXES).toContain("/api/");
  });
});
