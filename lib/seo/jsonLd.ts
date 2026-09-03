/**
 * schema.org JSON-LD node builders.
 *
 * Framework-free (the lib/billing/plans.ts precedent): every one of these
 * takes text that has ALREADY been resolved through the catalog by the Server
 * Component calling it, so this module never imports next-intl and the
 * display strings stay under messages/pt-BR.json where the language-boundary
 * rule puts them.
 *
 * The pre-existing FAQPage block in app/page.tsx is the shape this
 * generalizes: it walks the same FAQ_KEYS the section renders, so markup and
 * schema cannot describe different questions. Every builder here keeps that
 * property -- each one is fed from the same constant its screen renders from
 * (FAQ_KEYS, PLAN_CREDITS, PLAN_PRICE_CENTS), never a second transcription.
 */

/** One schema.org entity. Deliberately loose: this is a serialization target. */
export type JsonLdNode = Record<string, unknown>;

/** Stable @id fragments, so nodes can reference each other across pages. */
export const ORGANIZATION_ID = "#organization";
export const WEBSITE_ID = "#website";

export function organizationNode(
  site: string,
  name: string,
  description: string,
): JsonLdNode {
  // No `logo` and no `sameAs`. Google would happily take both, but this repo
  // has neither a square brand asset (components/shared/Wordmark.tsx is live
  // text, not an image) nor a single social profile -- and app/
  // opengraph-image.tsx is a 1200x630 card, not a logo. Inventing either is
  // the fabricated-record line the landing page's own "proof is product
  // facts, never social proof" rule already draws. Omitted until a real
  // asset exists.
  return {
    "@type": "Organization",
    "@id": `${site}${ORGANIZATION_ID}`,
    name,
    url: site,
    description,
  };
}

export function webSiteNode(
  site: string,
  name: string,
  description: string,
): JsonLdNode {
  // No `potentialAction`/SearchAction: there is no public site search to
  // point one at, and a sitelinks searchbox that 404s is worse than none.
  return {
    "@type": "WebSite",
    "@id": `${site}${WEBSITE_ID}`,
    name,
    url: site,
    description,
    inLanguage: "pt-BR",
    publisher: { "@id": `${site}${ORGANIZATION_ID}` },
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export function faqPageNode(entries: readonly FaqEntry[]): JsonLdNode {
  return {
    "@type": "FAQPage",
    mainEntity: entries.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

export interface PlanOffer {
  /** The plan's display name, from the PlanSection catalog. */
  name: string;
  /** Decimal string in major units, e.g. "59.00" -- never a formatted price. */
  price: string;
  /** ISO 4217, uppercase. */
  currency: string;
  /** The page this offer is bought from. */
  url: string;
}

export function softwareApplicationNode(
  site: string,
  opts: {
    name: string;
    description: string;
    url: string;
    offers: readonly PlanOffer[];
  },
): JsonLdNode {
  return {
    "@type": "SoftwareApplication",
    name: opts.name,
    description: opts.description,
    url: opts.url,
    applicationCategory: "DesignApplication",
    // A browser app with no install target; "Web" is schema.org's own
    // convention for that rather than naming an OS this never runs on.
    operatingSystem: "Web",
    inLanguage: "pt-BR",
    publisher: { "@id": `${site}${ORGANIZATION_ID}` },
    offers: opts.offers.map((offer) => ({
      "@type": "Offer",
      name: offer.name,
      price: offer.price,
      priceCurrency: offer.currency,
      availability: "https://schema.org/InStock",
      url: offer.url,
    })),
  };
}

/**
 * Serialize nodes as one `@graph` document for a single <script> tag.
 *
 * Every "<" is rewritten to its JSON unicode escape, which parses back to the
 * same character but cannot terminate the surrounding tag. Every string
 * reaching this today comes from our own catalog, so this is hygiene rather
 * than a fix -- but the block is injected with dangerouslySetInnerHTML, and a
 * literal closing script tag in any future value would end the tag early and
 * spill the rest of the document into the page as markup.
 */
export function jsonLdGraph(nodes: readonly JsonLdNode[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": nodes,
  }).replace(/</g, "\\u003c");
}
