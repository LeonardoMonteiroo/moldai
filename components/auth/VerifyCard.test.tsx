import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";

vi.mock("@/lib/api-client", () => ({ verifyEmail: vi.fn() }));

import VerifyCard from "./VerifyCard";
import { verifyEmail, ApiError } from "@/lib/api-client";

describe("VerifyCard", () => {
  // afterEach, not beforeEach: see the identical note in
  // ProfileSection.test.tsx / UsageSection.test.tsx (#44/#33).
  afterEach(() => vi.mocked(verifyEmail).mockReset());

  it("renders the catalog text for an expired_token code", async () => {
    vi.mocked(verifyEmail).mockResolvedValue({
      status: "error",
      error: "expired_token",
    });
    renderWithIntl(<VerifyCard token="tok" />);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: ptBR.Verify.confirmButton }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.Verify.errors.expired_token),
      ).toBeInTheDocument();
    });
  });

  it("shows the success screen when confirmation succeeds", async () => {
    vi.mocked(verifyEmail).mockResolvedValue({ status: "ok" });
    renderWithIntl(<VerifyCard token="tok" />);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: ptBR.Verify.confirmButton }),
    );

    await waitFor(() => {
      expect(screen.getByText(ptBR.Verify.successHeading)).toBeVisible();
    });
  });

  // #33: verifyEmail() throws on a 5xx or a rejected fetch -- previously
  // uncaught here, so `status` stayed "loading" forever and the button never
  // re-enabled, with no error shown.
  it("re-enables the button and shows an error when the confirm call throws", async () => {
    vi.mocked(verifyEmail).mockImplementation(async () => {
      throw new ApiError(500, "server_error");
    });
    renderWithIntl(<VerifyCard token="tok" />);

    const user = userEvent.setup();
    const button = screen.getByRole("button", {
      name: ptBR.Verify.confirmButton,
    });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(ptBR.Verify.errors.bad_body)).toBeVisible();
    });
    expect(button).not.toBeDisabled();
  });
});
