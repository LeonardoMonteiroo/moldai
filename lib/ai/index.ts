import Anthropic from "@anthropic-ai/sdk";
import type { PatternState } from "@/lib/types";
import { buildSystem } from "./prompt";
import { buildHistory } from "./history";
import { TOOL, parseRawToolInput } from "./schema";
import { resolveDecision, type AiDecision } from "./decision";

export type { AiDecision };

// #61: the SDK's own defaults (10 min timeout, 2 retries) can outlive
// TX_OPTS.timeout (lib/db/pattern.ts, 30s) — the transaction holding the
// Pattern+Wallet locks is already rolled back by the time a slow/retried
// response resolves, so the write that discovers it throws outside any
// catch. Bounding the call here keeps it inside the transaction's budget.
// Exported so index.test.ts can assert it directly, the exact precedent of
// REDIS_OPTIONS in lib/rate-limit/client.ts.
export const ANTHROPIC_OPTIONS = { timeout: 20_000, maxRetries: 1 } as const;

export async function proposeGarment(
  state: PatternState,
  answering: boolean,
): Promise<AiDecision> {
  const client = new Anthropic(ANTHROPIC_OPTIONS);
  const resp = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: buildSystem(state, answering),
    tools: [TOOL],
    tool_choice: { type: "tool", name: "propose_garment" },
    messages: buildHistory(state.chat),
  });

  // #99: a reply that hits max_tokens (routine for a token-heavy Portuguese
  // `explain` answer) comes back with a partially parsed tool_use.input —
  // decision may be truncated away entirely. Reject it here, before
  // resolveDecision ever sees the partial payload; the route's catch then
  // refunds instead of applying whatever a partial spec resolves to.
  if (resp.stop_reason === "max_tokens") {
    throw new Error("Anthropic response truncated at max_tokens");
  }

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Model did not return a tool_use block");
  }
  return resolveDecision(parseRawToolInput(block.input), answering);
}
