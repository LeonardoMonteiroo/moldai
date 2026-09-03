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
  priceDecimalString,
  SELF_SERVE_PLAN_IDS,
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

describe("priceDecimalString", () => {
  // The machine-readable counterpart to formatBRL, for schema.org's
  // Offer.price: major units, "." separator, no symbol, no grouping.
  it.each([
    [0, "0.00"],
    [5900, "59.00"],
    [14900, "149.00"],
    [39900, "399.00"],
    [1900, "19.00"],
    [1, "0.01"],
    [123456, "1234.56"],
  ])("renders %i centavos as %s", (cents, expected) => {
    expect(priceDecimalString(cents)).toBe(expected);
  });

  it("never emits a currency symbol, a comma or a thousands separator", () => {
    for (const cents of Object.values(PLAN_PRICE_CENTS)) {
      expect(priceDecimalString(cents)).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("disagrees with formatBRL only in presentation, never in value", () => {
    for (const cents of Object.values(PLAN_PRICE_CENTS)) {
      const machine = Number(priceDecimalString(cents));
      expect(machine).toBeCloseTo(cents / 100, 2);
    }
  });
});

describe("SELF_SERVE_PLAN_IDS", () => {
  // A JSON-LD Offer is a machine-readable claim that something is for sale.
  // Confeccao's CTA is permanently disabled behind an "em breve" badge --
  // there is no sales channel to route it to -- so it must not appear as one.
  it("excludes the tier whose CTA has no destination", () => {
    expect(SELF_SERVE_PLAN_IDS).not.toContain("factory");
  });

  it("covers every other plan, so a new tier is not silently unsellable", () => {
    const missing = PLAN_IDS.filter(
      (id) => id !== "factory" && !SELF_SERVE_PLAN_IDS.includes(id),
    );
    expect(missing).toEqual([]);
  });

  it("names only real plans", () => {
    for (const id of SELF_SERVE_PLAN_IDS) {
      expect(PLAN_IDS).toContain(id);
      expect(PLAN_PRICE_CENTS[id]).toBeTypeOf("number");
    }
  });
});
