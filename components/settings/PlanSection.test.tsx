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

  // #111: PlanSection badged Ateliê "em breve" while PaywallModal sold it as
  // a live, working subscribe card -- two screens making opposite claims
  // about the same purchasable plan.
  describe("Ateliê purchase (#111)", () => {
    afterEach(() => vi.mocked(purchase).mockReset());

    it("is purchasable, not badged em breve, when it isn't the current plan", () => {
      renderWithIntl(<PlanSection credits={CREDITS} />);
      expect(
        screen.getByRole("button", { name: ptBR.PlanSection.subscribeButton }),
      ).toBeInTheDocument();
      // Only one "em breve" badge pair should remain visible per non-current,
      // non-purchasable plan: studio and factory, not atelier.
      expect(
        screen.getAllByText(ptBR.PlanSection.comingSoonBadge),
      ).toHaveLength(2);
    });

    it("studio and factory stay badged em breve, not purchasable, until #9", () => {
      renderWithIntl(<PlanSection credits={CREDITS} />);
      // Exactly one subscribe button exists at all -- proves studio/factory
      // didn't also grow one, without asserting on their card's DOM shape.
      expect(
        screen.getAllByRole("button", {
          name: ptBR.PlanSection.subscribeButton,
        }),
      ).toHaveLength(1);
    });

    it("shows no subscribe button once atelier is the current plan", () => {
      renderWithIntl(<PlanSection credits={{ ...CREDITS, plan: "atelier" }} />);
      expect(
        screen.queryByRole("button", {
          name: ptBR.PlanSection.subscribeButton,
        }),
      ).not.toBeInTheDocument();
      // free, studio and factory are all non-current and non-purchasable now.
      expect(
        screen.getAllByText(ptBR.PlanSection.comingSoonBadge),
      ).toHaveLength(3);
    });

    it("moves the current-plan badge to Ateliê and clears the subscribe button on success", async () => {
      vi.mocked(purchase).mockResolvedValue({
        status: "ok",
        credits: {
          plan: "atelier",
          balance: 500,
          total: 500,
          renewsInDays: 30,
        },
      });
      const user = userEvent.setup();
      renderWithIntl(<PlanSection credits={CREDITS} />);

      await user.click(
        screen.getByRole("button", { name: ptBR.PlanSection.subscribeButton }),
      );

      await waitFor(() => {
        expect(
          screen.queryByRole("button", {
            name: ptBR.PlanSection.subscribeButton,
          }),
        ).not.toBeInTheDocument();
      });
      expect(
        screen.queryByText(ptBR.ActionErrorNotice.message),
      ).not.toBeInTheDocument();
    });

    it("shows a notice and re-enables the button when the subscribe call fails", async () => {
      vi.mocked(purchase).mockImplementation(async () => {
        throw new ApiError(500, "server_error");
      });
      const user = userEvent.setup();
      renderWithIntl(<PlanSection credits={CREDITS} />);

      const button = screen.getByRole("button", {
        name: ptBR.PlanSection.subscribeButton,
      });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText(ptBR.ActionErrorNotice.message)).toBeVisible();
      });
      expect(button).not.toBeDisabled();
    });
  });
});
