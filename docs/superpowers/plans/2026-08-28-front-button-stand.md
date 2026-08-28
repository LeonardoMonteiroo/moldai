# Front Button-Stand/Placket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draft a front button-stand piece for a blouse's bodice front, closing issue #223.

**Architecture:** The front bodice panel (`lib/draft/body.ts`) splits into a mirrored
half-panel (`qty: 2`, no fold) only when `style.frontClosure === "buttonStand"` on a
non-knit, non-dress garment — giving center front a real boundary edge for the first
time. A new `draftButtonStand` sub-piece (`lib/draft/subpieces.ts`) is measured off that
edge and mated to it via the seam graph, following the exact `collar`/`cuff`/`waistband`
recipe. `lib/proof3d/mesh.ts` needs one line changed (a new `centerXCm` field replaces a
bounding-box assumption); `lib/draft/easeReport.ts` needs no change at all (verified by a
new test, not by inspection).

**Tech Stack:** TypeScript, Vitest (`node` project — everything touched here is pure
logic, no DOM).

**Spec:** `docs/superpowers/specs/2026-08-28-front-button-stand-design.md`

## Global Constraints

- English identifiers; UI display text pt-BR (`messages/pt-BR.json`) — CLAUDE.md's
  language boundary.
- `FRONT_CLOSURES`/`BUTTON_STAND_WIDTH_CM`/every clamp bound is exported from one place
  (`lib/draft/garment.ts`/`lib/draft/subpieces.ts`) and quoted by the AI layer, never a
  hardcoded duplicate.
- `frontClosure` applies to `spec.type === "blouse"` only — the design spec's Non-goals
  section explains why `dress` is excluded (the waist-join pairing assumes the front's
  full hem width).
- Every new/changed pure-logic file lives in the `node` Vitest project (`lib/**/*.test.ts`)
  — run `npx vitest run --project node <path>` while iterating, `npm run typecheck` and
  `npm run lint` before each commit per this repo's own verification rule.
- Conventional Commits (`type(scope): summary`), English, one commit per task below.

---

## Task 1: `frontClosure` style field + `validateSpec`

**Files:**

- Modify: `lib/types.ts` (near `CollarType`/`CuffType`/`WaistbandType`, `~line 56-58`, and
  `GarmentStyle`, `~line 88-104`)
- Modify: `lib/draft/garment.ts` (`COLLARS`/`CUFFS`/`WAISTBANDS` block, `~line 73-75`;
  `validateSpec`, `~line 177-186`)
- Test: `lib/draft/garment.test.ts` (`describe("validateSpec")` block, `~line 150-187`)

**Interfaces:**

- Produces: `FrontClosureType = "none" | "buttonStand"` (`lib/types.ts`);
  `GarmentStyle.frontClosure?: FrontClosureType`; `FRONT_CLOSURES: FrontClosureType[]`
  (`lib/draft/garment.ts`) — consumed by Tasks 2, 4, 8.

- [ ] **Step 1: Write the failing tests**

In `lib/draft/garment.test.ts`, inside the existing `describe("validateSpec")` block
(right after the `"leaves collar/cuff/waistband undefined..."` test, `~line 186`):

```ts
it("falls back to none on an invalid frontClosure enum", () => {
  const s = validateSpec({
    type: "blouse",
    style: { frontClosure: "zipper" },
    measurementOverrides: {},
  });
  expect(s.style.frontClosure).toBe("none");
});

it("accepts frontClosure: buttonStand", () => {
  const s = validateSpec({
    type: "blouse",
    style: { frontClosure: "buttonStand" },
    measurementOverrides: {},
  });
  expect(s.style.frontClosure).toBe("buttonStand");
});

it("leaves frontClosure undefined when the spec doesn't mention it", () => {
  const s = validateSpec({
    type: "blouse",
    style: {},
    measurementOverrides: {},
  });
  expect(s.style.frontClosure).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project node lib/draft/garment.test.ts -t "frontClosure"`
Expected: FAIL — `s.style.frontClosure` is `undefined`/a TypeScript error (`frontClosure`
doesn't exist on `GarmentStyle` yet).

- [ ] **Step 3: Add the type**

In `lib/types.ts`, right after the existing sub-piece enum line (`~line 58`):

```ts
export type CollarType = "none" | "convertible";
export type CuffType = "none" | "straight";
export type WaistbandType = "none" | "straight";
// #223: closed enum, same shape as the three above -- "buttonStand" is the
// only front-closure shape MoldAI drafts; anything else is "em breve",
// surfaced by lib/ai/prompt.ts's guidance rather than a silent substitute.
export type FrontClosureType = "none" | "buttonStand";
```

In `GarmentStyle` (`~line 104`, right after the `waistband` field):

```ts
  waistband?: WaistbandType;
  // #223: a button-stand extension sewn to the front bodice's own
  // center-front edge (lib/draft/subpieces.ts's draftButtonStand). Applies
  // only to spec.type === "blouse" (lib/draft/body.ts gates it off dress and
  // tshirt internally -- see docs/superpowers/specs/2026-08-28-front-button-
  // stand-design.md's Non-goals for why dress is excluded). Opt-in, default
  // "none", the collar/cuff precedent (a new capability the AI must
  // actively request) rather than waistband's "defaults on".
  frontClosure?: FrontClosureType;
  trouserLengthCm?: number;
```

- [ ] **Step 4: Wire it into `garment.ts`**

In `lib/draft/garment.ts`, add the import and export (`~line 73-75`):

```ts
export const COLLARS: CollarType[] = ["none", "convertible"];
export const CUFFS: CuffType[] = ["none", "straight"];
export const WAISTBANDS: WaistbandType[] = ["none", "straight"];
// #223: same footing as the three above -- the AI-facing catalog, rendered
// into the prompt/schema from this one export, never a hardcoded duplicate.
export const FRONT_CLOSURES: FrontClosureType[] = ["none", "buttonStand"];
```

Add `FrontClosureType` to the type import at the top of the file (`~line 6-20`, the
`import { ... } from "@/lib/types"` block) alongside `WaistbandType`.

In `validateSpec`'s `outStyle` object (`~line 183-186`, right after the `waistband`
field):

```ts
    waistband:
      style.waistband !== undefined
        ? pick(style.waistband, WAISTBANDS, "straight")
        : undefined,
    frontClosure:
      style.frontClosure !== undefined
        ? pick(style.frontClosure, FRONT_CLOSURES, "none")
        : undefined,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --project node lib/draft/garment.test.ts -t "frontClosure"`
Expected: PASS (3 tests)

- [ ] **Step 6: Typecheck and full garment.test.ts run**

