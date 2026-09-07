import { describe, it, expect, vi, afterEach } from "vitest";
import type { LlmCallOptions, LlmCallResult } from "./provider/types";
import type { GarmentSpec } from "@/lib/types";

// #264: mocks the provider REGISTRY (not the SDK), the same lib/ai/index.test.ts
// precedent -- and the mock specifier must be the exact one this module
// imports ("./provider/registry", relative), not the "@/..." alias, or the
// mock silently never intercepts (CLAUDE.md's own testing rule).
const propose = vi.fn<(opts: LlmCallOptions) => Promise<LlmCallResult>>();
vi.mock("./provider/registry", () => ({
  getProvider: () => ({ id: "fake", propose }),
}));

import { findReferenceDisagreement } from "./compareToReference";

const SPEC: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: {},
};
const IMAGES = [{ mediaType: "image/jpeg" as const, base64: "abc" }];

function toolResp(input: unknown): LlmCallResult {
  return { toolInput: input };
}

describe("findReferenceDisagreement", () => {
  // #264: deliberately afterEach, not beforeEach -- in this Vitest/Windows
  // worker-pool combination, resetting the mock in a beforeEach that runs
  // immediately before the "gives up... even if the provider never
  // resolves" test below (vi.useFakeTimers() + Promise.race against a
  // promise that never settles) reliably hangs/crashes the worker; the same
  // reset moved to afterEach does not. Isolation between tests is identical
  // either way (nothing calls `propose` between one test's end and the
  // next's start) -- only the timing relative to fake-timer setup changes.
  afterEach(() => propose.mockReset());

  it("returns null when the model agrees", async () => {
    propose.mockResolvedValue(toolResp({ agrees: true }));
    expect(await findReferenceDisagreement(SPEC, IMAGES)).toBeNull();
  });

  it("returns the trimmed note when the model disagrees", async () => {
    propose.mockResolvedValue(
      toolResp({ agrees: false, note: "  a saia é reta, não godê  " }),
    );
    expect(await findReferenceDisagreement(SPEC, IMAGES)).toBe(
      "a saia é reta, não godê",
    );
  });

  it("returns null when agrees=false but no usable note was given", async () => {
    propose.mockResolvedValue(toolResp({ agrees: false }));
    expect(await findReferenceDisagreement(SPEC, IMAGES)).toBeNull();

    propose.mockResolvedValue(toolResp({ agrees: false, note: "   " }));
    expect(await findReferenceDisagreement(SPEC, IMAGES)).toBeNull();
  });

  it("returns null on a malformed tool response instead of throwing", async () => {
    propose.mockResolvedValue(toolResp(null));
    expect(await findReferenceDisagreement(SPEC, IMAGES)).toBeNull();

    propose.mockResolvedValue(toolResp({ agrees: "yes" }));
    expect(await findReferenceDisagreement(SPEC, IMAGES)).toBeNull();
  });

  // #264: this function's own contract is "never throws on a response it
  // CAN parse" -- a rejected call (network error, provider throwing) is the
  // caller's (the generate route's) own try/catch to swallow and report,
  // not this file's.
  it("propagates a rejected provider call rather than swallowing it itself", async () => {
    propose.mockRejectedValue(new Error("network error"));
    await expect(findReferenceDisagreement(SPEC, IMAGES)).rejects.toThrow(
      "network error",
    );
  });

  it("forces the compare_reference tool and attaches the SAME reference image(s)", async () => {
    propose.mockResolvedValue(toolResp({ agrees: true }));
    await findReferenceDisagreement(SPEC, IMAGES);

    const opts = propose.mock.calls[0][0];
    expect(opts.tool.name).toBe("compare_reference");
    expect(opts.toolChoice).toBe("compare_reference");
    expect(opts.images).toBe(IMAGES);
    // The drafted spec is sent as the same JSON shape the model already
    // emitted via propose_garment -- no second, prose representation built.
    expect(opts.systemDynamic).toContain(JSON.stringify(SPEC));
  });

  // #264: a generation that already succeeded must never wait on this past
  // a short, fixed ceiling -- this proves the internal race actually gives
  // up rather than hanging forever on a provider call that never settles.
  it("gives up and returns null once the internal timeout elapses, even if the provider never resolves", async () => {
    vi.useFakeTimers();
    try {
      propose.mockImplementation(() => new Promise<never>(() => {}));
      const pending = findReferenceDisagreement(SPEC, IMAGES);
      await vi.advanceTimersByTimeAsync(8_000);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
