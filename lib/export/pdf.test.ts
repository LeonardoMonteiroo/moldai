import { describe, it, expect } from "vitest";
import { planTiles, rulerTicksCm } from "./pdf";

describe("planTiles", () => {
  it("single: uma página do tamanho do molde + margem", () => {
    const t = planTiles(20, 30, "single");
    expect(t.cols).toBe(1);
    expect(t.rows).toBe(1);
    expect(t.pages).toHaveLength(1);
    expect(t.pageWcm).toBeCloseTo(21.6, 6); // 20 + 2*0.8
    expect(t.pageHcm).toBeCloseTo(31.6, 6);
    expect(t.overlapCm).toBe(0);
  });

  it("a4: molde pequeno cabe em uma folha", () => {
    const t = planTiles(15, 20, "a4");
    expect(t.cols).toBe(1);
    expect(t.rows).toBe(1);
    expect(t.pages).toHaveLength(1);
  });

  it("a4: molde grande fatia em grade com sobreposição", () => {
    const t = planTiles(50, 40, "a4");
    // printableW=19.4, stepW=18.4 -> cols=ceil((50-1)/18.4)=3
    // printableH=28.1, stepH=27.1 -> rows=ceil((40-1)/27.1)=2
    expect(t.cols).toBe(3);
    expect(t.rows).toBe(2);
    expect(t.pages).toHaveLength(6);
    // origem avança pelo passo (printable - overlap)
    expect(t.pages[1].originCm.x).toBeCloseTo(18.4, 6);
    expect(t.pages[3].originCm.y).toBeCloseTo(27.1, 6);
  });
});

describe("rulerTicksCm", () => {
  it("10 cm -> 11 ticks de 0 a 10", () => {
    expect(rulerTicksCm(10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
