import { describe, it, expect } from "vitest";
import { validateSpec } from "./garment";
import { draftPiecesCm, measureSeamGraph } from "./engine/facade";
import {
  DEFAULT_ENGINE_ID,
  MOLDAI_CAPABILITY,
  checkEngineSupport,
  type CapabilityStyleField,
} from "./engine/capability";
import { buildEaseReport } from "./easeReport";
import { buildAssemblyOrder } from "./assembly";
import { offsetOutlineCm } from "@/lib/export/offset";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { catmullRomSegments, type DraftedPiece } from "./core";
import { STYLE_LIMITS } from "./vocabulary";
import type {
  GarmentSpec,
  GarmentStyle,
  GarmentType,
  Pattern,
} from "@/lib/types";

// #256: GarmentCode's own pattern_sampler.py randomizes design parameters
// against declared ranges (assets/design_params/default.yaml) and rejects
// the result via assert_param_combinations/assert_total_length/
// is_self_intersecting, retrying up to 100 times. This is the same idea
// applied to MoldAI's own declared design space: TYPES/STYLE_LIMITS/the
// style enums (lib/draft/vocabulary.ts) instead of a yaml file,
// checkEngineSupport (lib/draft/engine/capability.ts) instead of a bespoke
// assert_param_combinations, and draftGarment's own containment/seam-graph/
// ease-report invariants instead of a hand-rolled geometry check -- cheap
// because validateSpec already defines the legal space and draftGarment is
// pure and DB-free (no retry loop needed: every combination this sampler
// can construct is, by construction, one checkEngineSupport already
// declares supported -- see "known-unsupported combos" below).

// A fixed seed -- printed in every failure message below -- makes a CI
// failure reproducible locally by rerunning this exact file; no test.only
// or environment variable is needed, the seed is simply a file constant.
const SEED = 0xc0ffee;
const N = 250; // "a few hundred", per the issue's own runtime guidance

// mulberry32: a small, dependency-free seeded PRNG (public-domain
// algorithm) -- deterministic across Node versions/platforms, unlike
// Math.random(), which is what "reproducible from the seed" requires.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randRange(rng: () => number, range: { min: number; max: number }) {
  return range.min + rng() * (range.max - range.min);
}

// ---- known-unsupported combos (explicit exclusion, not a silent skip) ----
//
// GarmentCode's sampler retries on a rejected combination; this sampler
// instead never CONSTRUCTS one, by restricting itself to what
// MOLDAI_CAPABILITY (lib/draft/engine/capability.ts) already declares this
// engine supports -- the single source of truth checkEngineSupport reads,
// so there is no second, drifting copy of "what's excluded" to maintain:
//
// 1. Garment TYPE: "hoodie"/"coat'/"shirt" are real, app-wide TYPES (a user
//    or the AI may request them on the "freesewing" engine) but
//    MOLDAI_CAPABILITY.types deliberately excludes all three -- garment.ts's
//    own draftAll throws rather than silently draft one ("no drafter wired
//    for garment type"). Sampling only from MOLDAI_CAPABILITY.types (not the
//    wider TYPES vocabulary) is this exclusion, made explicit.
// 2. STYLE FIELD per type: e.g. a skirt spec has no "collar", a tshirt has
//    no "darts"/"fit" (it reads "stretch" instead), a dress has no
//    "frontClosure"/"waistband". MOLDAI_CAPABILITY.styleFieldsByType is the
//    ground-truth list (verified against each drafter directly, per its own
//    module comment) of which fields a given type's drafter actually reads
//    -- sampling a style only from that per-type list is what keeps every
//    sampled spec inside the declared, supported space.
//
// Both exclusions are asserted below, not just assumed: every sampled spec
// is round-tripped through checkEngineSupport(MOLDAI_CAPABILITY, ...) and
// required to come back with zero gaps -- if this sampler or
// MOLDAI_CAPABILITY's own declaration ever drift apart, that assertion
// fails loudly instead of a spec silently reaching draftGarment that the
// engine itself would have declined.
const SAMPLED_TYPES: readonly GarmentType[] = MOLDAI_CAPABILITY.types;

