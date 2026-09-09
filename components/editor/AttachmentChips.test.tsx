import { describe, it, expect, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/pt-BR.json";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
  translatorFor,
} from "@/components/test-utils";
import { AttachmentChips } from "./AttachmentChips";
import {
  MAX_ATTACHMENT_COUNT,
  type PreparedAttachment,
} from "@/lib/editor/attachment";

/** Re-renders the same tree renderWithIntl produced, with a new `attachments`
 * prop -- simulates the parent (ChatPanel) applying a state update, such as a
 * removal, while a pick started against the OLD props is still in flight. */
function rerenderWithIntl(
  rerender: (ui: React.ReactElement) => void,
  attachments: PreparedAttachment[],
  onChange: (next: PreparedAttachment[]) => void,
) {
  rerender(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <AttachmentChips attachments={attachments} onChange={onChange} />
    </NextIntlClientProvider>,
  );
}

vi.mock("@/lib/editor/attachment", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/editor/attachment")>();
  return { ...actual, prepareImage: vi.fn() };
});
import { prepareImage } from "@/lib/editor/attachment";
const mockPrepare = prepareImage as unknown as ReturnType<typeof vi.fn>;

function photo(n: number): PreparedAttachment {
  return { mediaType: "image/jpeg", base64: `img${n}` };
}

