import { reportError } from "./report";
import type { SpecAdjustment } from "@/lib/draft/specAdjustments";

/**
 * #276: traces every `propose()` call (the provider facade,
 * lib/ai/provider/*) to Langfuse -- model, provider, token usage, latency,
 * and whether the one-repair-retry (#261) fired. Mirrors sentry.ts's own
 * shape on purpose: "@sentry/nextjs" there and "langfuse" here are both
 * dynamically imported, gated behind a config check, so an environment that
 * never sets LANGFUSE_SECRET_KEY/LANGFUSE_PUBLIC_KEY (every test run, and
 * any deploy that hasn't opted in) never even loads the SDK, not just
 * "never calls it".
 *
 * Fire-and-forget by construction: `traceProposeGarment` is synchronous and
 * never returns a Promise the caller could accidentally await. The real
 * network work happens inside an un-awaited internal async function, the
 * same shape forwardToSentry (./sentry.ts) already uses -- lib/ai/index.ts's
 * proposeGarment calls this from a `finally` block without awaiting it, so
 * this never adds an await inside withPatternAndWallet's 30s transaction
 * window (lib/db/pattern-wallet.ts), which already spends most of that
 * budget on the AI call itself.
 */

export type LlmTraceSource = "app" | "eval";

export interface LlmTraceUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmTraceContent {
  // Only ever populated by the caller when isTraceContentEnabled() -- never
  // constructed otherwise. Chat text is user personal data (LGPD); this
  // stays off by default. Attached reference photos (ProposeOptions.images)
  // are NEVER included here regardless of this flag -- only their prompt
  // text travels, never image binaries.
  systemDynamic?: string;
  messages?: { role: string; content: string }[];
  assistantMessage?: string;
}

export interface LlmCallTrace {
  provider: string;
  model: string;
  source: LlmTraceSource;
  /** The resolved decision ("apply"/"ask"/"decline"/"explain"), absent when propose() itself threw. */
  decision?: string;
  startedAt: number;
  finishedAt: number;
  repaired: boolean;
  usage?: LlmTraceUsage;
  // #250: every substitution/clamp validateSpec made, unfiltered -- never
  // personal data (field names and enum/numeric values only), so this is
  // always attached regardless of LANGFUSE_TRACE_CONTENT.
  adjustments?: SpecAdjustment[];
  error?: string;
  content?: LlmTraceContent;
}

function isLangfuseConfigured(): boolean {
  return Boolean(
    process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY,
  );
}

/**
 * The LGPD opt-in gate: callers must check this BEFORE building
 * `LlmCallTrace.content` at all, not merely before reading it here -- see
 * lib/ai/index.ts, the only real caller.
 */
export function isTraceContentEnabled(): boolean {
  return process.env.LANGFUSE_TRACE_CONTENT === "true";
}

export function traceProposeGarment(trace: LlmCallTrace): void {
  if (!isLangfuseConfigured()) return;
  void send();

  async function send(): Promise<void> {
    try {
      // Imported fresh (never cached in a module-level client) on every
      // call, the same "dynamic import, gated, never at top level" shape
      // forwardToSentry (./sentry.ts) uses -- one trace per propose() call
      // is not a hot enough path for a persistent client to matter, and
      // flushAsync() below is called immediately after anyway.
      const { Langfuse } = await import("langfuse");
      const langfuse = new Langfuse({
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL,
      });
      const t = langfuse.trace({
        name: "propose_garment",
        // #276 AC: npm run eval:ai runs must be distinguishable from the
        // generate route's real production traffic -- "app"/"eval" plus the
        // provider id, so an eval run against LLM_PROVIDER=local is tagged
        // distinctly from a production Anthropic call too.
        tags: [trace.source, trace.provider],
        input: trace.content?.messages,
        output: trace.content?.assistantMessage,
        metadata: {
          decision: trace.decision,
          repaired: trace.repaired,
          adjustments: trace.adjustments,
        },
      });
      t.generation({
        name: "propose_garment",
        model: trace.model,
        startTime: new Date(trace.startedAt),
        endTime: new Date(trace.finishedAt),
        input: trace.content?.systemDynamic,
        output: trace.content?.assistantMessage,
        usage: trace.usage
          ? {
              input: trace.usage.inputTokens,
              output: trace.usage.outputTokens,
              unit: "TOKENS",
            }
          : undefined,
        level: trace.error ? "ERROR" : "DEFAULT",
        statusMessage: trace.error,
      });
      await langfuse.flushAsync();
    } catch (err) {
      // Best-effort, exactly like forwardToSentry's own catch: a broken or
      // unreachable Langfuse endpoint must never be the reason a generation
      // fails, slows down, or throws past this fire-and-forget boundary.
      reportError("langfuse-trace", err);
    }
  }
}
