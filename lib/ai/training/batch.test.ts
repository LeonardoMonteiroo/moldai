import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { LlmCallOptions } from "@/lib/ai/provider/types";
import {
  submitBatch,
  getBatchStatus,
  pollBatchUntilDone,
  collectBatchResults,
  type BatchJobRequest,
} from "./batch";

// #269 Fase 5 (dataset): batch.ts never instantiates its own Anthropic
// client -- every function takes one as a parameter -- so these tests pass a
// plain object shaped like the one slice of the SDK each function actually
// calls, the same reason lib/ai/provider/anthropic.test.ts mocks the SDK
// module itself rather than this file needing to.

function fakeClient(overrides: {
  create?: ReturnType<typeof vi.fn>;
  retrieve?: ReturnType<typeof vi.fn>;
  results?: ReturnType<typeof vi.fn>;
}) {
  return {
    messages: {
      batches: {
        create: overrides.create ?? vi.fn(),
        retrieve: overrides.retrieve ?? vi.fn(),
        results: overrides.results ?? vi.fn(),
      },
    },
  } as unknown as Anthropic;
}

const TOOL = {
  name: "propose_garment",
  description: "d",
  input_schema: { type: "object" as const },
};

function opts(overrides: Partial<LlmCallOptions> = {}): LlmCallOptions {
  return {
    systemStatic: "static",
    systemDynamic: "dynamic",
    tool: TOOL,
    toolChoice: "propose_garment",
    messages: [{ role: "user", content: "quero uma blusa" }],
    maxTokens: 1024,
    ...overrides,
  };
}

describe("submitBatch", () => {
  it("submits one request per job, built via buildRequestParams, and returns the batch id", async () => {
    const create = vi.fn().mockResolvedValue({ id: "batch_123" });
    const client = fakeClient({ create });

    const jobs: BatchJobRequest[] = [
      { customId: "case-1", opts: opts() },
      { customId: "case-2", opts: opts({ maxTokens: 2048 }) },
    ];
    const id = await submitBatch(client, jobs);

    expect(id).toBe("batch_123");
    expect(create).toHaveBeenCalledTimes(1);
    const call = create.mock.calls[0][0] as {
      requests: { custom_id: string; params: Record<string, unknown> }[];
    };
    expect(call.requests).toHaveLength(2);
    expect(call.requests[0].custom_id).toBe("case-1");
    expect(call.requests[1].custom_id).toBe("case-2");
    expect(call.requests[0].params.model).toBe("claude-sonnet-5");
    expect(call.requests[1].params.max_tokens).toBe(2048);
  });
});

describe("getBatchStatus", () => {
  it("maps the SDK's batch shape to {id, processingStatus, counts}", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "batch_123",
      processing_status: "in_progress",
      request_counts: { processing: 5, succeeded: 0, errored: 0 },
    });
    const client = fakeClient({ retrieve });

    const status = await getBatchStatus(client, "batch_123");

    expect(retrieve).toHaveBeenCalledWith("batch_123");
    expect(status).toEqual({
      id: "batch_123",
      processingStatus: "in_progress",
      counts: { processing: 5, succeeded: 0, errored: 0 },
    });
  });
});

describe("pollBatchUntilDone", () => {
  it("polls until processing_status is ended, calling onTick each time", async () => {
    const retrieve = vi
      .fn()
      .mockResolvedValueOnce({
        id: "b1",
        processing_status: "in_progress",
        request_counts: {},
      })
      .mockResolvedValueOnce({
        id: "b1",
        processing_status: "in_progress",
        request_counts: {},
      })
      .mockResolvedValueOnce({
        id: "b1",
        processing_status: "ended",
        request_counts: {},
      });
    const client = fakeClient({ retrieve });
    const ticks: string[] = [];

    const final = await pollBatchUntilDone(client, "b1", {
      intervalMs: 0,
      onTick: (status) => ticks.push(status.processingStatus),
    });

    expect(final.processingStatus).toBe("ended");
    expect(retrieve).toHaveBeenCalledTimes(3);
    expect(ticks).toEqual(["in_progress", "in_progress", "ended"]);
  });

  it("returns immediately when already ended, without a wait", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "b1",
      processing_status: "ended",
      request_counts: {},
    });
    const client = fakeClient({ retrieve });

    const final = await pollBatchUntilDone(client, "b1", { intervalMs: 0 });

    expect(final.processingStatus).toBe("ended");
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
});

function fakeResultsStream(
  lines: { custom_id: string; result: Record<string, unknown> }[],
) {
  return vi.fn().mockResolvedValue({
    async *[Symbol.asyncIterator]() {
      for (const line of lines) yield line;
    },
  });
}

describe("collectBatchResults", () => {
  it("returns ok:true with the tool_use block's input for a succeeded result", async () => {
    const results = fakeResultsStream([
      {
        custom_id: "case-1",
        result: {
          type: "succeeded",
          message: {
            stop_reason: "tool_use",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "propose_garment",
                input: { decision: "apply" },
              },
            ],
          },
        },
      },
    ]);
    const client = fakeClient({ results });

    const out = await collectBatchResults(client, "batch_123");

    expect(results).toHaveBeenCalledWith("batch_123");
    expect(out).toEqual([
      { customId: "case-1", ok: true, toolInput: { decision: "apply" } },
    ]);
  });

  it("reports ok:false with the result type for a non-succeeded result", async () => {
    const results = fakeResultsStream([
      { custom_id: "case-1", result: { type: "errored" } },
    ]);
    const client = fakeClient({ results });

    const out = await collectBatchResults(client, "batch_123");

    expect(out).toEqual([{ customId: "case-1", ok: false, reason: "errored" }]);
  });

  it("reports ok:false with reason max_tokens for a truncated succeeded message", async () => {
    const results = fakeResultsStream([
      {
        custom_id: "case-1",
        result: {
          type: "succeeded",
          message: { stop_reason: "max_tokens", content: [] },
        },
      },
    ]);
    const client = fakeClient({ results });

    const out = await collectBatchResults(client, "batch_123");

    expect(out).toEqual([
      { customId: "case-1", ok: false, reason: "max_tokens" },
    ]);
  });

  it("reports ok:false with reason 'no tool_use block' when the message has none", async () => {
    const results = fakeResultsStream([
      {
        custom_id: "case-1",
        result: {
          type: "succeeded",
          message: {
            stop_reason: "end_turn",
            content: [{ type: "text", text: "oi" }],
          },
        },
      },
    ]);
    const client = fakeClient({ results });

    const out = await collectBatchResults(client, "batch_123");

    expect(out).toEqual([
      { customId: "case-1", ok: false, reason: "no tool_use block" },
    ]);
  });

  it("processes every line independently across a mixed batch", async () => {
    const results = fakeResultsStream([
      {
        custom_id: "case-1",
        result: {
          type: "succeeded",
          message: {
            stop_reason: "tool_use",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "propose_garment",
                input: { decision: "decline" },
              },
            ],
          },
        },
      },
      { custom_id: "case-2", result: { type: "expired" } },
    ]);
    const client = fakeClient({ results });

    const out = await collectBatchResults(client, "batch_123");

    expect(out).toEqual([
      { customId: "case-1", ok: true, toolInput: { decision: "decline" } },
      { customId: "case-2", ok: false, reason: "expired" },
    ]);
  });
});
