import { describe, it, expect } from "vitest";
import { renderWithIntl, ptBR, screen } from "@/components/test-utils";
import type { Credits } from "@/lib/types";
import { COSTS } from "@/lib/types";
import { PlanSection } from "./PlanSection";

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
    const t = ptBR.PlanSection;
    expect(
      screen.getByText(t.costGenerate.replace("{cost}", String(COSTS.adjust))),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t.costAdjust.replace("{cost}", String(COSTS.adjust))),
    ).toBeInTheDocument();
  });
});
