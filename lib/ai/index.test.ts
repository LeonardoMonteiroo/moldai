import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorState } from "@/lib/types";
import type { LlmCallOptions, LlmCallResult } from "./provider/types";

// #269 provider facade: proposeGarment's own job, after the refactor, is
// wiring (build the right LlmCallOptions, hand the provider's toolInput to
// parseRawToolInput/resolveDecision) -- not SDK mechanics (image attach
// shape, cache_control, the repair-retry wire protocol), which moved to
// lib/ai/provider/anthropic.test.ts, nor decision normalization (ask/apply/
// decline/explain, spec validation), already covered by decision.test.ts.
// Mocking the provider registry (not the SDK) is what makes that split
// possible -- the same "@/..." vs relative specifier care CLAUDE.md's own
// testing rule calls out: index.ts imports "./provider/registry", so the
// mock specifier below must be that exact string, not "@/lib/ai/provider/registry".
const propose = vi.fn<(opts: LlmCallOptions) => Promise<LlmCallResult>>();
vi.mock("./provider/registry", () => ({
  getProvider: () => ({ id: "fake", propose }),
}));

import { proposeGarment } from "./index";

function toolResp(input: unknown): LlmCallResult {
  return { toolInput: input };
}

const baseState = {
  pattern: { pieces: [], spec: undefined },
  chat: [{ author: "user", text: "I want a t-shirt" }],
} as unknown as EditorState;

describe("proposeGarment", () => {
  beforeEach(() => propose.mockReset());

  it("resolves the provider's tool input into an AiDecision", async () => {
    propose.mockResolvedValue(
      toolResp({ decision: "decline", assistantMessage: "not supported" }),
    );
    const d = await proposeGarment(baseState, { answering: false });
    expect(d.decision).toBe("decline");
    expect(d.assistantMessage).toBe("not supported");
  });

  it("passes the engine's static/dynamic system sections, forced tool, and history to the provider", async () => {
    propose.mockResolvedValue(
      toolResp({ decision: "decline", assistantMessage: "x" }),
    );
    await proposeGarment(baseState, { answering: false });
    const opts = propose.mock.calls[0][0];
    expect(opts.systemStatic).toContain("# Role");
    expect(opts.systemDynamic).toContain("# Current state");
    expect(opts.tool.name).toBe("propose_garment");
    expect(opts.toolChoice).toBe("propose_garment");
    expect(opts.messages[opts.messages.length - 1]).toEqual({
      role: "user",
      content: "I want a t-shirt",
    });
  });

  it("threads images, importContext, and formSpec through to the provider", async () => {
    propose.mockResolvedValue(
      toolResp({ decision: "decline", assistantMessage: "x" }),
    );
    const formSpec = {
      type: "blouse" as const,
      gender: "male" as const,
      measurementOverrides: {},
      style: { collar: "band" as const },
    };
    await proposeGarment(baseState, {
      answering: false,
      images: [{ mediaType: "image/jpeg", base64: "ZmFrZQ==" }],
      importContext: "IMPORT MARKER",
      formSpec,
    });
    const opts = propose.mock.calls[0][0];
    expect(opts.images).toEqual([
      { mediaType: "image/jpeg", base64: "ZmFrZQ==" },
    ]);
    expect(opts.systemDynamic).toContain("IMPORT MARKER");
    expect(opts.systemDynamic).toContain(JSON.stringify(formSpec));
  });

  // #99: resolveDecision still runs -- an unrecognized decision from the
  // provider is rejected here rather than fabricated into a default blouse.
  // The exhaustive matrix (ask/apply/decline/explain normalization, spec
  // validation, adjustments) lives in decision.test.ts; this only pins that
  // proposeGarment still calls through it.
  it("still rejects an unrecognized decision value from the provider", async () => {
    propose.mockResolvedValue(toolResp({ decision: "banana" }));
    await expect(
      proposeGarment(baseState, { answering: false }),
    ).rejects.toThrow(/unrecognized decision/);
  });
});