Run: `npx tsc --noEmit` (per this repo's own worktree note: prefer this over `npm run
typecheck` if working in a worktree — otherwise `npm run typecheck` is fine)
Run: `npx vitest run --project node lib/draft/garment.test.ts`
Expected: both clean — this task only adds a field and a validator branch, nothing
downstream reads it yet.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/draft/garment.ts lib/draft/garment.test.ts
git commit -m "feat(draft): add GarmentStyle.frontClosure style field

Part of #223. Closed enum (none/buttonStand), validated the same way
collar/cuff/waistband already are -- nothing drafts from it yet."
```

---

## Task 2: The front bodice splits into a half-panel (`body.ts`)

**Files:**

- Modify: `lib/draft/core.ts` (`DraftedPiece` interface, `~line 14-49`)
- Modify: `lib/draft/body.ts` (`bodice()`, `~line 54-425`)
- Test: `lib/draft/body.test.ts`

**Interfaces:**

- Consumes: `GarmentStyle.frontClosure` (Task 1).
- Produces: `DraftedPiece.centerXCm?: number` (new field); a front `DraftedPiece` with
  `qty: 2`, no `foldEdge`, `seamEdges.centerFront`, and `seamEdges.hem` narrowed to
  `[hemL, hemCenterIdx]` when front-closure is active — consumed by Tasks 4 and 6.

- [ ] **Step 1: Write the failing tests**

In `lib/draft/body.test.ts`, add a new `describe` block after the existing
`describe("draftBody sloper", ...)` block:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project node lib/draft/body.test.ts -t "front closure"`
Expected: FAIL — `front.qty` is `1`, `front.centerXCm` doesn't exist yet (TS error).

- [ ] **Step 3: Add `centerXCm` to `DraftedPiece`**

In `lib/draft/core.ts`, inside the `DraftedPiece` interface, right after `seamEdges`
(`~line 48`):

```ts
  seamEdges?: Record<string, [number, number]>;
  // #223: this piece's own true axis of symmetry, when it is NOT the
  // bounding-box midpoint -- an asymmetric half-panel (a front-closure
  // bodice front, lib/draft/body.ts). Absent for every symmetric piece
  // (every piece today except that one); lib/proof3d/mesh.ts reads it
  // instead of computing a bbox-based center when present.
  centerXCm?: number;
```

- [ ] **Step 4: Add the `frontClosure` gate in `bodice()`**

In `lib/draft/body.ts`, right after the existing `const fitted = !!style.darts &&
!opts.knit;` line (`~line 127`):

```ts
const fitted = !!style.darts && !opts.knit;
// #223: a front-closure blouse front splits into a mirrored half-panel
// instead of the usual whole, cut-on-fold piece -- see docs/superpowers/
// specs/2026-08-28-front-button-stand-design.md. Gated on `!opts.knit`
// (excludes tshirt) and `opts.dressHemHalfCm === undefined` (excludes
// dress, whose bodice hem doubles as the waist-join seam and assumes the
// front's FULL hem width -- see the spec's Non-goals) rather than
// threading spec.type into this function.
const frontClosure =
  frontish &&
  style.frontClosure === "buttonStand" &&
  !opts.knit &&
  opts.dressHemHalfCm === undefined;
const waistY = m.backLength;
```

- [ ] **Step 5: Stop building the right side when `frontClosure`**

Replace this block (`~line 159-190`):

```ts
const pts: Pt[] = [];
const spans: [number, number][] = [];
const push = (p: Pt) => (pts.push(p), pts.length - 1);

const cf = push([cx, neckDrop]); // neckline center
push([cx - neckHalf * 0.6, neckDrop * 0.55]); // left neckline ctrl
const hpsL = push([cx - neckHalf, 0]); // left HPS
spans.push([cf, hpsL]); // left neckline (curved)
const shL = push([cx - shoulderHalf, shoulderSlope]); // left shoulder (straight hpsL->shL)
push([cx - armCtrlX, midArmY]); // left armhole ctrl
const uaL = push([cx - halfChest, armholeDepth]); // left underarm
spans.push([shL, uaL]); // left armhole (curved)
// #79: for a dress, waistY === len (the hem IS the waist seam) -- pushing
// both would land two extra vertices exactly on top of the hem's own,
// retracing that edge and leaving the boundary non-simple.
if (fitted && !isDressHem) push([cx - waistHalf, waistY]); // left waist
const hemL = push([cx - hemHalf, len]); // left hem
// #126: exactly on the straight hem edge (collinear with left/right hem,
// same y) -- subdivides that edge into two collinear segments rather than
// changing the piece's rendered shape, giving the fold line's bottom
// endpoint a real vertex to reference. The top endpoint is `cf`, the
// neckline-center point already pushed at index 0.
const hemCenter = push([cx, len]); // hem center (fold bottom)
const hemR = push([cx + hemHalf, len]); // right hem (straight = hem)
if (fitted && !isDressHem) push([cx + waistHalf, waistY]); // right waist
const uaR = push([cx + halfChest, armholeDepth]); // right underarm
push([cx + armCtrlX, midArmY]); // right armhole ctrl
const shR = push([cx + shoulderHalf, shoulderSlope]); // right shoulder
spans.push([uaR, shR]); // right armhole (curved)
const hpsR = push([cx + neckHalf, 0]); // right HPS (straight shR->hpsR)
push([cx + neckHalf * 0.6, neckDrop * 0.55]); // right neckline ctrl
spans.push([hpsR, pts.length]); // right neckline + closing (curved)
```

with:

```ts
const pts: Pt[] = [];
const spans: [number, number][] = [];
const push = (p: Pt) => (pts.push(p), pts.length - 1);

const cf = push([cx, neckDrop]); // neckline center
push([cx - neckHalf * 0.6, neckDrop * 0.55]); // left neckline ctrl
const hpsL = push([cx - neckHalf, 0]); // left HPS
spans.push([cf, hpsL]); // left neckline (curved)
const shL = push([cx - shoulderHalf, shoulderSlope]); // left shoulder (straight hpsL->shL)
push([cx - armCtrlX, midArmY]); // left armhole ctrl
const uaL = push([cx - halfChest, armholeDepth]); // left underarm
spans.push([shL, uaL]); // left armhole (curved)
// #79: for a dress, waistY === len (the hem IS the waist seam) -- pushing
// both would land two extra vertices exactly on top of the hem's own,
// retracing that edge and leaving the boundary non-simple.
if (fitted && !isDressHem) push([cx - waistHalf, waistY]); // left waist
const hemL = push([cx - hemHalf, len]); // left hem
// #126: exactly on the straight hem edge (collinear with left/right hem,
// same y) -- subdivides that edge into two collinear segments rather than
// changing the piece's rendered shape, giving the fold line's bottom
// endpoint a real vertex to reference. The top endpoint is `cf`, the
// neckline-center point already pushed at index 0.
const hemCenter = push([cx, len]); // hem center (fold bottom)

// #223: a front-closure half-panel stops here -- the polygon closes
// directly from hemCenter back to cf (index 0), which IS the vertical
// center-front line, now a real boundary edge instead of the interior
// fold chord the whole-panel case marks below. Every "right side" vertex
// (hemR/uaR/shR/hpsR) simply doesn't exist for this half.
let hemR: number | undefined;
let uaR: number | undefined;
let shR: number | undefined;
let hpsR: number | undefined;
if (!frontClosure) {
  hemR = push([cx + hemHalf, len]); // right hem (straight = hem)
  if (fitted && !isDressHem) push([cx + waistHalf, waistY]); // right waist
  uaR = push([cx + halfChest, armholeDepth]); // right underarm
  push([cx + armCtrlX, midArmY]); // right armhole ctrl
  shR = push([cx + shoulderHalf, shoulderSlope]); // right shoulder
  spans.push([uaR, shR]); // right armhole (curved)
  hpsR = push([cx + neckHalf, 0]); // right HPS (straight shR->hpsR)
  push([cx + neckHalf * 0.6, neckDrop * 0.55]); // right neckline ctrl
  spans.push([hpsR, pts.length]); // right neckline + closing (curved)
}
```

- [ ] **Step 6: Move `insideRef` off the new boundary edge**

Replace (`~line 336`):

```ts
const insideRef: Pt = [cx, len / 2];
```

with:

```ts
// #223: on a front-closure half-panel, [cx, len/2] sits exactly on the
// new center-front boundary edge -- degenerate for notch orientation
// (notchAt needs a reference strictly inside the piece). Shifted toward
// the shoulder side, the same "-" direction every vertex on this half uses.
const insideRef: Pt = frontClosure
  ? [cx - shoulderHalf * 0.3, len / 2]
  : [cx, len / 2];
```

- [ ] **Step 7: Skip the notches a half-panel can't draft**

Replace this block (`~line 338-382`):

```ts
const pitchType: NotchType = frontish ? "single" : "double";
const notches: NotchCm[] = [
  // front/back pitch notches, walked from the SAME underarm-relative
  // distance the sleeve places its own matching notches at (see
  // sleeve.ts) -- left armhole curve (shL->uaL) and its mirror (uaR->shR).
  notchAtArcLengthCm(
    pts,
    spans,
    shL,
    uaL,
    armholeEdgeLenCm - pitchNotchCm,
    insideRef,
    pitchType,
  ),
  notchAtArcLengthCm(pts, spans, uaR, shR, pitchNotchCm, insideRef, pitchType),
  // hem-fold notch: centre front/back at the hem, to line up the fabric fold.
  notchAtVertex(pts, hemCenter, insideRef, "single"),
];
if (isDressHem) {
  // #124: waist-join notches -- the outer corners of the hem/waist-join
  // edge this panel shares with the skirt panel it's sewn to (#79).
  // "double" so they read apart from the hem-fold's own "single" centre
  // mark.
  notches.push(
    notchAtVertex(pts, hemL, insideRef, "double"),
    notchAtVertex(pts, hemR, insideRef, "double"),
  );
  // #124: dart-leg notches, where each dart's legs meet the waist/hem
  // seam -- only reachable here, since the fisheye (double-ended) dart a
  // non-dress piece drafts is fully internal and touches no edge to notch.
  for (const dart of dartsStruct ?? []) {
    const [legL, , legR] = dart.ptsCm;
    notches.push(
      notchAt(legL, [1, 0], insideRef, "single"),
      notchAt(legR, [1, 0], insideRef, "single"),
    );
  }
}
```

with:

```ts
const pitchType: NotchType = frontish ? "single" : "double";
const notches: NotchCm[] = [
  // front/back pitch notches, walked from the SAME underarm-relative
  // distance the sleeve places its own matching notches at (see
  // sleeve.ts) -- left armhole curve (shL->uaL) and its mirror (uaR->shR).
  notchAtArcLengthCm(
    pts,
    spans,
    shL,
    uaL,
    armholeEdgeLenCm - pitchNotchCm,
    insideRef,
    pitchType,
  ),
];
// #223: the mirror-side pitch notch and the hem-fold notch both mark
// geometry a front-closure half-panel simply doesn't draft (no right
// armhole, no fold at center front).
if (!frontClosure) {
  notches.push(
    notchAtArcLengthCm(
      pts,
      spans,
      uaR!,
      shR!,
      pitchNotchCm,
      insideRef,
      pitchType,
    ),
    // hem-fold notch: centre front/back at the hem, to line up the fabric fold.
    notchAtVertex(pts, hemCenter, insideRef, "single"),
  );
}
if (isDressHem) {
  // #124: waist-join notches -- the outer corners of the hem/waist-join
  // edge this panel shares with the skirt panel it's sewn to (#79).
  // "double" so they read apart from the hem-fold's own "single" centre
  // mark. frontClosure is never true here -- isDressHem implies a dress,
  // and frontClosure excludes dress (see its own doc above) -- so hemR is
  // always defined on this branch.
  notches.push(
    notchAtVertex(pts, hemL, insideRef, "double"),
    notchAtVertex(pts, hemR!, insideRef, "double"),
  );
  // #124: dart-leg notches, where each dart's legs meet the waist/hem
  // seam -- only reachable here, since the fisheye (double-ended) dart a
  // non-dress piece drafts is fully internal and touches no edge to notch.
  for (const dart of dartsStruct ?? []) {
    const [legL, , legR] = dart.ptsCm;
    notches.push(
      notchAt(legL, [1, 0], insideRef, "single"),
      notchAt(legR, [1, 0], insideRef, "single"),
    );
  }
}
```

- [ ] **Step 8: One dart, not two, on a half-panel**

Replace (`~line 313`):

```ts
dartsStruct = [oneDart(-1), oneDart(1)];
```

with:

```ts
// #223: a front-closure half-panel is cut twice (qty:2, mirrored), so
// one dart here reproduces both darts across the finished garment --
// the whole-panel case still needs both, since it's cut once.
dartsStruct = frontClosure ? [oneDart(-1)] : [oneDart(-1), oneDart(1)];
```

- [ ] **Step 9: Narrow `seamEdges.hem`, add `seamEdges.centerFront`**

Replace this block (`~line 395-402`):

```ts
const seamEdges: Record<string, [number, number]> = {
  shoulder: [hpsL, shL],
  side: [uaL, hemL],
  armhole: [shL, uaL],
  hem: [hemL, hemR],
  necklineLeft: [cf, hpsL],
  necklineRight: [hpsR, pts.length],
};
```

with:

```ts
const seamEdges: Record<string, [number, number]> = {
  shoulder: [hpsL, shL],
  side: [uaL, hemL],
  armhole: [shL, uaL],
  // #223: a front-closure half-panel's own hem edge is only [hemL,
  // hemCenter] (half the width) -- there is no hemR to name.
  hem: [hemL, frontClosure ? hemCenter : hemR!],
  necklineLeft: [cf, hpsL],
};
if (frontClosure) {
  // #223: the polygon's own closing edge (hemCenter wraps back to cf,
  // index 0) -- the new center-front boundary, the button stand's mate.
  seamEdges.centerFront = [hemCenter, pts.length];
} else {
  seamEdges.necklineRight = [hpsR!, pts.length];
}
```

- [ ] **Step 10: Set `qty`/`foldEdge`/`centerXCm` on the returned piece**

Replace the `return` statement (`~line 404-425`):

```ts
return {
  piece: {
    id,
    name,
    qty: 1,
    outlineCm: pts,
    curvedSpans: spans,
    grainlineCm,
    internalsCm,
    foldEdge: [cf, hemCenter],
    notches,
    detailRows,
    armholeLenCm: armholeEdgeLenCm,
    seamEdges,
  },
  armholeEdgeLenCm,
  armholeEdgeBaseLenCm,
  halfChestCm: halfChest,
  pitchNotchCm,
  basePitchNotchCm,
};
```

with:

```ts
return {
  piece: {
    id,
    name,
    qty: frontClosure ? 2 : 1,
    outlineCm: pts,
    curvedSpans: spans,
    grainlineCm,
    internalsCm,
    // #223: no fold on a front-closure half-panel -- this edge is a real
    // seam now (its own seamEdges.centerFront above), not a cut-on-fold
    // axis.
    foldEdge: frontClosure ? undefined : [cf, hemCenter],
    notches,
    detailRows,
    armholeLenCm: armholeEdgeLenCm,
    seamEdges,
    // #223: this half-panel isn't symmetric about its own bounding box,
    // so a bbox-midpoint (lib/proof3d/mesh.ts's pieceCx) can't find its
    // true axis -- cx is the same local variable that placed cf/hemCenter.
    centerXCm: frontClosure ? cx : undefined,
  },
  armholeEdgeLenCm,
  armholeEdgeBaseLenCm,
  halfChestCm: halfChest,
  pitchNotchCm,
  basePitchNotchCm,
};
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npx vitest run --project node lib/draft/body.test.ts`
Expected: PASS — every existing test in this file too (frontClosure defaults to
`undefined`/falsy for all of them, so `frontClosure` is `false` and every branch above
takes its original path).

- [ ] **Step 12: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If `hemR`/`uaR`/`shR`/`hpsR` non-null assertions or the `let` types
raise anything, double-check every read site is inside an `if (!frontClosure)` or
`if (isDressHem)` block as written above.

- [ ] **Step 13: Commit**

```bash
git add lib/draft/core.ts lib/draft/body.ts lib/draft/body.test.ts
git commit -m "feat(draft): split the front bodice into a half-panel for a button stand

Part of #223. style.frontClosure === \"buttonStand\" (blouse only, see
the design doc's Non-goals for why dress/tshirt are excluded) makes
bodice() stop at center front instead of mirroring both halves in one
piece -- qty:2, no fold, a real seamEdges.centerFront boundary where
there used to be only an interior fold chord."
```

---

## Task 3: `draftButtonStand` sub-piece + catalog entries

**Files:**

- Modify: `lib/draft/subpieces.ts`
- Modify: `messages/pt-BR.json` (`PatternData.pieceNames`, `PatternData.rows`)

**Interfaces:**

- Consumes: nothing new from earlier tasks (this is a leaf drafter, same as
  `draftCollar`/`draftCuff`/`draftWaistband`).
- Produces: `draftButtonStand(centerFrontLenCm: number, t: Translate): DraftedPiece`,
  `BUTTON_STAND_WIDTH_CM: number` — consumed by Task 4.

- [ ] **Step 1: Add the catalog keys**

In `messages/pt-BR.json`, under `PatternData.pieceNames` (`~line 162-171`), add after
`"waistband": "Cós"`:

```json
    "pieceNames": {
      "front": "Frente",
      "back": "Costas",
      "sleeve": "Manga",
      "skirt": "Saia",
      "collar": "Gola",
      "cuff": "Punho",
      "placket": "Carcela",
      "waistband": "Cós",
      "buttonStand": "Carcela de botões"
    },
```

Under `PatternData.rows` (`~line 172-195`), add after `"waistbandClosureMark": "Marca de
fechamento (botão/zíper)"`:

```json
      "waistbandClosureMark": "Marca de fechamento (botão/zíper)",
      "buttonStandMark": "Marca de botão/casa",
```

(Reuses the existing `rows.length`/`rows.grain`/`comingSoonBadge` keys — no other new
catalog entries needed for this piece, matching the cuff/waistband precedent of not
narrating a fixed width.)

- [ ] **Step 2: Add the drafter**

In `lib/draft/subpieces.ts`, append after the Waistband section (end of file, after
`draftWaistband`):

```ts
// ---------------------------------------------------------------------------
// Button stand (#223)
// ---------------------------------------------------------------------------

// Finished width of the stand extension -- a documented, reasonable shirt
// button-stand figure. The issue's own research found no verified
// industry-standard multiplier to cite, so this is a deliberate constant,
// the same footing as WAISTBAND_OVERLAP_CM above.
export const BUTTON_STAND_WIDTH_CM = 4;

// centerFrontLenCm is the front bodice half-panel's own MEASURED
// center-front edge (lib/draft/body.ts's frontClosure mode) -- the button
// stand is a separate piece mated to that edge via the seam graph, never a
// distortion of the front panel's own outline, so center front stays the
// fixed button-placement line the issue's source describes. Reuses
// straightBand exactly like draftCuff/draftWaistband above.
export function draftButtonStand(
  centerFrontLenCm: number,
  t: Translate,
): DraftedPiece {
  const { pts, seamEdge } = straightBand(
    centerFrontLenCm,
    BUTTON_STAND_WIDTH_CM,
  );
  const grainlineCm: [Pt, Pt] = [
    [centerFrontLenCm * 0.1, BUTTON_STAND_WIDTH_CM / 2],
    [centerFrontLenCm * 0.9, BUTTON_STAND_WIDTH_CM / 2],
  ];
  const detailRows: DetailRow[] = [
    { label: t("rows.length"), value: cm(centerFrontLenCm) },
    { label: t("rows.grain"), value: t("grainValue") },
    // #223 AC: the button/buttonhole placement mark is missing -- surfaced
    // "em breve" on the piece's own card, the waistbandClosureMark precedent.
    { label: t("rows.buttonStandMark"), value: t("comingSoonBadge") },
  ];
  return {
    id: "button-stand",
    name: t("pieceNames.buttonStand"),
    qty: 2, // one per front half
    outlineCm: pts,
    grainlineCm,
    detailRows,
    seamEdges: { centerFront: seamEdge },
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean — no test file exercises this function directly yet (it's covered via
`garment.test.ts`/the `DECORATION_CASES` matrix in Tasks 4-5, following the same pattern
`draftCollar`/`draftCuff`/`draftWaistband` already use — there is no
`subpieces.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add lib/draft/subpieces.ts messages/pt-BR.json
git commit -m "feat(draft): add the button-stand sub-piece drafter

Part of #223. Mirrors draftCuff exactly: a straight band sized from a
measured edge, qty:2 (one per front half), with an honest 'em breve'
row for the still-missing button/buttonhole placement mark."
```

---

## Task 4: Wire the button stand into `draftAll` + fix the collar-neckline arc

**Files:**

- Modify: `lib/draft/garment.ts` (`draftAll`, the collar block `~line 447-491`; import
  list `~line 34-40`)
- Modify: `messages/pt-BR.json` (`PatternData.seamPairs`)
- Test: `lib/draft/garment.test.ts`

**Interfaces:**

- Consumes: `draftButtonStand`, `BUTTON_STAND_WIDTH_CM` (Task 3); `front.seamEdges.
centerFront`, `front.qty` (Task 2).
- Produces: a `"button-stand"` piece and a `"button-stand-center-front"` seam-graph pair
  whenever `front.seamEdges?.centerFront` is set — consumed by Task 5 (fixtures/assembly)
  and Task 6 (easeReport/mesh, indirectly, via the matrix).

- [ ] **Step 1: Write the failing tests**

In `lib/draft/garment.test.ts`, add after the existing `"#130: the cuff's own seam..."`
test (`~line 1419`, right before the `"no cuff is drafted for a short sleeve..."` test):

```ts
it("#223: the button stand's own seam matches the front's measured center-front edge within 0.3cm", () => {
  const spec = {
    type: "blouse" as const,
    gender: "female" as const,
    measurementOverrides: {},
    style: { frontClosure: "buttonStand" as const },
  };
  const graph = measureSeamGraph(spec, SIZE_TABLE.M, t);
  const pair = graph.find((m) => m.key === "button-stand-center-front");
  expect(pair).toBeDefined();
  expect(pair!.fixable).toBe(false);
  expect(pair!.diffCm).toBeLessThan(0.3);
});

it("#223: no button stand is drafted when frontClosure is unset", () => {
  const spec = {
    type: "blouse" as const,
    gender: "female" as const,
    measurementOverrides: {},
    style: {},
  };
  // draftPiecesCm, not draftAll -- draftAll is not exported from this
  // file; draftPiecesCm is the exported wrapper the existing "no cuff is
  // drafted for a short sleeve..." test above already uses for the
  // identical shape of assertion.
  const pieces = draftPiecesCm(spec, SIZE_TABLE.M, t);
  expect(pieces.map((p) => p.id)).not.toContain("button-stand");
});

it("#223: a collar drafted together with a button stand still matches the front+back neckline arc (front counted from ONE half, doubled)", () => {
  const spec = {
    type: "blouse" as const,
    gender: "female" as const,
    measurementOverrides: {},
    style: {
      neckline: "round" as const,
      collar: "convertible" as const,
      frontClosure: "buttonStand" as const,
    },
  };
  const graph = measureSeamGraph(spec, SIZE_TABLE.M, t);
  const pair = graph.find((m) => m.key === "collar-neckline");
  expect(pair).toBeDefined();
  expect(pair!.diffCm).toBeLessThan(0.3);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project node lib/draft/garment.test.ts -t "#223"`
Expected: FAIL — no `"button-stand-center-front"` pair exists yet.

- [ ] **Step 3: Import `draftButtonStand`**

In `lib/draft/garment.ts`'s import block (`~line 34-40`):

```ts
import {
  draftCollar,
  draftCuff,
  draftPlacket,
  draftWaistband,
  draftButtonStand,
  WAISTBAND_OVERLAP_CM,
} from "./subpieces";
```

- [ ] **Step 4: Fix the collar-neckline arc for a split front**

Replace the collar block (`~line 452-491`):

```ts
if (style.collar === "convertible" && front.seamEdges && back.seamEdges) {
  const necklineArcCm =
    curveArcLengthCm(
      front.outlineCm,
      front.curvedSpans ?? [],
      ...front.seamEdges.necklineLeft,
    ) +
    curveArcLengthCm(
      front.outlineCm,
      front.curvedSpans ?? [],
      ...front.seamEdges.necklineRight,
    ) +
    curveArcLengthCm(
      back.outlineCm,
      back.curvedSpans ?? [],
      ...back.seamEdges.necklineLeft,
    ) +
    curveArcLengthCm(
      back.outlineCm,
      back.curvedSpans ?? [],
      ...back.seamEdges.necklineRight,
    );
  const collar = draftCollar(necklineArcCm, t);
  drafted.push(collar);
  if (collar.seamEdges) {
    seamPairs.push({
      key: "collar-neckline",
      labelKey: "collarNeckline",
      a: [
        edgeRef(front.id, front.seamEdges.necklineLeft),
        edgeRef(front.id, front.seamEdges.necklineRight),
        edgeRef(back.id, back.seamEdges.necklineLeft),
        edgeRef(back.id, back.seamEdges.necklineRight),
      ],
      b: [edgeRef(collar.id, collar.seamEdges.neckline)],
      easeCm: 0,
      fixable: false,
    });
  }
}
```

with:

```ts
if (style.collar === "convertible" && front.seamEdges && back.seamEdges) {
  // #223: a front-closure front (body.ts's frontClosure mode, signalled
  // by qty:2) drafts only one half and has no necklineRight at all --
  // both of its neckline-curve contributions come from necklineLeft,
  // counted twice (both mirrored halves draft the identical curve).
  const frontNeckEdges: [number, number][] =
    front.qty === 2
      ? [front.seamEdges.necklineLeft, front.seamEdges.necklineLeft]
      : [front.seamEdges.necklineLeft, front.seamEdges.necklineRight];
  const necklineArcCm =
    frontNeckEdges.reduce(
      (sum, edge) =>
        sum +
        curveArcLengthCm(front.outlineCm, front.curvedSpans ?? [], ...edge),
      0,
    ) +
    curveArcLengthCm(
      back.outlineCm,
      back.curvedSpans ?? [],
      ...back.seamEdges.necklineLeft,
    ) +
    curveArcLengthCm(
      back.outlineCm,
      back.curvedSpans ?? [],
      ...back.seamEdges.necklineRight,
    );
  const collar = draftCollar(necklineArcCm, t);
  drafted.push(collar);
  if (collar.seamEdges) {
    seamPairs.push({
      key: "collar-neckline",
      labelKey: "collarNeckline",
      a: [
        ...frontNeckEdges.map((edge) => edgeRef(front.id, edge)),
        edgeRef(back.id, back.seamEdges.necklineLeft),
        edgeRef(back.id, back.seamEdges.necklineRight),
      ],
      b: [edgeRef(collar.id, collar.seamEdges.neckline)],
      easeCm: 0,
      fixable: false,
    });
  }
}
```

- [ ] **Step 5: Draft the button stand and declare its seam pair**

Right after the block from Step 4 (still inside `if (isBody) { ... }`, before its closing
brace — the line that currently reads `}` at `~line 491`, followed by `if (spec.type ===
"skirt" || spec.type === "dress") {` at `~line 492`), insert:

```ts
// #223: a button stand, drafted from the front bodice's own measured
// center-front edge -- reachable only when body.ts's frontClosure mode
// actually split the front (the piece's own seamEdges.centerFront is
// the single source of truth for that, not a re-check of style here).
if (front.seamEdges?.centerFront) {
  const centerFrontLenCm = curveArcLengthCm(
    front.outlineCm,
    front.curvedSpans ?? [],
    ...front.seamEdges.centerFront,
  );
  const stand = draftButtonStand(centerFrontLenCm, t);
  drafted.push(stand);
  if (stand.seamEdges) {
    seamPairs.push({
      key: "button-stand-center-front",
      labelKey: "buttonStandCenterFront",
      a: [edgeRef(front.id, front.seamEdges.centerFront)],
      b: [edgeRef(stand.id, stand.seamEdges.centerFront)],
      easeCm: 0,
      fixable: false,
    });
  }
}
```

- [ ] **Step 6: Add the catalog entry for the seam pair's conflict-card label**

In `messages/pt-BR.json`, under `PatternData.seamPairs` (`~line 249-`), add after
`"cuffHem"`:

```json
      "cuffHem": {
        "title": "Punho e manga",
        "aLabel": "Manga · barra",
        "bLabel": "Punho"
      },
      "buttonStandCenterFront": {
        "title": "Carcela e centro-frente",
        "aLabel": "Centro-frente · corpo",
        "bLabel": "Carcela de botões"
      },
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --project node lib/draft/garment.test.ts`
Expected: PASS, including every pre-existing test in this 1500+-line file (the collar fix
is a no-op for every spec where `front.qty !== 2`, i.e. everything except a
`frontClosure: "buttonStand"` blouse).

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 9: Commit**

```bash
git add lib/draft/garment.ts messages/pt-BR.json lib/draft/garment.test.ts
git commit -m "feat(draft): draft the button stand and fix the collar arc for a split front

Part of #223. The stand mates to the front's own measured
centerFront edge via the seam graph, the exact cuff-hem/collar-
neckline recipe. Also fixes draftCollar's neckline arc computation,
which would otherwise read front.seamEdges.necklineRight (undefined
on a split front) and under-measure by half the front's contribution
whenever a collar and a button stand are requested together."
```

---

## Task 5: Matrix coverage — `fixtures.ts` + `assembly.ts`

**Files:**

- Modify: `lib/draft/fixtures.ts`
- Modify: `lib/draft/assembly.ts` (`PHASE_BY_KEY`, `~line 41-56`)

**Interfaces:**

- Consumes: everything from Tasks 2-4 (the new spec shape must draft cleanly through the
  whole pipeline).
- Produces: nothing new — this task extends existing shared coverage
  (`DECORATION_CASES` is consumed by `garment.test.ts`'s containment suite,
  `assembly.test.ts`'s exhaustiveness guard, and the export tests).

- [ ] **Step 1: Add the new case to the shared matrix**

In `lib/draft/fixtures.ts`, add a new entry to `DECORATION_CASES` (after the existing
`"blouse straight sleeveless"` case, `~line 52`):

```ts
  [
    "blouse straight sleeveless",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { neckline: "straight", sleeve: "none", darts: false },
    },
  ],
  [
    // #223: exercises the button-stand front split (qty:2, no fold, a real
    // centerFront edge) across every DECORATION_CASES consumer --
    // containment, the seam graph, assembly's exhaustiveness guard, and
    // every export format's cut-line/nesting suite.
    "blouse buttonstand",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "round",
        sleeve: "short",
        darts: true,
        frontClosure: "buttonStand",
      },
    },
  ],
