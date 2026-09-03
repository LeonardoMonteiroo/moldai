import { describe, it, expect, vi } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";
import { AttachmentChips, type AttachmentSelection } from "./AttachmentChips";

vi.mock("@/lib/editor/attachment", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/editor/attachment")>();
  return { ...actual, prepareImage: vi.fn() };
});
import { prepareImage } from "@/lib/editor/attachment";
const mockPrepare = prepareImage as unknown as ReturnType<typeof vi.fn>;

describe("AttachmentChips", () => {
  // #18: attaching an image is a real control; only .dxf stays a disabled
  // placeholder. Editor.dc.html:206-214 turned all three into icon-only
  // buttons on the composer's own row, which left no room for the visible
  // "em breve" badge -- so the .dxf button's own name AND tooltip carry that
  // explanation instead, and every one of the three keeps a tooltip (an
  // icon with no text beside it always does, per CLAUDE.md).
  it("enables the one image button, and keeps .dxf disabled with its reason as name and tooltip", () => {
    renderWithIntl(<AttachmentChips attachment={null} onChange={vi.fn()} />);

    const photo = screen.getByRole("button", {
      name: ptBR.AttachmentChips.photo,
    });
    expect(photo).toBeEnabled();
    expect(photo).toHaveAttribute("title", ptBR.AttachmentChips.photo);

    const dxf = screen.getByRole("button", {
      name: ptBR.AttachmentChips.dxfComingSoonTitle,
    });
    expect(dxf).toBeDisabled();
    expect(dxf).toHaveAttribute(
      "title",
      ptBR.AttachmentChips.dxfComingSoonTitle,
    );
  });

  it("prepares a selected file, reporting preparing then ready", async () => {
    mockPrepare.mockResolvedValue({ mediaType: "image/jpeg", base64: "abc" });
    const onChange = vi.fn();
    const { container } = renderWithIntl(
      <AttachmentChips attachment={null} onChange={onChange} />,
    );
    const [photoInput] = container.querySelectorAll('input[type="file"]');
    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });

    await userEvent.upload(photoInput as HTMLInputElement, file);

    expect(onChange).toHaveBeenNthCalledWith(1, { file, status: "preparing" });
    await waitFor(() =>
      expect(onChange).toHaveBeenNthCalledWith(2, {
        file,
        status: "ready",
        prepared: { mediaType: "image/jpeg", base64: "abc" },
      }),
    );
  });

  it("reports a failed preparation with its error code, not a fabricated success", async () => {
    mockPrepare.mockResolvedValue({ error: "too_large" });
    const onChange = vi.fn();
    const { container } = renderWithIntl(
      <AttachmentChips attachment={null} onChange={onChange} />,
    );
    const [photoInput] = container.querySelectorAll('input[type="file"]');
    const file = new File(["x"], "croqui.png", { type: "image/png" });

    await userEvent.upload(photoInput as HTMLInputElement, file);

    await waitFor(() =>
      expect(onChange).toHaveBeenNthCalledWith(2, {
        file,
        status: "error",
        errorCode: "too_large",
      }),
    );
  });

  it("renders a removable pill naming the file for a ready attachment", async () => {
    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    const attachment: AttachmentSelection = {
      file,
      status: "ready",
      prepared: { mediaType: "image/jpeg", base64: "abc" },
    };
    const onChange = vi.fn();
    renderWithIntl(
      <AttachmentChips attachment={attachment} onChange={onChange} />,
    );

    expect(screen.getByText("foto.jpg")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", {
        name: ptBR.AttachmentChips.removeAttachment,
      }),
    );
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows the preparing label while a file is still being processed", () => {
    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    renderWithIntl(
      <AttachmentChips
        attachment={{ file, status: "preparing" }}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(ptBR.AttachmentChips.preparing),
    ).toBeInTheDocument();
  });

  // Catalog text is asserted against the exported ptBR object, per the
  // repo's no-hardcoded-display-text rule applied to tests.
  it("surfaces a catalog-resolved error message when preparation fails", () => {
    const file = new File(["x"], "molde.pdf", { type: "application/pdf" });
    renderWithIntl(
      <AttachmentChips
        attachment={{ file, status: "error", errorCode: "unsupported_type" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      ptBR.AttachmentChips.errors.unsupported_type,
    );
  });
});