function sampleStyle(rng: () => number, type: GarmentType): GarmentStyle {
  const fields = MOLDAI_CAPABILITY.styleFieldsByType[type];
  const enums = MOLDAI_CAPABILITY.styleEnumsByType[type];
  const style: GarmentStyle = {};
  for (const field of fields) {
    switch (field) {
      case "neckline":
        style.neckline = pickFrom(rng, enums.neckline);
        break;
      case "sleeve":
        style.sleeve = pickFrom(rng, enums.sleeve);
        break;
      case "skirt":
        style.skirt = pickFrom(rng, enums.skirt);
        break;
      case "collar":
        style.collar = pickFrom(rng, enums.collar);
        break;
      case "cuff":
        style.cuff = pickFrom(rng, enums.cuff);
        break;
      case "waistband":
        style.waistband = pickFrom(rng, enums.waistband);
        break;
      case "frontClosure":
        style.frontClosure = pickFrom(rng, enums.frontClosure);
        break;
      case "fit":
        style.fit = pickFrom(rng, enums.fit);
        break;
      case "stretch":
        style.stretch = pickFrom(rng, enums.stretch);
        break;
      case "darts":
        style.darts = rng() < 0.5;
        break;
      case "necklineDepthCm":
        style.necklineDepthCm = randRange(rng, STYLE_LIMITS.necklineDepthCm);
        break;
      case "skirtLengthCm":
        style.skirtLengthCm = randRange(rng, STYLE_LIMITS.skirtLengthCm);
        break;
      case "seamAllowanceCm":
        style.seamAllowanceCm = randRange(rng, STYLE_LIMITS.seamAllowanceCm);
        break;
      case "armholeDeepenCm":
        style.armholeDeepenCm = randRange(rng, STYLE_LIMITS.armholeDeepenCm);
        break;
      case "trouserLengthCm":
        style.trouserLengthCm = randRange(rng, STYLE_LIMITS.trouserLengthCm);
        break;
      case "pleats":
        style.pleats = pickFrom(rng, enums.pleats);
        break;
      // #259: a signed offset -- STYLE_LIMITS.riseCm spans both signs, so
      // randRange over it already samples raised, lowered and ~unchanged
      // waistlines without a special case of its own.
      case "riseCm":
        style.riseCm = randRange(rng, STYLE_LIMITS.riseCm);
        break;
      default: {
        // Exhaustiveness guard: CapabilityStyleField gains a member only
        // when GarmentStyle itself does, and this switch must be extended
        // in lockstep -- a silently-unsampled field would just never be
        // exercised, the opposite of this test's whole purpose.
        const exhaustive: never = field;
        throw new Error(`sampleStyle: unhandled style field ${exhaustive}`);
      }
    }
  }
  return style;
}

function sampleSpec(rng: () => number): GarmentSpec {
  const type = pickFrom(rng, SAMPLED_TYPES);
  const gender = pickFrom(rng, ["female", "male"] as const);
  const raw = {
    type,
    gender,
    measurementOverrides: {},
    style: sampleStyle(rng, type),
  };
  // Round-tripped through validateSpec the same way any real request is --
  // a no-op for a spec already built from the same enums/clamps it enforces,
  // but it keeps this sampler honest against validateSpec ever changing
  // shape underneath it.
  return validateSpec(raw);
}

function baseRowFor(spec: GarmentSpec) {
  return spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
}

// Minimal Pattern for buildEaseReport/buildAssemblyOrder -- the same
// fakePattern shape lib/draft/garment.test.ts/assembly.test.ts/
// easeReport.test.ts each already duplicate locally: only
// spec/sizeTable/baseSize/pieces.length are ever read by either function.
function fakePattern(spec: GarmentSpec): Pattern {
  return {
    id: "p1",
    name: "Teste",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["M"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: baseRowFor(spec) },
    pieces: [
      {
        id: "x",
        name: "x",
        qty: 1,
        outline: { kind: "polygon", points: "0,0" },
        label: { x: 0, y: 0 },
        detailRows: [],
      },
    ],
    spec,
  };
}

// ---- geometry helpers (self-intersection + containment) -------------------
//
// Deliberately duplicated rather than imported from garment.test.ts/
// model.test.ts: this repo's own testing convention is that each test file
// owns its assertion helpers over the shared DECORATION_CASES/drafted-piece
// shape (model.test.ts re-derives the identical segmentsIntersect rather
// than importing garment.test.ts's), not a shared-fixture-only rule.