```

- [ ] **Step 2: Run the whole matrix WITHOUT the assembly fix, to see the real failure**

Run: `npx vitest run --project node lib/draft/assembly.test.ts`
Expected: FAIL — the exhaustiveness guard (`"has a real phase for every pair key the
drafting matrix produces (no silent 'other')"`) reports `button-stand-center-front` has
no entry in `PHASE_BY_KEY`.

- [ ] **Step 3: Add the phase entry**

In `lib/draft/assembly.ts`'s `PHASE_BY_KEY` (`~line 41-56`), add after `"cuff-hem":
"attach"`:

```ts
export const PHASE_BY_KEY: Record<string, SeamPhase> = {
  shoulder: "primary",
  "trouser-front-rise": "primary",
  "trouser-back-rise": "primary",
  "armhole-cap": "sleeve",
  "sleeve-underarm": "sleeve",
  side: "side",
  "trouser-inseam": "side",
  "trouser-outseam": "side",
  "collar-neckline": "attach",
  "cuff-hem": "attach",
  "button-stand-center-front": "attach",
  "waist-join-front": "waistJoin",
  "waist-join-back": "waistJoin",
  "waistband-waist": "band",
  "trouser-waistband-waist": "band",
};
```

- [ ] **Step 4: Run the full drafting test suite**

Run: `npx vitest run --project node lib/draft/`
Expected: PASS — this exercises `body.test.ts`, `garment.test.ts`, `assembly.test.ts`,
`easeReport.test.ts`, `skirt.test.ts`, `sleeve.test.ts`, `core.test.ts`, `ease.test.ts`
all at once, against the widened matrix.

- [ ] **Step 5: Run the export test suites too (they also consume `DECORATION_CASES`)**

Run: `npx vitest run --project node lib/export/`
Expected: PASS. If something fails here, it's almost certainly the offset/cut-line
machinery meeting a `qty: 2`, no-fold piece for the first time in a way `trousers.ts`'s
existing `qty: 2` pieces didn't exercise (e.g. an assumption about `foldEdge` always
being present) — re-read `lib/export/offset.ts`'s own `foldEdge` handling (CLAUDE.md:
"the check stays wired for a future drafter that genuinely emits a half-piece" — this may
be that drafter) and fix forward rather than reverting the matrix case.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit`
Run: `npm run lint`

