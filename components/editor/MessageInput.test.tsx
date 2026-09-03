import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  translatorFor,
} from "@/components/test-utils";
import { MessageInput } from "./MessageInput";
import { MAX_CHAT_MESSAGE_LENGTH, COSTS } from "@/lib/types";

// #106: mocked the same way as PlanSection.test.tsx -- a shallow, mutable
// copy of COSTS lets these tests force each plural boundary (0, 1, 2)
// through the real cost the component reads.
vi.mock("@/lib/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/types")>();
  return { ...actual, COSTS: { ...actual.COSTS } };
});

describe("MessageInput", () => {
  // The app's primary interaction is describing a garment; a single-line
  // <input> scrolled a long description sideways with no way to see it.
  it("is a multi-line field", () => {
    renderWithIntl(
      <MessageInput
        disabled={false}
        attachment={null}
        onAttachmentChange={() => {}}
        onSend={vi.fn()}
      />,
    );
    expect(
      screen.getByPlaceholderText(ptBR.MessageInput.placeholder).tagName,
    ).toBe("TEXTAREA");
  });

  it("sends on Enter", async () => {
    const onSend = vi.fn();
    renderWithIntl(
      <MessageInput
        disabled={false}
        attachment={null}
        onAttachmentChange={() => {}}
        onSend={onSend}
      />,
    );

    const field = screen.getByPlaceholderText(ptBR.MessageInput.placeholder);
    await userEvent.type(field, "uma blusa{Enter}");

    expect(onSend).toHaveBeenCalledWith("uma blusa");
    expect(field).toHaveValue("");
  });

  it("inserts a newline on Shift+Enter instead of sending", async () => {
    const onSend = vi.fn();
    renderWithIntl(
      <MessageInput
        disabled={false}
        attachment={null}
        onAttachmentChange={() => {}}
        onSend={onSend}
      />,
    );

    const field = screen.getByPlaceholderText(ptBR.MessageInput.placeholder);
    await userEvent.type(field, "manga longa{Shift>}{Enter}{/Shift}gola V");

    expect(onSend).not.toHaveBeenCalled();
    expect(field).toHaveValue("manga longa\ngola V");
  });

  it("does not send whitespace only", async () => {
    const onSend = vi.fn();
    renderWithIntl(
      <MessageInput
        disabled={false}
        attachment={null}
        onAttachmentChange={() => {}}
        onSend={onSend}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText(ptBR.MessageInput.placeholder),
      "   {Enter}",
    );

    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends the trimmed text", async () => {
    const onSend = vi.fn();
    renderWithIntl(
      <MessageInput
        disabled={false}
        attachment={null}
        onAttachmentChange={() => {}}
        onSend={onSend}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText(ptBR.MessageInput.placeholder),
      "  uma blusa  {Enter}",
    );

    expect(onSend).toHaveBeenCalledWith("uma blusa");
  });

  // #55: the field had no maxLength at all -- a large paste got appended to
  // the pattern's chat with nothing stopping it client-side, matching how
  // PatternCard/Footer/SloperCard cap their rename inputs at
  // MAX_PATTERN_NAME_LENGTH.
  it("caps input at MAX_CHAT_MESSAGE_LENGTH", () => {
    renderWithIntl(
      <MessageInput
        disabled={false}
        attachment={null}
        onAttachmentChange={() => {}}
        onSend={vi.fn()}
      />,
    );
    expect(
      screen.getByPlaceholderText(ptBR.MessageInput.placeholder),
    ).toHaveAttribute("maxLength", String(MAX_CHAT_MESSAGE_LENGTH));
  });

  it("sends nothing while a generation is in flight", async () => {
    const onSend = vi.fn();
    renderWithIntl(
      <MessageInput
        disabled
        attachment={null}
        onAttachmentChange={() => {}}
        onSend={onSend}
      />,
    );

    const field = screen.getByPlaceholderText(ptBR.MessageInput.placeholder);
    expect(field).toBeDisabled();
    await userEvent.type(field, "uma blusa{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  // #106: "{cost} crédito" was hardcoded singular -- it read "2 crédito" (or
  // "0 crédito") at any COSTS.adjust value other than exactly 1, the same
  // COSTS.adjust the sibling ChatPanel.generatingCost and PlanSection's
  // costGenerate/costAdjust strings were already fixed for.
  describe("credit cost pluralization (#106)", () => {
    const ORIGINAL_COSTS = { ...COSTS };
    afterEach(() => Object.assign(COSTS, ORIGINAL_COSTS));

    it("pluralizes the credit cost at 0, 1 and 2", () => {
      const tInput = translatorFor("MessageInput");
      for (const cost of [0, 1, 2]) {
        Object.assign(COSTS, { adjust: cost });
        const { unmount } = renderWithIntl(
          <MessageInput
            disabled={false}
            attachment={null}
            onAttachmentChange={() => {}}
            onSend={vi.fn()}
          />,
        );
        expect(
          screen.getByText(tInput("creditCost", { cost })),
        ).toBeInTheDocument();
        unmount();
      }
    });
  });
});
