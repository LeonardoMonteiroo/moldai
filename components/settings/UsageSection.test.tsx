import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";
import type { Credits } from "@/lib/types";
import { UsageSection } from "./UsageSection";
import { purchase, ApiError } from "@/lib/api-client";

vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return { ...actual, purchase: vi.fn() };
});

const CREDITS: Credits = {
  plan: "free",
  balance: 15,
  total: 30,
  renewsInDays: 10,
};

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
      <UsageSection credits={credits} initialLedger={[]} />,
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
      <UsageSection credits={credits} initialLedger={[]} />,
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
    renderWithIntl(<UsageSection credits={CREDITS} initialLedger={[]} />);

    const button = screen.getByRole("button", {
      name: ptBR.UsageSection.topupButton,
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
    renderWithIntl(<UsageSection credits={CREDITS} initialLedger={[]} />);

    await user.click(
      screen.getByRole("button", { name: ptBR.UsageSection.topupButton }),
    );

    await waitFor(() => {
      expect(screen.getByText("115")).toBeVisible();
    });
    expect(
      screen.queryByText(ptBR.ActionErrorNotice.message),
    ).not.toBeInTheDocument();
  });
});