- [ ] **Step 7: Commit**

```bash
git add lib/draft/fixtures.ts lib/draft/assembly.ts
git commit -m "test(draft): cover the button-stand front split in the shared matrix

Part of #223. Extends DECORATION_CASES so containment, the seam
graph, assembly's exhaustiveness guard, and every export format's
own suite all exercise the qty:2 half-panel front for free."
```

---

## Task 6: `lib/proof3d/mesh.ts` — read `centerXCm`

**Files:**

- Modify: `lib/proof3d/mesh.ts`
- Test: `lib/proof3d/mesh.test.ts`

**Interfaces:**

- Consumes: `DraftedPiece.centerXCm` (Task 2).

- [ ] **Step 1: Write the failing test**

In `lib/proof3d/mesh.test.ts`, add after the existing `"a blouse/tshirt/dress body shell
exists..."` test (`~line 215-230`, end of the first `describe` block):

```ts
it("#223: a front-closure blouse's bust/waist mesh girth matches the equivalent whole-front blouse", () => {
  const base = buildProofMesh(pattern(CASES[0][1], CASES[0][2]), t);
  const closure = buildProofMesh(
    pattern(
      {
        ...CASES[0][1],
        style: { ...CASES[0][1].style, frontClosure: "buttonStand" },
      },
      CASES[0][2],
    ),
    t,
  );
  const baseBust = base.fit.find((r) => r.key === "bust")!;
  const closureBust = closure.fit.find((r) => r.key === "bust")!;
  expect(closureBust.easeCm).toBeCloseTo(baseBust.easeCm, 5);

  const baseWaist = base.fit.find((r) => r.key === "waist")!;
  const closureWaist = closure.fit.find((r) => r.key === "waist")!;
  expect(closureWaist.easeCm).toBeCloseTo(baseWaist.easeCm, 5);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project node lib/proof3d/mesh.test.ts -t "#223"`
