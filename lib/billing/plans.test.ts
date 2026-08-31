import { describe, it, expect } from "vitest";
import {
  PLAN_CREDITS,
  PLAN_PRICE_CENTS,
  PLAN_FEATURES,
  TOPUP_CREDITS,
  isPaidPlanId,
  isPlanOrIntervalUpgrade,
  isBillingInterval,
  effectiveCredits,
  annualMonthlyEquivalentCents,
  annualPriceCents,
  ANNUAL_DISCOUNT_FACTOR,
} from "./plans";
import { PLAN_IDS } from "@/lib/types";

describe("PLAN_CREDITS", () => {
  it("matches design 5c's four tiers", () => {
    expect(PLAN_CREDITS).toEqual({
      free: 30,
      atelier: 500,
      studio: 2000,
      factory: 10000,
    });
  });
});

describe("isPaidPlanId", () => {
  it("accepts the three paid ids", () => {
    expect(isPaidPlanId("atelier")).toBe(true);
    expect(isPaidPlanId("studio")).toBe(true);
    expect(isPaidPlanId("factory")).toBe(true);
  });

  it("rejects free, an unknown string, a number, null and undefined", () => {
    expect(isPaidPlanId("free")).toBe(false);
    expect(isPaidPlanId("banana")).toBe(false);
    expect(isPaidPlanId(500)).toBe(false);
    expect(isPaidPlanId(null)).toBe(false);
    expect(isPaidPlanId(undefined)).toBe(false);
  });
});

describe("isPlanOrIntervalUpgrade", () => {
  it("matches the old isPlanUpgrade for every all-monthly comparison", () => {
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "free", interval: "month" },
        { plan: "atelier", interval: "month" },
      ),
    ).toBe(true);
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "atelier", interval: "month" },
        { plan: "studio", interval: "month" },
      ),
    ).toBe(true);
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "studio", interval: "month" },
        { plan: "factory", interval: "month" },
      ),
    ).toBe(true);
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "free", interval: "month" },
        { plan: "factory", interval: "month" },
      ),
    ).toBe(true);
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "factory", interval: "month" },
        { plan: "studio", interval: "month" },
      ),
    ).toBe(false);
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "studio", interval: "month" },
        { plan: "atelier", interval: "month" },
      ),
    ).toBe(false);
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "atelier", interval: "month" },
        { plan: "free", interval: "month" },
      ),
    ).toBe(false);
    for (const id of PLAN_IDS) {
      expect(
        isPlanOrIntervalUpgrade(
          { plan: id, interval: "month" },
          { plan: id, interval: "month" },
        ),
      ).toBe(false);
    }
  });

  it("monthly to annual, same tier, is always an upgrade", () => {
    for (const plan of ["atelier", "studio", "factory"] as const) {
      expect(
        isPlanOrIntervalUpgrade(
          { plan, interval: "month" },
          { plan, interval: "year" },
        ),
      ).toBe(true);
    }
  });

  it("annual to monthly, same tier, is always a downgrade (refused)", () => {
    for (const plan of ["atelier", "studio", "factory"] as const) {
      expect(
        isPlanOrIntervalUpgrade(
          { plan, interval: "year" },
          { plan, interval: "month" },
        ),
      ).toBe(false);
    }
  });

  it("ranks purely by effectiveCredits across both axes at once", () => {
    // atelier-annual (500*12=6000) beats studio-monthly (2000).
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "studio", interval: "month" },
        { plan: "atelier", interval: "year" },
      ),
    ).toBe(true);
    // studio-monthly (2000) does not beat atelier-annual (6000).
    expect(
      isPlanOrIntervalUpgrade(
        { plan: "atelier", interval: "year" },
        { plan: "studio", interval: "month" },
      ),
    ).toBe(false);
  });
});

describe("effectiveCredits", () => {
  it("is the plain plan allowance for a monthly interval", () => {
    for (const id of PLAN_IDS) {
      expect(effectiveCredits(id, "month")).toBe(PLAN_CREDITS[id]);
    }
  });
  it("is 12x the plan allowance for an annual interval", () => {
    expect(effectiveCredits("atelier", "year")).toBe(500 * 12);
    expect(effectiveCredits("studio", "year")).toBe(2000 * 12);
    expect(effectiveCredits("factory", "year")).toBe(10000 * 12);
  });
});

describe("isBillingInterval", () => {
  it("accepts exactly month and year", () => {
    expect(isBillingInterval("month")).toBe(true);
    expect(isBillingInterval("year")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isBillingInterval("annual")).toBe(false);
    expect(isBillingInterval("")).toBe(false);
    expect(isBillingInterval(null)).toBe(false);
    expect(isBillingInterval(undefined)).toBe(false);
    expect(isBillingInterval(12)).toBe(false);
  });
});

describe("annualMonthlyEquivalentCents / annualPriceCents", () => {
  it("discounts the monthly price by ANNUAL_DISCOUNT_FACTOR, rounded", () => {
    expect(annualMonthlyEquivalentCents("atelier")).toBe(
      Math.round(PLAN_PRICE_CENTS.atelier * ANNUAL_DISCOUNT_FACTOR),
    );
  });
  it("the real annual charge is exactly 12x the displayed monthly-equivalent, never separately rounded", () => {
    for (const plan of ["atelier", "studio", "factory"] as const) {
      expect(annualPriceCents(plan)).toBe(
        annualMonthlyEquivalentCents(plan) * 12,
      );
    }
  });
});

describe("PLAN_PRICE_CENTS / PLAN_FEATURES", () => {
  it("has an entry for every PlanId, with free priced at 0", () => {
    for (const id of PLAN_IDS) {
      expect(PLAN_PRICE_CENTS).toHaveProperty(id);
      expect(PLAN_FEATURES).toHaveProperty(id);
    }
    expect(PLAN_PRICE_CENTS.free).toBe(0);
  });

  it("never claims automatic cut planning or unlimited version history as a plan differentiator", () => {
    const allKeys = PLAN_IDS.flatMap((id) =>
      PLAN_FEATURES[id].map((f) => f.key),
    );
    expect(allKeys).not.toContain("autoCutPlan");
    expect(allKeys).not.toContain("unlimitedHistory");
  });
});

describe("TOPUP_CREDITS", () => {
  it("is the mock top-up's fixed grant", () => {
    expect(TOPUP_CREDITS).toBe(100);
  });
});
