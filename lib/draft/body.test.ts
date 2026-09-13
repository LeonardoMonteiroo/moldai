import { describe, it, expect } from "vitest";
import {
  SIZE_TABLE,
  SIZE_TABLE_MALE,
  Measurements,
  MEASUREMENT_RANGES,
} from "@/lib/measurements";
import { draftBody, BlockOpts } from "./body";
import { bbox, dartsOf, Pt, DRILL_HOLE_SETBACK_CM } from "./core";
import { pitchNotchDistanceCm } from "./seams";
import {
  FIT_CLASSES,
  FIT_EASE_CM,
  TSHIRT_BASE_EASE_PCT,
  wearingEaseCm,
} from "./ease";
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
    const darts = dartsOf(front.internalsCm);
    expect(darts).toHaveLength(2);
    for (const dart of darts) {
      expect(dart.length).toBeGreaterThanOrEqual(3);
    }
    // symmetric about the piece's own centre line (cx), never centred on it
    const b = bbox(front.outlineCm);
    const cx = (b.minX + b.maxX) / 2;
    const [left, right] = darts;
    expect(left.every(([x]) => x < cx)).toBe(true);
    expect(right.every(([x]) => x > cx)).toBe(true);
  });

  // #127: each dart's own fold line/drill hole(s) travel alongside it in
  // `internalsCm` -- two darts means two of each.
  it("#127: each dart also gets its own fold line and drill hole(s) in internalsCm", () => {
    const { front } = draftBody(M, { darts: true }, t, optsM);
    const kinds = (front.internalsCm ?? []).map((e) => e.kind);
    expect(kinds.filter((k) => k === "dart")).toHaveLength(2);
    expect(kinds.filter((k) => k === "foldLine")).toHaveLength(2);
    // a fisheye (double-ended) dart -- this is the non-dress case -- has two
    // free apexes, so 2 darts x 2 apexes = 4 drill holes.
    expect(kinds.filter((k) => k === "drillHole")).toHaveLength(4);
  });

  // #127 acceptance criterion: drill holes sit 1.0-1.5cm short of the dart
  // apex they mark, not exactly on it (which would puncture the visible
  // point) and not further back than the convention allows.
  it("#127: each drill hole sits 1.0-1.5cm short of the dart apex it marks", () => {
    const { front } = draftBody(M, { darts: true }, t, optsM);
    const internals = front.internalsCm ?? [];
    const darts = internals.filter((e) => e.kind === "dart");
    const holes = internals.filter((e) => e.kind === "drillHole");
    expect(holes.length).toBeGreaterThan(0);
    for (const hole of holes) {
      if (hole.kind !== "drillHole") continue;
      // nearest apex across all darts (the fisheye dart's own two ends).
      let minDist = Infinity;
      for (const dart of darts) {
        if (dart.kind !== "dart") continue;
        for (const [x, y] of dart.ptsCm) {
          const d = Math.hypot(x - hole.atCm[0], y - hole.atCm[1]);
          if (d < minDist) minDist = d;
        }
      }
      expect(minDist).toBeGreaterThanOrEqual(1.0 - 1e-6);
      expect(minDist).toBeLessThanOrEqual(1.5 + 1e-6);
    }
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

describe("draftBody front closure (#223)", () => {
  it("splits the front into a half-panel: qty 2, no foldEdge, has a centerFront edge", () => {
    const { front, back } = draftBody(
      M,
      { frontClosure: "buttonStand" },
      t,
      optsM,
    );
    expect(front.qty).toBe(2);
    expect(front.foldEdge).toBeUndefined();
    expect(front.seamEdges?.centerFront).toBeDefined();
    expect(front.centerXCm).toBeDefined();
    // The back panel is a front-only concept -- completely unaffected.
    expect(back.qty).toBe(1);
    expect(back.foldEdge).toBeDefined();
    expect(back.seamEdges?.centerFront).toBeUndefined();
  });

  it("the half-panel's own outline never crosses past its true center front", () => {
    const { front } = draftBody(M, { frontClosure: "buttonStand" }, t, optsM);
    const cx = front.centerXCm!;
    for (const [x] of front.outlineCm) {
      expect(x).toBeLessThanOrEqual(cx + 1e-6);
    }
  });

  it("keeps exactly one waist dart (not two) when fitted", () => {
    const { front } = draftBody(
      M,
      { darts: true, frontClosure: "buttonStand" },
      t,
      optsM,
    );
    expect(dartsOf(front.internalsCm).length).toBe(1);
  });

  it("does not split the front for a knit garment even if frontClosure is requested", () => {
    const knitOpts: BlockOpts = { ...optsM, knit: true };
    const { front } = draftBody(
      M,
      { frontClosure: "buttonStand" },
      t,
      knitOpts,
    );
    expect(front.qty).toBe(1);
    expect(front.foldEdge).toBeDefined();
  });

  it("does not split the front for a dress even if frontClosure is requested", () => {
    const dressOpts: BlockOpts = {
      ...optsM,
      lengthCm: M.backLength,
      dressHemHalfCm: 30,
    };
    const { front } = draftBody(
      M,
      { frontClosure: "buttonStand" },
      t,
      dressOpts,
    );
    expect(front.qty).toBe(1);
    expect(front.foldEdge).toBeDefined();
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

  // #282: a knit garment starts from a positive base ease PERCENTAGE
  // (TSHIRT_BASE_EASE_PCT), not 0 -- the highest stretch band still reduces
  // relative to that base, it no longer drops the drafted girth below the
  // body measurement outright.
  it("a knit at the highest stretch band drafts base ease minus the stretch reduction, not below the body measurement", () => {
    const opts: BlockOpts = {
      ...optsM,
      knit: true,
      wearingEaseCm: wearingEaseCm({ stretch: "high" }, true, M.bust),
    };
    const { halfChestCm } = draftBody(M, { stretch: "high" }, t, opts);
    const bustGirth = halfChestCm * 4;
    expect(bustGirth).toBeCloseTo(
      M.bust + (M.bust * (TSHIRT_BASE_EASE_PCT - 12)) / 100,
      1,
    );
    expect(bustGirth).toBeGreaterThan(M.bust);
  });

  // #282: the assertion that actually catches a regression in the DRAFTED
  // garment, not just in the ease table -- a male-M t-shirt (no stretch, the
  // default) should draft to the same 118.0cm finished bust girth FreeSewing's
  // Teagan produces at published defaults on the identical body
  // (docs/reference/freesewing-spike/README.md), not the 155.9cm the old
  // TSHIRT_BASE_EASE_CM=55.9 produced.
  it("a male-M knit tshirt (no stretch) drafts a 118.0cm finished bust girth, matching Teagan", () => {
    const maleM = SIZE_TABLE_MALE.M;
    const opts: BlockOpts = {
      gender: "male",
      knit: true,
      lengthCm: maleM.backLength + maleM.hipHeight + 5,
      wearingEaseCm: wearingEaseCm({}, true, maleM.bust),
    };
    const { halfChestCm } = draftBody(maleM, {}, t, opts);
    const bustGirth = halfChestCm * 4;
    expect(bustGirth).toBeCloseTo(118.0, 1);
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

  // #127: a dress-hem dart is single-ended (its wide end opens onto the
  // waist seam, #79) -- exactly one free apex per dart, so exactly one
  // drill hole per dart, each still 1.0-1.5cm short of its own apex.
  it("#127: a dress-hem (single-ended) dart gets exactly one drill hole, 1.0-1.5cm short of its apex", () => {
    const { front } = draftBody(M, { darts: true }, t, dressOpts);
    const internals = front.internalsCm ?? [];
    const darts = internals.filter((e) => e.kind === "dart");
    const foldLines = internals.filter((e) => e.kind === "foldLine");
    const holes = internals.filter((e) => e.kind === "drillHole");
    expect(darts).toHaveLength(2);
    expect(foldLines).toHaveLength(2);
    expect(holes).toHaveLength(2); // one per dart -- single free apex each
    for (const dart of darts) {
      if (dart.kind !== "dart") continue;
      // the apex is the dart's own middle point (leg, apex, leg).
      const apex = dart.ptsCm[1];
      const nearest = Math.min(
        ...holes.map((h) =>
          h.kind === "drillHole"
            ? Math.hypot(h.atCm[0] - apex[0], h.atCm[1] - apex[1])
            : Infinity,
        ),
      );
      expect(nearest).toBeGreaterThanOrEqual(1.0 - 1e-6);
      expect(nearest).toBeLessThanOrEqual(1.5 + 1e-6);
    }
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

// #132/#269: highBust/shoulderSlope/backWidth (the three body.ts still reads
// that remain in EXTENDED_MEASUREMENT_KEYS) each override a today-hardcoded
// proportion when present, and reproduce it exactly when absent -- M
// (SIZE_TABLE.M) never carries these three, so every "without" draft below
// already exercises the fallback branch. neckGirth was promoted to CORE
// (#269 -- a FreeSewing design requires it outright), so M now always
// carries a real value and its own fallback formula (bust/14) was removed
// from body.ts entirely; the "widens the neckline" comparison below still
// holds (neckGirth still drives real geometry), there's just no longer an
// "omitted" case to test.
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

  // #132 (post-review fix): backWidth used to drive halfChest (the
  // underarm-level width), seeded as bust/2 so the fallback stayed a no-op
  // -- but the guide text sends the user to measure real across-back
  // (armpit to armpit, shoulder-blade height, ~36-38cm at a 92cm bust), and
  // plugging that real ~37 into a halfChest-driving field (46 at bust=92)
  // drafted a back ~5cm narrower per side than intended. backWidth now
  // drives the armhole curve's own control point (armCtrlX, at midArmY --
  // between the shoulder and the underarm, i.e. roughly shoulder-blade
  // height) instead, leaving halfChest/the underarm itself bust-derived for
  // both panels always.
  it("backWidth widens/narrows the back panel's armhole curve, leaving the front's own control point and both panels' underarm width alone", () => {
    const narrow = draftBody({ ...M, backWidth: 28 }, {}, t, optsM);
    const wide = draftBody({ ...M, backWidth: 44 }, {}, t, optsM);
    // index 4 = left armhole control point (see bodice()'s push() order:
    // 0 cf, 1 ctrl, 2 hpsL, 3 shL, 4 armhole ctrl, 5 uaL).
    const armCtrlOffset = (d: typeof narrow) =>
      Math.abs(d.back.outlineCm[4][0] - d.back.outlineCm[0][0]);
    expect(armCtrlOffset(wide)).toBeGreaterThan(armCtrlOffset(narrow));
    // The front's own control point, and both panels' underarm (index 5),
    // are untouched by backWidth.
    expect(bbox(wide.front.outlineCm).w).toBeCloseTo(
      bbox(narrow.front.outlineCm).w,
      5,
    );
    expect(wide.back.outlineCm[5][0]).toBeCloseTo(
      narrow.back.outlineCm[5][0],
      9,
    );
  });

  it("omitting backWidth reproduces the shoulder/underarm interpolation exactly, front and back symmetric", () => {
    // The exact value that makes backWidth/2 + wearingEase equal the
    // fallback interpolation -- not a round number, just the fallback's own
    // formula solved for backWidth, since (unlike neckGirth/highBust/
    // shoulderSlope/bicep) the fallback here depends on the style-driven
    // wearingEase, not on bust alone.
    const wearingEase = optsM.wearingEaseCm / 4;
    const halfChestM = M.bust / 4 + wearingEase;
    const armCtrlXFallback = (M.shoulder + halfChestM) / 2 - 1;
    const backWidthEquivalent = (armCtrlXFallback - wearingEase) * 2;

    const withKey = draftBody(
      { ...M, backWidth: backWidthEquivalent },
      {},
      t,
      optsM,
    );
    const withoutKey = draftBody(M, {}, t, optsM);
    withKey.back.outlineCm.forEach(([x, y], i) => {
      const [ox, oy] = withoutKey.back.outlineCm[i];
      expect(x).toBeCloseTo(ox, 9);
      expect(y).toBeCloseTo(oy, 9);
    });
    expect(bbox(withoutKey.back.outlineCm).w).toBeCloseTo(
      bbox(withoutKey.front.outlineCm).w,
      5,
    );
  });
});

// bust-dart-shaping feature: a real cup delta (bust - highBust > 0) angles
// the front dart's bust-facing apex toward the wearer's real bust apex and
// widens the dart, per design.md's cited formulas. All expected numbers
// below are derived independently from those formulas (M's own measurements
// + the design's cited constants), not by reading body.ts's implementation.
describe("bust-apex dart shaping (bust-dart-shaping feature)", () => {
  // Hand-derived from M (bust 92, waist 74, hip 100, backLength 41,
  // shoulder 18.5), optsM (wearingEaseCm 8, female), with no bustSpan/
  // bustPointHeight override (cited flat fallbacks: 18.5 / 26.5):
  //   halfChest = 92/4 + 2 = 25; hemHalf = 100/4 + 2 = 27; cx = max(18.5,25,27) = 27
  //   waistSuppression = 100/4 - 74/4 = 6.5; sideSeamSuppression = 3.25
  //   waistHalf = max(25 - 3.25, 25 - 3) = 22; dartOffset = 11
  //   dx (side -1) = 27 - 11 = 16; waistY = backLength = 41
  //   apexXOffsetCm = clamp(18.5/2 + 0.5, 2, 25-2) = 9.75
  //   apexYCm = clamp(4.0 + 26.5, 4.0+4, 41-4) = 30.5
  //   bust apex (side -1) = [27 - 9.75, 30.5] = [17.25, 30.5]
  const HIGH_BUST_DELTA = { ...M, highBust: 84 }; // bustCupDeltaCm = 8
  const EXPECTED_APEX: Pt = [17.25, 30.5];
  const UNCHANGED_APEX_TOP: Pt = [16, 41 - 12]; // [dx, waistY - dartRiseCm]
  const UNCHANGED_APEX_BOTTOM: Pt = [16, 41 + 12];
  // #335: the dress-hem case below (dressHemHalfCm: 27, deliberately the
  // same number the blouse hem's own hip-derived formula produces, per its
  // own comment) now widens hemHalf -- and therefore cx, which the
  // bust-facing apex reads off directly -- by dressHemDartIntakeCm/2:
  //   dartHalfWidth (with the same +8cm HIGH_BUST_DELTA) = max(0.9, 3.25/8)
  //     + 8/4 = 0.9 + 2 = 2.9
  //   dressHemDartIntakeCm = dartCount(2) * 2 * 2.9 = 11.6
  //   hemHalf = 27 + 11.6/2 = 32.8; cx = max(18.5, 25, 32.8) = 32.8
  //   bust apex (side -1) = [32.8 - 9.75, 30.5] = [23.05, 30.5]
  const EXPECTED_DRESS_APEX: Pt = [EXPECTED_APEX[0] + 5.8, EXPECTED_APEX[1]];

  it("BDART-04: highBust equal to bust (both system charts today) drafts an identical dart to highBust absent", () => {
    const withEqualHighBust = draftBody(
      { ...M, highBust: M.bust },
      { darts: true },
      t,
      optsM,
    );
    const withoutHighBust = draftBody(M, { darts: true }, t, optsM);
    const a = dartsOf(withEqualHighBust.front.internalsCm);
    const b = dartsOf(withoutHighBust.front.internalsCm);
    expect(a).toEqual(b);
  });

  it("BDART-04: a highBust larger than bust (inverted entry) clamps to no effect, same as no delta", () => {
    const inverted = draftBody(
      { ...M, highBust: M.bust + 20 },
      { darts: true },
      t,
      optsM,
    );
    const noDelta = draftBody(M, { darts: true }, t, optsM);
    expect(dartsOf(inverted.front.internalsCm)).toEqual(
      dartsOf(noDelta.front.internalsCm),
    );
  });

  it("BDART-01/02: a real cup delta angles the fisheye dart's upper apex toward the bust apex and widens it", () => {
    const withDelta = draftBody(HIGH_BUST_DELTA, { darts: true }, t, optsM);
    const noDelta = draftBody(M, { darts: true }, t, optsM);
    const [dartWithDelta] = dartsOf(withDelta.front.internalsCm);
    const [dartNoDelta] = dartsOf(noDelta.front.internalsCm);
    // ptsCm = [apexTop, rightLeg, apexBottom, leftLeg, apexTop]
    const [apexTopWith, rightLegWith, apexBottomWith] = dartWithDelta;
    const [apexTopNo, rightLegNo, apexBottomNo] = dartNoDelta;

    expect(apexTopWith[0]).toBeCloseTo(EXPECTED_APEX[0], 9);
    expect(apexTopWith[1]).toBeCloseTo(EXPECTED_APEX[1], 9);
    // The lower apex (toward the hip) has no anatomical target -- untouched.
    expect(apexBottomWith).toEqual(apexBottomNo);
    // The dart widened: the leg moved further from center than before.
    expect(Math.abs(rightLegWith[0] - 16)).toBeGreaterThan(
      Math.abs(rightLegNo[0] - 16),
    );
    // Sanity: without the delta this dart is the untouched vertical shape.
    expect(apexTopNo).toEqual(UNCHANGED_APEX_TOP);
  });

  // BDART-08: dartInternals (core.ts) derives the fold line and drill holes
  // generically from whatever points it's handed -- no per-shape
  // special-casing was added for the re-angled apex, so a drill hole must
  // still land the standard DRILL_HOLE_SETBACK_CM short of the NEW apex
  // position, walking toward the (unchanged) lower apex.
  it("BDART-08: the fold line and drill hole still derive correctly from the re-angled apex, generically", () => {
    const withDelta = draftBody(HIGH_BUST_DELTA, { darts: true }, t, optsM);
    const internals = withDelta.front.internalsCm!;
    const fold = internals.find((e) => e.kind === "foldLine");
    expect(fold).toBeDefined();
    if (fold?.kind !== "foldLine") throw new Error("expected a foldLine");
    // The fold line's upper endpoint is now the re-angled apex.
    expect(fold.aCm[0]).toBeCloseTo(EXPECTED_APEX[0], 9);
    expect(fold.aCm[1]).toBeCloseTo(EXPECTED_APEX[1], 9);

    const holes = internals.filter((e) => e.kind === "drillHole");
    const nearApex = holes.find(
      (h) =>
        h.kind === "drillHole" &&
        Math.hypot(h.atCm[0] - EXPECTED_APEX[0], h.atCm[1] - EXPECTED_APEX[1]) <
          DRILL_HOLE_SETBACK_CM + 1e-6,
    );
    expect(nearApex).toBeDefined();
  });

  it("BDART-03: the back panel's dart is unaffected by a real cup delta", () => {
    const withDelta = draftBody(HIGH_BUST_DELTA, { darts: true }, t, optsM);
    const noDelta = draftBody(M, { darts: true }, t, optsM);
    expect(dartsOf(withDelta.back.internalsCm)).toEqual(
      dartsOf(noDelta.back.internalsCm),
    );
    const [backDart] = dartsOf(withDelta.back.internalsCm);
    expect(backDart[0]).toEqual(UNCHANGED_APEX_TOP);
    expect(backDart[2]).toEqual(UNCHANGED_APEX_BOTTOM);
  });

  it("BDART-01/10: a real cup delta angles the dress waist-join dart's single apex the same way", () => {
    const dressOpts: BlockOpts = {
      ...optsM,
      lengthCm: M.backLength,
      dressHemHalfCm: 27,
    };
    const withDelta = draftBody(HIGH_BUST_DELTA, { darts: true }, t, dressOpts);
    const [dart] = dartsOf(withDelta.front.internalsCm);
    // ptsCm = [leftLeg, apex, rightLeg] for the single-ended dress dart.
    const [, apex] = dart;
    expect(apex[0]).toBeCloseTo(EXPECTED_DRESS_APEX[0], 9);
    expect(apex[1]).toBeCloseTo(EXPECTED_DRESS_APEX[1], 9);
  });

  it("BDART-01/10: a real cup delta angles the front-closure half-panel's single dart the same way", () => {
    const withDelta = draftBody(
      HIGH_BUST_DELTA,
      { darts: true, frontClosure: "buttonStand" },
      t,
      optsM,
    );
    const [dart] = dartsOf(withDelta.front.internalsCm);
    const [apexTop] = dart;
    expect(apexTop[0]).toBeCloseTo(EXPECTED_APEX[0], 9);
    expect(apexTop[1]).toBeCloseTo(EXPECTED_APEX[1], 9);
  });

  it("BDART-02: dart width grows monotonically with a larger cup delta", () => {
    const small = draftBody(
      { ...M, highBust: 88 }, // delta 4
      { darts: true },
      t,
      optsM,
    );
    const big = draftBody(
      { ...M, highBust: 76 }, // delta 16
      { darts: true },
      t,
      optsM,
    );
    const [dartSmall] = dartsOf(small.front.internalsCm);
    const [dartBig] = dartsOf(big.front.internalsCm);
    const widthAt = (dart: Pt[]) => Math.abs(dart[1][0] - dart[3][0]); // rightLeg.x - leftLeg.x
    expect(widthAt(dartBig)).toBeGreaterThan(widthAt(dartSmall));
  });

  // Verifier fix (validation.md, Fix 1): the monotonic test above proves
  // direction but not the cited formula's exact coefficient -- a mutated
  // divisor (e.g. /4 -> /2) would still pass it. Asserting the WIDTH
  // DIFFERENCE (not the absolute width, which also depends on the
  // pre-existing dartsSuppression term) isolates exactly the cited
  // FBA formula this feature adds: widthWith - widthNo = 2 * (delta/4) =
  // delta/2, independent of any other term in dartHalfWidth's formula.
  it("BDART-02: the dart widens by EXACTLY bustCupDeltaCm/2 (the cited FBA formula), not just monotonically", () => {
    const withDelta = draftBody(HIGH_BUST_DELTA, { darts: true }, t, optsM); // delta 8
    const noDelta = draftBody(M, { darts: true }, t, optsM);
    const [dartWithDelta] = dartsOf(withDelta.front.internalsCm);
    const [dartNoDelta] = dartsOf(noDelta.front.internalsCm);
    const widthAt = (dart: Pt[]) => Math.abs(dart[1][0] - dart[3][0]);
    const widthDiff = widthAt(dartWithDelta) - widthAt(dartNoDelta);
    const bustCupDeltaCm = 8;
    expect(widthDiff).toBeCloseTo(bustCupDeltaCm / 2, 9);
  });

  // Verifier fix (validation.md, Fix 2): bustSpan and bustPointHeight must
  // resolve INDEPENDENTLY -- setting only one must use the real value for
  // that one and the cited fallback for the other.
  it("BDART-06: bustSpan set alone uses the real value for X, the fallback for Y", () => {
    // apexXOffsetCm = clamp(22/2 + 0.5, 2, 23) = 11.5 (real bustSpan)
    // apexYCm = clamp(4.0 + 26.5, 8, 37) = 30.5 (fallback bustPointHeight)
    const withBustSpanOnly = draftBody(
      { ...HIGH_BUST_DELTA, bustSpan: 22 },
      { darts: true },
      t,
      optsM,
    );
    const [dart] = dartsOf(withBustSpanOnly.front.internalsCm);
    const [apexTop] = dart;
    expect(apexTop[0]).toBeCloseTo(15.5, 9); // 27 - 11.5, the real bustSpan
    expect(apexTop[1]).toBeCloseTo(EXPECTED_APEX[1], 9); // fallback bustPointHeight
  });

  it("BDART-06: bustPointHeight set alone uses the real value for Y, the fallback for X", () => {
    // apexXOffsetCm = clamp(18.5/2 + 0.5, 2, 23) = 9.75 (fallback bustSpan)
    // apexYCm = clamp(4.0 + 24, 8, 37) = 28 (real bustPointHeight)
    const withBustPointHeightOnly = draftBody(
      { ...HIGH_BUST_DELTA, bustPointHeight: 24 },
      { darts: true },
      t,
      optsM,
    );
    const [dart] = dartsOf(withBustPointHeightOnly.front.internalsCm);
    const [apexTop] = dart;
    expect(apexTop[0]).toBeCloseTo(EXPECTED_APEX[0], 9); // fallback bustSpan
    expect(apexTop[1]).toBeCloseTo(28, 9); // 4.0 + 24, the real bustPointHeight
  });

  // Verifier fix (validation.md, Fix 3): the `if (fitted)` gate (pre-existing,
  // unmodified by this feature) must keep the whole bust-apex code path
  // inert on a panel with no dart to shape -- a knit panel never fits, so a
  // real cup delta there has no effect at all.
  it("BDART-10: a real cup delta on a knit (non-fitted) panel has no effect -- no dart exists to re-angle", () => {
    const knitOpts: BlockOpts = { ...optsM, knit: true };
    const withDelta = draftBody(HIGH_BUST_DELTA, {}, t, knitOpts);
    expect(dartsOf(withDelta.front.internalsCm)).toHaveLength(0);
    expect(
      (withDelta.front.internalsCm ?? []).some((e) => e.kind === "dart"),
    ).toBe(false);
  });

  it("BDART-06: a real bustSpan/bustPointHeight value (not the fallback) is used verbatim in the apex calculation", () => {
    // apexXOffsetCm = clamp(22/2 + 0.5, 2, 23) = 11.5 (unclamped, real value)
    // apexYCm = clamp(4.0 + 24, 8, 37) = 28 (unclamped, real value)
    // apex (side -1) = [27 - 11.5, 28] = [15.5, 28] -- distinct from the
    // fallback-derived EXPECTED_APEX ([17.25, 30.5]) above.
    const withRealValues = draftBody(
      { ...HIGH_BUST_DELTA, bustSpan: 22, bustPointHeight: 24 },
      { darts: true },
      t,
      optsM,
    );
    const [dart] = dartsOf(withRealValues.front.internalsCm);
    const [apexTop] = dart;
    expect(apexTop[0]).toBeCloseTo(15.5, 9);
    expect(apexTop[1]).toBeCloseTo(28, 9);
    expect(apexTop).not.toEqual(EXPECTED_APEX);
  });

  it("BDART-07: boundary bustSpan/bustPointHeight values (at MEASUREMENT_RANGES extremes) on the smallest chart still clamp the apex into the panel's own interior band", () => {
    const pp = SIZE_TABLE.PP;
    const boundaryOpts: BlockOpts = {
      gender: "female",
      knit: false,
      lengthCm: pp.backLength + pp.hipHeight + 5,
      wearingEaseCm: 8,
    };
    const withBoundary = draftBody(
      {
        ...pp,
        highBust: pp.bust - 20,
        bustSpan: MEASUREMENT_RANGES.bustSpan.max,
        bustPointHeight: MEASUREMENT_RANGES.bustPointHeight.max,
      },
      { darts: true },
      t,
      boundaryOpts,
    );
    const [dart] = dartsOf(withBoundary.front.internalsCm);
    const [apexTop] = dart;
    const shoulderSlope = 4.0;
    const waistY = pp.backLength;
    // apexYCm is clamped to [shoulderSlope + 4, waistY - 4] -- never at or
    // past the waist, never at or above the shoulder line.
    expect(apexTop[1]).toBeGreaterThanOrEqual(shoulderSlope + 4);
    expect(apexTop[1]).toBeLessThanOrEqual(waistY - 4);
  });
});

// #253: the two independently-clamped pitch-notch fractions (0.7 of a
// panel's own single-side armhole length here, 0.35 of the cap's own full
// arc in sleeve.ts) are gone -- both sides now derive ONE shared distance
// off the PAIR's own combined total (lib/draft/seams.ts's
// pitchNotchDistanceCm), computed once in draftBody and handed to both
// bodice() calls verbatim.
describe("draftBody pitch-notch distance (#253)", () => {
  it("matches pitchNotchDistanceCm(armholeLenCm) exactly -- derived from the TOTAL, not either panel's own length", () => {
    const { armholeLenCm, armholeBaseLenCm, pitchNotchCm, basePitchNotchCm } =
      draftBody(M, { sleeve: "short", darts: true }, t, optsM);
    expect(pitchNotchCm).toBeCloseTo(pitchNotchDistanceCm(armholeLenCm), 9);
    expect(basePitchNotchCm).toBeCloseTo(
      pitchNotchDistanceCm(armholeBaseLenCm),
      9,
    );
  });

  it("stays derived from the shared total even when backWidth makes front and back genuinely different lengths", () => {
    const diverged: Measurements = { ...M, backWidth: 30 };
    const { front, back, armholeLenCm, pitchNotchCm } = draftBody(
      diverged,
      { sleeve: "short", darts: true },
      t,
      optsM,
    );
    // Sanity check: this backWidth genuinely produces a front/back armhole
    // divergence -- otherwise the rest of this test would be vacuous.
    expect(front.armholeLenCm).not.toBeCloseTo(back.armholeLenCm!, 1);
    // Even so, the ONE shared distance is still exactly derived from the
    // PAIR's own combined total (front + back), not either side alone.
    expect(pitchNotchCm).toBeCloseTo(pitchNotchDistanceCm(armholeLenCm), 9);
  });
});
