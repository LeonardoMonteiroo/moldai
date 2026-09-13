import { describe, it, expect, beforeAll } from "vitest";
import { validateSpec, seamCheck } from "./garment";
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
import { TOL_CM } from "@/lib/export/bezier";
import {
  SIZE_TABLE,
  SIZE_TABLE_MALE,
  CORE_MEASUREMENT_KEYS,
  MEASUREMENT_RANGES,
  type Measurements,
} from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { signedAreaCm, type DraftedPiece } from "./core";
import { SEAM_TOLERANCE_CM, type SeamMeasurement } from "./seams";
import { STYLE_LIMITS } from "./vocabulary";
import {
  hasSelfIntersection,
  flattenedNetOutlineCm,
  densifiedOutlineCm,
  pointInPolygonCm,
  decorationPointsCm,
  notchTipsCm,
  shortestEdgeCm,
  fromXY,
  CONTAINMENT_EPS_CM,
} from "./geometryPredicates";
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
//
// #330: gates a NAMED BUCKET per invariant (seam closure, net-outline
// simplicity, positive area/no degenerate edge, no orphaned piece) over
// TWO extra bodies besides the base row -- GarmentCodeData's own ladder
// keeps a sample only once it survives on two different bodies. Geometric
// predicates (self-intersection, containment, area, degeneracy) now live in
// ./geometryPredicates, shared with lib/draft/garment.test.ts and
// lib/export/model.test.ts rather than re-derived a third time here.

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

// #330: the RAW (unresolved) base row for this spec's gender -- what
// checkEngineSupport reads (it never inspects measurementOverrides, only
// whether the row itself carries every required key) and what draftPiecesCm/
// measureSeamGraph take as `baseMeasurements`, resolving+clamping a body's
// own overrides internally via resolveMeasurements -- the exact pipeline a
// real request goes through, never pre-resolved by this file.
function baseRowFor(spec: GarmentSpec): Measurements {
  return spec.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
}

// ---- the second and third bodies (#330 AC3) --------------------------------
//
// A uniform corner over every CORE_MEASUREMENT_KEYS key (all-min or all-max)
// rather than a per-key random draw: a mixed draw produces a physiologically
// incoherent body (bust at 140 with shoulder at 14) that can break geometry
// for an illegitimate reason. "Every key at its floor" and "every key at its
// ceiling" are both coherent shapes, and are exactly the two ends where the
// degenerate-area/zero-edge gates below have any real chance of firing.
// Expressed as measurementOverrides (never a hand-built row) so
// resolveMeasurements' own clamp runs on the way through, satisfying AC3's
// "ideally measurementOverrides not empty" with the same change. No RNG is
// consumed building these -- sampleStyle's own draw order (and therefore
// every one of the 250 style specs) is completely untouched by this axis.
//
// The four EXTENDED keys (highBust, shoulderSlope, backWidth, rise) are
// deliberately never overridden here. backWidth in particular: it feeds the
// back panel's armhole control point ONLY, so a real divergence there is
// exactly what expectEqualSplit/subSegmentDiffCm is built to flag on
// armhole-cap as a genuine, user-facing, UNFIXABLE conflict
// (docs/architecture/seams-and-assembly.md). Overriding it here would force
// a second carve-out whose predicate would just restate sideSplitDevCm,
// making the seamSplitDivergence gate below vacuous -- the one gate most
// likely to catch a real regression. That divergence path already has
// dedicated coverage in lib/draft/garment.test.ts; sampling it is a
// candidate for its own follow-up issue (an "activate an EXTENDED key" axis
// is a different question from "how big is this body", which is all this
// axis answers).
interface SampledBody {
  name: string;
  overrides: Record<string, number>;
}

function cornerOverrides(edge: "min" | "max"): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of CORE_MEASUREMENT_KEYS)
    out[key] = MEASUREMENT_RANGES[key][edge];
  return out;
}

const BODIES: SampledBody[] = [
  { name: "base", overrides: {} },
  { name: "minCorner", overrides: cornerOverrides("min") },
  { name: "maxCorner", overrides: cornerOverrides("max") },
];

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

