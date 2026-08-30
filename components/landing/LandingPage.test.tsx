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

describe("LandingPage", () => {
  it("renders the nav's real links: howItWorks/faq as same-page anchors, login/signup as auth links", () => {
    renderWithIntl(<LandingPage />);

    const howItWorks = screen.getByRole("link", {
      name: ptBR.Landing.nav.howItWorks,
    });
    expect(howItWorks).toHaveAttribute("href", "#how-it-works");

    const faq = screen.getByRole("link", {
      name: ptBR.Landing.nav.faq,
    });
    expect(faq).toHaveAttribute("href", "#faq");

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
    expect(screen.getByRole("link", { name: expectedCta })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  // The hero's image is a neutral placeholder for now
  // (public/landing/hero-editor.svg) -- assert it renders by its catalog
  // alt text.
  it("renders the hero's placeholder image", () => {
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
      // Each thumbnail is a neutral placeholder for now
      // (public/landing/*.svg) -- assert the image itself, named by its
      // catalog alt.
      expect(
        screen.getByRole("img", { name: ptBR.Landing.steps[key].imageAlt }),
      ).toBeInTheDocument();
    }
  });

  it("renders the FAQ section header and all four questions with their exact copy", () => {
    renderWithIntl(<LandingPage />);

    expect(
      screen.getByRole("heading", { name: ptBR.Landing.faq.sectionTitle }),
    ).toBeInTheDocument();

    for (const key of [
      "seamCheck",
      "sizeChart",
      "dxf",
      "readyToCut",
    ] as const) {
      expect(
        screen.getByText(ptBR.Landing.faq[key].question),
      ).toBeInTheDocument();
      expect(
        screen.getByText(ptBR.Landing.faq[key].answer),
      ).toBeInTheDocument();
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
