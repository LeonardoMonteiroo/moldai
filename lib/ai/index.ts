import Anthropic from "@anthropic-ai/sdk";
import type { PatternState } from "@/lib/types";
import { STATIC_SECTIONS, buildDynamicSection } from "./prompt";
import { buildHistory, type HistoryTurn } from "./history";
import { TOOL, parseRawToolInput } from "./schema";
import { resolveDecision, type AiDecision } from "./decision";
import type { ProposeImage, ProposeOptions } from "./options";

// ProposeImage was declared here before ProposeOptions needed it too (see
// options.ts on the cycle) -- re-exported so no importer has to know it
// moved.
export type { AiDecision, ProposeImage, ProposeOptions };

// Attaches every image in `images` to the FINAL turn's content, in the order
// received and ahead of that turn's text, converting the content from a plain
// string to the Messages API's content-block-array form. buildHistory stays
// pure/text-only on purpose (see history.ts) -- this is the one place that
// needs to know about images, and it runs after buildHistory has already
// normalized roles/merging.
//
// The final turn is always "user" in practice: the route appends the new user
// message to state.chat before calling proposeGarment, so it is always the
// last chat entry buildHistory sees. The role guard is therefore unreachable
// today, but it silently DROPS the attachments rather than mis-attaching them
// to an assistant turn, and with N images that loss is bigger than it was
// with one. Kept as-is and pinned by its own test, so a future buildHistory
// change that can leave an assistant turn last fails loudly instead of
// quietly discarding the user's reference photos.
function withImages(
  turns: HistoryTurn[],
  images: ProposeImage[] | undefined,
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
  opts: ProposeOptions,
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
        text: buildDynamicSection(state, opts),
      },
    ],
    tools: [TOOL],
    tool_choice: { type: "tool", name: "propose_garment" },
    messages: withImages(buildHistory(state.chat), opts.images),
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
  return resolveDecision(parseRawToolInput(block.input), opts.answering);
}
