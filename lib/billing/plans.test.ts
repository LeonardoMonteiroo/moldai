import { describe, it, expect } from "vitest";
import {
  PLAN_CREDITS,
  PLAN_PRICE_CENTS,
  PLAN_FEATURES,
  TOPUP_CREDITS,
  isPaidPlanId,
  isPlanUpgrade,
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

describe("isPlanUpgrade", () => {
  it("is true for every strictly-higher-credit move", () => {
    expect(isPlanUpgrade("free", "atelier")).toBe(true);
    expect(isPlanUpgrade("atelier", "studio")).toBe(true);
    expect(isPlanUpgrade("studio", "factory")).toBe(true);
    expect(isPlanUpgrade("free", "factory")).toBe(true);
  });

  it("is false for a downgrade or a same-plan request", () => {
    expect(isPlanUpgrade("factory", "studio")).toBe(false);
    expect(isPlanUpgrade("studio", "atelier")).toBe(false);
    expect(isPlanUpgrade("atelier", "free")).toBe(false);
    for (const id of PLAN_IDS) {
      expect(isPlanUpgrade(id, id)).toBe(false);
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
