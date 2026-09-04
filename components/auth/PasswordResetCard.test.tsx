import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";

vi.mock("@/lib/api-client", () => ({
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

import PasswordResetCard from "./PasswordResetCard";
import { requestPasswordReset, confirmPasswordReset } from "@/lib/api-client";
import { MIN_PASSWORD_LENGTH } from "@/lib/account/settings";

/**
 * #168: the reset flow had no component test. Two properties here are
 * security properties, not cosmetic ones:
 *
 *  - `token` alone decides which of the two forms renders. A blank token
 *    must never reach the confirm form, or the card would offer to set a new
 *    password with nothing to authorize it.
 *  - the request form must say the SAME generic thing whether or not the
 *    address exists. POST /api/password-reset/request always answers 200 for
 *    exactly that reason; if this card rendered anything address-specific,
 *    the UI would become the enumeration oracle the route was built not to
 *    be. That is asserted below by driving both an existing and an unknown
 *    address through the same success response and comparing the rendered
 *    text, not by trusting the comment on the route.
 */

const EMAIL = "ana@example.com";
const PASSWORD = "new-secret-123";
const TOKEN = "reset-token";

describe("PasswordResetCard", () => {
  beforeEach(() => {
    vi.mocked(requestPasswordReset).mockReset();
    vi.mocked(confirmPasswordReset).mockReset();
  });

  describe("with no token (the request form)", () => {
    it("renders the request form, not the new-password form", () => {
      renderWithIntl(<PasswordResetCard token="" />);
      expect(screen.getByText(ptBR.PasswordReset.requestHeading)).toBeVisible();
      expect(screen.getByText(ptBR.PasswordReset.requestIntro)).toBeVisible();
      // No password field exists to submit without a token.
      expect(
        screen.queryByLabelText(ptBR.PasswordReset.newPasswordLabel),
      ).toBeNull();
    });

    it("requests the link for the typed address", async () => {
      vi.mocked(requestPasswordReset).mockResolvedValue({ status: "ok" });
      renderWithIntl(<PasswordResetCard token="" />);
      const user = userEvent.setup();
      await user.type(
        screen.getByLabelText(ptBR.PasswordReset.emailLabel),
        EMAIL,
      );
      await user.click(
        screen.getByRole("button", { name: ptBR.PasswordReset.requestButton }),
      );

      expect(requestPasswordReset).toHaveBeenCalledWith(EMAIL);
      await waitFor(() =>
        expect(
          screen.getByText(ptBR.PasswordReset.requestSentHeading),
        ).toBeVisible(),
      );
      expect(
        screen.getByText(ptBR.PasswordReset.requestSentBody),
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: ptBR.PasswordReset.backToLogin }),
      ).toHaveAttribute("href", "/login");
    });

    // The account-enumeration property, checked by comparison rather than by
    // reading the copy: the route answers 200 either way, so the two renders
    // must be byte-identical.
    it("renders the identical confirmation for a registered and an unknown address", async () => {
      vi.mocked(requestPasswordReset).mockResolvedValue({ status: "ok" });

      async function submitAs(email: string) {
        const view = renderWithIntl(<PasswordResetCard token="" />);
        const user = userEvent.setup();
        await user.type(
          screen.getByLabelText(ptBR.PasswordReset.emailLabel),
          email,
        );
        await user.click(
          screen.getByRole("button", {
            name: ptBR.PasswordReset.requestButton,
          }),
        );
        const text = await screen
          .findByText(ptBR.PasswordReset.requestSentHeading)
          .then((el) => el.parentElement!.textContent);
        view.unmount();
        return text;
      }

      const registered = await submitAs(EMAIL);
      const unknown = await submitAs("nobody@example.com");
      expect(registered).toBe(unknown);
      // And neither echoes the address back, which would leak it into a
      // shared screen or a screenshot even without an existence signal.
      expect(registered).not.toContain(EMAIL);
    });

    it.each([
      ["rate_limited", ptBR.PasswordReset.errors.rate_limited],
      ["bad_body", ptBR.PasswordReset.errors.bad_body],
    ])(
      "renders the %s code from the catalog and stays on the form",
      async (code, message) => {
        vi.mocked(requestPasswordReset).mockResolvedValue({
          status: "error",
          error: code as "rate_limited",
        });
        renderWithIntl(<PasswordResetCard token="" />);
        const user = userEvent.setup();
        await user.type(
          screen.getByLabelText(ptBR.PasswordReset.emailLabel),
          EMAIL,
        );
        const button = screen.getByRole("button", {
          name: ptBR.PasswordReset.requestButton,
        });
        await user.click(button);

        await waitFor(() => expect(screen.getByText(message)).toBeVisible());
        expect(
          screen.queryByText(ptBR.PasswordReset.requestSentHeading),
        ).toBeNull();
        expect(button).toBeEnabled();
        expect(
          screen.getByLabelText(ptBR.PasswordReset.emailLabel),
        ).toHaveAttribute("aria-invalid", "true");
      },
    );
  });

  describe("with a token (the confirm form)", () => {
    async function fill(
      user: ReturnType<typeof userEvent.setup>,
      { password = PASSWORD, confirm = PASSWORD } = {},
    ) {
      await user.type(
        screen.getByLabelText(ptBR.PasswordReset.newPasswordLabel),
        password,
      );
      await user.type(
        screen.getByLabelText(ptBR.PasswordReset.confirmPasswordLabel),
        confirm,
      );
    }

    function submitButton() {
      return screen.getByRole("button", {
        name: ptBR.PasswordReset.confirmButton,
      });
    }

    it("renders the new-password form, not the request form", () => {
      renderWithIntl(<PasswordResetCard token={TOKEN} />);
      // By role: confirmHeading and newPasswordLabel are the same words in
      // the catalog, so getByText would match two nodes.
      expect(
        screen.getByRole("heading", {
          name: ptBR.PasswordReset.confirmHeading,
        }),
      ).toBeVisible();
      expect(screen.getByText(ptBR.PasswordReset.confirmIntro)).toBeVisible();
      expect(screen.queryByLabelText(ptBR.PasswordReset.emailLabel)).toBeNull();
    });

    it("submits the token from the mailed link alongside the new password", async () => {
      vi.mocked(confirmPasswordReset).mockResolvedValue({ status: "ok" });
      renderWithIntl(<PasswordResetCard token={TOKEN} />);
      const user = userEvent.setup();
      await fill(user);
      await user.click(submitButton());

      // The token is the whole authorization for this call -- it comes from
      // the prop, never from anything the visitor typed.
      expect(confirmPasswordReset).toHaveBeenCalledWith(TOKEN, PASSWORD);
      await waitFor(() =>
        expect(
          screen.getByText(ptBR.PasswordReset.confirmSuccessHeading),
        ).toBeVisible(),
      );
      expect(
        screen.getByText(ptBR.PasswordReset.confirmSuccessBody),
      ).toBeVisible();
      // No auto-sign-in: the success state points at /login.
      expect(
        screen.getByRole("link", { name: ptBR.PasswordReset.loginLink }),
      ).toHaveAttribute("href", "/login");
    });

    it.each([
      ["the two passwords do not match", { confirm: "different-123" }],
      [
        "the password is shorter than the server's own minimum",
        {
          password: "a".repeat(MIN_PASSWORD_LENGTH - 1),
          confirm: "a".repeat(MIN_PASSWORD_LENGTH - 1),
        },
      ],
    ])("keeps submit disabled while %s", async (_label, overrides) => {
      renderWithIntl(<PasswordResetCard token={TOKEN} />);
      const user = userEvent.setup();
      await fill(user, overrides);

      expect(submitButton()).toBeDisabled();
      await user.click(submitButton());
      expect(confirmPasswordReset).not.toHaveBeenCalled();
    });

    it("shows the mismatch message only once both fields have been typed into", async () => {
      renderWithIntl(<PasswordResetCard token={TOKEN} />);
      const user = userEvent.setup();
      await user.type(
        screen.getByLabelText(ptBR.PasswordReset.newPasswordLabel),
        PASSWORD,
      );
      expect(screen.queryByText(ptBR.PasswordReset.mismatchError)).toBeNull();

      await user.type(
        screen.getByLabelText(ptBR.PasswordReset.confirmPasswordLabel),
        "nope-123",
      );
      expect(screen.getByText(ptBR.PasswordReset.mismatchError)).toBeVisible();
    });

    // A used or aged-out link is the ordinary failure of this screen, and
    // the two codes have to stay distinguishable: "peça um novo" is the
    // action either way, but only one of them means the link was already
    // spent.
    it.each([
      ["invalid_token", ptBR.PasswordReset.errors.invalid_token],
      ["expired_token", ptBR.PasswordReset.errors.expired_token],
      ["weak_password", ptBR.PasswordReset.errors.weak_password],
      ["rate_limited", ptBR.PasswordReset.errors.rate_limited],
    ])(
      "renders the %s code from the catalog and keeps the form usable",
      async (code, message) => {
        vi.mocked(confirmPasswordReset).mockResolvedValue({
          status: "error",
          error: code as "invalid_token",
        });
        renderWithIntl(<PasswordResetCard token={TOKEN} />);
        const user = userEvent.setup();
        await fill(user);
        await user.click(submitButton());

        await waitFor(() => expect(screen.getByText(message)).toBeVisible());
        expect(
          screen.queryByText(ptBR.PasswordReset.confirmSuccessHeading),
        ).toBeNull();
        expect(submitButton()).toBeEnabled();
      },
    );
  });
});