// ---- named failure buckets (#330 AC4) --------------------------------------

const BUCKETS = [
  "draftThrew", // any gate threw -- never an unrelated red
  "capabilityGap",
  "seamDivergence", // seamCheck flagged a pair outside the proved armhole-deepen carve-out
  "seamSplitDivergence", // subSegmentDiffCm > tolerance (#253) -- NEVER tolerated, not even inside the carve-out
  "netSelfIntersection", // the DRAWN outline, before any offset -- #330's own point
  "cutSelfIntersection", // the offset/repaired outline, as before #330
  "degenerateArea",
  "zeroLengthEdge",
  "orphanPiece",
  "decorationOutside",
  "easeReportNaN",
  "assemblyStepMismatch",
] as const;
type Bucket = (typeof BUCKETS)[number];

interface Failure {
  bucket: Bucket;
  index: number;
  detail: string;
}

interface GateReport {
  bodyName: string;
  total: number;
  failures: Failure[];
}

function countByBucket(report: GateReport): Record<Bucket, number> {
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<
    Bucket,
    number
  >;
  for (const f of report.failures) counts[f.bucket]++;
  return counts;
}

function failedSpecCount(report: GateReport): number {
  return new Set(report.failures.map((f) => f.index)).size;
}

function formatReport(report: GateReport): string {
  const counts = countByBucket(report);
  const lines = BUCKETS.map((b) => `  ${b}: ${counts[b]}`).join("\n");
  return (
    `seed=0x${SEED.toString(16)} body=${report.bodyName} total=${report.total} ` +
    `failedSpecs=${failedSpecCount(report)}\n${lines}`
  );
}

// Capped at 5 detail lines so a fully-red run doesn't dump 250 lines into CI
// -- the summary block above (formatReport) already gives the total count.
function formatBucket(bucket: Bucket, report: GateReport): string {
  const hits = report.failures.filter((f) => f.bucket === bucket);
  const shown = hits
    .slice(0, 5)
    .map((f) => `  #${f.index} ${f.detail}`)
    .join("\n");
  const more = hits.length > 5 ? `\n  +${hits.length - 5} more` : "";
  return (
    `${bucket}: ${hits.length}/${report.total} specs failed ` +
    `(seed=0x${SEED.toString(16)}, body=${report.bodyName})\n${shown}${more}`
  );
}

// #344: was `new Set(["placket"])` -- the placket used to have no distinct
// edge on the already-drafted sleeve piece to mate against, so it declared
// no seamEdges (lib/draft/subpieces.ts's own prior doc on draftPlacket).
// Closed by #344: the sleeve now cuts its own placket opening as a real,
// measurable cut edge (lib/draft/sleeve.ts's cutEdges.placketOpening), and
// garment.ts declares a real "sleeve-placket" pair against it -- so the
// placket is paired like every other sub-piece now, and this set goes back
// to empty. Kept as a closed, asserted set (not deleted outright) so a
// FUTURE new orphan piece fails this gate loudly rather than silently
// growing an allowlist again -- verified by emptying it and confirming the
// gate stays green (the #330 precedent ran this check in reverse, emptying
// a non-empty set and confirming red).
const ORPHAN_ALLOWLIST = new Set<string>([]);

