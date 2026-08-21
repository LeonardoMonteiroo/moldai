import { describe, it, expect, vi } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import { MessageInput } from "./MessageInput";

describe("MessageInput", () => {
  // The app's primary interaction is describing a garment; a single-line
  // <input> scrolled a long description sideways with no way to see it.
  it("is a multi-line field", () => {
    renderWithIntl(<MessageInput disabled={false} onSend={vi.fn()} />);
    expect(
      screen.getByPlaceholderText(ptBR.MessageInput.placeholder).tagName,
    ).toBe("TEXTAREA");
  });

  it("sends on Enter", async () => {
    const onSend = vi.fn();
    renderWithIntl(<MessageInput disabled={false} onSend={onSend} />);

    const field = screen.getByPlaceholderText(ptBR.MessageInput.placeholder);
    await userEvent.type(field, "uma blusa{Enter}");

    expect(onSend).toHaveBeenCalledWith("uma blusa");
    expect(field).toHaveValue("");
  });

  it("inserts a newline on Shift+Enter instead of sending", async () => {
    const onSend = vi.fn();
    renderWithIntl(<MessageInput disabled={false} onSend={onSend} />);

    const field = screen.getByPlaceholderText(ptBR.MessageInput.placeholder);
    await userEvent.type(field, "manga longa{Shift>}{Enter}{/Shift}gola V");

    expect(onSend).not.toHaveBeenCalled();
    expect(field).toHaveValue("manga longa\ngola V");
  });

  it("does not send whitespace only", async () => {
    const onSend = vi.fn();
    renderWithIntl(<MessageInput disabled={false} onSend={onSend} />);

    await userEvent.type(
      screen.getByPlaceholderText(ptBR.MessageInput.placeholder),
      "   {Enter}",
    );

    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends the trimmed text", async () => {
    const onSend = vi.fn();
    renderWithIntl(<MessageInput disabled={false} onSend={onSend} />);

    await userEvent.type(
      screen.getByPlaceholderText(ptBR.MessageInput.placeholder),
      "  uma blusa  {Enter}",
    );

    expect(onSend).toHaveBeenCalledWith("uma blusa");
  });

  it("sends nothing while a generation is in flight", async () => {
    const onSend = vi.fn();
    renderWithIntl(<MessageInput disabled onSend={onSend} />);

    const field = screen.getByPlaceholderText(ptBR.MessageInput.placeholder);
    expect(field).toBeDisabled();
    await userEvent.type(field, "uma blusa{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });
});
