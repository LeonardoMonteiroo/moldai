import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
  translatorFor,
} from "@/components/test-utils";
import type { Credits } from "@/lib/types";
import { COSTS } from "@/lib/types";
import { PlanSection } from "./PlanSection";
import { purchase, ApiError } from "@/lib/api-client";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return { ...actual, purchase: vi.fn() };
});

// #106: COSTS is a plain object, not frozen -- mocking @/lib/types with a
// shallow copy of it (rather than the same frozen reference the real module
// exports) lets these tests force each boundary value (0, 1, 2) through the
// same COSTS the component reads, without a separate mock per cost key.
vi.mock("@/lib/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/types")>();
  return { ...actual, COSTS: { ...actual.COSTS } };
});

const CREDITS: Credits = {
  plan: "free",
  balance: 30,
  total: 30,
  renewsInDays: 20,
};

function subscribeLabel(plan: string) {
  const tPlan = translatorFor("PlanSection");
  return tPlan("subscribeButton", { plan: tPlan(`plans.${plan}.name`) });
}

describe("PlanSection", () => {
  // #108: the cut plan is computed client-side and never debits credits —
  // it must not appear priced in the cost list at all. The catalog key
  // itself was deleted, so there is no remaining `ptBR` value to reference
  // for the DOM check (checked as a literal here); the catalog-shape
  // assertion below is the literal-free half of this guard.
  it("shows no entry for the cut plan (it's free, computed client-side)", () => {
    renderWithIntl(<PlanSection credits={CREDITS} />);
    expect(screen.queryByText(/plano de corte/i)).not.toBeInTheDocument();
    expect(ptBR.PlanSection).not.toHaveProperty("costCuttingPlan");
  });

  it("prices generation and adjustment the same, at the real debited cost", () => {
    renderWithIntl(<PlanSection credits={CREDITS} />);
    const tPlan = translatorFor("PlanSection");
    expect(
      screen.getByText(tPlan("costGenerate", { cost: COSTS.adjust })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(tPlan("costAdjust", { cost: COSTS.adjust })),
    ).toBeInTheDocument();
  });

  // #106: "{cost} créditos" was a hardcoded plural noun -- COSTS.adjust is 1,
  // so /settings?section=plan rendered "Ajuste · 1 créditos" on every load.
  describe("cost line pluralization (#106)", () => {
    const ORIGINAL_COSTS = { ...COSTS };
    afterEach(() => Object.assign(COSTS, ORIGINAL_COSTS));

    it.each([
      ["costGenerate", "adjust"],
      ["costAdjust", "adjust"],
      ["costGraduate", "graduate"],
      ["costCorrection", "correction"],
    ] as const)("pluralizes %s at 0, 1 and 2 credits", (key, costsKey) => {
      const tPlan = translatorFor("PlanSection");
      for (const cost of [0, 1, 2]) {
        Object.assign(COSTS, { [costsKey]: cost });
        const { unmount } = renderWithIntl(<PlanSection credits={CREDITS} />);
        expect(screen.getByText(tPlan(key, { cost }))).toBeInTheDocument();
        unmount();
      }
    });
  });

  // #9: PLAN_CREDITS's thousands are rendered through {credits, number} ICU
  // interpolation, not a pasted "2.000" literal in the catalog.
  it("renders the studio card's credits label with the number formatted for pt-BR", () => {
    renderWithIntl(<PlanSection credits={CREDITS} />);
    const tPlan = translatorFor("PlanSection");
    expect(
      screen.getByText(tPlan("plans.studio.creditsLabel", { credits: 2000 })),
    ).toBeInTheDocument();
  });

  // #9: applyPurchase can now move a wallet to any paid tier -- every plan
  // above the account's own is a real, working control, and every plan
  // below it stays disabled + badged, with the boundary stated on screen.
  describe("real plan switching (#9)", () => {
    afterEach(() => {
      vi.mocked(purchase).mockReset();
      refresh.mockReset();
    });

    it("offers an enabled control for every tier above the current plan, from a free account", () => {
      renderWithIntl(<PlanSection credits={CREDITS} />);
      for (const plan of ["atelier", "studio", "factory"]) {
        expect(
          screen.getByRole("button", { name: subscribeLabel(plan) }),
        ).toBeEnabled();
      }
      // No card is both current and disabled-badged.
      expect(
        screen.queryAllByText(ptBR.PlanSection.comingSoonBadge),
      ).toHaveLength(0);
    });

    it("badges every lower tier em breve with a disabled control, and shows the downgrade note", () => {
      renderWithIntl(<PlanSection credits={{ ...CREDITS, plan: "studio" }} />);
      // free and atelier are lower tiers now; factory is still an upgrade.
      expect(
        screen.getAllByText(ptBR.PlanSection.comingSoonBadge),
      ).toHaveLength(2);
      expect(
        screen.getAllByRole("button", {
          name: ptBR.PlanSection.downgradeButton,
        }),
      ).toHaveLength(2);
      expect(
        screen.getByRole("button", { name: subscribeLabel("factory") }),
      ).toBeEnabled();
      expect(
        screen.getByText(ptBR.PlanSection.downgradeNote),
      ).toBeInTheDocument();
    });

    it("shows no downgrade note for a free account (nothing below it to downgrade to)", () => {
      renderWithIntl(<PlanSection credits={CREDITS} />);
      expect(
        screen.queryByText(ptBR.PlanSection.downgradeNote),
      ).not.toBeInTheDocument();
    });

    it("subscribes to studio, updates the current-plan badge and refreshes the server data", async () => {
      vi.mocked(purchase).mockResolvedValue({
        status: "ok",
        credits: {
          plan: "studio",
          balance: 2000,
          total: 2000,
          renewsInDays: 30,
        },
      });
      const user = userEvent.setup();
      renderWithIntl(<PlanSection credits={CREDITS} />);

      await user.click(
        screen.getByRole("button", { name: subscribeLabel("studio") }),
      );

      expect(purchase).toHaveBeenCalledWith("subscribe", "studio");
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: subscribeLabel("studio") }),
        ).not.toBeInTheDocument();
      });
      // Only factory is left as an upgrade target now.
      expect(
        screen.getByRole("button", { name: subscribeLabel("factory") }),
      ).toBeInTheDocument();
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("renders catalog copy resolved from the wire error code and leaves the screen usable", async () => {
      vi.mocked(purchase).mockImplementation(async () => {
        throw new ApiError(400, "plan_not_upgradable");
      });
      const user = userEvent.setup();
      renderWithIntl(<PlanSection credits={CREDITS} />);

      const button = screen.getByRole("button", {
        name: subscribeLabel("atelier"),
      });
      await user.click(button);

      await waitFor(() => {
        expect(
          screen.getByText(ptBR.PlanSection.errors.plan_not_upgradable),
        ).toBeVisible();
      });
      expect(button).not.toBeDisabled();
    });

    it("resolves a generic failure through errors.request_failed", async () => {
      vi.mocked(purchase).mockImplementation(async () => {
        throw new Error("network down");
      });
      const user = userEvent.setup();
      renderWithIntl(<PlanSection credits={CREDITS} />);

      await user.click(
        screen.getByRole("button", { name: subscribeLabel("atelier") }),
      );

      await waitFor(() => {
        expect(
          screen.getByText(ptBR.PlanSection.errors.request_failed),
        ).toBeVisible();
      });
    });
  });

  it('links out to the public /planos screen for the fuller card content ("mais escolhido", feature bullets)', () => {
    renderWithIntl(<PlanSection credits={CREDITS} />);
    expect(
      screen.getByRole("link", { name: ptBR.PlanSection.viewAllPlansLink }),
    ).toHaveAttribute("href", "/planos");
  });
});
