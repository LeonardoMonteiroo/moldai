import { describe, it, expect } from "vitest";
import { buildHistory } from "./history";
import type { ChatMessage } from "@/lib/types";

let seq = 0;
function msg(
  author: "user" | "ai",
  text: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  seq += 1;
  return { id: `m${seq}`, author, text, createdAt: seq, ...extra };
}

describe("buildHistory", () => {
  it("maps authors to API roles", () => {
    const h = buildHistory([msg("user", "a t-shirt"), msg("ai", "done")]);
    expect(h).toEqual([
      { role: "user", content: "a t-shirt" },
      { role: "assistant", content: "done" },
    ]);
  });

  it("serializes an ai turn's questions into its content", () => {
    const h = buildHistory([
      msg("user", "a blouse"),
      msg("ai", "Tell me:", {
        questions: [
          {
            id: "q0",
            label: "Neckline",
            options: ["round", "V"],
            allowOther: false,
          },
        ],
      }),
      msg("user", "round"),
    ]);
    expect(h[1].content).toBe("Tell me:\n- Neckline: round | V");
  });

  it("merges consecutive same-role turns (error-orphaned user message)", () => {
    const h = buildHistory([
      msg("user", "a dress"),
      msg("user", "a long dress"),
    ]);
    expect(h).toEqual([{ role: "user", content: "a dress\n\na long dress" }]);
  });

  it("drops a leading assistant turn so history starts with user", () => {
    const h = buildHistory([msg("ai", "done"), msg("user", "shorter")]);
    expect(h).toEqual([{ role: "user", content: "shorter" }]);
  });

  it("keeps only the last 10 messages", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "ai", `t${i}`),
    );
    const h = buildHistory(many);
    expect(h).toHaveLength(10);
    expect(h[0]).toEqual({ role: "user", content: "t2" });
  });

  it("skips blank messages", () => {
    const h = buildHistory([msg("user", "hi"), msg("ai", "  ")]);
    expect(h).toEqual([{ role: "user", content: "hi" }]);
  });
});
