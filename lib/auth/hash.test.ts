import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./hash";

describe("hash", () => {
  it("generates a hash different from the text and verifies it correctly", async () => {
    const h = await hashPassword("secret");
    expect(h).not.toBe("secret");
    expect(h.length).toBeGreaterThan(20);
    expect(await verifyPassword("secret", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});
