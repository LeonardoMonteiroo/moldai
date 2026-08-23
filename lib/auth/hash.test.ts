import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, DUMMY_HASH } from "./hash";

describe("hash", () => {
  it("generates a hash different from the text and verifies it correctly", async () => {
    const h = await hashPassword("secret");
    expect(h).not.toBe("secret");
    expect(h.length).toBeGreaterThan(20);
    expect(await verifyPassword("secret", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  // #26: DUMMY_HASH must be a real bcrypt hash -- verifyPassword against it
  // is what equalizes an unknown-email login/resend's timing with a known
  // one, so it has to pay the same bcrypt cost, not short-circuit.
  it("DUMMY_HASH is a real bcrypt hash that never verifies a guessed password", async () => {
    expect(DUMMY_HASH).toMatch(/^\$2[aby]\$10\$/);
    expect(await verifyPassword("", DUMMY_HASH)).toBe(true);
    expect(await verifyPassword("correct", DUMMY_HASH)).toBe(false);
  });
});
