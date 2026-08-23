import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorState } from "@/lib/types";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  const Anthropic = vi.fn(() => ({ messages: { create } }));
  return { default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { proposeGarment, ANTHROPIC_OPTIONS } from "./index";

// shared handle for the mock (the factory reuses the same create fn)
const create = new (
  Anthropic as unknown as new () => {
    messages: { create: ReturnType<typeof vi.fn> };
  }
)().messages.create;

function toolResp(input: unknown) {
  return { content: [{ type: "tool_use", name: "propose_garment", input }] };
}

const baseState = {
  pattern: { pieces: [], spec: undefined },
  chat: [{ author: "user", text: "I want a t-shirt" }],
} as unknown as EditorState;

describe("proposeGarment", () => {
  beforeEach(() => create.mockReset());

  it("maps decision=ask with validated questions", async () => {
    create.mockResolvedValue(
      toolResp({
        decision: "ask",
        assistantMessage: "Tell me more:",
        questions: [
          { label: "Neckline", options: ["round", "V"], allowOther: true },
        ],
      }),
    );
    const d = await proposeGarment(baseState, false);
    expect(d.decision).toBe("ask");
    expect(d.questions).toHaveLength(1);
    expect(d.questions![0].id).toBe("q0");
  });

  it("degrades ask without valid questions to apply", async () => {
    create.mockResolvedValue(
      toolResp({
        decision: "ask",
        assistantMessage: "x",
        questions: [],
        spec: {
          type: "tshirt",
          gender: "male",
          style: {},
          measurementOverrides: {},
        },
      }),
    );
    const d = await proposeGarment(baseState, false);
    expect(d.decision).toBe("apply");
  });

  it("answering=true forces apply even if the AI responds ask", async () => {
    create.mockResolvedValue(
      toolResp({
        decision: "ask",
        assistantMessage: "x",
        questions: [{ label: "Neckline", options: ["a", "b"] }],
        spec: {
          type: "tshirt",
          gender: "male",
          style: {},
          measurementOverrides: {},
        },
      }),
    );
    const d = await proposeGarment(baseState, true);
    expect(d.decision).toBe("apply");
    expect(d.questions).toBeUndefined();
  });

  it("rejects apply without a spec object (route refunds via its catch)", async () => {
    create.mockResolvedValue(
      toolResp({ decision: "apply", assistantMessage: "done" }),
    );
    await expect(proposeGarment(baseState, false)).rejects.toThrow(/spec/);
  });

  // #99: a reply that hits the 1024 max_tokens ceiling (routine for a
  // token-heavy Portuguese `explain` answer) comes back with a partially
  // parsed tool_use.input — `stop_reason` is the one signal that the model
  // didn't actually finish. Reject it before resolveDecision ever sees the
  // truncated payload, so the route's catch refunds instead of applying
  // whatever partial/fabricated spec falls out of it.
  it("rejects a max_tokens-truncated response instead of resolving its partial payload", async () => {
    create.mockResolvedValue({
      ...toolResp({ decision: "apply", assistantMessage: "x" }),
      stop_reason: "max_tokens",
    });
    await expect(proposeGarment(baseState, false)).rejects.toThrow(
      /max_tokens/,
    );
  });

  // #61: the SDK's own defaults (10 min timeout, 2 retries) can outlive
  // TX_OPTS.timeout (30s) — the transaction holding the Pattern+Wallet
  // locks is already rolled back by the time a slow/retried response
  // resolves. Bounding the client here keeps the call inside that budget.
  it("bounds the Anthropic client below the 30s transaction timeout", async () => {
    create.mockResolvedValue(
      toolResp({ decision: "decline", assistantMessage: "x" }),
    );
    await proposeGarment(baseState, false);
    expect(Anthropic).toHaveBeenCalledWith(ANTHROPIC_OPTIONS);
    expect(ANTHROPIC_OPTIONS.timeout).toBeLessThan(30_000);
  });
});
