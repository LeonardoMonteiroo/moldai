import type { MetadataRoute } from "next";
import {
  CRAWLER_DISALLOWED_PREFIXES,
  absoluteUrl,
  siteUrl,
} from "@/lib/seo/site";

// This file did not exist: /robots.txt answered 404, so nothing told a
// crawler where the sitemap was and nothing kept it out of /api/* or the
// session-gated screens (which all 307 to /login, burning crawl budget on a
// redirect chain that never yields content).
//
// Read the disallow list's own doc comment before adding to it: the four
// NOINDEX_ROUTES are deliberately NOT here. Disallowing a URL prevents the
// fetch, which prevents the crawler ever reading that page's `noindex` --
// the page then stays indexable from any inbound link, just without a
// snippet. Blocking and de-indexing are opposite tools.
//
// Rendered per request rather than baked at build (`sitemap` below has to be
// absolute, and APP_URL only exists at runtime in this deployment -- see
// lib/seo/site.ts). Two crawler hits a day against a string template is not
// a cost worth caching.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...CRAWLER_DISALLOWED_PREFIXES],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml", base),
  };
}
