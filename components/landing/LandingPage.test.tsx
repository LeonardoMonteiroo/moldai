import { describe, it, expect } from "vitest";
import {
  renderWithIntl,
  screen,
  ptBR,
  priceText,
} from "@/components/test-utils";
import {
  EXPORT_FORMATS,
  EXPORT_FORMAT_USE_CASE,
  EXPORT_FORMAT_USE_CASE_ORDER,
} from "@/lib/export/formats";
import { LandingPage } from "./LandingPage";
import { PLAN_CREDITS, PLAN_PRICE_CENTS, formatBRL } from "@/lib/billing/plans";
import { COSTS } from "@/lib/types";
import { FAQ_KEYS } from "@/lib/landing/faq";

describe("LandingPage", () => {
  it("renders the nav's real links: howItWorks/faq as same-page anchors, login/signup as auth links", () => {
    renderWithIntl(<LandingPage />);

    const howItWorks = screen.getByRole("link", {
      name: ptBR.Landing.nav.howItWorks,
    });
    expect(howItWorks).toHaveAttribute("href", "/#how-it-works");

    const faq = screen.getByRole("link", {
      name: ptBR.Landing.nav.faq,
    });
    expect(faq).toHaveAttribute("href", "/#faq");

    expect(
      screen.getByRole("link", { name: ptBR.Landing.nav.login }),
    ).toHaveAttribute("href", "/login");
    expect(
      screen.getByRole("link", { name: ptBR.Landing.nav.signup }),
    ).toHaveAttribute("href", "/signup");
  });

  // #15: the public pricing screen shipped -- the nav's "Planos" item is a
  // real link now, not the disabled+badged placeholder issue #13 shipped.
  it("links the Planos nav item to the public pricing screen", () => {
    renderWithIntl(<LandingPage />);

    expect(
      screen.getByRole("link", { name: ptBR.Landing.nav.plans }),
    ).toHaveAttribute("href", "/planos");
  });

  it("renders the hero copy, with the primary CTA's credit count from PLAN_CREDITS.free", () => {
    renderWithIntl(<LandingPage />);

    expect(screen.getByText(ptBR.Landing.hero.eyebrow)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: ptBR.Landing.hero.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(ptBR.Landing.hero.body)).toBeInTheDocument();
    expect(screen.getByText(ptBR.Landing.hero.noCardNote)).toBeInTheDocument();

    const expectedCta = ptBR.Landing.hero.primaryCta.replace(
      "{credits}",
      String(PLAN_CREDITS.free),
    );
    // A2 #12: the closing CTA repeats the hero's word for word, so this name
    // matches twice on purpose. Asserting every match points at /signup is
    // the stronger form of A4's "one primary action" -- it fails if a second
    // CTA with the same promise ever starts leading somewhere else.
    const ctas = screen.getAllByRole("link", { name: expectedCta });
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/signup");
    }
  });

  // The hero's image is a cartooned SVG of the editor, drawn at the size the
  // design gives it -- asserted by its catalog alt text and its src.
  it("renders the hero illustration", () => {
    renderWithIntl(<LandingPage />);

    const heroImage = screen.getByRole("img", {
      name: ptBR.Landing.hero.imageAlt,
    });
    expect(heroImage).toBeInTheDocument();
    expect(heroImage).toHaveAttribute("src", "/landing/hero-editor.svg");
  });

  it("renders the how-it-works section header and all three step cards with their exact copy", () => {
    renderWithIntl(<LandingPage />);

    expect(
      screen.getByRole("heading", { name: ptBR.Landing.steps.sectionTitle }),
    ).toBeInTheDocument();

    for (const key of ["describe", "adjust", "export"] as const) {
      expect(
        screen.getByText(ptBR.Landing.steps[key].step),
      ).toBeInTheDocument();
      expect(
        screen.getByText(ptBR.Landing.steps[key].title),
      ).toBeInTheDocument();
      expect(
        screen.getByText(ptBR.Landing.steps[key].body),
      ).toBeInTheDocument();
      // One illustration per step -- assert the image itself, named by its
      // catalog alt, and that it points at the shipped asset rather than a
      // leftover placeholder.
      expect(
        screen.getByRole("img", { name: ptBR.Landing.steps[key].imageAlt }),
      ).toHaveAttribute("src", `/landing/step-${key}.svg`);
    }
  });

  // Walks FAQ_KEYS rather than a list pasted here, so a question added to
  // the page (or to the FAQPage schema, which reads the same list) can never
  // be silently left untested. A2 #10 wants six to twelve of them.
  it("renders the FAQ section header and every question in FAQ_KEYS with its exact copy", () => {
    renderWithIntl(<LandingPage />);

    expect(
      screen.getByRole("heading", { name: ptBR.Landing.faq.sectionTitle }),
    ).toBeInTheDocument();

    expect(FAQ_KEYS.length).toBeGreaterThanOrEqual(6);
    expect(FAQ_KEYS.length).toBeLessThanOrEqual(12);

    // The namespace also holds the section's own eyebrow/title strings, so
    // it is not a uniform Record of Q&A pairs -- widen through unknown.
    const faq = ptBR.Landing.faq as unknown as Record<
      string,
      { question: string; answer: string }
    >;
    // The answers interpolate the real cost/credit constants, so the
    // expectation has to resolve the same placeholders next-intl does --
    // comparing against the raw catalog string would be vacuous.
    const resolve = (s: string) =>
      s
        .replace("{adjust}", String(COSTS.adjust))
        .replace("{credits}", String(PLAN_CREDITS.free));

    for (const key of FAQ_KEYS) {
      expect(
        faq[key],
        `Landing.faq.${key} missing from the catalog`,
      ).toBeTruthy();
      expect(screen.getByText(resolve(faq[key].question))).toBeInTheDocument();
      expect(screen.getByText(resolve(faq[key].answer))).toBeInTheDocument();
    }
  });

  // Spot-checking a few format labels is what let the old flat FormatsSection
  // drift: it kept its own hardcoded list of five ids and stayed green while
  // #135/#136 added plt and pdf-layered. Assert EVERY entry in EXPORT_FORMATS
  // instead -- a format added to the app now fails this test until the
  // credits section's grouped list advertises it. Each group's ids render as
  // one "·"-joined text node (CreditsSection.tsx), so the expectation joins
  // the same way rather than querying each short label in isolation.
  it("advertises every format the app can actually write, grouped by use case", () => {
    renderWithIntl(<LandingPage />);

    expect(screen.getByText(ptBR.Landing.credits.title)).toBeInTheDocument();

    const seen = new Set<string>();
    for (const group of EXPORT_FORMAT_USE_CASE_ORDER) {
      expect(
        screen.getByText(
          (ptBR.Landing.formatGroups as Record<string, string>)[group],
        ),
      ).toBeInTheDocument();

      const ids = EXPORT_FORMATS.filter(
        (id) => EXPORT_FORMAT_USE_CASE[id] === group,
      );
      const joined = ids
        .map((id) => {
          const label = (ptBR.Landing.formatShort as Record<string, string>)[
            id
          ];
          expect(
            label,
            `Landing.formatShort.${id} missing from the catalog`,
          ).toBeTruthy();
          seen.add(id);
          return label;
        })
        .join(" · ");
      expect(screen.getByText(joined)).toBeInTheDocument();
    }

    for (const id of EXPORT_FORMATS) {
      expect(seen.has(id), `${id} missing from every use-case group`).toBe(
        true,
      );
    }
  });

  it("renders the free-plan teaser card with real credit/price figures and links to signup", () => {
    renderWithIntl(<LandingPage />);

    expect(
      screen.getByText(ptBR.Landing.credits.planEyebrow),
    ).toBeInTheDocument();
    expect(screen.getByText(String(PLAN_CREDITS.free))).toBeInTheDocument();

    const expectedUpsell = priceText(
      ptBR.Landing.credits.planUpsell
        .replace("{price}", formatBRL(PLAN_PRICE_CENTS.atelier))
        .replace("{credits}", String(PLAN_CREDITS.atelier)),
    );
    expect(screen.getByText(expectedUpsell)).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: ptBR.Landing.credits.planCta }),
    ).toHaveAttribute("href", "/signup");
  });

  it("renders the footer's billing note", () => {
    renderWithIntl(<LandingPage />);

    expect(
      screen.getByText(ptBR.Landing.footer.billingNote),
    ).toBeInTheDocument();
  });
});

