import { describe, it, expect, vi } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import { PricingPage } from "./PricingPage";
import { PLAN_PRICES } from "@/lib/billing/plans";
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
    // Free renders its own literal ("R$ 0"); every paid tier renders
    // "R$ {PLAN_PRICES[id]}" -- changing PLAN_PRICES changes the rendered
    // text, since nothing here pastes the number separately.
    expect(screen.getByText(ptBR.Pricing.priceFree)).toBeInTheDocument();
    expect(screen.getByText(`R$ ${PLAN_PRICES.atelier}`)).toBeInTheDocument();
    expect(screen.getByText(`R$ ${PLAN_PRICES.studio}`)).toBeInTheDocument();
    expect(screen.getByText(`R$ ${PLAN_PRICES.factory}`)).toBeInTheDocument();
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
        screen.getByText(`R$ ${Math.round(PLAN_PRICES.atelier * 0.8)}`),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: ptBR.Pricing.plans.atelier.cta }),
      ).toBeDisabled();
      expect(
        screen.getAllByText(ptBR.Pricing.annualBilledNote).length,
      ).toBeGreaterThan(0);
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
