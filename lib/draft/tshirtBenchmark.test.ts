import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { draftPiecesCm } from "./engine/facade";
import {
  ENGINE_IDS,
  checkEngineSupport,
  type EngineId,
} from "./engine/capability";
import { getEngine } from "./engine/registry";
import { bbox, catmullRomSegments, curveArcLengthCm } from "./core";
import type { DraftedPiece, Pt } from "./core";
import { SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";
import benchmark from "@/docs/reference/tshirt-benchmark/measurements.json";

// tshirt-fit-calibration (TSHIRT-06/07): drafts the tshirt archetype across
// the benchmark's own graded sizes and reports each piece's real geometry
// against docs/reference/tshirt-benchmark/measurements.json. No assertion in
// this file gates on a delta being below any numeric bound -- the spec's
// explicit decision is to report deltas, not pass/fail on them (see
// spec.md's Assumptions & Out of Scope).
//
// #267: this is the harness docs/decisions/drafting.md names as "any
// registered engine scored on one set of metrics" -- it loops ENGINE_IDS,
// not a single hardcoded draftPiecesCm call. With one engine registered
// this produces the exact same 16 rows as before; the loop is what makes a
// future second engine's own numbers land in this same report rather than
// a throwaway project outside the repo (the #266 spike's own limitation).
// docs/decisions/drafting.md also records why the two representation-
// dependent metrics below (rectilinearPerimeterCm/curvePerimeterCm split,
// and the orientation-dependent widthCm/heightCm) are not comparable
// ACROSS engines -- only perimeterCm/areaCm2 are.

type PieceMetrics = {
  perimeterCm: number;
  areaCm2: number;
  rectilinearPerimeterCm: number;
  curvePerimeterCm: number;
  widthCm: number;
  heightCm: number;
};

const METRIC_KEYS: (keyof PieceMetrics)[] = [
  "perimeterCm",
  "areaCm2",
  "rectilinearPerimeterCm",
  "curvePerimeterCm",
  "widthCm",
  "heightCm",
];

// Local cubic-Bézier point sampler mirroring core.ts's own private
// bezierPoint (not exported) -- the well-known De Casteljau cubic formula,
// not a reimplementation of anything the curved-span DETECTION logic above
// already does (that part is reused via the exported catmullRomSegments).
function bezierPointAt(p0: Pt, c1: Pt, c2: Pt, p3: Pt, u: number): Pt {
  const mt = 1 - u;
  const a = mt * mt * mt,
    b = 3 * mt * mt * u,
    c = 3 * mt * u * u,
    d = u * u * u;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
  ];
}

// Dense polygon (straight edges verbatim, curved edges sampled) for a real
// shoelace-area measurement -- reuses the exported catmullRomSegments for
// the curve-detection/control-point math, only adding the point sampling.
function flattenOutline(
  pts: Pt[],
  curvedSpans: [number, number][],
  samplesPerEdge = 16,
): Pt[] {
  const { start, segs } = catmullRomSegments(pts, curvedSpans);
  const out: Pt[] = [start];
  let prev = start;
  for (const seg of segs) {
    if (seg.kind === "line") {
      out.push(seg.to);
      prev = seg.to;
    } else {
      for (let s = 1; s <= samplesPerEdge; s++) {
        out.push(
          bezierPointAt(prev, seg.c1, seg.c2, seg.to, s / samplesPerEdge),
        );
      }
      prev = seg.to;
    }
  }
  return out;
}

