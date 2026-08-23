import { describe, it, expect } from "vitest";
import { renderWithIntl, screen } from "@/components/test-utils";
import type { Credits } from "@/lib/types";
import { CreditsCard } from "./CreditsCard";

describe("CreditsCard", () => {
  it("fills the bar proportionally when balance is within the plan total", () => {
    const credits: Credits = {
      plan: "free",
      balance: 15,
      total: 30,
      renewsInDays: 10,
    };
    const { container } = renderWithIntl(<CreditsCard credits={credits} />);
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
    const { container } = renderWithIntl(<CreditsCard credits={credits} />);
    const bar = container.querySelector(".bg-olive") as HTMLElement;
    expect(bar.style.width).toBe("100%");
    // The true balance is still shown in full, not clamped.
    expect(screen.getByText("130")).toBeInTheDocument();
  });
});
