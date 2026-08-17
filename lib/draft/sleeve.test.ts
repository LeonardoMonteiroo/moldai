import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftSleeve } from "./sleeve";
import { bbox } from "./core";

const M = resolveMeasurements("M", {});

describe("draftSleeve copa em sino", () => {
  it("retorna null quando sleeve=none", () => {
    expect(draftSleeve(M, { sleeve: "none" }, 22)).toBeNull();
  });
  it("longa é mais comprida que curta", () => {
    const curta = draftSleeve(M, { sleeve: "short" }, 22)!;
    const longa = draftSleeve(M, { sleeve: "long" }, 22)!;
    expect(bbox(longa.outlineCm).h).toBeGreaterThan(bbox(curta.outlineCm).h);
  });
  it("largura da copa acompanha a cava", () => {
    const estreita = draftSleeve(M, { sleeve: "short" }, 18)!;
    const larga = draftSleeve(M, { sleeve: "short" }, 30)!;
    expect(bbox(larga.outlineCm).w).toBeGreaterThan(bbox(estreita.outlineCm).w);
  });
  it("marca a copa como curvedSpan", () => {
    const mg = draftSleeve(M, { sleeve: "short" }, 22)!;
    expect((mg.curvedSpans ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