describe("AttachmentChips", () => {
  // #18/#274: attaching an image is a real control; only .dxf stays a
  // disabled placeholder. Editor.dc.html:206-214 turned all three into
  // icon-only buttons on the composer's own row, which left no room for the
  // visible "em breve" badge -- so the .dxf button's own name AND tooltip
  // carry that explanation instead, and every one of the three keeps a
  // tooltip (an icon with no text beside it always does, per CLAUDE.md).
  it("enables the photo button, and keeps .dxf disabled with its reason as name and tooltip", () => {
    renderWithIntl(<AttachmentChips attachments={[]} onChange={vi.fn()} />);

    const add = screen.getByRole("button", {
      name: ptBR.AttachmentChips.photo,
    });
    expect(add).toBeEnabled();
    expect(add).toHaveAttribute("title", ptBR.AttachmentChips.photo);

    const dxf = screen.getByRole("button", {
      name: ptBR.AttachmentChips.dxfComingSoonTitle,
    });
    expect(dxf).toBeDisabled();
    expect(dxf).toHaveAttribute(
      "title",
      ptBR.AttachmentChips.dxfComingSoonTitle,
    );
  });

  it("prepares a selected file and reports the resulting list", async () => {
    mockPrepare.mockResolvedValue({ mediaType: "image/jpeg", base64: "abc" });
    const onChange = vi.fn();
    const { container } = renderWithIntl(
      <AttachmentChips attachments={[]} onChange={onChange} />,
    );
    const [photoInput] = container.querySelectorAll('input[type="file"]');
    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });

    await userEvent.upload(photoInput as HTMLInputElement, file);

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        { mediaType: "image/jpeg", base64: "abc" },
      ]),
    );
  });

  it("reports a failed preparation with its error code, not a fabricated success", async () => {
    mockPrepare.mockResolvedValue({ error: "too_large" });
    const onChange = vi.fn();
    const { container } = renderWithIntl(
      <AttachmentChips attachments={[]} onChange={onChange} />,
    );
    const [photoInput] = container.querySelectorAll('input[type="file"]');
    const file = new File(["x"], "croqui.png", { type: "image/png" });

    await userEvent.upload(photoInput as HTMLInputElement, file);

    await waitFor(() =>
      expect(
        screen.getByText(ptBR.AttachmentChips.errors.too_large),
      ).toBeInTheDocument(),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  // #274: picking several files at once (up to the room left under
  // MAX_ATTACHMENT_COUNT) reports each addition in turn, threading the
  // accumulator through rather than the (stale, by the second await) prop.
  it("accepts multiple files in one pick, up to MAX_ATTACHMENT_COUNT", async () => {
    mockPrepare
      .mockResolvedValueOnce({ mediaType: "image/jpeg", base64: "a" })
      .mockResolvedValueOnce({ mediaType: "image/jpeg", base64: "b" });
    const onChange = vi.fn();
    const { container } = renderWithIntl(
      <AttachmentChips attachments={[]} onChange={onChange} />,
    );
    const [photoInput] = container.querySelectorAll('input[type="file"]');
    const files = [
      new File(["x"], "frente.jpg", { type: "image/jpeg" }),
      new File(["y"], "costas.jpg", { type: "image/jpeg" }),
    ];

    await userEvent.upload(photoInput as HTMLInputElement, files);

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        { mediaType: "image/jpeg", base64: "a" },
        { mediaType: "image/jpeg", base64: "b" },
      ]),
    );
  });

  it("disables and relabels the add button once MAX_ATTACHMENT_COUNT is reached", () => {
    const tAttach = translatorFor("AttachmentChips");
    const attachments = Array.from({ length: MAX_ATTACHMENT_COUNT }, (_, i) =>
      photo(i),
    );
    renderWithIntl(
      <AttachmentChips attachments={attachments} onChange={vi.fn()} />,
    );

    const label = tAttach("photoLimitReached", { max: MAX_ATTACHMENT_COUNT });
    const add = screen.getByRole("button", { name: label });
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute("title", label);
  });

  it("renders a removable thumbnail per attachment", async () => {
    const onChange = vi.fn();
    renderWithIntl(
      <AttachmentChips
        attachments={[photo(1), photo(2)]}
        onChange={onChange}
      />,
    );

    const removeButtons = screen.getAllByRole("button", {
      name: ptBR.AttachmentChips.removeAttachment,
    });
    expect(removeButtons).toHaveLength(2);

    await userEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith([photo(2)]);
  });

  // #274 review finding: MessageInput blocks Send while a pick is in flight
  // (a message must never go out silently missing the image just chosen),
  // gated entirely on this callback.
  it("reports preparing=true while a pick is in flight and false once it settles", async () => {
    let resolvePrepare!: (value: {
      mediaType: "image/jpeg";
      base64: string;
    }) => void;
    mockPrepare.mockReturnValue(
      new Promise((resolve) => {
        resolvePrepare = resolve;
      }),
    );
    const onPreparingChange = vi.fn();
    const { container } = renderWithIntl(
      <AttachmentChips
        attachments={[]}
        onChange={vi.fn()}
        onPreparingChange={onPreparingChange}
      />,
    );
    const [photoInput] = container.querySelectorAll('input[type="file"]');
    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });

    await userEvent.upload(photoInput as HTMLInputElement, file);
    expect(onPreparingChange).toHaveBeenLastCalledWith(true);

    resolvePrepare({ mediaType: "image/jpeg", base64: "abc" });
    await waitFor(() =>
      expect(onPreparingChange).toHaveBeenLastCalledWith(false),
    );
  });

  // #274 review finding: a removal that lands while an earlier pick is still
  // awaiting prepareImage must stick -- the pending pick's own completion
  // used to overwrite it with a stale, pre-removal base list.
  it("keeps a removal made while a pick is still in flight, instead of the pick's own completion resurrecting it", async () => {
    let resolvePrepare!: (value: {
      mediaType: "image/jpeg";
      base64: string;
    }) => void;
    mockPrepare.mockReturnValue(
      new Promise((resolve) => {
        resolvePrepare = resolve;
      }),
    );
    const onChange = vi.fn();
    const { container, rerender } = renderWithIntl(
      <AttachmentChips
        attachments={[photo(1), photo(2)]}
        onChange={onChange}
      />,
    );
    const [photoInput] = container.querySelectorAll('input[type="file"]');
    const file = new File(["x"], "detalhe.jpg", { type: "image/jpeg" });

    await userEvent.upload(photoInput as HTMLInputElement, file);

    // The parent applies a removal (of photo(1)) while the pick above is
    // still awaiting prepareImage.
    rerenderWithIntl(rerender, [photo(2)], onChange);

    resolvePrepare({ mediaType: "image/jpeg", base64: "new" });
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        photo(2),
        { mediaType: "image/jpeg", base64: "new" },
      ]),
    );
  });

  // #274 review finding: CLAUDE.md's "surface a limitation on-screen, never
  // silently" -- picking more files than the remaining room used to drop the
  // extras with no trace.
  it("surfaces a notice when a pick offers more files than the remaining room", async () => {
    mockPrepare.mockResolvedValue({ mediaType: "image/jpeg", base64: "a" });
    const onChange = vi.fn();
    const attachments = Array.from(
      { length: MAX_ATTACHMENT_COUNT - 1 },
      (_, i) => photo(i),
    );
    const { container } = renderWithIntl(
      <AttachmentChips attachments={attachments} onChange={onChange} />,
    );
    const [photoInput] = container.querySelectorAll('input[type="file"]');
    // Room is 1; two files are offered.
    const files = [
      new File(["x"], "a.jpg", { type: "image/jpeg" }),
      new File(["y"], "b.jpg", { type: "image/jpeg" }),
    ];

    await userEvent.upload(photoInput as HTMLInputElement, files);

    await waitFor(() =>
      expect(
        screen.getByText(
          translatorFor("AttachmentChips")("photoLimitReached", {
            max: MAX_ATTACHMENT_COUNT,
          }),
        ),
      ).toBeInTheDocument(),
    );
  });
});