function shoelaceArea(pts: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

function measurePiece(piece: DraftedPiece): PieceMetrics {
  const pts = piece.outlineCm;
  const spans = piece.curvedSpans ?? [];
  const perimeterCm = curveArcLengthCm(pts, spans, 0, pts.length);
  const curvePerimeterCm = spans.reduce(
    (sum, [a, b]) => sum + curveArcLengthCm(pts, spans, a, b),
    0,
  );
  const { w: widthCm, h: heightCm } = bbox(pts);
  return {
    perimeterCm,
    areaCm2: shoelaceArea(flattenOutline(pts, spans)),
    rectilinearPerimeterCm: perimeterCm - curvePerimeterCm,
    curvePerimeterCm,
    widthCm,
    heightCm,
  };
}

const GRADE = ["P", "M", "G", "GG"] as const;
// Benchmark-piece-id mapping stays here, keyed per engine, rather than on
// EngineCapability: this is test metadata (which of THIS benchmark's piece
// names correspond to which of an engine's own piece ids), not a capability
// the app itself needs to know. An engine with no entry here is reported as
// unmapped rather than silently scored against zeroed rows.
const PIECE_IDS_BY_ENGINE: Record<
  EngineId,
  Record<string, string> | undefined
> = {
  moldai: {
    back: "body-back",
    front: "body-front",
    sleeve: "sleeve",
    collarBand: "collar",
  },
  // #269: the freesewing adapter (lib/draft/engine/freesewing/designs/
  // teagan.ts) reuses our OWN canonical piece ids for front/back/sleeve, so
  // the mapping is identical to moldai's for those three. collarBand is
  // deliberately absent -- Teagan draws no collar band at all
  // (docs/reference/freesewing-spike's own finding) -- which reports as a
  // zeroed row below, not a silent drop.
  freesewing: {
    back: "body-back",
    front: "body-front",
    sleeve: "sleeve",
  },
};
const BENCHMARK_PIECES = ["back", "front", "sleeve", "collarBand"] as const;
type BenchmarkPiece = (typeof BENCHMARK_PIECES)[number];

function tshirtSpec(): GarmentSpec {
  return {
    type: "tshirt",
    gender: "male",
    measurementOverrides: {},
    style: {},
  };
}

interface ReportRow {
  engine: EngineId;
  piece: BenchmarkPiece;
  size: (typeof GRADE)[number];
  ours: PieceMetrics;
  benchmark: PieceMetrics;
}

interface SkippedEngine {
  engine: EngineId;
  reason: string;
}

let rows: ReportRow[] = [];
let skipped: SkippedEngine[] = [];
let reportPath: string;

beforeAll(() => {
  reportPath = fileURLToPath(
    new URL(
      "../../docs/reference/tshirt-benchmark/comparison-report.md",
      import.meta.url,
    ),
  );
  rows = [];
  skipped = [];

  for (const engineId of ENGINE_IDS) {
    const pieceIds = PIECE_IDS_BY_ENGINE[engineId];
    if (!pieceIds) {
      skipped.push({
        engine: engineId,
        reason: "declares no benchmark piece mapping (PIECE_IDS_BY_ENGINE)",
      });
      continue;
    }
    const capability = getEngine(engineId).capability;
    // #267: SIZE_TABLE_MALE may not satisfy a future engine's own required
    // measurements -- reported and skipped, never a throw or a silent zero
    // row. Checked once per engine against the M row; the tshirt archetype
    // itself is also checked (an engine that doesn't draft tshirt at all
    // gets the same treatment).
    const gaps = checkEngineSupport(
      capability,
      tshirtSpec(),
      SIZE_TABLE_MALE.M,
    );
    const blocking = gaps.find(
      (g) => g.kind === "type" || g.kind === "measurements",
    );
    if (blocking) {
      skipped.push({ engine: engineId, reason: JSON.stringify(blocking) });
      continue;
    }

    for (const size of GRADE) {
      const pieces = draftPiecesCm(
        engineId,
        tshirtSpec(),
        SIZE_TABLE_MALE[size],
        t,
      );
      for (const benchPiece of BENCHMARK_PIECES) {
        const pieceId = pieceIds[benchPiece];
        const piece = pieceId ? pieces.find((p) => p.id === pieceId) : null;
        // A missing piece (e.g. collar declined by a future default change)
        // is reported as a zeroed row rather than silently dropped, so the
        // report's row count stays a constant, checkable number.
        const ours = piece
          ? measurePiece(piece)
          : {
              perimeterCm: 0,
              areaCm2: 0,
              rectilinearPerimeterCm: 0,
              curvePerimeterCm: 0,
              widthCm: 0,
              heightCm: 0,
            };
        const benchmarkMetrics = (
          benchmark.pieces as Record<
            string,
            { sizes: Record<string, PieceMetrics> }
          >
        )[benchPiece].sizes[size];
        rows.push({
          engine: engineId,
          piece: benchPiece,
          size,
          ours,
          benchmark: benchmarkMetrics,
        });
      }
    }
  }

  const lines: string[] = [
    "# T-shirt drafter vs. benchmark comparison",
    "",
    "Auto-generated by `lib/draft/tshirtBenchmark.test.ts` -- regenerated on every",
    "test run, never hand-edited. No numeric delta here is a pass/fail gate; see",
    "the feature spec's Assumptions for why.",
    "",
    "Scores every registered drafting engine (see `lib/draft/engine/registry.ts`)",
    "on the same six metrics -- `moldai` and `freesewing` today.",
    "`perimeterCm`/`areaCm2` are representation- and orientation-invariant and",
    "comparable across engines; `rectilinearPerimeterCm`/`curvePerimeterCm`",
    "(how a curve/straight split is represented) and `widthCm`/`heightCm`",
    "(bounding-box orientation) are not -- see docs/decisions/drafting.md.",
    "Before #282, this app's own tshirt ease constant was solved backwards",
    "from this benchmark's own contested `widthCm` figure, which made an",
    '"ours is closer" reading of `widthCm`/`perimeterCm`/`areaCm2` circular.',
    "#282 replaced that calibration (see docs/decisions/drafting.md), so",
    "those readings are no longer circular here -- but",
    "`rectilinearPerimeterCm`/`curvePerimeterCm` and `widthCm`/`heightCm`",
    "still aren't comparable across engines for the representation/",
    "orientation reasons above, independent of calibration. `areaCm2` is the",
    "fair comparison, and freesewing's own tshirt panel reads closer to the",
    "benchmark's real garment there than moldai's now does.",
    "",
    "Note on `collarBand` rows: this app drafts the band as a horizontal strip",
    "(widthCm = strip length, heightCm = band height); the benchmark's own export",
    "draws it rotated 90 degrees (widthCm = band height, heightCm = strip length).",
    "A rectangle's own orientation is arbitrary, so widthCm/heightCm read as swapped",
    "there -- compare perimeterCm/areaCm2 instead, which are orientation-invariant.",
    "freesewing's own collarBand rows are all zero -- a declared capability gap,",
    "not a bug: Teagan draws no collar/neckband at all (FREESEWING_CAPABILITY's",
    "own tshirt.collar is empty), so there is no piece here to measure.",
    "",
    "| Engine | Piece | Size | Metric | Ours | Benchmark | Delta |",
    "| ------ | ----- | ---- | ------ | ---- | --------- | ----- |",
  ];
  for (const row of rows) {
    for (const key of METRIC_KEYS) {
      const ours = row.ours[key];
      const bench = row.benchmark[key];
      const delta = ours - bench;
      lines.push(
        `| ${row.engine} | ${row.piece} | ${row.size} | ${key} | ${ours.toFixed(2)} | ${bench.toFixed(2)} | ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} |`,
      );
    }
  }
  if (skipped.length > 0) {
    lines.push(
      "",
      "## Engines not scored",
      "",
      "| Engine | Reason |",
      "| ------ | ------ |",
      ...skipped.map((s) => `| ${s.engine} | ${s.reason} |`),
    );
  }
  writeFileSync(reportPath, lines.join("\n") + "\n");
});

describe("tshirt benchmark comparison", () => {
  it("drafts and measures every registered engine's 4 sizes x 4 pieces", () => {
    expect(rows).toHaveLength(
      ENGINE_IDS.length * GRADE.length * BENCHMARK_PIECES.length,
    );
  });

  it("every row carries all 6 metrics for both ours and the benchmark", () => {
    for (const row of rows) {
      for (const key of METRIC_KEYS) {
        expect(typeof row.ours[key]).toBe("number");
        expect(Number.isFinite(row.ours[key])).toBe(true);
        expect(typeof row.benchmark[key]).toBe("number");
      }
    }
  });

  // #267: an engine that can't be scored (no piece mapping, or a
  // capability gap against the benchmark's own measurements) is reported
  // with a stated reason, never silently absent from the report and never
  // a thrown error that would fail every other engine's rows too.
  it("reports a stated reason for any engine it could not score, never a silent skip", () => {
    for (const s of skipped) {
      expect(s.reason.length).toBeGreaterThan(0);
    }
  });

  it("writes a checked-in report covering every engine x size x piece x metric row", () => {
    const content = readReport();
    for (const row of rows) {
      expect(content).toContain(
        `| ${row.engine} | ${row.piece} | ${row.size} |`,
      );
    }
    // 2 header/separator lines + one row per (engine x size x piece) * 6 metrics
    const tableLines = content
      .split("\n")
      .filter(
        (l) =>
          l.startsWith("| ") &&
          !l.startsWith("| Engine |") &&
          !l.startsWith("| ---") &&
          !l.startsWith("| ------"),
      );
    expect(tableLines.length).toBe(rows.length * METRIC_KEYS.length);
  });

  it("the report's 'ours' figures match what measurePiece independently computed for the same draft (round-trip, not a threshold)", () => {
    const content = readReport();
    const size = "M";
    const engine = ENGINE_IDS[0];
    const pieceIds = PIECE_IDS_BY_ENGINE[engine]!;
    const spec = tshirtSpec();
    const pieces = draftPiecesCm(engine, spec, SIZE_TABLE_MALE[size], t);
    const front = pieces.find((p) => p.id === pieceIds.front)!;
    const metrics = measurePiece(front);
    const line = content
      .split("\n")
      .find((l) =>
        l.startsWith(`| ${engine} | front | ${size} | perimeterCm |`),
      );
    expect(line).toBeDefined();
    const oursCell = line!.split("|")[5].trim();
    expect(Number(oursCell)).toBeCloseTo(metrics.perimeterCm, 1);
  });

  function readReport(): string {
    return readFileSync(reportPath, "utf8");
  }
});