interface XY {
  x: number;
  y: number;
}

function cross(o: XY, p: XY, q: XY): number {
  return (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
}

function segmentsIntersect(a1: XY, a2: XY, b1: XY, b2: XY): boolean {
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  return (
    ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) &&
    ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))
  );
}

// Non-adjacent edges only -- adjacent edges legitimately share an endpoint,
// which isn't a self-intersection (the same carve-out model.test.ts's own
// hasSelfIntersection makes).
function hasSelfIntersection(pts: XY[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]))
        return true;
    }
  }
  return false;
}

function verticalSpanAt(pts: [number, number][], x: number) {
  let top = Infinity;
  let bottom = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a[0] === b[0]) continue;
    if (x < Math.min(a[0], b[0]) || x > Math.max(a[0], b[0])) continue;
    const y = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { top, bottom };
}

// Densified against the real Catmull-Rom geometry, the same reason
// garment.test.ts's own densifiedOutline exists: the coarse vertex polygon
// UNDERCUTS a curved span (a Catmull-Rom cap bulges above the chord between
// its own two vertices), so a notch tip placed ON that curve can read as
// spuriously "outside" the cheap vertex-polygon span.
function densifiedOutline(
  ptsCm: [number, number][],
  curvedSpans?: [number, number][],
): [number, number][] {
  const { start, segs } = catmullRomSegments(ptsCm, curvedSpans ?? []);
  const out: [number, number][] = [start];
  let cur = start;
  const STEPS = 24;
  for (const seg of segs) {
    if (seg.kind === "line") {
      out.push(seg.to);
      cur = seg.to;
      continue;
    }
    for (let i = 1; i <= STEPS; i++) {
      const u = i / STEPS;
      const v = 1 - u;
      out.push([
        v * v * v * cur[0] +
          3 * v * v * u * seg.c1[0] +
          3 * v * u * u * seg.c2[0] +
          u * u * u * seg.to[0],
        v * v * v * cur[1] +
          3 * v * v * u * seg.c1[1] +
          3 * v * u * u * seg.c2[1] +
          u * u * u * seg.to[1],
      ]);
    }
    cur = seg.to;
  }
  return out;
}

// A boundary-inclusive comparison needs a small float epsilon, not just
// >=/<=: a decoration point that sits exactly ON the boundary (a dart's
// open end on a seam, a hem vertex at the panel's own bottom edge -- both
// legitimate per garment.test.ts's own containment suite) is frequently
// computed via a DIFFERENT arithmetic path than the boundary vertex itself
// (e.g. lengthCm derived from a randomly-sampled skirtLengthCm one way,
// the vertex laid out from the same value another way), so the two values
// can differ in the 14th-15th significant digit -- float64 rounding noise
// nowhere near a real cm-scale defect. 1e-6 cm is far tighter than anything
// a cutting machine resolves and far looser than IEEE 754 noise.
const CONTAINMENT_EPS_CM = 1e-6;

function assertDecorationsContained(
  pieces: DraftedPiece[],
  label: string,
): void {
  for (const piece of pieces) {
    const points: [number, number][] = [...(piece.grainlineCm ?? [])];
    for (const entry of piece.internalsCm ?? []) {
      switch (entry.kind) {
        case "dart":
        case "pleat":
        case "styleLine":
          points.push(...entry.ptsCm);
          break;
        case "foldLine":
          points.push(entry.aCm, entry.bCm);
          break;
        case "drillHole":
        case "placementMark":
          points.push(entry.atCm);
          break;
      }
    }
    if (piece.notches?.length) {
      const dense = densifiedOutline(piece.outlineCm, piece.curvedSpans);
      for (const notch of piece.notches) {
        const [nx, ny] = notch.innerCm;
        const span = verticalSpanAt(dense, nx);
        expect(
          ny,
          `${label} / ${piece.id} notch tip (${nx.toFixed(1)}, ${ny.toFixed(1)}) vs [${span.top.toFixed(1)}, ${span.bottom.toFixed(1)}]`,
        ).toBeGreaterThanOrEqual(span.top - CONTAINMENT_EPS_CM);
        expect(ny).toBeLessThanOrEqual(span.bottom + CONTAINMENT_EPS_CM);
      }
    }
    for (const [x, y] of points) {
      const span = verticalSpanAt(piece.outlineCm, x);
      expect(
        y,
        `${label} / ${piece.id} point (${x.toFixed(1)}, ${y.toFixed(1)}) vs [${span.top.toFixed(1)}, ${span.bottom.toFixed(1)}]`,
      ).toBeGreaterThanOrEqual(span.top - CONTAINMENT_EPS_CM);
      expect(y).toBeLessThanOrEqual(span.bottom + CONTAINMENT_EPS_CM);
    }
  }
}

