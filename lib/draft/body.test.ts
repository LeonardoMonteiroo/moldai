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

  // #121: the back tech-sheet row used to read the FRONT's spec choice
  // unconditionally, even though the back is always drafted as its own
  // shallow round scoop (backNeckDrop = 2.0) independent of style.neckline.
  it("the back piece reports its own (round) neckline, not the front's V", () => {
    const { front, back } = draftBody(M, { neckline: "V" }, t, optsM);
    const row = (rows: typeof front.detailRows) =>
      rows.find((r) => r.label === "rows.neckline")?.value;
    expect(row(front.detailRows)).toBe("neckline.V");
    expect(row(back.detailRows)).toBe("neckline.round");
  });

  it("marks the neckline and armhole as curvedSpans", () => {
    const { front } = draftBody(M, {}, t, optsM);
    expect((front.curvedSpans ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("exposes a sleeve-matchable armhole length", () => {
    expect(draftBody(M, {}, t, optsM).armholeLenCm).toBeGreaterThan(10);
  });

  it("generates two mirrored darts when darts=true (non-knit)", () => {
    const { front } = draftBody(M, { darts: true }, t, optsM);
    expect(front.dartsCm).toHaveLength(2);
    for (const dart of front.dartsCm!) {
      expect(dart.length).toBeGreaterThanOrEqual(3);
    }
    // symmetric about the piece's own centre line (cx), never centred on it
    const b = bbox(front.outlineCm);
    const cx = (b.minX + b.maxX) / 2;
    const [left, right] = front.dartsCm!;
    expect(left.every(([x]) => x < cx)).toBe(true);
    expect(right.every(([x]) => x > cx)).toBe(true);
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

    // the hem (left, #126's fold-centre, and right -- three consecutive
    // max-y points forming two collinear straight segments) is straight
    const b = bbox(pts);
    const hemIdx = pts
      .map((p, i) => ({ i, y: p[1] }))
      .filter((o) => Math.abs(o.y - b.maxY) < 0.01)
      .map((o) => o.i)
      .sort((a, c) => a - c);
    expect(hemIdx).toHaveLength(3);
    expect(hemIdx[1] - hemIdx[0]).toBe(1);
    expect(hemIdx[2] - hemIdx[1]).toBe(1);
    expect(edgeCurved(hemIdx[0])).toBe(false);
    expect(edgeCurved(hemIdx[1])).toBe(false);
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

// #79: a dress's bodice piece ends at the waist (lengthCm === waistY there),
// so its hem IS the waist seam it joins to a separately-drafted skirt panel
// -- opts.dressHemHalfCm lets the caller (garment.ts's draftAll) pass in
// that skirt panel's own waist width instead of the hip-derived blouse hem,
// and drops the redundant fitted-only waist vertices that would otherwise
// retrace the same edge.
describe("dressHemHalfCm (#79)", () => {
  const dressOpts: BlockOpts = {
    ...optsM,
    lengthCm: M.backLength, // a dress bodice ends at the natural waist
    dressHemHalfCm: 27, // an arbitrary stand-in for the skirt's own waist half
  };

  it("drafts the hem at dressHemHalfCm, not the hip-derived width", () => {
    const { front } = draftBody(M, {}, t, dressOpts);
    const maxY = Math.max(...front.outlineCm.map(([, y]) => y));
    const hemXs = front.outlineCm.filter(([, y]) => y === maxY).map(([x]) => x);
    const hemWidth = Math.max(...hemXs) - Math.min(...hemXs);
    expect(hemWidth).toBeCloseTo(54, 5); // 2 * dressHemHalfCm
  });

  it("does not push the redundant fitted-waist vertices onto the hem edge", () => {
    const { front } = draftBody(M, { darts: true }, t, dressOpts);
    const maxY = Math.max(...front.outlineCm.map(([, y]) => y));
    const hemLevelPoints = front.outlineCm.filter(([, y]) => y === maxY);
    // Without the fix: 5 points at the hem's y (2 hem + 1 #126 fold-centre +
    // 2 duplicate waist). The legitimate count is 3: left hem, #126's
    // fold-centre, right hem.
    expect(hemLevelPoints).toHaveLength(3);
  });

  it("without dressHemHalfCm, a fitted non-dress piece still gets its waist vertices (unaffected)", () => {
    const { front } = draftBody(M, { darts: true }, t, optsM);
    const waistY = M.backLength;
    const waistLevelPoints = front.outlineCm.filter(([, y]) => y === waistY);
    expect(waistLevelPoints).toHaveLength(2);
  });
});

// #124: notches by convention.
describe("notches (#124)", () => {
  it("front gets two single pitch notches (one per armhole curve) and a hem-fold notch; back gets double pitch notches", () => {
    const { front, back } = draftBody(M, {}, t, optsM);
    const frontTypes = front.notches!.map((n) => n.type);
    const backTypes = back.notches!.map((n) => n.type);
    expect(frontTypes).toEqual(["single", "single", "single"]);
    expect(backTypes).toEqual(["double", "double", "single"]);
  });

  it("the front's two pitch notches sit on opposite sides of the panel's own centre", () => {
    const { front } = draftBody(M, {}, t, optsM);
    const b = bbox(front.outlineCm);
    const cx = (b.minX + b.maxX) / 2;
    const [left, right] = front.notches!;
    expect(left.outerCm[0]).toBeLessThan(cx);
    expect(right.outerCm[0]).toBeGreaterThan(cx);
  });

  it("the hem-fold notch sits at the piece's own hem-centre point", () => {
    const { front } = draftBody(M, {}, t, optsM);
    const [, , hemFold] = front.notches!;
    const b = bbox(front.outlineCm);
    const cx = (b.minX + b.maxX) / 2;
    expect(hemFold.outerCm[0]).toBeCloseTo(cx, 5);
    expect(hemFold.outerCm[1]).toBeCloseTo(b.maxY, 5);
  });

  it("a non-dress fitted panel gets no dart-leg notches (the fisheye dart touches no seam)", () => {
    const { front } = draftBody(M, { darts: true }, t, optsM);
    // exactly the 2 pitch + 1 hem-fold notches -- nothing dart-related.
    expect(front.notches).toHaveLength(3);
  });

  it("a dress bodice hem gets waist-join notches at both outer corners, plus dart-leg notches per dart", () => {
    const dressOpts: BlockOpts = {
      ...optsM,
      lengthCm: M.backLength,
      dressHemHalfCm: 27,
    };
    const { front } = draftBody(M, { darts: true }, t, dressOpts);
    // 2 pitch + 1 hem-fold + 2 waist-join + (2 darts × 2 legs) = 9
    expect(front.notches).toHaveLength(9);
    const types = front.notches!.map((n) => n.type);
    expect(types.filter((ty) => ty === "double")).toHaveLength(2); // waist-join corners
    expect(types.filter((ty) => ty === "single")).toHaveLength(7); // 2 pitch + hem-fold + 4 dart legs
  });

  it("a dress bodice hem with no darts still gets the waist-join notches, no dart-leg ones", () => {
    const dressOpts: BlockOpts = {
      ...optsM,
      lengthCm: M.backLength,
      dressHemHalfCm: 27,
    };
    const { front } = draftBody(M, { darts: false }, t, dressOpts);
    // 2 pitch + 1 hem-fold + 2 waist-join = 5
    expect(front.notches).toHaveLength(5);
  });
});

// #132: the four EXTENDED_MEASUREMENT_KEYS body.ts reads (neckGirth,
// highBust, shoulderSlope, backWidth) each override a today-hardcoded
// proportion when present, and reproduce it exactly when absent -- M
// (SIZE_TABLE.M) never carries these fields, so every "without" draft below
// already exercises the fallback branch.
describe("#132: extended measurement overrides", () => {
  // Point order for a no-dart, non-dress panel (see bodice()'s push()
  // sequence): 0 = neckline centre (cf), 2 = left HPS (hpsL), 3 = left
  // shoulder tip (shL), 5 = left underarm (uaL).
  it("neckGirth widens the neckline instead of the bust-derived proportion", () => {
    const narrow = draftBody({ ...M, neckGirth: 24 }, {}, t, optsM);
    const wide = draftBody({ ...M, neckGirth: 48 }, {}, t, optsM);
    const neckHalf = (d: typeof narrow) =>
      Math.abs(d.front.outlineCm[2][0] - d.front.outlineCm[0][0]);
    expect(neckHalf(wide)).toBeGreaterThan(neckHalf(narrow));
  });

  it("omitting neckGirth reproduces the bust/14 fallback exactly", () => {
    // (bust*6)/14, then re-divided by 6 inside the drafter's neckGirth/6,
    // isn't bit-for-bit bust/14 in IEEE 754 (division/multiplication by the
    // same constant don't always invert exactly) -- toBeCloseTo per
    // coordinate is the tolerance every other float geometry assertion in
    // this file already uses, not a bit-exact toEqual.
    const withKey = draftBody(
      { ...M, neckGirth: (M.bust * 6) / 14 },
      {},
      t,
      optsM,
    );
    const withoutKey = draftBody(M, {}, t, optsM);
    withKey.front.outlineCm.forEach(([x, y], i) => {
      const [ox, oy] = withoutKey.front.outlineCm[i];
      expect(x).toBeCloseTo(ox, 9);
      expect(y).toBeCloseTo(oy, 9);
    });
  });

  it("highBust overrides the bust-derived armhole depth", () => {
    const shallow = draftBody({ ...M, highBust: 60 }, {}, t, optsM);
    const deep = draftBody({ ...M, highBust: 130 }, {}, t, optsM);
    expect(deep.front.outlineCm[5][1]).toBeGreaterThan(
      shallow.front.outlineCm[5][1],
    );
  });

  it("omitting highBust reproduces the bust-derived armhole depth exactly", () => {
    const withKey = draftBody({ ...M, highBust: M.bust }, {}, t, optsM);
    const withoutKey = draftBody(M, {}, t, optsM);
    expect(withKey.front.outlineCm).toEqual(withoutKey.front.outlineCm);
  });

  it("shoulderSlope overrides the fixed per-gender constant", () => {
    const shallow = draftBody({ ...M, shoulderSlope: 2 }, {}, t, optsM);
    const steep = draftBody({ ...M, shoulderSlope: 7 }, {}, t, optsM);
    expect(steep.front.outlineCm[3][1]).toBeGreaterThan(
      shallow.front.outlineCm[3][1],
    );
  });

  it("omitting shoulderSlope reproduces the 4.0/4.5 constant exactly", () => {
    const withKey = draftBody({ ...M, shoulderSlope: 4.0 }, {}, t, optsM);
    const withoutKey = draftBody(M, {}, t, optsM);
    expect(withKey.front.outlineCm).toEqual(withoutKey.front.outlineCm);
  });

  it("backWidth overrides only the back panel's width, leaving the front bust-derived width alone", () => {
    const narrow = draftBody({ ...M, backWidth: 30 }, {}, t, optsM);
    const wide = draftBody({ ...M, backWidth: 80 }, {}, t, optsM);
    expect(bbox(wide.back.outlineCm).w).toBeGreaterThan(
      bbox(narrow.back.outlineCm).w,
    );
    expect(bbox(wide.front.outlineCm).w).toBeCloseTo(
      bbox(narrow.front.outlineCm).w,
      5,
    );
  });

  it("omitting backWidth reproduces the bust/2 fallback exactly, front and back symmetric", () => {
    const withKey = draftBody({ ...M, backWidth: M.bust / 2 }, {}, t, optsM);
    const withoutKey = draftBody(M, {}, t, optsM);
    expect(withKey.back.outlineCm).toEqual(withoutKey.back.outlineCm);
    expect(bbox(withoutKey.back.outlineCm).w).toBeCloseTo(
      bbox(withoutKey.front.outlineCm).w,
      5,
    );
  });
});
