import Anthropic from "@anthropic-ai/sdk";
import type { PatternState } from "@/lib/types";
import { buildSystem } from "./prompt";
import { buildHistory } from "./history";
import { TOOL, type RawToolInput } from "./schema";
import { resolveDecision, type AiDecision } from "./decision";

export type { AiDecision };

export async function proposeGarment(
  state: PatternState,
  answering: boolean,
): Promise<AiDecision> {
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: buildSystem(state, answering),
    tools: [TOOL],
    tool_choice: { type: "tool", name: "propose_garment" },
    messages: buildHistory(state.chat),
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Model did not return a tool_use block");
  }
  return resolveDecision(block.input as RawToolInput, answering);
}
