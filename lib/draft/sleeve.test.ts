import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftSleeve } from "./sleeve";
import { bbox } from "./core";
import { t } from "@/lib/i18n/test-translate";

const M = resolveMeasurements("M", {});

describe("draftSleeve copa em sino", () => {
  it("retorna null quando sleeve=none", () => {
    expect(draftSleeve(M, { sleeve: "none" }, 22, t)).toBeNull();
  });
  it("longa é mais comprida que curta", () => {
    const curta = draftSleeve(M, { sleeve: "short" }, 22, t)!;
    const longa = draftSleeve(M, { sleeve: "long" }, 22, t)!;
    expect(bbox(longa.outlineCm).h).toBeGreaterThan(bbox(curta.outlineCm).h);
  });
  it("largura da copa acompanha a cava", () => {
    const estreita = draftSleeve(M, { sleeve: "short" }, 18, t)!;
    const larga = draftSleeve(M, { sleeve: "short" }, 30, t)!;
    expect(bbox(larga.outlineCm).w).toBeGreaterThan(bbox(estreita.outlineCm).w);
  });
  it("marca a copa como curvedSpan", () => {
    const mg = draftSleeve(M, { sleeve: "short" }, 22, t)!;
    expect((mg.curvedSpans ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
