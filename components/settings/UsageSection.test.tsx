import { describe, it, expect, vi } from "vitest";
import { renderWithIntl } from "@/components/test-utils";
import type { Credits } from "@/lib/types";
import { UsageSection } from "./UsageSection";

vi.mock("@/lib/api-client", () => ({ purchase: vi.fn() }));

describe("UsageSection", () => {
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
});
