import { describe, it, expect } from "vitest";
import { PatternStateSchema } from "./pattern";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
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
});
