import { describe, it, expect, vi } from "vitest";
import { renderWithIntl, ptBR, screen } from "@/components/test-utils";
import type { Credits } from "@/lib/types";
import { SizeChartsShell } from "./SizeChartsShell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return { ...actual, listSizeCharts: vi.fn(() => new Promise(() => {})) };
});

const CREDITS: Credits = {
  plan: "free",
  balance: 30,
  total: 30,
  renewsInDays: 12,
};

// #117: the subtitle used to claim the active grade "vale para toda geração
// e graduação" -- but pickSizeChartForGeneration falls back to the system
// chart whenever the garment's gender differs, exactly what the library's
// own "activeScope" badge already admits. The two must not contradict.
describe("SizeChartsShell", () => {
  it("states the gender-scoped rule in the subtitle, not a blanket claim", () => {
    renderWithIntl(<SizeChartsShell userEmail="a@b.com" credits={CREDITS} />);

    expect(screen.getByText(ptBR.SizeCharts.subtitle)).toBeInTheDocument();
    expect(
      screen.queryByText(
        "A grade escolhida vale para toda geração e graduação",
      ),
    ).not.toBeInTheDocument();
  });
});
