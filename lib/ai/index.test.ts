import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorState } from "@/lib/types";
import type { LlmCallOptions, LlmCallResult } from "./provider/types";
import { LlmProposeError } from "./provider/types";

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
  getProvider: () => ({ id: "fake", model: () => "fake-model", propose }),
}));

// #276: proposeGarment's own tracing call -- mocked here (rather than
// exercised for real) so this file stays about the wiring (what
// traceProposeGarment is called WITH), not lib/observability/langfuse.ts's
// own Langfuse SDK mechanics, which langfuse.test.ts already covers. The
// specifier must match index.ts's own import exactly (CLAUDE.md's
// mock-specifier rule): "@/lib/observability/langfuse", not a relative path.
// vi.hoisted is required (not a plain top-level const) because vi.mock's
// factory below is itself hoisted above every other statement in this
// file -- a plain const referenced from inside it would still be in the
// temporal dead zone when the factory first runs.
const { traceProposeGarment, isTraceContentEnabled } = vi.hoisted(() => ({
  traceProposeGarment: vi.fn(),
  isTraceContentEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/observability/langfuse", () => ({
  traceProposeGarment,
  isTraceContentEnabled,
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
  beforeEach(() => {
    propose.mockReset();
    traceProposeGarment.mockReset();
    isTraceContentEnabled.mockReset().mockReturnValue(false);
  });

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

// #276: proposeGarment is the one seam that traces every propose() call
// (both the production Anthropic path and the eval-harness/local path) to
// Langfuse. These tests pin the WIRING -- what traceProposeGarment gets
// called with -- not the Langfuse SDK mechanics themselves.
describe("proposeGarment: Langfuse tracing (#276)", () => {
  beforeEach(() => {
    propose.mockReset();
    traceProposeGarment.mockReset();
    isTraceContentEnabled.mockReset().mockReturnValue(false);
  });

  it("traces a successful call with provider, model, source, decision, usage, and repaired", async () => {
    propose.mockResolvedValue({
      toolInput: { decision: "decline", assistantMessage: "not supported" },
      usage: { inputTokens: 42, outputTokens: 7 },
      repaired: true,
    });
    await proposeGarment(baseState, { answering: false });
    expect(traceProposeGarment).toHaveBeenCalledTimes(1);
    const call = traceProposeGarment.mock.calls[0][0];
    expect(call.provider).toBe("fake");
    expect(call.model).toBe("fake-model");
    expect(call.source).toBe("app");
    expect(call.decision).toBe("decline");
    expect(call.usage).toEqual({ inputTokens: 42, outputTokens: 7 });
    expect(call.repaired).toBe(true);
    expect(call.error).toBeUndefined();
    expect(typeof call.startedAt).toBe("number");
    expect(typeof call.finishedAt).toBe("number");
  });

  // #276 AC: npm run eval:ai runs must be distinguishable from the generate
  // route's own production traffic.
  it("tags the trace source as 'eval' only when the caller sets evalRun", async () => {
    propose.mockResolvedValue(
      toolResp({ decision: "decline", assistantMessage: "x" }),
    );
    await proposeGarment(baseState, { answering: false, evalRun: true });
    expect(traceProposeGarment.mock.calls[0][0].source).toBe("eval");
  });

  it("still traces (with the error message, no decision) when propose() throws", async () => {
    propose.mockRejectedValue(new Error("Anthropic 401"));
    await expect(
      proposeGarment(baseState, { answering: false }),
    ).rejects.toThrow("Anthropic 401");
    expect(traceProposeGarment).toHaveBeenCalledTimes(1);
    const call = traceProposeGarment.mock.calls[0][0];
    expect(call.decision).toBeUndefined();
    expect(call.repaired).toBe(false);
    expect(call.error).toBe("Anthropic 401");
  });

  // #276: when a provider's one repair attempt also fails, propose() throws
  // an LlmProposeError carrying both attempts' usage (still real, billed
  // calls) instead of a plain Error -- the trace must read usage/repaired
  // off it rather than recording usage: undefined for a charged call.
  it("reads usage/repaired off a thrown LlmProposeError, not just a successful LlmCallResult", async () => {
    propose.mockRejectedValue(
      new LlmProposeError("repair also failed", {
        usage: { inputTokens: 700, outputTokens: 110 },
        repaired: true,
      }),
    );
    await expect(
      proposeGarment(baseState, { answering: false }),
    ).rejects.toThrow("repair also failed");
    const call = traceProposeGarment.mock.calls[0][0];
    expect(call.usage).toEqual({ inputTokens: 700, outputTokens: 110 });
    expect(call.repaired).toBe(true);
    expect(call.error).toBe("repair also failed");
  });

  it("never adds an await on the trace call -- proposeGarment resolves without waiting on it", async () => {
    let resolveTrace: () => void = () => {};
    traceProposeGarment.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveTrace = resolve;
        }) as unknown as void,
    );
    propose.mockResolvedValue(
      toolResp({ decision: "decline", assistantMessage: "x" }),
    );
    const decision = await proposeGarment(baseState, { answering: false });
    // proposeGarment already resolved even though traceProposeGarment's own
    // mock implementation never resolved its returned promise -- proving
    // the real function is called fire-and-forget, not awaited.
    expect(decision.decision).toBe("decline");
    resolveTrace();
  });

  it("omits prompt/response content from the trace when content capture is disabled", async () => {
    propose.mockResolvedValue(
      toolResp({ decision: "decline", assistantMessage: "x" }),
    );
    await proposeGarment(baseState, { answering: false });
    expect(traceProposeGarment.mock.calls[0][0].content).toBeUndefined();
  });

  // #276 LGPD acceptance criterion: prompt/response bodies are opt-in,
  // never built when the flag is off (the test above), and carried onto
  // the trace only when it's on.
  it("carries prompt/response content on the trace when content capture is enabled", async () => {
    isTraceContentEnabled.mockReturnValue(true);
    propose.mockResolvedValue(
      toolResp({ decision: "decline", assistantMessage: "resposta" }),
    );
    await proposeGarment(baseState, { answering: false });
    const content = traceProposeGarment.mock.calls[0][0].content;
    expect(content.assistantMessage).toBe("resposta");
    expect(content.systemDynamic).toContain("# Current state");
    expect(content.messages[content.messages.length - 1]).toEqual({
      role: "user",
      content: "I want a t-shirt",
    });
  });
});
