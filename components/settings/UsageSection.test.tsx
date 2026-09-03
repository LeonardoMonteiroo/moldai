import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
  translatorFor,
} from "@/components/test-utils";
import type { Credits, UsageThisCycle } from "@/lib/types";
import { COSTS } from "@/lib/types";
import { UsageSection } from "./UsageSection";
import { purchase, ApiError } from "@/lib/api-client";
import { TOPUP_PRICE_CENTS, formatBRL } from "@/lib/billing/plans";

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
  balance: 15,
  total: 30,
  renewsInDays: 10,
};

const NO_USAGE: UsageThisCycle = { generate: 0, graduate: 0 };

// #206: the top-up button's label now interpolates the price from
// lib/billing/plans.ts instead of carrying "R$ 19" as a catalog literal, so
// the expected text has to be resolved through the catalog rather than read
// off it raw -- translatorFor also asserts the key actually exists.
//
// NOT run through priceText, unlike a getByText matcher: an accessible name
// is computed from the DOM and compared without Testing Library's text
// normalizer, so the non-breaking space Intl emits between "R$" and the
// amount has to stay intact on this side too.
const topupLabel = translatorFor("UsageSection")("topupButton", {
  price: formatBRL(TOPUP_PRICE_CENTS),
});

describe("UsageSection", () => {
  // Deliberately afterEach, not beforeEach: resetting the mock in beforeEach
  // and then configuring a rejecting mockImplementation inside the test body
  // makes Vitest 2.1.9 misreport that rejection as an unhandled error even
  // though the app code's try/catch does handle it (confirmed by
  // instrumenting the catch block directly) -- isolated with a minimal
  // React+vi.mock repro outside this file. Resetting after each test gives
  // every test the same clean slate without tripping it.
  afterEach(() => vi.mocked(purchase).mockReset());

  it("fills the bar proportionally when balance is within the plan total", () => {
    const credits: Credits = {
      plan: "free",
      balance: 15,
      total: 30,
      renewsInDays: 10,
    };
    const { container } = renderWithIntl(
      <UsageSection
        credits={credits}
        initialLedger={[]}
        patternCount={0}
        usageThisCycle={NO_USAGE}
        patternsCreatedThisWeek={0}
      />,
    );
    const bar = container.querySelector(".bg-olive") as HTMLElement;
    expect(bar.style.width).toBe("50%");
  });

  // #37: a top-up raises balance without raising total (purchased credits
  // carry over independently of the plan allowance), so balance can exceed
  // total — the bar must clamp at 100% instead of overflowing its track.
  it("clamps the bar at 100% when balance exceeds total (purchased top-up credits)", () => {
    const credits: Credits = {
      plan: "free",
      balance: 130,
      total: 30,
      renewsInDays: 1,
    };
    const { container } = renderWithIntl(
      <UsageSection
        credits={credits}
        initialLedger={[]}
        patternCount={0}
        usageThisCycle={NO_USAGE}
        patternsCreatedThisWeek={0}
      />,
    );
    const bar = container.querySelector(".bg-olive") as HTMLElement;
    expect(bar.style.width).toBe("100%");
  });

  // #44: purchase() throws on any non-2xx (expired JWT, a 5xx) -- previously
  // uncaught here, so `buying` never reset (the button stayed disabled
  // forever) and nothing on screen told the user whether the R$19 charge
  // went through.
  it("shows a notice and re-enables the button when the top-up call fails", async () => {
    vi.mocked(purchase).mockImplementation(async () => {
      throw new ApiError(500, "server_error");
    });
    const user = userEvent.setup();
    renderWithIntl(
      <UsageSection
        credits={CREDITS}
        initialLedger={[]}
        patternCount={0}
        usageThisCycle={NO_USAGE}
        patternsCreatedThisWeek={0}
      />,
    );

    const button = screen.getByRole("button", {
      name: topupLabel,
    });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(ptBR.ActionErrorNotice.message)).toBeVisible();
    });
    expect(button).not.toBeDisabled();
  });

  it("does not show a failure notice, and updates the balance, on success", async () => {
    vi.mocked(purchase).mockResolvedValue({
      status: "ok",
      credits: { ...CREDITS, balance: 115 },
    });
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <UsageSection
        credits={CREDITS}
        initialLedger={[]}
        patternCount={0}
        usageThisCycle={NO_USAGE}
        patternsCreatedThisWeek={0}
      />,
    );

    await user.click(screen.getByRole("button", { name: topupLabel }));

    // Scoped to the balance panel's own big number -- the "Créditos
    // restantes" stat card now shows the identical balance too.
    await waitFor(() => {
      expect(container.querySelector(".text-display")).toHaveTextContent("115");
    });
    expect(
      screen.queryByText(ptBR.ActionErrorNotice.message),
    ).not.toBeInTheDocument();
  });

  // #161: under the real gateway, purchase() answers {status:"redirect",
  // url} instead of crediting instantly -- the balance/ledger must not be
  // touched (nothing has actually been granted yet), and the browser
  // navigates out to the hosted checkout.
  it("navigates to the checkout URL on a redirect result, without updating the balance", async () => {
    const checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_x";
    vi.mocked(purchase).mockResolvedValue({
      status: "redirect",
      url: checkoutUrl,
    });
    const assign = vi.fn();
    const assignSpy = vi
      .spyOn(window, "location", "get")
      .mockReturnValue({ assign } as unknown as Location);
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <UsageSection
        credits={CREDITS}
        initialLedger={[]}
        patternCount={0}
        usageThisCycle={NO_USAGE}
        patternsCreatedThisWeek={0}
      />,
    );

    await user.click(screen.getByRole("button", { name: topupLabel }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(checkoutUrl);
    });
    // The balance shown is still the one this section was rendered with --
    // no optimistic "115" (CREDITS.balance + TOPUP_CREDITS) ever appears.
    // Scoped to the balance panel's own big number -- the "Créditos
    // restantes" stat card now shows the identical balance too.
    expect(container.querySelector(".text-display")).toHaveTextContent(
      String(CREDITS.balance),
    );

    assignSpy.mockRestore();
  });

  // #106: "renova em {days} dias" was a hardcoded plural noun.
  it("pluralizes the renewal days at 0, 1 and 2", () => {
    const tUsage = translatorFor("UsageSection");
    for (const renewsInDays of [0, 1, 2]) {
      const credits: Credits = {
        plan: "free",
        balance: 15,
        total: 30,
        renewsInDays,
      };
      const { unmount } = renderWithIntl(
        <UsageSection
          credits={credits}
          initialLedger={[]}
          patternCount={0}
          usageThisCycle={NO_USAGE}
          patternsCreatedThisWeek={0}
        />,
      );
      expect(
        screen.getByText(
          tUsage("outOfTotal", { total: 30, days: renewsInDays }),
        ),
      ).toBeInTheDocument();
      unmount();
    }
  });

  // #9: a subscribe row's reason is the purchased PlanId, resolved through
  // PlanSection's own catalog rather than REASON_KEY's debit reasons.
  describe("ledger history (#9)", () => {
    it("suffixes a subscribe row with the purchased plan's name", () => {
      renderWithIntl(
        <UsageSection
          credits={CREDITS}
          initialLedger={[
            {
              type: "subscribe",
              reason: "studio",
              amount: 1970,
              createdAt: new Date().toISOString(),
            },
          ]}
          patternCount={0}
          usageThisCycle={NO_USAGE}
          patternsCreatedThisWeek={0}
        />,
      );
      expect(
        screen.getByText(
          `${ptBR.UsageSection.typeSubscribe} · ${ptBR.PlanSection.plans.studio.name}`,
        ),
      ).toBeInTheDocument();
    });

    it("renders a legacy subscribe row (reason: null) with no plan suffix", () => {
      renderWithIntl(
        <UsageSection
          credits={CREDITS}
          initialLedger={[
            {
              type: "subscribe",
              reason: null,
              amount: 470,
              createdAt: new Date().toISOString(),
            },
          ]}
          patternCount={0}
          usageThisCycle={NO_USAGE}
          patternsCreatedThisWeek={0}
        />,
      );
      expect(
        screen.getByText(ptBR.UsageSection.typeSubscribe),
      ).toBeInTheDocument();
    });
  });

  // The three stat cards moved here from AccountSummaryCard/PlanSection are
  // real, derived data -- not the design mockup's "8 gerações · 4 ajustes"
  // split, which this app's ledger cannot honestly produce (every chat-driven
  // draft or later adjustment shares the identical "generate" reason code;
  // there is no separate "first generation" concept to count).
  describe("stat cards", () => {
    it("shows the real balance/total, usage-this-cycle, and pattern counts", () => {
      const tUsage = translatorFor("UsageSection");
      renderWithIntl(
        <UsageSection
          credits={CREDITS}
          initialLedger={[]}
          patternCount={24}
          usageThisCycle={{ generate: 8, graduate: 4 }}
          patternsCreatedThisWeek={3}
        />,
      );

      expect(
        screen.getByText(ptBR.UsageSection.statCreditsRemaining),
      ).toBeInTheDocument();
      expect(
        screen.getByText(tUsage("statCreditsRemainingSub", { total: 30 })),
      ).toBeInTheDocument();

      expect(
        screen.getByText(ptBR.UsageSection.statUsedThisCycle),
      ).toBeInTheDocument();
      // 8 generate + 4 graduate = 12 total actions this cycle.
      expect(screen.getByText("12")).toBeInTheDocument();
      expect(
        screen.getByText(
          tUsage("statUsedThisCycleSub", { generate: 8, graduate: 4 }),
        ),
      ).toBeInTheDocument();

      expect(
        screen.getByText(ptBR.UsageSection.statActivePatterns),
      ).toBeInTheDocument();
      expect(screen.getByText("24")).toBeInTheDocument();
      expect(
        screen.getByText(tUsage("statActivePatternsSub", { count: 3 })),
      ).toBeInTheDocument();
    });
  });

  // Moved here from PlanSection (#233 follow-up): the design's own
  // Plano-e-cobrança reference shows no cost-per-action panel at all --
  // it lives only on Créditos e uso.
  describe("cost-per-action panel", () => {
    it("prices generation and adjustment the same, at the real debited cost", () => {
      const tUsage = translatorFor("UsageSection");
      renderWithIntl(
        <UsageSection
          credits={CREDITS}
          initialLedger={[]}
          patternCount={0}
          usageThisCycle={NO_USAGE}
          patternsCreatedThisWeek={0}
        />,
      );
      expect(
        screen.getByText(tUsage("costGenerate", { cost: COSTS.adjust })),
      ).toBeInTheDocument();
      expect(
        screen.getByText(tUsage("costAdjust", { cost: COSTS.adjust })),
      ).toBeInTheDocument();
    });

    // #106: "{cost} créditos" was a hardcoded plural noun -- COSTS.adjust is
    // 1, so this panel rendered "Ajuste · 1 créditos" on every load.
    describe("cost line pluralization (#106)", () => {
      const ORIGINAL_COSTS = { ...COSTS };
      afterEach(() => Object.assign(COSTS, ORIGINAL_COSTS));

      it.each([
        ["costGenerate", "adjust"],
        ["costAdjust", "adjust"],
        ["costGraduate", "graduate"],
        ["costCorrection", "correction"],
      ] as const)("pluralizes %s at 0, 1 and 2 credits", (key, costsKey) => {
        const tUsage = translatorFor("UsageSection");
        for (const cost of [0, 1, 2]) {
          Object.assign(COSTS, { [costsKey]: cost });
          const { unmount } = renderWithIntl(
            <UsageSection
              credits={CREDITS}
              initialLedger={[]}
              patternCount={0}
              usageThisCycle={NO_USAGE}
              patternsCreatedThisWeek={0}
            />,
          );
          expect(screen.getByText(tUsage(key, { cost }))).toBeInTheDocument();
          unmount();
        }
      });
    });
  });
});
