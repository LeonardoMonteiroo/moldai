import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorState } from "./types";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  const Anthropic = vi.fn(() => ({ messages: { create } }));
  return { default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { proposeGarment } from "./ai";

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
      }),
    );
    const d = await proposeGarment(baseState, true);
    expect(d.decision).toBe("apply");
    expect(d.questions).toBeUndefined();
  });
});
