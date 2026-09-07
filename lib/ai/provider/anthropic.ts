import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmProvider,
  LlmCallOptions,
  LlmCallResult,
  LlmTurn,
  LlmImage,
  LlmUsage,
} from "./types";
import { sumUsage, LlmProposeError } from "./types";

// The ONE file in the repo that imports the Anthropic SDK as a value (a
// second file, lib/ai/schema.ts, used to import its Tool type only -- that
// coupling is gone now that LlmTool is its own structural-equivalent type).
// Ported near-verbatim from lib/ai/index.ts before the provider facade
// existed -- every comment/constant below carries the same reasoning it did
// there, just relocated.

// #61: the SDK's own defaults (10 min timeout, 2 retries) can outlive
// TX_OPTS.timeout (lib/db/pattern.ts, 30s) — the transaction holding the
// Pattern+Wallet locks is already rolled back by the time a slow/retried
// response resolves, so the write that discovers it throws outside any
// catch. Bounding the call here keeps it inside the transaction's budget.
export const ANTHROPIC_OPTIONS = { timeout: 20_000, maxRetries: 1 } as const;

// #261: the one repair attempt below reuses this client but overrides the
// per-call timeout down from ANTHROPIC_OPTIONS.timeout — a repair call is a
// short corrective re-ask, not a full first draft, and the two calls'
// timeouts must sum to comfortably less than TX_OPTS.timeout (30s) or a
// worst-case repair changes the failure mode from "refunded, lost turn" into
// "503, lock held for the full transaction window". 20_000 + 8_000 = 28_000,
// asserted below ANTHROPIC_OPTIONS's own bound in anthropic.test.ts.
const REPAIR_TIMEOUT_MS = 8_000;

// #261: the truncation repair raises max_tokens rather than just re-asking
// with the same ceiling -- re-issuing an unchanged budget against the same
// request would routinely truncate identically a second time for a
// token-heavy Portuguese `explain` answer.
const REPAIR_MAX_TOKENS_ON_TRUNCATION = 2048;

// #276: the one literal, read by buildRequestParams below AND by the
// provider's own model() -- so a caller (lib/ai/index.ts's Langfuse trace,
// scripts/ai-eval.ts's report header) reads this instead of a second,
// hand-copied "claude-sonnet-5" string.
const MODEL = "claude-sonnet-5" as const;

function withImages(
  turns: LlmTurn[],
  images: LlmImage[] | undefined,
): Anthropic.MessageParam[] {
  if (!images || images.length === 0 || turns.length === 0) return turns;
  const last = turns[turns.length - 1];
  if (last.role !== "user") return turns;
  return [
    ...turns.slice(0, -1),
    {
      role: "user",
      content: [
        ...images.map((image) => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: image.mediaType,
            data: image.base64,
          },
        })),
        { type: "text" as const, text: last.content },
      ],
    },
  ];
}

// #269 Fase 5 (dataset): exported so scripts/lib/ai/training/batch.ts can
// submit the SAME request shape (model, cache_control'd static block, tool,
// forced tool_choice) to the Batch API instead of a live `messages.create`
// call -- a faithful reuse of this facade's own request-building, never a
// second, hand-rolled copy of it (the "never a second copy of a fact that
// already has an owner" rule, applied to a request shape instead of a
// database column). Only the transport differs; parsing the result still
// goes through parseRawToolInput/resolveDecision exactly as a live call
// does.
export function buildRequestParams(
  opts: LlmCallOptions,
  messages: Anthropic.MessageParam[],
  maxTokens: number,
) {
  return {
    model: MODEL,
    max_tokens: maxTokens,
    // A 1h TTL trades a slightly pricier cache write for staying warm
    // across the app's full request volume rather than expiring every 5
    // minutes (lib/ai/prompt.ts's staticSectionsFor is byte-identical
    // across every request using the same engine).
    system: [
      {
        type: "text" as const,
        text: opts.systemStatic,
        cache_control: { type: "ephemeral" as const, ttl: "1h" as const },
      },
      { type: "text" as const, text: opts.systemDynamic },
    ],
    tools: [opts.tool as unknown as Anthropic.Tool],
    tool_choice: { type: "tool" as const, name: opts.toolChoice },
    messages,
  };
}

type ToolUseBlock = Extract<
  Anthropic.Message["content"][number],
  { type: "tool_use" }
>;

function findToolUse(resp: Anthropic.Message): ToolUseBlock | undefined {
  const block = resp.content.find((b) => b.type === "tool_use");
  return block && block.type === "tool_use" ? block : undefined;
}

