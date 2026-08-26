import { describe, it, expect } from "vitest";
import { renderWithIntl, screen, ptBR } from "@/components/test-utils";
import { LandingPage } from "./LandingPage";
import { FREE_PLAN_CREDITS } from "./constants";

describe("LandingPage", () => {
  it("renders the nav's real links: howItWorks/formats as same-page anchors, login/signup as auth links", () => {
    renderWithIntl(<LandingPage />);

    const howItWorks = screen.getByRole("link", {
      name: ptBR.Landing.nav.howItWorks,
    });
    expect(howItWorks).toHaveAttribute("href", "#how-it-works");

    const formats = screen.getByRole("link", {
      name: ptBR.Landing.nav.formats,
    });
    expect(formats).toHaveAttribute("href", "#formats");

    expect(
      screen.getByRole("link", { name: ptBR.Landing.nav.login }),
    ).toHaveAttribute("href", "/login");
    expect(
      screen.getByRole("link", { name: ptBR.Landing.nav.signup }),
    ).toHaveAttribute("href", "/signup");
  });

  it("marks the unbuilt Planos nav item as disabled and badged, not a dead link", () => {
    renderWithIntl(<LandingPage />);

    const plans = screen.getByRole("button", { name: ptBR.Landing.nav.plans });
    expect(plans).toBeDisabled();
    expect(plans).toHaveAttribute("title", ptBR.Landing.nav.comingSoonTitle);
    expect(
      screen.getAllByText(ptBR.Landing.nav.comingSoonBadge).length,
    ).toBeGreaterThan(0);
  });

  it("renders the hero copy, with the primary CTA's credit count from FREE_PLAN_CREDITS", () => {
    renderWithIntl(<LandingPage />);

    expect(screen.getByText(ptBR.Landing.hero.eyebrow)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: ptBR.Landing.hero.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(ptBR.Landing.hero.body)).toBeInTheDocument();
    expect(screen.getByText(ptBR.Landing.hero.noCardNote)).toBeInTheDocument();

    const expectedCta = ptBR.Landing.hero.primaryCta.replace(
      "{credits}",
      String(FREE_PLAN_CREDITS),
    );
    expect(screen.getByRole("link", { name: expectedCta })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("shows the secondary CTA disabled and badged -- there is no public demo pattern", () => {
    renderWithIntl(<LandingPage />);

    const secondary = screen.getByRole("button", {
      name: ptBR.Landing.hero.secondaryCta,
    });
    expect(secondary).toBeDisabled();
    expect(secondary).toHaveAttribute(
      "title",
      ptBR.Landing.hero.secondaryCtaTitle,
    );
  });

  it("renders the mockup card as a static illustration with no exposed fake controls", () => {
    renderWithIntl(<LandingPage />);

    expect(
      screen.getByText(ptBR.Landing.mockup.promptExample),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.MessageInput.generateButton),
    ).toBeInTheDocument();
    // The fake prompt row is aria-hidden, so neither a real textbox nor a
    // real button with the "Gerar" name is exposed to assistive tech.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ptBR.MessageInput.generateButton }),
    ).not.toBeInTheDocument();

    const canvas = screen.getByRole("img", {
      name: ptBR.Landing.mockup.canvasAlt,
    });
    expect(canvas).toBeInTheDocument();

    expect(
      screen.getByText(ptBR.PatternData.pieceNames.front.toUpperCase()),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.PatternData.pieceNames.back.toUpperCase()),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.PatternData.pieceNames.sleeve.toUpperCase()),
    ).toBeInTheDocument();

    expect(
      screen.getByText(ptBR.Landing.mockup.chipGraduate),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.Landing.mockup.chipCutPlan),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.Landing.mockup.chipExport),
    ).toBeInTheDocument();
  });

  it("renders the formats section reusing the editor's own format labels", () => {
    renderWithIntl(<LandingPage />);

    expect(screen.getByText(ptBR.Landing.formats.title)).toBeInTheDocument();
    expect(screen.getByText(ptBR.Footer.formatSvg)).toBeInTheDocument();
    expect(screen.getByText(ptBR.Footer.formatDxf)).toBeInTheDocument();
    expect(screen.getByText(ptBR.Footer.formatPdfA4)).toBeInTheDocument();
  });

  it("renders all three step cards with their exact titles and bodies", () => {
    renderWithIntl(<LandingPage />);

    for (const key of ["describe", "adjust", "export"] as const) {
      expect(
        screen.getByText(ptBR.Landing.steps[key].title),
      ).toBeInTheDocument();
      expect(
        screen.getByText(ptBR.Landing.steps[key].body),
      ).toBeInTheDocument();
    }
  });
});