Expected: FAIL — `cxF` is computed from `pieceCx(ptsF)` (the bounding-box midpoint),
which is wrong for the asymmetric half-panel, so `closureBust`/`closureWaist` diverge
from the whole-front baseline.

- [ ] **Step 3: Read `centerXCm` when present**

In `lib/proof3d/mesh.ts`, inside `buildProofMesh`'s `if (front && back) { ... }` block
(`~line 244-251`), change:

```ts
const ptsF = flattenOutline(front.outlineCm, front.curvedSpans ?? []);
const ptsB = flattenOutline(back.outlineCm, back.curvedSpans ?? []);
const cxF = pieceCx(ptsF);
const cxB = pieceCx(ptsB);
```

to:

```ts
const ptsF = flattenOutline(front.outlineCm, front.curvedSpans ?? []);
const ptsB = flattenOutline(back.outlineCm, back.curvedSpans ?? []);
// #223: a front-closure half-panel isn't symmetric about its own
// bounding box -- centerXCm (set only on that piece, in the SAME
// outlineCm coordinate space flattening never moves an existing
// vertex in) names its true axis instead. Every other piece keeps
// today's bbox-midpoint behavior.
const cxF = front.centerXCm ?? pieceCx(ptsF);
const cxB = pieceCx(ptsB);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project node lib/proof3d/mesh.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones — this is a
no-op for every piece without `centerXCm`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add lib/proof3d/mesh.ts lib/proof3d/mesh.test.ts
git commit -m "fix(proof3d): use centerXCm for an asymmetric half-panel front

Part of #223. pieceCx's bounding-box midpoint only finds the true
center of a symmetric piece; a front-closure front isn't one. Every
other piece is unaffected -- centerXCm is absent for all of them."
```

