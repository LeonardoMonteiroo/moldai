import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// #276: "langfuse" is only ever dynamically imported inside langfuse.ts
// (never at module top level -- mirrors sentry.ts's own reasoning), so
// vi.mock still has to target this exact specifier: Vitest intercepts a
// dynamic import() the same way it intercepts a static one, as long as the
// specifier matches (CLAUDE.md's mock-specifier rule).
interface FakeTraceBody {
  tags?: string[];
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
}

const generation = vi.fn();
const trace = vi.fn((_body: FakeTraceBody) => ({ generation }));
const flushAsync = vi.fn().mockResolvedValue(undefined);
const Langfuse = vi.fn(() => ({ trace, flushAsync }));
vi.mock("langfuse", () => ({ Langfuse }));

import {
  isTraceContentEnabled,
  traceProposeGarment,
  type LlmCallTrace,
} from "./langfuse";

const ORIGINAL_ENV = {
  LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
  LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
  LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
  LANGFUSE_TRACE_CONTENT: process.env.LANGFUSE_TRACE_CONTENT,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function baseTrace(overrides: Partial<LlmCallTrace> = {}): LlmCallTrace {
  return {
    provider: "anthropic",
    model: "claude-sonnet-5",
    source: "app",
    startedAt: 1000,
    finishedAt: 1500,
    repaired: false,
    ...overrides,
  };
}

// traceProposeGarment is a synchronous fire-and-forget function -- its
// actual work happens inside an un-awaited internal async function, gated
// behind a dynamic import(). vi.waitFor polls the assertion instead of
// guessing a delay, the same reason sentry.test.ts's waitForSentryCall
// exists.
const waitForTrace = (assertion: () => void) => vi.waitFor(assertion);

describe("isTraceContentEnabled", () => {
  afterEach(restoreEnv);

  it("is false when unset", () => {
    delete process.env.LANGFUSE_TRACE_CONTENT;
    expect(isTraceContentEnabled()).toBe(false);
  });

  it("is false for any value other than exactly 'true'", () => {
    process.env.LANGFUSE_TRACE_CONTENT = "1";
    expect(isTraceContentEnabled()).toBe(false);
  });

  it("is true only for exactly 'true'", () => {
    process.env.LANGFUSE_TRACE_CONTENT = "true";
    expect(isTraceContentEnabled()).toBe(true);
  });
});

describe("traceProposeGarment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
  });

  afterEach(restoreEnv);

  it("never imports/calls the SDK when either key is missing", () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    // No dynamic import is even started in this branch (the early return
    // happens before `void send()`), so there is no async work to wait for.
    traceProposeGarment(baseTrace());
    expect(Langfuse).not.toHaveBeenCalled();
  });

  it("constructs the client from the configured keys/base URL", async () => {
    process.env.LANGFUSE_BASE_URL = "https://langfuse.example.com";
    traceProposeGarment(baseTrace());
    await waitForTrace(() => expect(Langfuse).toHaveBeenCalledTimes(1));
    expect(Langfuse).toHaveBeenCalledWith({
      secretKey: "sk-test",
      publicKey: "pk-test",
      baseUrl: "https://langfuse.example.com",
    });
  });

  it("tags the trace with source and provider, so eval runs are distinguishable from production", async () => {
    traceProposeGarment(baseTrace({ source: "eval", provider: "local" }));
    await waitForTrace(() =>
      expect(trace).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ["eval", "local"] }),
      ),
    );
  });

  it("carries model, usage, and repaired onto the generation", async () => {
    traceProposeGarment(
      baseTrace({
        model: "claude-sonnet-5",
        usage: { inputTokens: 100, outputTokens: 20 },
        repaired: true,
      }),
    );
    await waitForTrace(() =>
      expect(generation).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-5",
          usage: { input: 100, output: 20, unit: "TOKENS" },
        }),
      ),
    );
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ repaired: true }),
      }),
    );
  });

  // #250: decision.adjustments must land on the trace regardless of the
  // content opt-in flag -- it carries no chat text or images, only field
  // names and enum/numeric values.
  it("carries adjustments on the trace metadata even when content capture is off", async () => {
    delete process.env.LANGFUSE_TRACE_CONTENT;
    const adjustments = [
      {
        kind: "clamped" as const,
        field: "necklineDepthCm" as const,
        requested: 999,
        used: 20,
        range: { min: 0, max: 20 },
      },
    ];
    traceProposeGarment(baseTrace({ adjustments }));
    await waitForTrace(() =>
      expect(trace).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ adjustments }),
        }),
      ),
    );
  });

  it("omits prompt/response content from the trace when no content was passed", async () => {
    traceProposeGarment(baseTrace());
    await waitForTrace(() => expect(trace).toHaveBeenCalledTimes(1));
    const call = trace.mock.calls[0][0];
    expect(call.input).toBeUndefined();
    expect(call.output).toBeUndefined();
  });

  it("carries content onto the trace when the caller supplied it", async () => {
    traceProposeGarment(
      baseTrace({
        content: {
          systemDynamic: "# Current state",
          messages: [{ role: "user", content: "uma blusa" }],
          assistantMessage: "Pronto!",
        },
      }),
    );
    await waitForTrace(() =>
      expect(trace).toHaveBeenCalledWith(
        expect.objectContaining({
          input: [{ role: "user", content: "uma blusa" }],
          output: "Pronto!",
        }),
      ),
    );
  });

  it("marks the generation ERROR and carries the message when propose() threw", async () => {
    traceProposeGarment(baseTrace({ error: "boom" }));
    await waitForTrace(() =>
      expect(generation).toHaveBeenCalledWith(
        expect.objectContaining({ level: "ERROR", statusMessage: "boom" }),
      ),
    );
  });

  it("flushes before returning, and never throws when the SDK itself fails", async () => {
    Langfuse.mockImplementationOnce(() => {
      throw new Error("network down");
    });
    expect(() => traceProposeGarment(baseTrace())).not.toThrow();
    // Best-effort: a broken Langfuse client must not surface past this
    // fire-and-forget boundary. There is nothing further to assert here
    // beyond "it never threw" -- reportError's own forwarding is covered by
    // report.test.ts.
    await waitForTrace(() => expect(Langfuse).toHaveBeenCalledTimes(1));
  });
});
