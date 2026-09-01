import Anthropic from "@anthropic-ai/sdk";
import type { PatternState } from "@/lib/types";
import type { ImageMediaType } from "@/lib/editor/attachment";
import { STATIC_SECTIONS, buildDynamicSection } from "./prompt";
import { buildHistory, type HistoryTurn } from "./history";
import { TOOL, parseRawToolInput } from "./schema";
import { resolveDecision, type AiDecision } from "./decision";

export type { AiDecision };

// #18: the prepared (already downscaled/re-encoded) attachment proposeGarment
// forwards to the model, one image content block per generate call -- never
// persisted, see lib/editor/attachment.ts.
export interface ProposeImage {
  mediaType: ImageMediaType;
  base64: string;
}

// Attaches `image` to the FINAL turn's content, converting it from a plain
// string to the Messages API's content-block-array form. buildHistory stays
// pure/text-only on purpose (see history.ts) -- this is the one place that
// needs to know about images, and it runs after buildHistory has already
// normalized roles/merging. The final turn is always "user": the route
// appends the new user message to state.chat before calling proposeGarment,
// so it is always the last chat entry buildHistory sees.
function withImage(
  turns: HistoryTurn[],
  image: ProposeImage | undefined,
): Anthropic.MessageParam[] {
  if (!image || turns.length === 0) return turns;
  const last = turns[turns.length - 1];
  if (last.role !== "user") return turns;
  return [
    ...turns.slice(0, -1),
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: image.mediaType,
            data: image.base64,
          },
        },
        { type: "text", text: last.content },
      ],
    },
  ];
}

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
  image?: ProposeImage,
  importContext?: string,
): Promise<AiDecision> {
  const client = new Anthropic(ANTHROPIC_OPTIONS);
  const resp = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    // Split system prompt: STATIC_SECTIONS (~6.2k tokens, byte-identical
    // across every user/request) carries the cache breakpoint, so it's a
    // cache hit for essentially every generate call in the app rather than
    // only within one conversation — see STATIC_SECTIONS's own comment.
    // buildDynamicSection (current spec/size table/ease report/assembly
    // order) genuinely changes per call and stays uncached. A 1h TTL trades
    // a slightly pricier cache write for staying warm across the app's full
    // request volume rather than expiring every 5 minutes.
    system: [
      {
        type: "text",
        text: STATIC_SECTIONS,
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
      {
        type: "text",
        text: buildDynamicSection(state, answering, importContext),
      },
    ],
    tools: [TOOL],
    tool_choice: { type: "tool", name: "propose_garment" },
    messages: withImage(buildHistory(state.chat), image),
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
