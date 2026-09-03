import type { MetadataRoute } from "next";
import { INDEXABLE_ROUTES, absoluteUrl, siteUrl } from "@/lib/seo/site";

// /sitemap.xml answered 404 before this. Four static public URLs, so the list
// is a constant (lib/seo/site.ts) rather than a filesystem walk -- "renders
// without a session" and "belongs in the index" are different questions, and
// deriving one from the other would quietly enrol /login and the two
// token-carrying transactional screens.
//
// Deliberately emits `url` ALONE -- no lastModified, changeFrequency or
// priority:
//   - `lastModified` would have to be invented. `new Date()` on every request
//     claims all four pages changed just now, on every crawl, forever; a
//     hardcoded date rots. Google's own guidance is that it ignores a
//     lastmod it cannot trust, and this repo does not ship a value it cannot
//     substantiate.
//   - Google ignores `changefreq` and `priority` outright. Four URLs ranked
//     against each other by a number nothing reads is noise.
// Add lastModified the day there is a real content timestamp to read.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return INDEXABLE_ROUTES.map((route) => ({ url: absoluteUrl(route, base) }));
}
