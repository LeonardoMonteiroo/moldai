import { describe, it, expect } from "vitest";
import {
  ORGANIZATION_ID,
  faqPageNode,
  jsonLdGraph,
  organizationNode,
  softwareApplicationNode,
  webSiteNode,
} from "./jsonLd";

const SITE = "https://moldai.app";

describe("jsonLdGraph", () => {
  it("wraps nodes in a single @context/@graph document", () => {
    const parsed = JSON.parse(jsonLdGraph([{ "@type": "Thing" }]));
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@graph"]).toEqual([{ "@type": "Thing" }]);
  });

  // The block is injected with dangerouslySetInnerHTML, so a "<" surviving
  // verbatim in any value could close the script tag early and spill the rest
  // of the document into the page as markup.
  it("leaves no raw < in the output, and still parses back to the original", () => {
    const hostile = { "@type": "Thing", name: "</script><img src=x>" };
    const out = jsonLdGraph([hostile]);
    expect(out).not.toContain("<");
    expect(JSON.parse(out)["@graph"][0].name).toBe("</script><img src=x>");
  });
});

describe("organizationNode", () => {
  it("is addressable by a stable @id other nodes reference", () => {
    const org = organizationNode(SITE, "MoldAI", "desc");
    expect(org["@id"]).toBe(`${SITE}${ORGANIZATION_ID}`);
    expect(org.url).toBe(SITE);
  });

  // Guarded rather than merely omitted: this repo has no square brand asset
  // and no social profile, and a fabricated one is the same line the landing
  // page's "proof is product facts, never social proof" rule already draws.
  it("claims neither a logo nor a social profile it does not have", () => {
    const org = organizationNode(SITE, "MoldAI", "desc");
    expect(org).not.toHaveProperty("logo");
    expect(org).not.toHaveProperty("sameAs");
  });
});

describe("webSiteNode", () => {
  it("hangs off the organization by @id", () => {
    expect(webSiteNode(SITE, "MoldAI", "desc").publisher).toEqual({
      "@id": `${SITE}${ORGANIZATION_ID}`,
    });
  });

  it("declares no site search, because there is none to declare", () => {
    expect(webSiteNode(SITE, "MoldAI", "desc")).not.toHaveProperty(
      "potentialAction",
    );
  });
});

describe("faqPageNode", () => {
  it("maps each entry to a Question with its accepted Answer", () => {
    const node = faqPageNode([{ question: "Q1?", answer: "A1." }]);
    expect(node).toEqual({
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Q1?",
          acceptedAnswer: { "@type": "Answer", text: "A1." },
        },
      ],
    });
  });
});

describe("softwareApplicationNode", () => {
  const node = softwareApplicationNode(SITE, {
    name: "MoldAI",
    description: "desc",
    url: SITE,
    offers: [
      { name: "Free", price: "0.00", currency: "BRL", url: `${SITE}/planos` },
      {
        name: "Atelier",
        price: "59.00",
        currency: "BRL",
        url: `${SITE}/planos`,
      },
    ],
  });

  it("emits one Offer per plan it was given", () => {
    const offers = node.offers as Record<string, unknown>[];
    expect(offers).toHaveLength(2);
    expect(offers[1]).toMatchObject({
      "@type": "Offer",
      name: "Atelier",
      price: "59.00",
      priceCurrency: "BRL",
    });
  });

  it("hangs off the organization by @id", () => {
    expect(node.publisher).toEqual({ "@id": `${SITE}${ORGANIZATION_ID}` });
  });
});
