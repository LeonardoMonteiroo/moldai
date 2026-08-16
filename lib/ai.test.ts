import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorState } from "./types";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  const Anthropic = vi.fn(() => ({ messages: { create } }));
  return { default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { proposeGarment } from "./ai";

// handle compartilhado do mock (a factory reusa a mesma fn create)
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
  chat: [{ author: "user", text: "quero uma camiseta" }],
} as unknown as EditorState;

describe("proposeGarment", () => {
  beforeEach(() => create.mockReset());

  it("mapeia decision=ask com perguntas validadas", async () => {
    create.mockResolvedValue(
      toolResp({
        decision: "ask",
        assistantMessage: "Me conta mais:",
        questions: [
          { label: "Gola", options: ["redonda", "V"], allowOther: true },
        ],
      }),
    );
    const d = await proposeGarment(baseState, false);
    expect(d.decision).toBe("ask");
    expect(d.questions).toHaveLength(1);
    expect(d.questions![0].id).toBe("q0");
  });

  it("degrada ask sem perguntas válidas para apply", async () => {
    create.mockResolvedValue(
      toolResp({
        decision: "ask",
        assistantMessage: "x",
        questions: [],
        spec: {
          tipo: "camiseta",
          sexo: "masc",
          style: {},
          measurementOverrides: {},
        },
      }),
    );
    const d = await proposeGarment(baseState, false);
    expect(d.decision).toBe("apply");
  });

  it("answering=true força apply mesmo se a IA responder ask", async () => {
    create.mockResolvedValue(
      toolResp({
        decision: "ask",
        assistantMessage: "x",
        questions: [{ label: "Gola", options: ["a", "b"] }],
      }),
    );
    const d = await proposeGarment(baseState, true);
    expect(d.decision).toBe("apply");
    expect(d.questions).toBeUndefined();
  });
});
