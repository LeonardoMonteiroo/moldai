import Anthropic from "@anthropic-ai/sdk";
import type { PatternState } from "@/lib/types";
import { staticSectionsFor, buildDynamicSection } from "./prompt";
import { buildHistory, type HistoryTurn } from "./history";
import { toolFor, parseRawToolInput } from "./schema";
import { resolveDecision, type AiDecision } from "./decision";
import type { ProposeImage, ProposeOptions } from "./options";
import { engineFor, type EngineId } from "@/lib/draft/engine/capability";

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

// #261: the one repair attempt below reuses this client but overrides the
// per-call timeout down from ANTHROPIC_OPTIONS.timeout — a repair call is a
// short corrective re-ask, not a full first draft, and the two calls'
// timeouts must sum to comfortably less than TX_OPTS.timeout (30s) or a
// worst-case repair changes the failure mode from "refunded, lost turn" into
// "503, lock held for the full transaction window". 20_000 + 8_000 = 28_000,
// asserted below ANTHROPIC_OPTIONS's own bound in index.test.ts.
const REPAIR_TIMEOUT_MS = 8_000;

const DEFAULT_MAX_TOKENS = 1024;
// #261: the truncation repair raises max_tokens rather than just re-asking
// with the same ceiling -- re-issuing an unchanged 1024-token budget against
// the same request would routinely truncate identically a second time for a
// token-heavy Portuguese `explain` answer, the exact case index.ts's own
// max_tokens comment already names.
const REPAIR_MAX_TOKENS_ON_TRUNCATION = 2048;

function buildRequestParams(
  engine: EngineId,
  state: PatternState,
  opts: ProposeOptions,
  messages: Anthropic.MessageParam[],
  maxTokens: number = DEFAULT_MAX_TOKENS,
) {
  return {
    model: "claude-sonnet-5" as const,
    max_tokens: maxTokens,
    // Split system prompt: the static section (~6.2k tokens, byte-identical
    // across every user/request USING THE SAME ENGINE) carries the cache
    // breakpoint, so it's a cache hit for essentially every generate call in
    // the app rather than only within one conversation — see
    // staticSectionsFor's own comment (lib/ai/prompt.ts). buildDynamicSection
    // (current spec/size table/ease report/assembly order) genuinely changes
    // per call and stays uncached. A 1h TTL trades a slightly pricier cache
    // write for staying warm across the app's full request volume rather
    // than expiring every 5 minutes.
    system: [
      {
        type: "text" as const,
        text: staticSectionsFor(engine),
        cache_control: { type: "ephemeral" as const, ttl: "1h" as const },
      },
      {
        type: "text" as const,
        text: buildDynamicSection(state, opts),
      },
    ],
    tools: [toolFor(engine)],
    tool_choice: { type: "tool" as const, name: "propose_garment" as const },
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
// before resolveDecision ever sees the partial payload, so the caller can
// decide whether to repair or let it propagate.
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
// block's id in the very next user turn (a bare text turn there is rejected
// by the API) -- when it didn't (e.g. no tool_use block at all), there is no
// pending tool_use to resolve, so a plain text turn is used instead.
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

export async function proposeGarment(
  state: PatternState,
  opts: ProposeOptions,
): Promise<AiDecision> {
  // #267: reads the pattern's own FROZEN engine (absent -> the default) --
  // never a bare default -- so the prompt/tool never disagree with what
  // will actually draft the spec this call produces.
  const engine = engineFor(state.pattern.engine);
  const client = new Anthropic(ANTHROPIC_OPTIONS);
  const messages = withImages(buildHistory(state.chat), opts.images);

  const resp = await client.messages.create(
    buildRequestParams(engine, state, opts, messages),
  );

  try {
    const block = extractToolUse(resp);
    return resolveDecision(parseRawToolInput(block.input), opts.answering);
  } catch (err) {
    // #261: one repair attempt, mirroring Design2GarmentCode's
    // validation-feedback retry (docs/reference/design2garmentcode-spike) --
    // feed the SPECIFIC defect back and re-issue once. Never retried a
    // second time; a repeat failure propagates to the route's catch, which
    // refunds — proposeGarment runs entirely before any debit, so nothing
    // has touched the wallet either way.
    const reason = err instanceof Error ? err.message : String(err);
    const repairMessages = buildRepairMessages(messages, resp, reason);
    const repairMaxTokens =
      resp.stop_reason === "max_tokens"
        ? REPAIR_MAX_TOKENS_ON_TRUNCATION
        : DEFAULT_MAX_TOKENS;
    const repairResp = await client.messages.create(
      buildRequestParams(engine, state, opts, repairMessages, repairMaxTokens),
      { timeout: REPAIR_TIMEOUT_MS },
    );
    const repairBlock = extractToolUse(repairResp);
    return resolveDecision(
      parseRawToolInput(repairBlock.input),
      opts.answering,
    );
  }
}
