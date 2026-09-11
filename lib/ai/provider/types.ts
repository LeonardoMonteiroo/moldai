import type { ImageMediaType } from "@/lib/editor/attachment";

// The provider facade -- mirrors lib/draft/engine/{types,facade,registry}.ts
// on purpose (docs/architecture/drafting.md's own justification for that
// abstraction applies here too: in-repo scoring via the eval harness
// (lib/ai/eval/), a stated contract, and a per-request choice via
// LLM_PROVIDER). Everything in this file is neutral: a self-hosted
// OpenAI-compatible endpoint and Anthropic must both be expressible in it.
//
// The one-repair-retry loop (#261) lives INSIDE each provider's propose(),
// not here -- the repair protocol is provider-specific (Anthropic answers a
// failed tool_use with a tool_result addressed to its own id; an
// OpenAI-compatible API instead appends a "tool" role message), so forcing
// it through one neutral shape would either lose fidelity or leak provider
// detail back into this file. Mirrors DraftingEngine.draft() in
// lib/draft/engine/types.ts: one method IS the provider's whole job.

export interface LlmImage {
  mediaType: ImageMediaType;
  base64: string;
}

export interface LlmTurn {
  role: "user" | "assistant";
  content: string;
}

// Byte-shape-identical to the Anthropic SDK's own Tool type on purpose:
// lib/ai/prompt.test.ts pins a sha256 of
// `JSON.stringify(toolFor("moldai"))` -- renaming `input_schema` here would
// change that hash even though nothing about the PROMPT or SCHEMA changed.
export interface LlmTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmCallOptions {
  /** The cacheable, byte-identical-per-engine system prefix. */
  systemStatic: string;
  /** The per-request system suffix -- never cached. */
  systemDynamic: string;
  tool: LlmTool;
  /** The tool's own name -- every call forces exactly this one tool. */
  toolChoice: string;
  messages: LlmTurn[];
  /** Attached to the final (user) turn, in order, ahead of its text. */
  images?: LlmImage[];
  maxTokens: number;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmCallResult {
  /** The propose_garment tool call's raw input -- still untrusted. */
  toolInput: unknown;
  // #276: token usage for whichever call(s) actually happened -- summed
  // across the first attempt and the repair attempt when one fired, since
  // both are real, billed API calls. Optional so every existing bare-object
  // provider mock/test (index.test.ts, anthropic.test.ts, openaiCompat.test.ts)
  // keeps typechecking without also having to fabricate a usage figure.
  usage?: LlmUsage;
  // #276/#261: whether the one-repair-retry fired for this call. Optional
  // for the same reason as usage above; lib/ai/index.ts treats an absent
  // value as false when it builds the Langfuse trace.
  repaired?: boolean;
}

export interface LlmProvider {
  id: string;
  /**
   * The underlying model identifier this provider is currently configured to
   * call. A function, not a static field: openaiCompatProvider resolves it
   * from LLM_MODEL at call time (mirrors getProvider() itself reading
   * LLM_PROVIDER at call time), so a snapshot taken at module load could go
   * stale. #252's eval harness report header reads this instead of a second,
   * hand-copied literal, and lib/ai/index.ts (#276) reads it to label the
   * Langfuse trace with the model that actually answered the call.
   */
  model(): string;
  propose(opts: LlmCallOptions): Promise<LlmCallResult>;
}

// #276: both providers sum first-attempt + repair-attempt token usage
// identically (both are real, billed calls) -- shared here instead of
// duplicated in anthropic.ts and openaiCompat.ts, so a future change to the
// summing rule can't drift between them unnoticed.
export function sumUsage(
  a: LlmUsage | undefined,
  b: LlmUsage | undefined,
): LlmUsage | undefined {
  if (!a && !b) return undefined;
  return {
    inputTokens: (a?.inputTokens ?? 0) + (b?.inputTokens ?? 0),
    outputTokens: (a?.outputTokens ?? 0) + (b?.outputTokens ?? 0),
  };
}

// #276: thrown instead of a plain Error when the ONE repair attempt (#261)
// itself also fails to yield a usable tool call -- both attempts are still
// real, billed API calls, so their usage must not be silently lost just
// because propose() ends up throwing rather than returning. lib/ai/index.ts's
// catch block reads `usage`/`repaired` off this type (when present) to keep
// the Langfuse trace honest on this failure path; every other thrown error
// (e.g. a network failure before any response came back) carries no usage,
// exactly as before.
export class LlmProposeError extends Error {
  usage?: LlmUsage;
  repaired: boolean;

  constructor(
    message: string,
    opts?: { usage?: LlmUsage; repaired?: boolean },
  ) {
    super(message);
    this.name = "LlmProposeError";
    this.usage = opts?.usage;
    this.repaired = opts?.repaired ?? false;
  }
}
