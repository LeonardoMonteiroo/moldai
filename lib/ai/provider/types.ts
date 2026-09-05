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

export interface LlmCallResult {
  /** The propose_garment tool call's raw input -- still untrusted. */
  toolInput: unknown;
}

export interface LlmProvider {
  id: string;
  propose(opts: LlmCallOptions): Promise<LlmCallResult>;
}
