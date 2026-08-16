import { describe, it, expect } from "vitest";
import { applyGarmentSpec, getState, resetState } from "./mock-data";

describe("applyGarmentSpec", () => {
  it("drafts a saia from a spec and stores it on the pattern", () => {
    resetState();
    applyGarmentSpec({ tipo: "saia", measurementOverrides: {}, style: { saia: "circulo" } });

    const state = getState();
    expect(state.pattern.pieces.length).toBe(1);
    expect(state.pattern.pieces[0].id).toBe("saia");
    expect(state.pattern.viewBox!.w).toBeGreaterThan(0);
  });

  it("drafts a camiseta masculina from a spec", () => {
    resetState();
    applyGarmentSpec({ tipo: "camiseta", sexo: "masc", measurementOverrides: {}, style: {} });
    const state = getState();
    const ids = state.pattern.pieces.map((p) => p.id).sort();
    expect(ids).toEqual(["corpo-costas", "corpo-frente", "manga"]);
    expect(state.pattern.spec!.sexo).toBe("masc");
  });
});
