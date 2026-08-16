import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./hash";

describe("hash", () => {
  it("gera hash diferente do texto e verifica corretamente", async () => {
    const h = await hashPassword("segredo");
    expect(h).not.toBe("segredo");
    expect(h.length).toBeGreaterThan(20);
    expect(await verifyPassword("segredo", h)).toBe(true);
    expect(await verifyPassword("errado", h)).toBe(false);
  });
});