// #330 4a: STYLE_LIMITS.armholeDeepenCm is {min:0,max:6} sampled uniformly,
// and a deepen with no refit makes armhole-cap diverge BY DESIGN (the cap is
// sized from the base armhole, never the deepened one --
// docs/architecture/seams-and-assembly.md). But `armholeDeepenCm > 0` alone
// is a near-vacuous guard (the uniform draw is essentially never exactly 0),
// so this proves the carve-out instead of merely naming it: a divergent
// entry is tolerated only if ALL of the following hold, each checked in
// order so a failing clause names itself in the returned reason.
function armholeCarveOutHolds(
  spec: GarmentSpec,
  baseRow: Measurements,
  bad: SeamMeasurement[],
): { holds: boolean; reason?: string } {
  if (bad.length !== 1 || bad[0].key !== "armhole-cap") {
    return {
      holds: false,
      reason: `divergent keys [${bad.map((m) => m.key).join(", ")}] are not exactly {armhole-cap}`,
    };
  }
  const m = bad[0];
  const deepen = spec.style.armholeDeepenCm ?? 0;
  if (!(deepen > 0)) {
    return {
      holds: false,
      reason: "armhole-cap diverges but style.armholeDeepenCm is 0/absent",
    };
  }
  if (m.subSegmentDiffCm > SEAM_TOLERANCE_CM) {
    return {
      holds: false,
      reason: `subSegmentDiffCm=${m.subSegmentDiffCm} exceeds tolerance -- a deepen must move front/back equally`,
    };
  }
  // The twin spec with armholeDeepenCm zeroed -- built by spread, not
  // validateSpec (spec already passed it), and NEVER via sleeveRefit, which
  // is deliberately not accepted by validateSpec (seams-and-assembly.md)
  // and must stay unreachable from a spec built the way a request is.
  const twinSpec: GarmentSpec = {
    ...spec,
    style: { ...spec.style, armholeDeepenCm: 0 },
  };
  const twinGraph = measureSeamGraph(DEFAULT_ENGINE_ID, twinSpec, baseRow, t);
  if (seamCheck(twinGraph).length !== 0) {
    return {
      holds: false,
      reason: "twin spec (armholeDeepenCm=0) does not close on its own",
    };
  }
  const twinPair = twinGraph.find((x) => x.key === "armhole-cap");
  if (!twinPair) {
    return { holds: false, reason: "twin graph has no armhole-cap pair" };
  }
  if (twinPair.bLenCm !== m.bLenCm) {
    return {
      holds: false,
      reason: `cap length moved with the deepen: ${twinPair.bLenCm} -> ${m.bLenCm}`,
    };
  }
  // Exact, no magic factor: with gatherRatio=1, diffCm = |bLen - aLen - ease|.
  // The twin closes and the cap is unchanged, so diffCm must sit within one
  // tolerance of exactly the armhole's own measured growth -- this is what
  // makes the carve-out say "the divergence equals the deepening and
  // nothing else", not merely "some divergence happened to co-occur with a
  // nonzero deepen".
  const armholeGrowthCm = Math.abs(m.aLenCm - twinPair.aLenCm);
  if (Math.abs(m.diffCm - armholeGrowthCm) > SEAM_TOLERANCE_CM) {
    return {
      holds: false,
      reason: `diffCm=${m.diffCm} is not within tolerance of the measured armhole growth (${armholeGrowthCm.toFixed(1)})`,
    };
  }
  return { holds: true };
}

// ---- the gate walk ----------------------------------------------------------

