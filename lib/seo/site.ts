/**
 * The app's public origin, and the route lists robots.txt / sitemap.xml are
 * built from.
 *
 * Framework-free leaf module (the lib/billing/plans.ts precedent): one place
 * that knows what this deployment is reachable at, so `metadataBase`, the
 * sitemap's absolute URLs and the robots.txt `Sitemap:` line can never name
 * three different origins.
 *
 * WHY THIS MODULE EXISTS AT ALL: with no `metadataBase`, Next resolves every
 * relative social-image URL against
 * `metadataBase || VERCEL_PROJECT_PRODUCTION_URL || http://localhost:3000`
 * (node_modules/next/dist/lib/metadata/resolvers/resolve-url.js). This app is
 * self-hosted Docker, so neither Vercel variable is ever set and **production
 * fell through to the localhost default** -- every `og:image`/`twitter:image`
 * on every page pointed at `http://localhost:3000/opengraph-image`, which
 * made app/opengraph-image.tsx's card unreachable for any real share. That is
 * a silent failure: the build does not fail, the tags are present, and the
 * only symptom is a blank preview on someone else's machine.
 */

/** The last-resort origin, matching Next's own fallback and .env.example. */
export const DEFAULT_SITE_URL = "http://localhost:3000";

/**
 * Normalize a configured origin into a `metadataBase`-shaped URL.
 *
 * Total, never throws: an absent, blank, unparseable or non-HTTP(S) value
 * falls back to {@link DEFAULT_SITE_URL} rather than taking the whole render
 * down over a typo'd env var -- the `validateSizeChartPatch` drop-or-clamp
 * contract, applied to configuration. Empty string is treated as absent
 * because a Docker `ARG` that was never passed produces `ENV APP_URL=`, not
 * an unset variable.
 *
 * A pathname is preserved (this app can legitimately be mounted under a
 * sub-path via APP_URL) but normalized to carry no trailing slash, so
 * {@link absoluteUrl} can join without producing a `//`. Query and hash are
 * dropped: neither can mean anything on an origin.
 */
export function parseSiteUrl(raw: string | undefined | null): URL {
  const trimmed = raw?.trim();
  if (!trimmed) return new URL(DEFAULT_SITE_URL);
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new URL(DEFAULT_SITE_URL);
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  return new URL(`${parsed.origin}${path}`);
}

/** This deployment's origin, from the same APP_URL the OAuth callback uses. */
export function siteUrl(): URL {
  return parseSiteUrl(process.env.APP_URL);
}

/**
 * An absolute URL for a root-relative route.
 *
 * `new URL(route, base)` is deliberately NOT used: a route starting with "/"
 * discards the base's own pathname, which would silently drop a sub-path
 * deployment's prefix from every sitemap entry.
 */
export function absoluteUrl(route: string, base: URL = siteUrl()): string {
  const prefix = base.pathname === "/" ? "" : base.pathname;
  return `${base.origin}${prefix}${route}`;
}

/**
 * The site root as a bare string with NO trailing slash -- the form a
 * schema.org `@id` and `url` want ("https://x.com#organization" reads as one
 * identifier; "https://x.com/#organization" is a second spelling of the same
 * thing). Preserves a sub-path deployment's prefix, like {@link absoluteUrl}.
 */
export function siteRootUrl(base: URL = siteUrl()): string {
  return absoluteUrl("", base);
}

/**
 * The public routes that belong in the index, and therefore in the sitemap.
 *
 * Hand-maintained rather than derived from the filesystem: "renders without a
 * session" and "should be indexed" are different questions, and only the
 * second one belongs here.
 */
export const INDEXABLE_ROUTES = ["/", "/planos", "/privacy", "/terms"] as const;

/**
 * Public routes that must render for an anonymous visitor but must NOT be
 * indexed: two auth entry points (thin, and duplicating the root layout's own
 * description) and two transactional screens reached only from a mailed link,
 * whose URLs carry a single-use token.
 *
 * These are deliberately absent from {@link CRAWLER_DISALLOWED_PREFIXES}.
 * Disallowing a page in robots.txt stops a crawler from FETCHING it, which
 * means it never reads the `noindex` -- the URL can then still be indexed
 * from an inbound link, with no snippet. A page you want out of the index has
 * to stay crawlable so the directive is actually seen.
 */
export const NOINDEX_ROUTES = [
  "/login",
  "/signup",
  "/verify",
  "/password-reset",
] as const;

/**
 * Prefixes no crawler should spend budget on. Every one of these either
 * answers JSON or 307s to /login for an anonymous request, so none of them
 * can serve a `noindex` of its own -- robots.txt is the only lever they have.
 */
export const CRAWLER_DISALLOWED_PREFIXES = [
  "/api/",
  "/import",
  "/onboarding",
  "/pattern/",
  "/settings",
  "/size-charts",
  "/slopers",
] as const;

/**
 * The brand name, as schema.org and the OG tags spell it. A constant so the
 * Organization/WebSite nodes and `openGraph.siteName` cannot drift; not a
 * catalog entry, because a proper noun is not display text to translate.
 */
export const SITE_NAME = "MoldAI";