// The sections the landing-page-design skill requires that this page did not
// have before: a proof signal above the fold (A2 #4), outcome-driven
// benefits (#7), the mandatory large-type tagline reveal (B11), and a
// closing CTA with its risk reversal (#11/#12).
describe("LandingPage · skill-required sections", () => {
  it("puts a proof signal above the fold, built from real product constants", () => {
    renderWithIntl(<LandingPage />);

    expect(
      screen.getByText(
        ptBR.Landing.hero.proof.credits.replace(
          "{credits}",
          String(PLAN_CREDITS.free),
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        ptBR.Landing.hero.proof.formats.replace(
          "{formats}",
          String(EXPORT_FORMATS.length),
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(ptBR.Landing.hero.proof.seams)).toBeInTheDocument();
  });

  it("renders every benefit, with its costs read from COSTS", () => {
    renderWithIntl(<LandingPage />);

    expect(
      screen.getByRole("heading", { name: ptBR.Landing.benefits.sectionTitle }),
    ).toBeInTheDocument();

    const benefits = ptBR.Landing.benefits as unknown as Record<
      string,
      { title: string; body: string }
    >;
    const resolve = (s: string) =>
      s
        .replace("{adjust}", String(COSTS.adjust))
        .replace("{graduate}", String(COSTS.graduate))
        .replace("{formats}", String(EXPORT_FORMATS.length));

    for (const key of [
      "seamCheck",
      "sizeChart",
      "grading",
      "export",
      "correction",
    ] as const) {
      expect(
        screen.getByRole("heading", { name: resolve(benefits[key].title) }),
      ).toBeInTheDocument();
      expect(screen.getByText(resolve(benefits[key].body))).toBeInTheDocument();
    }
  });

  // B11: at least two lines, and each word is its own element so it can be
  // lit one at a time. Asserting the split (not just the text) is what keeps
  // a future simplification from quietly turning it back into a plain
  // paragraph that fades in as one block.
  it("renders the tagline reveal with every word individually addressable", () => {
    const { container } = renderWithIntl(<LandingPage />);

    const lines = [
      ptBR.Landing.tagline.line1,
      ptBR.Landing.tagline.line2,
      ptBR.Landing.tagline.line3,
    ];
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const words = container.querySelectorAll("[data-word]");
    const expected = lines.reduce((n, l) => n + l.split(" ").length, 0);
    expect(words).toHaveLength(expected);

    // jsdom implements no IntersectionObserver, which is exactly the
    // condition a real browser with the API disabled would hit. The
    // guarantee that matters is that the copy is then simply READABLE --
    // every word lit -- rather than left at 30% ink with no event that can
    // ever arrive. Asserting "false" here would have pinned the opposite.
    for (const word of words) {
      expect(word).toHaveClass("marketing-word");
      expect(word).toHaveAttribute("data-lit", "true");
    }
  });

  // A4/A2 #11: the risk reversal is deliberately NOT "cancele quando
  // quiser" -- downgrades are refused server-side in this app, so that
  // promise would be false. This pins the honest wording.
  it("closes with the CTA and a risk reversal it can actually honour", () => {
    renderWithIntl(<LandingPage />);

    expect(
      screen.getByRole("heading", { name: ptBR.Landing.finalCta.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(ptBR.Landing.finalCta.note)).toBeInTheDocument();
    expect(ptBR.Landing.finalCta.note).not.toMatch(/cancele/i);
  });
});

describe("LandingPage · ship requirements", () => {
  // B10: a keyboard user must be able to jump the nav.
  it("offers a skip link that targets the main landmark", () => {
    const { container } = renderWithIntl(<LandingPage />);

    const skip = screen.getByRole("link", { name: ptBR.Landing.skipToContent });
    expect(skip).toHaveAttribute("href", "#main");
    expect(container.querySelector("main#main")).not.toBeNull();
  });

  // B10 + B9: legal links present, and pointing at real routes rather than
  // "#". Route names stay English per the repo's own routing rule.
  it("links privacy and terms to real routes", () => {
    renderWithIntl(<LandingPage />);

    expect(
      screen.getByRole("link", { name: ptBR.Landing.footer.privacy }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      screen.getByRole("link", { name: ptBR.Landing.footer.terms }),
    ).toHaveAttribute("href", "/terms");
  });

  // B7: the closed nav is a floating pill detached from the top, not the
  // full-width bar this shipped as.
  it("renders the nav as a detached floating pill", () => {
    const { container } = renderWithIntl(<LandingPage />);

    const nav = container.querySelector("nav[aria-label]");
    expect(nav).not.toBeNull();
    expect(nav).toHaveClass("rounded-full", "w-max", "mx-auto", "mt-6");
  });

  // B9: an icon-only control carries BOTH an accessible name and a hover
  // tooltip, resolved from the same catalog key.
  it("gives the menu toggle a name and a tooltip", () => {
    renderWithIntl(<LandingPage />);

    const toggle = screen.getByRole("button", {
      name: ptBR.Landing.nav.menuOpen,
    });
    expect(toggle).toHaveAttribute("title", ptBR.Landing.nav.menuOpen);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
