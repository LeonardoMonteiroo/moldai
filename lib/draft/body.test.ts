import { describe, it, expect } from "vitest";
import { SIZE_TABLE, Measurements } from "@/lib/measurements";
import { draftBody, BlockOpts } from "./body";
import { bbox, Pt } from "./core";
import { FIT_CLASSES, FIT_EASE_CM, wearingEaseCm } from "./ease";
import type { FitClass } from "@/lib/types";
import { t } from "@/lib/i18n/test-translate";

const M = SIZE_TABLE.M;
const optsM: BlockOpts = {
  gender: "female",
  knit: false,
  lengthCm: M.backLength + M.hipHeight + 5,
  wearingEaseCm: 8, // FIT_EASE_CM.fitted.bust (lib/draft/ease.ts) -- today's default
};

// smallest central y = neckline base (front/back)
const neckDrop = (pts: Pt[]) => {
  const b = bbox(pts);
  const cx = (b.minX + b.maxX) / 2;
  const central = pts.filter(
    (p) => Math.abs(p[0] - cx) < b.w * 0.2 && p[1] < b.h * 0.5,
  );
  return Math.max(...central.map((p) => p[1]));
};

describe("draftBody sloper", () => {
  it("scales the width with the bust", () => {
    const small = draftBody(SIZE_TABLE.PP, {}, t);
    const big = draftBody(SIZE_TABLE.GG, {}, t);
    expect(bbox(big.front.outlineCm).w).toBeGreaterThan(
      bbox(small.front.outlineCm).w,
    );
  });

  it("shoulder has slope (shoulder tip below the HPS)", () => {
    const { front } = draftBody(M, {}, t, optsM);
    const b = bbox(front.outlineCm);
    const cx = (b.minX + b.maxX) / 2;
    // HPS: highest point near the center; shoulder tip: highest point farthest out
    const near = front.outlineCm.filter(
      (p) => Math.abs(p[0] - cx) < b.w * 0.25,
    );
    const far = front.outlineCm.filter((p) => Math.abs(p[0] - cx) > b.w * 0.3);
    const hpsY = Math.min(...near.map((p) => p[1]));
    const shoulderTipY = Math.min(...far.map((p) => p[1]));
    expect(shoulderTipY).toBeGreaterThan(hpsY);
  });

  it("length reaches the hip (blouse/t-shirt)", () => {
    const { front } = draftBody(M, {}, t, optsM);
    expect(bbox(front.outlineCm).h).toBeCloseTo(optsM.lengthCm, 0);
  });

  it("front neckline deeper than back; V > round > straight", () => {
    const reto = draftBody(M, { neckline: "straight" }, t, optsM);
    const red = draftBody(M, { neckline: "round" }, t, optsM);
    const v = draftBody(M, { neckline: "V", necklineDepthCm: 8 }, t, optsM);
    expect(neckDrop(v.front.outlineCm)).toBeGreaterThan(
      neckDrop(v.back.outlineCm),
    );
    expect(neckDrop(v.front.outlineCm)).toBeGreaterThan(
      neckDrop(red.front.outlineCm),
    );
    expect(neckDrop(red.front.outlineCm)).toBeGreaterThan(
      neckDrop(reto.front.outlineCm),
    );
  });

  it("marks the neckline and armhole as curvedSpans", () => {
    const { front } = draftBody(M, {}, t, optsM);
    expect((front.curvedSpans ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("exposes a sleeve-matchable armhole length", () => {
    expect(draftBody(M, {}, t, optsM).armholeLenCm).toBeGreaterThan(10);
  });

  it("generates a dart when darts=true (non-knit)", () => {
    expect(
      draftBody(M, { darts: true }, t, optsM).front.dartCm?.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("has a straight hem and straight edges (anti-balloon invariant)", () => {
    const { front } = draftBody(M, {}, t, optsM);
    const pts = front.outlineCm;
    const spans = front.curvedSpans ?? [];
    const n = pts.length;
    const edgeCurved = (i: number) =>
      spans.some(([a, b]) => i >= a && i + 1 <= b);

    // not everything is curved: some edges are straight
    const curvedCount = Array.from({ length: n }, (_, i) =>
      edgeCurved(i),
    ).filter(Boolean).length;
    expect(curvedCount).toBeGreaterThan(0);
    expect(curvedCount).toBeLessThan(n);

    // the hem (edge between the two consecutive max-y points) is straight
    const b = bbox(pts);
    const hemIdx = pts
      .map((p, i) => ({ i, y: p[1] }))
      .filter((o) => Math.abs(o.y - b.maxY) < 0.01)
      .map((o) => o.i)
      .sort((a, c) => a - c);
    expect(hemIdx).toHaveLength(2);
    expect(hemIdx[1] - hemIdx[0]).toBe(1);
    expect(edgeCurved(hemIdx[0])).toBe(false);
  });
});

// #125: bust girth is 4× halfChestCm (four quarter-panels: front-left/right,
// back-left/right), and the drafter's only ease knob is opts.wearingEaseCm --
// asserting against the DRAFTED geometry (not just wearingEaseCm's own return
// value, covered separately in ease.test.ts) is what the issue's acceptance
// criteria asks for.
function optsFor(m: Measurements, style: { fit?: FitClass }): BlockOpts {
  return {
    gender: "female",
    knit: false,
    lengthCm: m.backLength + m.hipHeight + 5,
    wearingEaseCm: wearingEaseCm(style, false, m.bust),
  };
}

describe("fit class / fabric stretch ease (#125)", () => {
  it.each(FIT_CLASSES)(
    "drafted bust girth equals body bust + the %s class's table ease",
    (fit) => {
      const { halfChestCm } = draftBody(M, { fit }, t, optsFor(M, { fit }));
      const bustGirth = halfChestCm * 4;
      expect(bustGirth).toBeCloseTo(M.bust + FIT_EASE_CM[fit].bust, 1);
    },
  );

  it("a knit at the highest stretch band drafts below the body measurement", () => {
    const opts: BlockOpts = {
      ...optsM,
      knit: true,
      wearingEaseCm: wearingEaseCm({ stretch: "high" }, true, M.bust),
    };
    const { halfChestCm } = draftBody(M, { stretch: "high" }, t, opts);
    expect(halfChestCm * 4).toBeLessThan(M.bust);
  });

  it("ease is invariant across a graded run -- same fit class, same absolute ease in cm at PP and GG", () => {
    const pp = SIZE_TABLE.PP;
    const gg = SIZE_TABLE.GG;
    const style: { fit: FitClass } = { fit: "semiFitted" };
    const small = draftBody(pp, style, t, optsFor(pp, style));
    const big = draftBody(gg, style, t, optsFor(gg, style));
    const easeSmall = small.halfChestCm * 4 - pp.bust;
    const easeBig = big.halfChestCm * 4 - gg.bust;
    expect(easeBig).toBeCloseTo(easeSmall, 1);
  });

  it("the default fit class reproduces today's bust girth exactly (bust + 8)", () => {
    const { halfChestCm } = draftBody(M, {}, t, optsM);
    expect(halfChestCm * 4).toBeCloseTo(M.bust + 8, 5);
  });
});