function runGatesForBody(body: SampledBody, specs: GarmentSpec[]): GateReport {
  const failures: Failure[] = [];
  const push = (index: number, bucket: Bucket, detail: string) =>
    failures.push({ bucket, index, detail });

  for (let index = 0; index < specs.length; index++) {
    const spec = specs[index];
    const rawBaseRow = baseRowFor(spec);
    // The effective spec this body drafts -- style untouched, overrides
    // swapped for this body's own. Safe to build by spread rather than a
    // fresh validateSpec call: every override key/value here already comes
    // from MEASUREMENT_RANGES itself, so nothing survives the validator's
    // whitelist-and-clamp differently than it already is.
    const effectiveSpec: GarmentSpec = {
      ...spec,
      measurementOverrides: body.overrides,
    };

    const gaps = checkEngineSupport(MOLDAI_CAPABILITY, spec, rawBaseRow);
    if (gaps.length > 0) {
      push(index, "capabilityGap", `gaps=${JSON.stringify(gaps)}`);
    }

    let pieces: DraftedPiece[];
    let graph: SeamMeasurement[];
    try {
      pieces = draftPiecesCm(DEFAULT_ENGINE_ID, effectiveSpec, rawBaseRow, t);
      graph = measureSeamGraph(DEFAULT_ENGINE_ID, effectiveSpec, rawBaseRow, t);
    } catch (e) {
      push(index, "draftThrew", (e as Error).message);
      continue;
    }

    const allowance = effectiveSpec.style.seamAllowanceCm ?? 1;
    for (const piece of pieces) {
      // The NET outline, before any offset -- #330's own complaint: only the
      // repaired CUT outline (below) was ever checked before this issue.
      // Flattened via the production path (outlineSegments + flattenOutlineCm
      // at TOL_CM, lib/draft/geometryPredicates.ts's flattenedNetOutlineCm)
      // rather than a separate fixed-step densifier, so a net-vs-cut
      // discrepancy is attributable to the drafter, never to a difference in
      // sampling density between the two checks.
      const net = flattenedNetOutlineCm(piece.outlineCm, piece.curvedSpans);
      if (hasSelfIntersection(net)) {
        push(
          index,
          "netSelfIntersection",
          `${piece.id}: net outline self-intersects (${net.length} flattened pts)`,
        );
      }
      const cut = fromXY(
        offsetOutlineCm(
          piece.outlineCm,
          piece.curvedSpans ?? [],
          piece.foldEdge,
          allowance,
        ),
      );
      if (hasSelfIntersection(cut)) {
        push(
          index,
          "cutSelfIntersection",
          `${piece.id}: cut outline self-intersects`,
        );
      }
      // normalizeWinding already forces signedAreaCm >= 0 on every moldai
      // piece (core.ts), so this pins sign AND magnitude in one comparison
      // rather than a weaker "!== 0". 1 cm² sits ~46x below the smallest
      // real piece this engine drafts (the placket, ~45.9 cm²) and many
      // orders above float64 noise at cm scale.
      const area = signedAreaCm(piece.outlineCm);
      if (area < 1) {
        push(
          index,
          "degenerateArea",
          `${piece.id}: signed area ${area.toFixed(3)} cm² below the 1 cm² floor`,
        );
      }
      // Measured on the COARSE outline, not the flattened one -- a flattened
      // polyline legitimately has very short segments at a cubic/line
      // junction; a duplicated/collapsed drafted VERTEX is the real defect.
      // TOL_CM (0.02 cm) is what the export pipeline itself can represent.
      // Ratchet check (a one-off run over this exact sampled space, base +
      // both corner bodies): the shortest real drafted edge measured 0.13 cm
      // (a radial skirt panel's own 12-step discretization, base body) --
      // ~6.5x above this floor, comfortably clear of a false positive.
      // Raise this floor, never lower it, and only after re-measuring.
      const shortest = shortestEdgeCm(piece.outlineCm);
      if (shortest.lenCm <= TOL_CM) {
        push(
          index,
          "zeroLengthEdge",
          `${piece.id}: edge ${shortest.index} is ${shortest.lenCm.toFixed(4)} cm`,
        );
      }
      for (const { kind, ptCm } of decorationPointsCm(piece)) {
        if (!pointInPolygonCm(ptCm, piece.outlineCm, CONTAINMENT_EPS_CM)) {
          push(
            index,
            "decorationOutside",
            `${piece.id}: ${kind} point (${ptCm[0].toFixed(1)}, ${ptCm[1].toFixed(1)}) outside its own outline`,
          );
        }
      }
      if (piece.notches?.length) {
        const dense = densifiedOutlineCm(piece.outlineCm, piece.curvedSpans);
        for (const tip of notchTipsCm(piece)) {
          if (!pointInPolygonCm(tip, dense, CONTAINMENT_EPS_CM)) {
            push(
              index,
              "decorationOutside",
              `${piece.id}: notch tip (${tip[0].toFixed(1)}, ${tip[1].toFixed(1)}) outside its own outline`,
            );
          }
        }
      }
    }

    // Every drafted piece.id must be named by some declared pair's own
    // per-edge breakdown (#253's aEdges/bEdges) -- aPieceId/bPieceId alone
    // under-count (armhole-cap's `a` side names front AND back, but
    // aPieceId is only the first ref).
    const paired = new Set(
      graph.flatMap((m) => [...m.aEdges, ...m.bEdges].map((e) => e.pieceId)),
    );
    for (const piece of pieces) {
      if (paired.has(piece.id) || ORPHAN_ALLOWLIST.has(piece.id)) continue;
      push(
        index,
        "orphanPiece",
        `${piece.id}: not referenced by any declared seam pair`,
      );
    }

    // #253: checked independently of the armhole carve-out below, over
    // EVERY pair in the graph (not only the ones seamCheck flags) -- a
    // front/back split mismatch is never tolerated, not even alongside a
    // legitimate armholeDeepenCm.
    for (const m of graph) {
      if (m.subSegmentDiffCm > SEAM_TOLERANCE_CM) {
        push(
          index,
          "seamSplitDivergence",
          `${m.key}: subSegmentDiffCm=${m.subSegmentDiffCm} exceeds ${SEAM_TOLERANCE_CM}`,
        );
      }
    }

    const bad = seamCheck(graph);
    if (bad.length > 0) {
      const verdict = armholeCarveOutHolds(effectiveSpec, rawBaseRow, bad);
      if (!verdict.holds) {
        push(index, "seamDivergence", verdict.reason!);
      }
    }

    const pattern = fakePattern(effectiveSpec);
    const easeReport = buildEaseReport(pattern, t);
    if (!easeReport) {
      push(index, "easeReportNaN", "buildEaseReport returned null");
    } else {
      for (const g of easeReport.girths) {
        if (
          !Number.isFinite(g.finishedCm) ||
          !Number.isFinite(g.bodyCm) ||
          !Number.isFinite(g.diffCm) ||
          !Number.isFinite(g.diffPct)
        ) {
          push(
            index,
            "easeReportNaN",
            `girth ${g.girth} has a non-finite value`,
          );
        }
      }
      if (
        easeReport.cap &&
        (!Number.isFinite(easeReport.cap.armholeArcCm) ||
          !Number.isFinite(easeReport.cap.capArcCm) ||
          !Number.isFinite(easeReport.cap.easeCm))
      ) {
        push(index, "easeReportNaN", "cap has a non-finite value");
      }
    }

    const order = buildAssemblyOrder(pattern, t);
    if (!order) {
      push(index, "assemblyStepMismatch", "buildAssemblyOrder returned null");
    } else {
      const seamSteps = order.steps.filter((s) => s.kind === "seam");
      if (seamSteps.length !== graph.length) {
        push(
          index,
          "assemblyStepMismatch",
          `seam steps=${seamSteps.length} vs graph=${graph.length}`,
        );
      } else {
        const stepKeys = seamSteps.map((s) => s.key).sort();
        const graphKeys = graph.map((m) => m.key).sort();
        if (JSON.stringify(stepKeys) !== JSON.stringify(graphKeys)) {
          push(
            index,
            "assemblyStepMismatch",
            `key sets differ: steps=[${stepKeys.join(",")}] graph=[${graphKeys.join(",")}]`,
          );
        }
      }
    }
  }

  return { bodyName: body.name, total: specs.length, failures };
}

// ---- the sampler itself -----------------------------------------------------

const rng = mulberry32(SEED);
const specs: GarmentSpec[] = Array.from({ length: N }, () => sampleSpec(rng));

for (const body of BODIES) {
  describe(`#256/#330: sampled spec space (seed=0x${SEED.toString(16)}, N=${N}, body=${body.name})`, () => {
    let report: GateReport;
    beforeAll(() => {
      report = runGatesForBody(body, specs);
    });

    it("no sampled spec fails any gate", () => {
      expect(report.failures.length, formatReport(report)).toBe(0);
    });

    it.each(BUCKETS)("gate %s: zero failures", (bucket) => {
      const hits = report.failures.filter((f) => f.bucket === bucket);
      expect(hits.length, formatBucket(bucket, report)).toBe(0);
    });
  });
}

// Compile-time-only reference so `CapabilityStyleField` stays visibly tied
// to sampleStyle's own switch above for a future reader (unused at runtime).
type _AssertSampleStyleIsExhaustive = CapabilityStyleField;
