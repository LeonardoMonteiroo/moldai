import type {
  LlmProvider,
  LlmCallOptions,
  LlmCallResult,
  LlmTurn,
  LlmImage,
  LlmUsage,
} from "./types";
import { sumUsage, LlmProposeError } from "./types";

// The self-hosted path: talks to any OpenAI Chat Completions-compatible
// server (vLLM's own `--enable-prefix-caching`, or a wider gateway) over
// plain fetch -- no SDK dependency, the same reason lib/billing/stripe.ts's
// own precedent comment (lib/ai/index.ts, before the provider facade) says
// "one file per external SDK": this one has none, on purpose, since adding
// the `openai` package just for one endpoint shape would be a second way to
// do the exact same POST lib/ai/provider/anthropic.ts already knows how to
// make.
//
// #269-equivalent constraint carried over from the Anthropic provider: the
// forced tool call must be STRUCTURALLY guaranteed, not merely requested --
// vLLM's own grammar-constrained decoding (`--guided-decoding-backend
// xgrammar`, a server-side flag, see docker-compose.gpu.yml) is what makes
// `tool_choice` here as reliable as Anthropic's forced tool_choice. Without
// it, a self-hosted model's malformed JSON would cost a repair attempt (or a
// refund) on every call, defeating the entire point of a facade.

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[] | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatCompletionResponse {
  choices: {
    finish_reason: string;
    message: ChatMessage;
  }[];
  // #276: OpenAI Chat Completions' own usage shape -- optional because a
  // fixture (openaiCompat.test.ts) that predates this field must keep
  // typechecking and parsing without one.
  usage?: { prompt_tokens: number; completion_tokens: number };
}

function imageDataUri(image: LlmImage): string {
  return `data:${image.mediaType};base64,${image.base64}`;
}

function toContentParts(
  text: string,
  images: LlmImage[] | undefined,
): ChatContentPart[] {
  return [
    ...(images ?? []).map((image): ChatContentPart => ({
      type: "image_url",
      image_url: { url: imageDataUri(image) },
    })),
    { type: "text", text },
  ];
}

function withImages(
  turns: LlmTurn[],
  images: LlmImage[] | undefined,
): ChatMessage[] {
  const base: ChatMessage[] = turns.map((t) => ({
    role: t.role,
    content: t.content,
  }));
  if (!images || images.length === 0 || base.length === 0) return base;
  const last = base[base.length - 1];
  if (last.role !== "user" || typeof last.content !== "string") return base;
  return [
    ...base.slice(0, -1),
    { role: "user", content: toContentParts(last.content, images) },
  ];
}

function baseUrl(): string {
  return process.env.LLM_BASE_URL ?? "http://localhost:8000/v1";
}

function apiKey(): string {
  return process.env.LLM_API_KEY ?? "not-needed";
}

function model(): string {
  return process.env.LLM_MODEL ?? "local-model";
}

async function chatCompletion(
  messages: ChatMessage[],
  opts: LlmCallOptions,
  maxTokens: number,
  timeoutMs: number,
): Promise<ChatCompletionResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({
        model: model(),
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content: opts.systemStatic + "\n\n" + opts.systemDynamic,
          },
          ...messages,
        ],
        tools: [
          {
            type: "function",
            function: {
              name: opts.tool.name,
              description: opts.tool.description,
              parameters: opts.tool.input_schema,
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: opts.toolChoice },
        },
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(
        `local LLM endpoint returned ${resp.status}: ${await resp.text()}`,
      );
    }
    return (await resp.json()) as ChatCompletionResponse;
  } finally {
    clearTimeout(timer);
  }
}

function extractToolCall(resp: ChatCompletionResponse): ChatToolCall {
  const choice = resp.choices[0];
  if (choice.finish_reason === "length") {
    throw new Error("local LLM response truncated at max_tokens");
  }
  const call = choice.message.tool_calls?.[0];
  if (!call) {
    throw new Error("Model did not return a tool call");
  }
  return call;
}

function parseArguments(call: ChatToolCall): unknown {
  try {
    return JSON.parse(call.function.arguments);
  } catch {
    throw new Error("Model's tool call arguments were not valid JSON");
  }
}

// The OpenAI tool-calling protocol's own repair shape: replay the failed
// assistant turn (with its tool_calls) verbatim, then answer it with a
// "tool" role message addressed to the SAME tool_call_id -- the direct
// analogue of Anthropic's tool_result, just a different role name.
function buildRepairMessages(
  messages: ChatMessage[],
  choice: ChatCompletionResponse["choices"][0],
  reason: string,
): ChatMessage[] {
  const call = choice.message.tool_calls?.[0];
  const feedback = `Invalid ${call?.function.name ?? "tool"} call: ${reason}. Call it again, fixing exactly that.`;
  if (!call) {
    return [...messages, { role: "user", content: feedback }];
  }
  return [
    ...messages,
    {
      role: "assistant",
      content: choice.message.content,
      tool_calls: choice.message.tool_calls,
    },
    { role: "tool", tool_call_id: call.id, content: feedback },
  ];
}

const DEFAULT_TIMEOUT_MS = 60_000; // a local model is expected to be slower
const REPAIR_TIMEOUT_MS = 20_000;
const REPAIR_MAX_TOKENS_ON_TRUNCATION = 2048;

// #276: tolerant of a mock response with no `usage` field (every existing
// openaiCompat.test.ts fixture) -- undefined in, undefined out.
function toUsage(usage: ChatCompletionResponse["usage"]): LlmUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
  };
}

async function propose(opts: LlmCallOptions): Promise<LlmCallResult> {
  const messages = withImages(opts.messages, opts.images);
  const resp = await chatCompletion(
    messages,
    opts,
    opts.maxTokens,
    DEFAULT_TIMEOUT_MS,
  );

  try {
    const call = extractToolCall(resp);
    return {
      toolInput: parseArguments(call),
      usage: toUsage(resp.usage),
      repaired: false,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const repairMessages = buildRepairMessages(
      messages,
      resp.choices[0],
      reason,
    );
    const repairMaxTokens =
      resp.choices[0].finish_reason === "length"
        ? REPAIR_MAX_TOKENS_ON_TRUNCATION
        : opts.maxTokens;
    let repairResp: ChatCompletionResponse;
    try {
      repairResp = await chatCompletion(
        repairMessages,
        opts,
        repairMaxTokens,
        REPAIR_TIMEOUT_MS,
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
      const repairCall = extractToolCall(repairResp);
      return {
        toolInput: parseArguments(repairCall),
        // #276: both attempts are real calls -- summed the same way the
        // Anthropic provider sums its own first-attempt + repair usage.
        usage: sumUsage(toUsage(resp.usage), toUsage(repairResp.usage)),
        repaired: true,
      };
    } catch (extractErr) {
      // #261/#276: the repair attempt ALSO failed to yield a usable tool
      // call -- propagates to the caller exactly as before (one repair
      // attempt, never a second), but both attempts were still real calls,
      // so their combined usage travels on the thrown error instead of the
      // Langfuse trace silently recording usage: undefined for two charged
      // requests.
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

export const openaiCompatProvider: LlmProvider = {
  id: "local",
  model,
  propose,
};
