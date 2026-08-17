import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftManga } from "./manga";
import { bbox } from "./core";

const M = resolveMeasurements("M", {});

describe("draftManga copa em sino", () => {
  it("retorna null quando sleeve=none", () => {
    expect(draftManga(M, { sleeve: "none" }, 22)).toBeNull();
  });
  it("longa é mais comprida que curta", () => {
    const curta = draftManga(M, { sleeve: "short" }, 22)!;
    const longa = draftManga(M, { sleeve: "long" }, 22)!;
    expect(bbox(longa.outlineCm).h).toBeGreaterThan(bbox(curta.outlineCm).h);
  });
  it("largura da copa acompanha a cava", () => {
    const estreita = draftManga(M, { sleeve: "short" }, 18)!;
    const larga = draftManga(M, { sleeve: "short" }, 30)!;
    expect(bbox(larga.outlineCm).w).toBeGreaterThan(bbox(estreita.outlineCm).w);
  });
  it("marca a copa como curvedSpan", () => {
    const mg = draftManga(M, { sleeve: "short" }, 22)!;
    expect((mg.curvedSpans ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
