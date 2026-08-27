import { describe, it, expect } from "vitest";
import { renderWithIntl, ptBR, screen } from "@/components/test-utils";
import type { ChatMessage } from "@/lib/types";
import { ChatBubble } from "./ChatBubble";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    author: "ai",
    text: "1. Pences. 2. Ombro. 3. Cava/manga. 4. Lateral. 5. Barra.",
    createdAt: 1,
    ...overrides,
  };
}

describe("ChatBubble", () => {
  // #138: the disclaimer is catalog chrome (Decisions: "the surrounding
  // chrome and the disclaimer come from the catalog"), so it must resolve
  // against the real pt-BR value, never a substring/regex a missing key's
  // literal-key-path fallback could also satisfy.
  it("shows the AI-generated-guidance disclaimer when the message answers an assembly-order question", () => {
    renderWithIntl(<ChatBubble message={message({ assembly: true })} />);
    expect(
      screen.getByText(ptBR.ChatBubble.assemblyDisclaimer),
    ).toBeInTheDocument();
  });

  it("does not show the disclaimer on an ordinary AI reply", () => {
    renderWithIntl(<ChatBubble message={message()} />);
    expect(
      screen.queryByText(ptBR.ChatBubble.assemblyDisclaimer),
    ).not.toBeInTheDocument();
  });

  it("does not show the disclaimer on a conflict-toned reply either", () => {
    renderWithIntl(<ChatBubble message={message({ tone: "conflict" })} />);
    expect(
      screen.queryByText(ptBR.ChatBubble.assemblyDisclaimer),
    ).not.toBeInTheDocument();
  });

  it("still shows chips and text alongside the disclaimer", () => {
    renderWithIntl(
      <ChatBubble
        message={message({
          assembly: true,
          chips: [{ label: "−1 crédito", tone: "credit" }],
        })}
      />,
    );
    expect(screen.getByText("−1 crédito")).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.ChatBubble.assemblyDisclaimer),
    ).toBeInTheDocument();
  });
});
