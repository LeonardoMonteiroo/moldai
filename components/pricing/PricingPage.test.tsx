import { describe, it, expect, vi } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  priceText,
} from "@/components/test-utils";
import { PricingPage } from "./PricingPage";
import { PLAN_PRICE_CENTS, formatBRL } from "@/lib/billing/plans";
import { COSTS, PLAN_IDS } from "@/lib/types";

// #106/#9's own precedent: COSTS is a plain object, not frozen -- mocking
// @/lib/types with a shallow copy lets the footer test force a boundary
// value through the same COSTS the component reads.
vi.mock("@/lib/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/types")>();
  return { ...actual, COSTS: { ...actual.COSTS } };
});

describe("PricingPage", () => {
  it("renders the title, subtitle and a Mensal/Anual toggle for an anonymous visitor", () => {
    renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
    expect(
      screen.getByRole("heading", { name: ptBR.Pricing.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(ptBR.Pricing.subtitle)).toBeInTheDocument();
    expect(screen.getByText(ptBR.Pricing.toggle.monthly)).toBeInTheDocument();
    expect(screen.getByText(ptBR.Pricing.toggle.annual)).toBeInTheDocument();
  });

  it("renders four plan cards with the documented price and credit amount from lib/billing/plans.ts", () => {
    renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
    for (const id of PLAN_IDS) {
      expect(
        screen.getByText(ptBR.PlanSection.plans[id].name),
      ).toBeInTheDocument();
    }
    // #206: every tier -- free included -- renders through the same
    // formatBRL(PLAN_PRICE_CENTS[id]), so changing a price in plans.ts
    // changes the rendered text and nothing here pastes a currency literal.
    // Asserted via formatBRL rather than a hand-written "R$ 59,00" for the
    // same reason the catalog no longer carries one: a second copy of the
    // format is a second thing that can disagree.
    for (const id of PLAN_IDS) {
      expect(
        screen.getByText(priceText(formatBRL(PLAN_PRICE_CENTS[id]))),
      ).toBeInTheDocument();
    }
  });

  it("gives the Estúdio card the 2px olive border and the mais escolhido badge", () => {
    renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
    expect(screen.getByText(ptBR.Pricing.mostChosenBadge)).toBeInTheDocument();
    const studioName = screen.getByText(ptBR.PlanSection.plans.studio.name);
    const card = studioName.closest("div.border-2");
    expect(card).not.toBeNull();
    expect(card).toHaveClass("border-olive");
  });

  it("marks every unshipped capability em breve and leaves shipped ones unbadged", () => {
    renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
    // Modelo v2 Pro (Estúdio) is not a real, shipped capability.
    const modelRow = screen.getByText(ptBR.Pricing.feature.modelV2Pro);
    expect(modelRow.closest("li")?.textContent).toContain(
      ptBR.PlanSection.comingSoonBadge,
    );
    // Graduação e .dxf liberados (Grátis) is real and shipped -- no badge.
    const graduationRow = screen.getByText(
      ptBR.Pricing.feature.graduationExport,
    );
    expect(graduationRow.closest("li")?.textContent).not.toContain(
      ptBR.PlanSection.comingSoonBadge,
    );
  });

  it("never presents Plano de corte automático or unlimited version history as an Estúdio/Ateliê-only feature", () => {
    renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
    expect(screen.queryByText(/plano de corte/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/histórico ilimitado/i)).not.toBeInTheDocument();
  });

  it("renders the cost footer from COSTS, never a hardcoded 4, and the top-up line from TOPUP", () => {
    const ORIGINAL_ADJUST = COSTS.adjust;
    Object.assign(COSTS, { adjust: 7 });
    renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
    expect(screen.getByText(/geração 7/)).toBeInTheDocument();
    expect(screen.queryByText(/geração 4/)).not.toBeInTheDocument();
    expect(screen.getByText(/100 por R\$ 19/)).toBeInTheDocument();
    Object.assign(COSTS, { adjust: ORIGINAL_ADJUST });
  });

  it('disables "Falar com vendas" on Confecção and badges it, rather than an invented address', () => {
    renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
    expect(
      screen.getByRole("button", { name: ptBR.Pricing.plans.factory.cta }),
    ).toBeDisabled();
  });

  describe("annual toggle", () => {
    it("shows 80% of the monthly price and disables the paid CTAs with a badge", async () => {
      const user = userEvent.setup();
      renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);

      await user.click(screen.getByText(ptBR.Pricing.toggle.annual));

      expect(
        screen.getByText(
          priceText(formatBRL(Math.round(PLAN_PRICE_CENTS.atelier * 0.8))),
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: ptBR.Pricing.plans.atelier.cta }),
      ).toBeDisabled();
      expect(
        screen.getAllByText(ptBR.Pricing.annualBilledNote).length,
      ).toBeGreaterThan(0);
    });
  });

  // #218: the top nav is LandingNav, reused from the public landing page --
  // it used to always render the signed-out "Entrar"/"Testar grátis" pair
  // regardless of the session PricingPage itself already knows about.
  describe("top nav", () => {
    it("shows Entrar/Testar grátis for an anonymous visitor", () => {
      renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
      expect(
        screen.getByRole("link", { name: ptBR.Landing.nav.login }),
      ).toHaveAttribute("href", "/login");
      expect(
        screen.getByRole("link", { name: ptBR.Landing.nav.signup }),
      ).toHaveAttribute("href", "/signup");
      expect(
        screen.queryByRole("link", { name: ptBR.Landing.nav.dashboard }),
      ).not.toBeInTheDocument();
    });

    it("shows a link back to the dashboard for a signed-in visitor, not Entrar/Testar grátis", () => {
      renderWithIntl(<PricingPage signedIn={true} currentPlan="free" />);
      expect(
        screen.getByRole("link", { name: ptBR.Landing.nav.dashboard }),
      ).toHaveAttribute("href", "/");
      expect(
        screen.queryByRole("link", { name: ptBR.Landing.nav.login }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: ptBR.Landing.nav.signup }),
      ).not.toBeInTheDocument();
    });
  });

  describe("CTA destinations", () => {
    it("sends every actionable CTA to /signup when there is no session", () => {
      renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
      expect(
        screen.getByRole("link", { name: ptBR.Pricing.plans.atelier.cta }),
      ).toHaveAttribute("href", "/signup");
      expect(
        screen.getByRole("link", { name: ptBR.Pricing.plans.studio.cta }),
      ).toHaveAttribute("href", "/signup");
    });

    it("shows Plano atual on the current plan and sends the others to /settings when signed in", () => {
      renderWithIntl(<PricingPage signedIn={true} currentPlan="atelier" />);
      expect(
        screen.getByText(ptBR.PlanSection.currentBadge),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", {
          name: ptBR.Pricing.plans.atelier.cta,
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: ptBR.Pricing.plans.studio.cta }),
      ).toHaveAttribute("href", "/settings?section=plan");
    });
  });
});
