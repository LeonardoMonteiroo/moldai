import Anthropic from "@anthropic-ai/sdk";
import { buildRequestParams } from "@/lib/ai/provider/anthropic";
import type { LlmCallOptions } from "@/lib/ai/provider/types";

// #269 Fase 5 (dataset): Batch API submit -> poll -> collect, at half the
// per-token price of a live call (docs/decisions/ai-provider.md's own cost
// framing for this generator: verification is the irreducible spend, and
// latency is irrelevant for an offline bulk generation run). Deliberately
// NOT registered as an LlmProvider (lib/ai/provider/types.ts) -- that
// contract is a single `propose(): Promise<LlmCallResult>` request/response,
// and a submit/poll/collect cycle across up to 24h is not that shape;
// pretending it is would misrepresent what the facade promises to every
// other caller.
//
// Reuses `buildRequestParams` from lib/ai/provider/anthropic.ts verbatim --
// same model, same cache_control'd static system block, same tool, same
// forced tool_choice as a live call. Only the transport differs.

export interface BatchJobRequest {
  customId: string;
  opts: LlmCallOptions;
}

export interface BatchResultOk {
  customId: string;
  ok: true;
  toolInput: unknown;
}

export interface BatchResultErr {
  customId: string;
  ok: false;
  reason: string;
}

export type BatchResult = BatchResultOk | BatchResultErr;

function toRequestParam(
  job: BatchJobRequest,
): Anthropic.Messages.Batches.BatchCreateParams.Request {
  // Training generation never attaches images -- LlmTurn's shape
  // ({role, content: string}) is already structurally identical to
  // Anthropic.MessageParam for a plain-text turn, the same identity
  // conversion lib/ai/provider/anthropic.ts's own withImages performs when
  // no images are given.
  const messages = job.opts.messages as unknown as Anthropic.MessageParam[];
  const params = buildRequestParams(job.opts, messages, job.opts.maxTokens);
  return {
    custom_id: job.customId,
    params: params as unknown as Anthropic.MessageCreateParamsNonStreaming,
  };
}

/** Submits one batch job. Anthropic caps a single batch at 100,000 requests -- well above this generator's ~1,000-phrase budget, so no chunking is implemented. */
export async function submitBatch(
  client: Anthropic,
  requests: BatchJobRequest[],
): Promise<string> {
  const batch = await client.messages.batches.create({
    requests: requests.map(toRequestParam),
  });
  return batch.id;
}

export interface BatchStatus {
  id: string;
  processingStatus: Anthropic.Messages.Batches.MessageBatch["processing_status"];
  counts: Anthropic.Messages.Batches.MessageBatchRequestCounts;
}

export async function getBatchStatus(
  client: Anthropic,
  batchId: string,
): Promise<BatchStatus> {
  const batch = await client.messages.batches.retrieve(batchId);
  return {
    id: batch.id,
    processingStatus: batch.processing_status,
    counts: batch.request_counts,
  };
}

/**
 * Polls until the batch's `processing_status` is "ended". `onTick` is
 * called after every poll so a long-running CLI run can report progress
 * without this module knowing anything about console output.
 */
export async function pollBatchUntilDone(
  client: Anthropic,
  batchId: string,
  opts: { intervalMs?: number; onTick?: (status: BatchStatus) => void } = {},
): Promise<BatchStatus> {
  const intervalMs = opts.intervalMs ?? 30_000;
  for (;;) {
    const status = await getBatchStatus(client, batchId);
    opts.onTick?.(status);
    if (status.processingStatus === "ended") return status;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function findToolUse(
  message: Anthropic.Message,
): Anthropic.Messages.ToolUseBlock | undefined {
  const block = message.content.find((b) => b.type === "tool_use");
  return block && block.type === "tool_use" ? block : undefined;
}

/**
 * Reads every result line for a finished batch. Unlike the live provider
 * (lib/ai/provider/anthropic.ts), there is no repair-retry here -- a
 * malformed/truncated/errored result is reported as `ok: false` and the
 * caller (scripts/generate-training-data.ts) re-queues it in a fresh batch
 * rather than this module attempting a same-batch fixup the API doesn't
 * support.
 */
export async function collectBatchResults(
  client: Anthropic,
  batchId: string,
): Promise<BatchResult[]> {
  const out: BatchResult[] = [];
  const lines = await client.messages.batches.results(batchId);
  for await (const line of lines) {
    const { custom_id: customId, result } = line;
    if (result.type !== "succeeded") {
      out.push({ customId, ok: false, reason: result.type });
      continue;
    }
    const message = result.message;
    if (message.stop_reason === "max_tokens") {
      out.push({ customId, ok: false, reason: "max_tokens" });
      continue;
    }
    const block = findToolUse(message);
    if (!block) {
      out.push({ customId, ok: false, reason: "no tool_use block" });
      continue;
    }
    out.push({ customId, ok: true, toolInput: block.input });
  }
  return out;
}
