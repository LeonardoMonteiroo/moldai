import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";

vi.mock("@/lib/api-client", () => ({
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
}));

import VerifyCard from "./VerifyCard";
import { verifyEmail, resendVerification, ApiError } from "@/lib/api-client";

const EMAIL = "ana@example.com";
const PASSWORD = "senha-correta1";

describe("VerifyCard", () => {
  // afterEach, not beforeEach: see the identical note in
  // ProfileSection.test.tsx / UsageSection.test.tsx (#44/#33) -- resetting
  // before a test that configures a rejecting mockImplementation (this file's
  // "re-enables the button... when the confirm call throws" test) makes
  // Vitest misreport the rejection as unhandled even though it IS handled.
  afterEach(() => {
    vi.mocked(verifyEmail).mockReset();
    vi.mocked(resendVerification).mockReset();
  });

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

  // #240: a token that is invalid/expired can never succeed by retrying --
  // the "Confirmar meu email" button must not survive that failure, and the
  // credential-gated resend route needs an email + password this screen
  // never had, so it has to ask for them right here.
  describe.each([
    ["expired_token", ptBR.Verify.errors.expired_token],
    ["invalid_token", ptBR.Verify.errors.invalid_token],
  ])("after a %s failure", (code, message) => {
    async function confirmThenFail(user: ReturnType<typeof userEvent.setup>) {
      vi.mocked(verifyEmail).mockResolvedValue({
        status: "error",
        error: code as "expired_token",
      });
      renderWithIntl(<VerifyCard token="tok" />);
      await user.click(
        screen.getByRole("button", { name: ptBR.Verify.confirmButton }),
      );
      await waitFor(() => expect(screen.getByText(message)).toBeVisible());
    }

    it("replaces the dead retry button with an email + password resend form", async () => {
      const user = userEvent.setup();
      await confirmThenFail(user);

      expect(
        screen.queryByRole("button", { name: ptBR.Verify.confirmButton }),
      ).toBeNull();
      expect(screen.getByLabelText(ptBR.Verify.emailLabel)).toBeVisible();
      expect(screen.getByLabelText(ptBR.Verify.passwordLabel)).toBeVisible();
      expect(
        screen.getByRole("button", { name: ptBR.Verify.resendButton }),
      ).toBeDisabled();
    });

    it("resends using the credentials just typed into the form", async () => {
      const user = userEvent.setup();
      vi.mocked(resendVerification).mockResolvedValue({ status: "ok" });
      await confirmThenFail(user);

      await user.type(screen.getByLabelText(ptBR.Verify.emailLabel), EMAIL);
      await user.type(
        screen.getByLabelText(ptBR.Verify.passwordLabel),
        PASSWORD,
      );
      await user.click(
        screen.getByRole("button", { name: ptBR.Verify.resendButton }),
      );

      expect(resendVerification).toHaveBeenCalledWith(EMAIL, PASSWORD);
      await waitFor(() =>
        expect(screen.getByText(ptBR.Verify.resendDone)).toBeVisible(),
      );
    });

    it("renders a resend domain code from the catalog and keeps the form usable", async () => {
      const user = userEvent.setup();
      vi.mocked(resendVerification).mockResolvedValue({
        status: "error",
        error: "invalid_credentials",
      });
      await confirmThenFail(user);

      await user.type(screen.getByLabelText(ptBR.Verify.emailLabel), EMAIL);
      await user.type(
        screen.getByLabelText(ptBR.Verify.passwordLabel),
        "wrong",
      );
      const resendButton = screen.getByRole("button", {
        name: ptBR.Verify.resendButton,
      });
      await user.click(resendButton);

      await waitFor(() =>
        expect(
          screen.getByText(ptBR.Verify.errors.invalid_credentials),
        ).toBeVisible(),
      );
      expect(resendButton).toBeEnabled();
    });
  });
});
