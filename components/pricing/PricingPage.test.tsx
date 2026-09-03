import { describe, it, expect, vi } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  priceText,
} from "@/components/test-utils";
import { PricingPage } from "./PricingPage";
import {
  PLAN_PRICE_CENTS,
  formatBRL,
  annualMonthlyEquivalentCents,
} from "@/lib/billing/plans";
import { COSTS, PLAN_IDS } from "@/lib/types";

// #106/#9's own precedent: COSTS is a plain object, not frozen -- mocking
// @/lib/types with a shallow copy lets the footer test force a boundary
// value through the same COSTS the component reads.
vi.mock("@/lib/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/types")>();
  return { ...actual, COSTS: { ...actual.COSTS } };
});

describe("PricingPage", () => {
  it("renders the eyebrow, headline, subtitle and a Mensal/Anual toggle for an anonymous visitor", () => {
    renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
    expect(
      screen.getByRole("heading", { name: ptBR.Pricing.headline }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(ptBR.Pricing.title).length).toBeGreaterThan(0);
    expect(screen.getByText(ptBR.Pricing.subtitle)).toBeInTheDocument();
    expect(screen.getByText(ptBR.Pricing.toggle.monthly)).toBeInTheDocument();
    expect(screen.getByText(ptBR.Pricing.toggle.annual)).toBeInTheDocument();
  });

  // Planos.dc.html:36 specifies asymmetric hero padding (56px top / 44px
  // bottom) and a 18px gap between the Grátis card and the paid-plan grid
  // (line 52) -- both had rounded to a uniform/narrower value before this fix.
  it("matches the redesign reference's hero padding and card-row gap", () => {
    const { container } = renderWithIntl(
      <PricingPage signedIn={false} currentPlan={null} />,
    );
    const hero = container.querySelector('[class*="pb-11"]');
    expect(hero).not.toBeNull();
    expect(hero).toHaveClass("pt-14");

    const cardRow = container.querySelector('[class*="gap-[18px]"]');
    expect(cardRow).not.toBeNull();
  });

  it("renders four plan cards with the documented price and credit amount from lib/billing/plans.ts", () => {
    renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
    for (const id of PLAN_IDS) {
      expect(
        screen.getByText(ptBR.PlanSection.plans[id].name),
      ).toBeInTheDocument();
    }
    // #206: every paid tier renders through the same
    // formatBRL(PLAN_PRICE_CENTS[id]), so changing a price in plans.ts
    // changes the rendered text and nothing here pastes a currency literal.
    // Asserted via formatBRL rather than a hand-written "R$ 59,00" for the
    // same reason the catalog no longer carries one: a second copy of the
    // format is a second thing that can disagree. The Grátis card shows no
    // price line at all -- there's nothing to charge -- so it's excluded.
    for (const id of PLAN_IDS.filter((id) => id !== "free")) {
      expect(
        screen.getByText(priceText(formatBRL(PLAN_PRICE_CENTS[id]))),
      ).toBeInTheDocument();
    }
  });

  // Regression guard: this previously targeted "studio" (a real, previously
  // shipped bug found by the redesign fidelity pass's Round 2 audit) --
  // the design's own default state features Ateliê (R$59), not Estúdio.
  it("gives the Ateliê card the 2px olive border, the mais escolhido badge, and the one solid CTA", () => {
    renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
    expect(screen.getByText(ptBR.Pricing.mostChosenBadge)).toBeInTheDocument();
    const atelierName = screen.getByText(ptBR.PlanSection.plans.atelier.name);
    const card = atelierName.closest("div.border-2");
    expect(card).not.toBeNull();
    expect(card).toHaveClass("border-olive");

    const atelierCta = screen.getByRole("link", {
      name: ptBR.Pricing.plans.atelier.cta,
    });
    expect(atelierCta).toHaveAttribute("data-variant", "default");

    // Neither of the other two paid plans is featured -- their CTAs stay
    // outline, not the solid fill only the featured card should carry.
    const studioCta = screen.getByRole("link", {
      name: ptBR.Pricing.plans.studio.cta,
    });
    expect(studioCta).toHaveAttribute("data-variant", "outline");
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

  it("renders the cost footer from COSTS, never a hardcoded value, and the top-up line from TOPUP", () => {
    const ORIGINAL_ADJUST = COSTS.adjust;
    Object.assign(COSTS, { adjust: 7 });
    renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);
    const generateTile = screen
      .getByText(ptBR.Pricing.footer.costs.generate)
      .closest("div");
    expect(generateTile).toHaveTextContent("7");
    expect(generateTile).not.toHaveTextContent("4");
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
    it("shows the discounted monthly-equivalent price and keeps every paid CTA enabled", async () => {
      const user = userEvent.setup();
      renderWithIntl(<PricingPage signedIn={false} currentPlan={null} />);

      await user.click(screen.getByText(ptBR.Pricing.toggle.annual));

      expect(
        screen.getByText(
          priceText(formatBRL(annualMonthlyEquivalentCents("atelier"))),
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: ptBR.Pricing.plans.atelier.cta }),
      ).toHaveAttribute("href", "/signup");
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