// #99/#261: a reply that hits max_tokens (routine for a token-heavy
// Portuguese `explain` answer) comes back with a partially parsed
// tool_use.input — decision may be truncated away entirely. Reject it here,
// before resolveDecision ever sees the partial payload.
function extractToolUse(resp: Anthropic.Message): ToolUseBlock {
  if (resp.stop_reason === "max_tokens") {
    throw new Error("Anthropic response truncated at max_tokens");
  }
  const block = findToolUse(resp);
  if (!block) {
    throw new Error("Model did not return a tool_use block");
  }
  return block;
}

// #261: replays the failed attempt as its own assistant turn, then tells the
// model exactly what was wrong with it. When that attempt DID produce a
// tool_use block, the Messages API requires a tool_result addressed to that
// block's id in the very next user turn -- when it didn't, a plain text turn
// is used instead.
function buildRepairMessages(
  messages: Anthropic.MessageParam[],
  resp: Anthropic.Message,
  reason: string,
): Anthropic.MessageParam[] {
  const block = findToolUse(resp);
  const feedback = `Invalid propose_garment call: ${reason}. Call propose_garment again, fixing exactly that.`;
  return [
    ...messages,
    { role: "assistant", content: resp.content },
    {
      role: "user",
      content: block
        ? [
            {
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: feedback,
            },
          ]
        : feedback,
    },
  ];
}

// #276: reads whatever the SDK actually returned, tolerant of a mock
// response that omits `usage` entirely (every existing anthropic.test.ts
// fixture does) -- undefined in, undefined out, never a fabricated 0.
function toUsage(
  usage: Anthropic.Message["usage"] | undefined,
): LlmUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens ?? undefined,
    outputTokens: usage.output_tokens,
  };
}

async function propose(opts: LlmCallOptions): Promise<LlmCallResult> {
  const client = new Anthropic(ANTHROPIC_OPTIONS);
  const messages = withImages(opts.messages, opts.images);

  const resp = await client.messages.create(
    buildRequestParams(opts, messages, opts.maxTokens),
  );

  try {
    const block = extractToolUse(resp);
    return {
      toolInput: block.input,
      usage: toUsage(resp.usage),
      repaired: false,
    };
  } catch (err) {
    // #261: one repair attempt, never a second -- a repeat failure
    // propagates to the caller (index.ts), whose caller (the generate
    // route) refunds, exactly as a first-attempt failure would.
    const reason = err instanceof Error ? err.message : String(err);
    const repairMessages = buildRepairMessages(messages, resp, reason);
    const repairMaxTokens =
      resp.stop_reason === "max_tokens"
        ? REPAIR_MAX_TOKENS_ON_TRUNCATION
        : opts.maxTokens;
    let repairResp: Anthropic.Message;
    try {
      repairResp = await client.messages.create(
        buildRequestParams(opts, repairMessages, repairMaxTokens),
        { timeout: REPAIR_TIMEOUT_MS },
      );
    } catch (repairErr) {
      // #276: the repair call itself failed (e.g. a network/timeout error)
      // before any repair response came back -- only the first attempt's
      // usage is known, but that attempt was still a real, billed call, so
      // it travels on the thrown error rather than being silently lost.
      throw new LlmProposeError(
        repairErr instanceof Error ? repairErr.message : String(repairErr),
        { usage: toUsage(resp.usage), repaired: true },
      );
    }
    try {
      const repairBlock = extractToolUse(repairResp);
      return {
        toolInput: repairBlock.input,
        // #276: both attempts are real, billed calls -- the repair's own
        // usage alone would understate what this propose() call actually
        // cost.
        usage: sumUsage(toUsage(resp.usage), toUsage(repairResp.usage)),
        repaired: true,
      };
    } catch (extractErr) {
      // #261/#276: the repair attempt ALSO failed to yield a usable tool
      // call -- propagates to the caller exactly as before (one repair
      // attempt, never a second), but both attempts were still real, billed
      // calls, so their combined usage travels on the thrown error instead
      // of the Langfuse trace silently recording usage: undefined for two
      // charged requests.
      throw new LlmProposeError(
        extractErr instanceof Error ? extractErr.message : String(extractErr),
        {
          usage: sumUsage(toUsage(resp.usage), toUsage(repairResp.usage)),
          repaired: true,
        },
      );
    }
  }
}

export const anthropicProvider: LlmProvider = {
  id: "anthropic",
  model: () => MODEL,
  propose,
};
