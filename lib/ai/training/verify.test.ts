import { describe, it, expect, vi } from "vitest";
import type { Combination } from "./combinations";

// draftsCleanly's own three branches (gap check / clean draft / thrown
// error) are each cheap to isolate with mocks -- combinations.test.ts
// already exercises the real engine end-to-end for the happy path, so this
// file targets only the branches that path never reaches: a reported
// type/measurements gap, and draftGarment throwing.

const checkEngineSupport = vi.fn();
const draftGarment = vi.fn();
const seamCheck = vi.fn();

vi.mock("@/lib/draft/engine/capability", () => ({
  checkEngineSupport: (...args: unknown[]) => checkEngineSupport(...args),
}));
vi.mock("@/lib/draft/engine/facade", () => ({
  draftGarment: (...args: unknown[]) => draftGarment(...args),
}));
vi.mock("@/lib/draft/garment", () => ({
  seamCheck: (...args: unknown[]) => seamCheck(...args),
}));

const { draftsCleanly } = await import("./verify");

const COMBO: Combination = {
  key: "blouse|female|neckline=V",
  type: "blouse",
  gender: "female",
  fields: { neckline: "V" },
  arity: 1,
};

const t = ((key: string) => key) as never;

describe("draftsCleanly", () => {
  it("returns false without drafting when checkEngineSupport reports a type gap", () => {
    checkEngineSupport.mockReturnValue([{ kind: "type" }]);
    const result = draftsCleanly(
      "moldai" as never,
      {} as never,
      COMBO,
      {} as never,
      {} as never,
      t,
    );
    expect(result).toBe(false);
    expect(draftGarment).not.toHaveBeenCalled();
  });

  it("returns false without drafting when checkEngineSupport reports a measurements gap", () => {
    checkEngineSupport.mockReturnValue([{ kind: "measurements" }]);
    const result = draftsCleanly(
      "moldai" as never,
      {} as never,
      COMBO,
      {} as never,
      {} as never,
      t,
    );
    expect(result).toBe(false);
    expect(draftGarment).not.toHaveBeenCalled();
  });

  it("returns false when draftGarment throws", () => {
    checkEngineSupport.mockReturnValue([]);
    draftGarment.mockImplementation(() => {
      throw new Error("boom");
    });
    const result = draftsCleanly(
      "moldai" as never,
      {} as never,
      COMBO,
      {} as never,
      {} as never,
      t,
    );
    expect(result).toBe(false);
  });

  it("returns false when the draft produces no pieces", () => {
    checkEngineSupport.mockReturnValue([]);
    draftGarment.mockReturnValue({ pieces: [], seamGraph: {} });
    const result = draftsCleanly(
      "moldai" as never,
      {} as never,
      COMBO,
      {} as never,
      {} as never,
      t,
    );
    expect(result).toBe(false);
  });

  it("returns true when there are no seam conflicts", () => {
    checkEngineSupport.mockReturnValue([]);
    draftGarment.mockReturnValue({ pieces: [{}], seamGraph: {} });
    seamCheck.mockReturnValue([]);
    const result = draftsCleanly(
      "moldai" as never,
      {} as never,
      COMBO,
      {} as never,
      {} as never,
      t,
    );
    expect(result).toBe(true);
  });

  it("returns false when there is an unexpected seam conflict", () => {
    checkEngineSupport.mockReturnValue([]);
    draftGarment.mockReturnValue({ pieces: [{}], seamGraph: {} });
    seamCheck.mockReturnValue([{ key: "some-other-conflict" }]);
    const result = draftsCleanly(
      "moldai" as never,
      {} as never,
      COMBO,
      {} as never,
      {} as never,
      t,
    );
    expect(result).toBe(false);
  });

  it("allows only the armhole-cap conflict when the combination sets a positive armholeDeepenCm", () => {
    checkEngineSupport.mockReturnValue([]);
    draftGarment.mockReturnValue({ pieces: [{}], seamGraph: {} });
    seamCheck.mockReturnValue([{ key: "armhole-cap" }]);
    const comboWithArmhole: Combination = {
      ...COMBO,
      fields: { armholeDeepenCm: 3 },
    };
    const result = draftsCleanly(
      "moldai" as never,
      {} as never,
      comboWithArmhole,
      {} as never,
      {} as never,
      t,
    );
    expect(result).toBe(true);
  });
});
