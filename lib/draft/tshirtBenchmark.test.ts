import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { draftPiecesCm } from "./engine/facade";
import { DEFAULT_ENGINE_ID } from "./engine/capability";
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
const PIECE_IDS = {
  back: "body-back",
  front: "body-front",
  sleeve: "sleeve",
  collarBand: "collar",
} as const;

type BenchmarkPiece = keyof typeof PIECE_IDS;

function tshirtSpec(): GarmentSpec {
  return {
    type: "tshirt",
    gender: "male",
    measurementOverrides: {},
    style: {},
  };
}

interface ReportRow {
  piece: BenchmarkPiece;
  size: (typeof GRADE)[number];
  ours: PieceMetrics;
  benchmark: PieceMetrics;
}

let rows: ReportRow[] = [];
let reportPath: string;

beforeAll(() => {
  reportPath = fileURLToPath(
    new URL(
      "../../docs/reference/tshirt-benchmark/comparison-report.md",
      import.meta.url,
    ),
  );
  rows = [];
  for (const size of GRADE) {
    const pieces = draftPiecesCm(
      DEFAULT_ENGINE_ID,
      tshirtSpec(),
      SIZE_TABLE_MALE[size],
      t,
    );
    for (const [benchPiece, pieceId] of Object.entries(PIECE_IDS) as [
      BenchmarkPiece,
      string,
    ][]) {
      const piece = pieces.find((p) => p.id === pieceId);
      // A missing piece (e.g. collar declined by a future default change)
      // is reported as a zeroed row rather than silently dropped, so the
      // report's row count stays a constant, checkable 16.
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
      rows.push({ piece: benchPiece, size, ours, benchmark: benchmarkMetrics });
    }
  }

  const lines: string[] = [
    "# T-shirt drafter vs. benchmark comparison",
    "",
    "Auto-generated by `lib/draft/tshirtBenchmark.test.ts` -- regenerated on every",
    "test run, never hand-edited. No numeric delta here is a pass/fail gate; see",
    "the feature spec's Assumptions for why.",
    "",
    "Note on `collarBand` rows: this app drafts the band as a horizontal strip",
    "(widthCm = strip length, heightCm = band height); the benchmark's own export",
    "draws it rotated 90 degrees (widthCm = band height, heightCm = strip length).",
    "A rectangle's own orientation is arbitrary, so widthCm/heightCm read as swapped",
    "there -- compare perimeterCm/areaCm2 instead, which are orientation-invariant.",
    "",
    "| Piece | Size | Metric | Ours | Benchmark | Delta |",
    "| ----- | ---- | ------ | ---- | --------- | ----- |",
  ];
  for (const row of rows) {
    for (const key of METRIC_KEYS) {
      const ours = row.ours[key];
      const bench = row.benchmark[key];
      const delta = ours - bench;
      lines.push(
        `| ${row.piece} | ${row.size} | ${key} | ${ours.toFixed(2)} | ${bench.toFixed(2)} | ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} |`,
      );
    }
  }
  writeFileSync(reportPath, lines.join("\n") + "\n");
});

describe("tshirt benchmark comparison", () => {
  it("drafts and measures all 4 sizes x 4 pieces", () => {
    expect(rows).toHaveLength(GRADE.length * Object.keys(PIECE_IDS).length);
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

  it("writes a checked-in report covering every size x piece x metric row", () => {
    const content = readReport();
    for (const row of rows) {
      expect(content).toContain(`| ${row.piece} | ${row.size} |`);
    }
    // 2 header/separator lines + 16 rows * 6 metrics
    const tableLines = content
      .split("\n")
      .filter(
        (l) =>
          l.startsWith("| ") &&
          !l.startsWith("| Piece") &&
          !l.startsWith("| ---"),
      );
    expect(tableLines.length).toBe(rows.length * METRIC_KEYS.length);
  });

  it("the report's 'ours' figures match what measurePiece independently computed for the same draft (round-trip, not a threshold)", () => {
    const content = readReport();
    const size = "M";
    const spec = tshirtSpec();
    const pieces = draftPiecesCm(
      DEFAULT_ENGINE_ID,
      spec,
      SIZE_TABLE_MALE[size],
      t,
    );
    const front = pieces.find((p) => p.id === PIECE_IDS.front)!;
    const metrics = measurePiece(front);
    const line = content
      .split("\n")
      .find((l) => l.startsWith(`| front | ${size} | perimeterCm |`));
    expect(line).toBeDefined();
    const oursCell = line!.split("|")[4].trim();
    expect(Number(oursCell)).toBeCloseTo(metrics.perimeterCm, 1);
  });

  function readReport(): string {
    return readFileSync(reportPath, "utf8");
  }
});