---

## Task 7: `easeReport.ts` verification test (no production code change)

**Files:**

- Test: `lib/draft/easeReport.test.ts`

**Interfaces:**

- Consumes: `buildEaseReport` (already exported), the widened matrix from Task 2.

This task exists to turn the design spec's hand-verified claim ("`widthAtCm(front, y) *
front.qty` already generalizes correctly for a half-panel") into a real, running
assertion — not to change any production code. If this test fails, that claim was wrong
and `lib/draft/easeReport.ts` genuinely needs a fix; do not skip straight to editing it
without first confirming the failure and re-reading the `widthAtCm`/`polygonSpanAt`
functions (`~line 71-123`) against the actual half-panel geometry Task 2 produces.

- [ ] **Step 1: Write the test**

In `lib/draft/easeReport.test.ts`, add after the existing tests (end of the `describe(
"buildEaseReport", ...)` block):

```ts
it("#223: a front-closure blouse reports the same bust/waist/hip ease as the equivalent whole-front blouse", () => {
  const withoutClosure = buildEaseReport(fakePattern(blouseSpec), t)!;
  const withClosure = buildEaseReport(
    fakePattern({
      ...blouseSpec,
      style: { ...blouseSpec.style, frontClosure: "buttonStand" },
    }),
    t,
  )!;
  expect(withoutClosure).not.toBeNull();
  expect(withClosure).not.toBeNull();
  expect(withClosure.girths.map((g) => g.finishedCm)).toEqual(
    withoutClosure.girths.map((g) => g.finishedCm),
  );
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run --project node lib/draft/easeReport.test.ts -t "#223"`
Expected: PASS, per the design spec's hand-verification in Task 2's own review. If it
fails, stop and re-examine `widthAtCm`/`polygonSpanAt` against the half-panel's real
`outlineCm` before touching anything — the discrepancy is telling you the qty
generalization has an edge case the design missed (e.g. a dart-subtraction interaction),
not that the test is wrong.

- [ ] **Step 3: Run the full file**

Run: `npx vitest run --project node lib/draft/easeReport.test.ts`
Expected: PASS (all tests).

- [ ] **Step 4: Commit**

```bash
git add lib/draft/easeReport.test.ts
git commit -m "test(draft): pin that easeReport needs no change for a front-closure front

Part of #223. widthAtCm(front, y) * front.qty already generalizes to
a half-panel (qty:2) exactly the way it already does for trousers'
own asymmetric front/back -- this is the regression guard proving it,
not a behavior change."
```

---

## Task 8: AI layer — schema, prompt, and their tests

**Files:**

- Modify: `lib/ai/schema.ts` (`~line 93-111`)
- Modify: `lib/ai/prompt.ts` (import list `~line 6-11`, style section `~line 61-75`,
  vocabulary-mapping section `~line 79`)
- Test: `lib/ai/schema.test.ts`, `lib/ai/prompt.test.ts`

**Interfaces:**

- Consumes: `FRONT_CLOSURES` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `lib/ai/schema.test.ts`, update the import (`~line 3-15`) to add `FRONT_CLOSURES`:

```ts
import {
  NECKLINES,
  SLEEVES,
  SKIRTS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  FRONT_CLOSURES,
  TYPES,
  GENDERS,
  STYLE_LIMITS,
  FIT_CLASSES,
  STRETCH_CLASSES,
} from "@/lib/draft/garment";
```

Add to the `"enums match the validator's catalogs"` test (`~line 49-63`):

```ts
expect(style.collar.enum).toEqual(COLLARS);
expect(style.cuff.enum).toEqual(CUFFS);
expect(style.waistband.enum).toEqual(WAISTBANDS);
expect(style.frontClosure.enum).toEqual(FRONT_CLOSURES);
```

In `lib/ai/prompt.test.ts`, update the import (`~line 6`) to add `FRONT_CLOSURES`, and
extend the `"quotes the collar/cuff/waistband catalogs..."` test (`~line 145-151`):

```ts
import {
  STYLE_LIMITS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  FRONT_CLOSURES,
} from "@/lib/draft/garment";
```

```ts
it("quotes the collar/cuff/waistband/frontClosure catalogs and tells the model not to silently substitute", () => {
  const s = buildSystem(state(0), false);
  for (const v of COLLARS) expect(s).toContain(v);
  for (const v of CUFFS) expect(s).toContain(v);
  for (const v of WAISTBANDS) expect(s).toContain(v);
  for (const v of FRONT_CLOSURES) expect(s).toContain(v);
  expect(s).toContain("don't silently substitute");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project node lib/ai/schema.test.ts lib/ai/prompt.test.ts`
Expected: FAIL — `style.frontClosure` doesn't exist in the schema yet; the prompt
doesn't mention `"buttonStand"`.

- [ ] **Step 3: Add to the schema**

In `lib/ai/schema.ts`, add `FRONT_CLOSURES` to the import from `@/lib/draft/garment`
(alongside `WAISTBANDS`), and add to the `style.properties` object (`~line 108`):

```ts
              collar: { type: "string", enum: [...COLLARS] },
              cuff: { type: "string", enum: [...CUFFS] },
              waistband: { type: "string", enum: [...WAISTBANDS] },
              frontClosure: { type: "string", enum: [...FRONT_CLOSURES] },
              trouserLengthCm: bounded(STYLE_LIMITS.trouserLengthCm),
```

- [ ] **Step 4: Add to the prompt**

In `lib/ai/prompt.ts`, add `FRONT_CLOSURES` to the import from `@/lib/draft/garment`
(`~line 6-11`, alongside `WAISTBANDS`), and add a new bullet after the `waistband` line
(`~line 74`):

```ts
  - waistband (skirt and trousers only): ${WAISTBANDS.join(" | ")}. "straight" is a plain straight band with a fixed closure overlap, sized from the drafted waist edge — the default for any skirt or trousers, since neither can be finished without one. No contoured or faced waistband exists yet. Set "none" only if the user explicitly asks for a raw/unfinished waist.
  - frontClosure (blouse only): ${FRONT_CLOSURES.join(" | ")}. "buttonStand" adds a button-stand strip sewn to the front bodice's own center-front edge, sized from the drafted opening — the only front-closure shape MoldAI drafts today. Not available for a dress or tshirt (a bodice sewn to a skirt, or a knit pullover) — treat a request for either like any other unsupported combination below. No button/buttonhole placement mark exists yet. Default none (unchanged, pullover-style front).
  - trouserLengthCm (trousers only): ${fmtRange(STYLE_LIMITS.trouserLengthCm)}. Total waist-to-hem length. Defaults to a fixed adult length if unset (not sized per body/height).
```

Also add a mapping hint to the `# Vocabulary mapping` section (`~line 79`, appended to
the existing paragraph):

```ts
`; "button placket"/"button-down front"/"botão na frente"->frontClosure=buttonStand (blouse only).`;
```

(Concatenate this onto the existing template-literal string in that section — match
whatever exact punctuation/casing convention the line already ends with; don't start a
new sentence fragment.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --project node lib/ai/schema.test.ts lib/ai/prompt.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole `lib/ai` suite**

Run: `npx vitest run --project node lib/ai/`
Expected: PASS — `prompt.test.ts` has other tests asserting on the prompt's exact
structure/length in places; skim any failure carefully rather than just widening an
assertion.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 8: Commit**

```bash
git add lib/ai/schema.ts lib/ai/prompt.ts lib/ai/schema.test.ts lib/ai/prompt.test.ts
git commit -m "feat(ai): expose frontClosure to the propose_garment tool

Part of #223. Same treatment as collar/cuff/waistband: the enum
renders from FRONT_CLOSURES into both the schema and the prompt, with
guidance not to silently substitute or apply it to a dress/tshirt."
```

---

## Task 9: Full verification, push, close #223

**Files:** none (verification + repo hygiene only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: both Vitest projects (`node` and `dom`) pass. The `dom` project shouldn't be
touched by this work at all (nothing under `components/` changed), so a `dom` failure
here would indicate an unexpected regression — investigate before proceeding.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit`
Run: `npm run lint`
Run: `npm run format:check` (the pre-commit hook already ran `prettier --write` on each
commit above, so this should already be clean — a failure here means a manually-edited
file after the last commit)

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds (this also re-runs the TypeScript check per this repo's own `npm run
build` description).

- [ ] **Step 4: Push**

```bash
git push
```

- [ ] **Step 5: Confirm CI**

Run: `gh run list --limit 3` then `gh run view <run-id>` (or watch it) for the pushed
commits — per this session's own standing note, there is no pre-push hook, so CI is the
first real gate after pushing.

- [ ] **Step 6: Close the issue**

```bash
gh issue close 223 --comment "Fixed across the commits on main from $(git log --format=%H -1 --grep='#223' | tail -1 | cut -c1-7) onward: the front bodice now splits into a mirrored half-panel (qty:2, no fold) when style.frontClosure is \"buttonStand\" on a non-knit blouse, giving center front a real boundary edge; a new draftButtonStand sub-piece mates to it via the seam graph, the same recipe collar/cuff/waistband already use. dress/tshirt are explicitly out of scope for now (recorded in docs/superpowers/specs/2026-08-28-front-button-stand-design.md's Non-goals) since a dress bodice's hem doubles as its waist-join seam to the skirt panel, which assumes the front's full hem width."
```

(Adjust the shell substitution above if it doesn't cleanly resolve to the first commit
mentioning #223 in this branch's history — a plain `git log --oneline --all --grep=
'#223'` reviewed by eye is a fine substitute for the exact SHA if the one-liner is
awkward.)

## Self-review notes (for whoever executes this plan)

- **Spec coverage:** every section of the design doc (half-panel split, button-stand
  drafting, easeReport/mesh ripple fixes, assembly phase, AI layer, catalog, Non-goals'
  dress exclusion) has a task above. The design doc's own "Testing" section maps 1:1 onto
  Tasks 2, 4, 5, 6, 7.
- **Ordering:** Tasks 1→4 are strictly sequential (each consumes the previous one's
  output). Task 5 must follow Task 4 (needs the real pair key to exist before adding it
  to `PHASE_BY_KEY`). Tasks 6 and 7 only depend on Task 2 and could run in either order or
  in parallel with Task 8, which only depends on Task 1 — but Task 9 (final verification)
  must be last regardless.
