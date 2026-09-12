import { describe, it, expect } from "vitest";
import { PatternStateSchema } from "./pattern";
import {
  seedPatternState,
  applyGarmentSpec,
  setConflict,
} from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";

describe("PatternStateSchema", () => {
  it("accepts a freshly seeded, blank pattern state", () => {
    const state = seedPatternState(t);
    expect(PatternStateSchema.safeParse(state).success).toBe(true);
  });

  it("accepts a state after a real generation (pieces, viewBox, spec present)", () => {
    const state = seedPatternState(t);
    applyGarmentSpec(
      state,
      { type: "blouse", gender: "female", measurementOverrides: {}, style: {} },
      t,
    );
    const result = PatternStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });

  it("round-trips through JSON.stringify/parse the same as a Postgres jsonb column would", () => {
    const state = seedPatternState(t);
    const roundTripped = JSON.parse(JSON.stringify(state));
    expect(PatternStateSchema.safeParse(roundTripped).success).toBe(true);
  });

  // #58: the exact corruption this issue reports -- a sizeTable that no
  // longer has a row under baseSize used to read as `undefined` and silently
  // draft NaN geometry instead of failing anywhere.
  it("rejects a pattern whose baseSize is not a key of its sizeTable", () => {
    const state = seedPatternState(t);
    delete state.pattern.sizeTable[state.pattern.baseSize];
    const result = PatternStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it("rejects a sizeTable row missing a required measurement key", () => {
    const state = seedPatternState(t);
    const row = state.pattern.sizeTable[
      state.pattern.baseSize
    ] as unknown as Record<string, unknown>;
    delete row.bust;
    expect(PatternStateSchema.safeParse(state).success).toBe(false);
  });

  it("rejects an unrecognised garment type", () => {
    const state = seedPatternState(t);
    state.pattern.spec = {
      // @ts-expect-error deliberately invalid for the test
      type: "cape",
      measurementOverrides: {},
      style: {},
    };
    expect(PatternStateSchema.safeParse(state).success).toBe(false);
  });

  it("tolerates an inert leftover key nothing reads (e.g. savedAgo) by stripping it", () => {
    const state = seedPatternState(t);
    const withLeftover = {
      ...state,
      pattern: { ...state.pattern, savedAgo: "salvo agora" },
    };
    const result = PatternStateSchema.safeParse(withLeftover);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pattern).not.toHaveProperty("savedAgo");
    }
  });

  it("rejects a non-object blob (e.g. a Prisma JsonNull turned literal null)", () => {
    expect(PatternStateSchema.safeParse(null).success).toBe(false);
  });

  // #243: a piece's internalLoops must round-trip, not be silently stripped
  // by z.object's default "drop unrecognised keys" mode -- the exact trap
  // that already destroyed hasImage/assembly/decision in production once.
  it("round-trips a piece's internalLoops rather than stripping them", () => {
    const state = seedPatternState(t);
    applyGarmentSpec(
      state,
      { type: "blouse", gender: "female", measurementOverrides: {}, style: {} },
      t,
    );
    const withLoop = {
      ...state,
      pattern: {
        ...state.pattern,
        pieces: state.pattern.pieces.map((piece, i) =>
          i === 0
            ? {
                ...piece,
                internalLoops: [
                  { kind: "polygon" as const, points: "0,0 10,0 10,10 0,10" },
                ],
              }
            : piece,
        ),
      },
    };
    const result = PatternStateSchema.safeParse(withLoop);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pattern.pieces[0].internalLoops).toEqual([
        { kind: "polygon", points: "0,0 10,0 10,10 0,10" },
      ]);
    }
  });

  // #318: the same strip the #243 case above pins for internalLoops, on the
  // one field a real draft actually populates today. `darts: true` is
  // load-bearing: lib/draft/body.ts's bodice draft gates internalsCm on
  // `!!style.darts && !knit`, and applyGarmentSpec passes spec.style to
  // draftGarment verbatim (no validateSpec default), so with the blank
  // `style: {}` every other case in this file uses, no piece carries an
  // internal at all and this assertion would pass even against a schema
  // that still stripped the field.
  it("round-trips a real drafted piece's internals rather than stripping them", () => {
    const state = seedPatternState(t);
    applyGarmentSpec(
      state,
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { darts: true },
      },
      t,
    );

    const drafted = state.pattern.pieces.filter((p) => p.internals?.length);
    expect(drafted.length).toBeGreaterThan(0);
    const kinds = new Set(
      drafted.flatMap((p) => p.internals!.map((e) => e.kind)),
    );
    expect(kinds.has("dart")).toBe(true);
    expect(kinds.has("foldLine")).toBe(true);
    expect(kinds.has("drillHole")).toBe(true);

    // Through JSON first -- what a Postgres jsonb column actually hands back.
    const result = PatternStateSchema.safeParse(
      JSON.parse(JSON.stringify(state)),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    for (const piece of drafted) {
      const parsed = result.data.pattern.pieces.find((p) => p.id === piece.id);
      expect(parsed?.internals).toEqual(piece.internals);
    }
  });

  // #324: ConflictInfo.entries (#134's multi-divergence list) was never
  // named in ConflictInfoSchema, so it was stripped the same way -- one
  // entry carries `sizes` (#241) to pin that nested field too.
  it("round-trips conflict.entries rather than stripping them", () => {
    const state = seedPatternState(t);
    setConflict(state, {
      id: "c1",
      title: "Divergência de costura",
      description: "A cava e a cabeça da manga não fecham.",
      diffCm: 2.1,
      suggestion: "Ajustar a cabeça da manga.",
      pieceAId: "front",
      pieceBId: "sleeve",
      markers: [{ cx: 10, cy: 20, r: 3 }],
      entries: [
        {
          key: "armhole-cap",
          label: "Cava x cabeça da manga",
          aLabel: "Cava",
          bLabel: "Cabeça da manga",
          aPieceId: "front",
          bPieceId: "sleeve",
          diffCm: 2.1,
          fixable: true,
          markers: [{ cx: 10, cy: 20, r: 3 }],
        },
        {
          key: "side-seam",
          label: "Lateral",
          aLabel: "Frente",
          bLabel: "Costas",
          aPieceId: "front",
          bPieceId: "back",
          diffCm: 0.8,
          fixable: false,
          markers: [],
          sizes: ["P", "G"],
        },
      ],
    });

    const result = PatternStateSchema.safeParse(
      JSON.parse(JSON.stringify(state)),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conflict?.entries).toEqual(state.conflict?.entries);
    }
  });
});