// ---- the sampler itself -----------------------------------------------------

describe(`#256: random spec-space sampling (seed=0x${SEED.toString(16)}, N=${N})`, () => {
  const rng = mulberry32(SEED);
  const specs: GarmentSpec[] = Array.from({ length: N }, () => sampleSpec(rng));

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const label = `#${i} seed=0x${SEED.toString(16)} ${JSON.stringify(spec)}`;

    it(`${label}: is inside MOLDAI_CAPABILITY's declared space`, () => {
      const gaps = checkEngineSupport(
        MOLDAI_CAPABILITY,
        spec,
        baseRowFor(spec),
      );
      expect(gaps, label).toEqual([]);
    });

    // Both geometry checks below need the SAME drafted pieces for this spec
    // -- one shared draftPiecesCm call rather than one per `it` (draftGarment
    // is pure/cheap, but there's no reason to redo it twice per spec when a
    // single call already serves both assertions).
    it(`${label}: every outline is non-self-intersecting once offset for the cut line, and every grainline/dart/notch stays inside it`, () => {
      const pieces = draftPiecesCm(
        DEFAULT_ENGINE_ID,
        spec,
        baseRowFor(spec),
        t,
      );
      const allowance = spec.style.seamAllowanceCm ?? 1;
      for (const piece of pieces) {
        const cut = offsetOutlineCm(
          piece.outlineCm,
          piece.curvedSpans ?? [],
          piece.foldEdge,
          allowance,
        );
        expect(
          hasSelfIntersection(cut),
          `${label} / ${piece.id} cut outline self-intersects`,
        ).toBe(false);
      }
      assertDecorationsContained(pieces, label);
    });

    it(`${label}: buildEaseReport carries no NaN`, () => {
      const report = buildEaseReport(fakePattern(spec), t);
      expect(report, label).not.toBeNull();
      for (const g of report!.girths) {
        expect(Number.isFinite(g.finishedCm), `${label} finishedCm`).toBe(true);
        expect(Number.isFinite(g.bodyCm), `${label} bodyCm`).toBe(true);
        expect(Number.isFinite(g.diffCm), `${label} diffCm`).toBe(true);
        expect(Number.isFinite(g.diffPct), `${label} diffPct`).toBe(true);
      }
      if (report!.cap) {
        expect(Number.isFinite(report!.cap.armholeArcCm), label).toBe(true);
        expect(Number.isFinite(report!.cap.capArcCm), label).toBe(true);
        expect(Number.isFinite(report!.cap.easeCm), label).toBe(true);
      }
    });

    it(`${label}: buildAssemblyOrder emits exactly one step per walked SeamMeasurement`, () => {
      const seamGraph = measureSeamGraph(
        DEFAULT_ENGINE_ID,
        spec,
        baseRowFor(spec),
        t,
      );
      const order = buildAssemblyOrder(fakePattern(spec), t);
      expect(order, label).not.toBeNull();
      const seamSteps = order!.steps.filter((s) => s.kind === "seam");
      expect(seamSteps.length, label).toBe(seamGraph.length);
      expect(seamSteps.map((s) => s.key).sort(), label).toEqual(
        seamGraph.map((m) => m.key).sort(),
      );
    });
  }
});

// Compile-time-only reference so `CapabilityStyleField` stays visibly tied
// to sampleStyle's own switch above for a future reader (unused at runtime).
type _AssertSampleStyleIsExhaustive = CapabilityStyleField;
