import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";

vi.mock("@/lib/api-client", () => ({
  signUp: vi.fn(),
  resendVerification: vi.fn(),
}));

import SignupCard from "./SignupCard";
import { signUp, resendVerification } from "@/lib/api-client";
import { MIN_PASSWORD_LENGTH } from "@/lib/account/settings";

/**
 * #168: sign-up had no component test. The two properties worth pinning are
 * the ones a plausible-looking edit breaks silently:
 *
 *  - the submit gate is `canSubmit`, not the browser's own `required`
 *    attributes, so a mismatched or too-short password must never reach
 *    signUp() -- and MIN_PASSWORD_LENGTH is read from lib/account/settings,
 *    the same constant the server validates with, rather than pasted here.
 *  - a successful sign-up swaps the card IN PLACE and does NOT sign anyone
 *    in: the account starts unverified. The card keeps the email and
 *    password in state purely so resend can satisfy the route's credential
 *    gate, which is invisible unless a test actually clicks resend after a
 *    successful sign-up.
 */

const NAME = "Ana";
const EMAIL = "ana@example.com";
const PASSWORD = "secret-123";

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { password = PASSWORD, confirm = PASSWORD } = {},
) {
  await user.type(screen.getByLabelText(ptBR.Signup.nameLabel), NAME);
  await user.type(screen.getByLabelText(ptBR.Signup.emailLabel), EMAIL);
  await user.type(screen.getByLabelText(ptBR.Signup.passwordLabel), password);
  await user.type(screen.getByLabelText(ptBR.Signup.confirmLabel), confirm);
}

function submitButton() {
  return screen.getByRole("button", { name: ptBR.Signup.submitButton });
}

describe("SignupCard", () => {
  beforeEach(() => {
    vi.mocked(signUp).mockReset();
    vi.mocked(resendVerification).mockReset();
  });

  it("creates the account with the typed fields and never sends the confirm field", async () => {
    vi.mocked(signUp).mockResolvedValue({ status: "ok" });
    renderWithIntl(<SignupCard />);
    const user = userEvent.setup();
    await fill(user);
    await user.click(submitButton());

    // Three arguments, in this order: the confirm field is a client-side
    // gate only and the server never receives it.
    expect(signUp).toHaveBeenCalledWith(NAME, EMAIL, PASSWORD);
  });

  it("swaps to the confirm-your-email state without signing anyone in", async () => {
    vi.mocked(signUp).mockResolvedValue({ status: "ok" });
    renderWithIntl(<SignupCard />);
    const user = userEvent.setup();
    await fill(user);
    await user.click(submitButton());

    await waitFor(() =>
      expect(screen.getByText(ptBR.Signup.sentHeading)).toBeVisible(),
    );
    // The form is gone -- the card swapped in place rather than navigating.
    expect(screen.queryByLabelText(ptBR.Signup.passwordLabel)).toBeNull();
    // sentBody is t.rich with a <b> chunk, so it has no single resolved
    // string to compare against -- what matters is that the address the
    // link actually went to is echoed back (test-supplied data, not
    // catalog copy) and that the hint below it comes from the catalog.
    expect(screen.getByText(EMAIL)).toBeVisible();
    expect(screen.getByText(ptBR.Signup.sentHint)).toBeVisible();
  });

  // The gate, exercised through the real button rather than by reading
  // `canSubmit`: each of these is a state a user can actually be in.
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
    renderWithIntl(<SignupCard />);
    const user = userEvent.setup();
    await fill(user, overrides);

    expect(submitButton()).toBeDisabled();
    await user.click(submitButton());
    expect(signUp).not.toHaveBeenCalled();
  });

  it("keeps submit disabled for a blank or whitespace-only name", async () => {
    renderWithIntl(<SignupCard />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(ptBR.Signup.emailLabel), EMAIL);
    await user.type(screen.getByLabelText(ptBR.Signup.passwordLabel), PASSWORD);
    await user.type(screen.getByLabelText(ptBR.Signup.confirmLabel), PASSWORD);
    expect(submitButton()).toBeDisabled();

    // `name.trim()`, not `name.length` -- a space is not a name.
    await user.type(screen.getByLabelText(ptBR.Signup.nameLabel), "   ");
    expect(submitButton()).toBeDisabled();

    await user.type(screen.getByLabelText(ptBR.Signup.nameLabel), NAME);
    expect(submitButton()).toBeEnabled();
  });

  it("shows the mismatch message only once both fields have been typed into", async () => {
    renderWithIntl(<SignupCard />);
    const user = userEvent.setup();
    // A half-typed confirm field is not yet an error -- reporting one on the
    // first keystroke is the noise this guard exists to avoid.
    await user.type(screen.getByLabelText(ptBR.Signup.passwordLabel), PASSWORD);
    expect(screen.queryByText(ptBR.Signup.mismatchError)).toBeNull();

    await user.type(
      screen.getByLabelText(ptBR.Signup.confirmLabel),
      "nope-123",
    );
    expect(screen.getByText(ptBR.Signup.mismatchError)).toBeVisible();
    expect(screen.getByLabelText(ptBR.Signup.confirmLabel)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it.each([
    ["email_taken", ptBR.Signup.errors.email_taken],
    ["invalid_email", ptBR.Signup.errors.invalid_email],
    ["weak_password", ptBR.Signup.errors.weak_password],
    ["rate_limited", ptBR.Signup.errors.rate_limited],
    // The account WAS created -- the copy has to say so and point at login,
    // not read as a failed sign-up.
    ["mail_unavailable", ptBR.Signup.errors.mail_unavailable],
  ])(
    "renders the %s code from the catalog and stays on the form",
    async (code, message) => {
      vi.mocked(signUp).mockResolvedValue({
        status: "error",
        error: code as "email_taken",
      });
      renderWithIntl(<SignupCard />);
      const user = userEvent.setup();
      await fill(user);
      await user.click(submitButton());

      await waitFor(() => expect(screen.getByText(message)).toBeVisible());
      expect(screen.queryByText(ptBR.Signup.sentHeading)).toBeNull();
      // A rejected sign-up must leave the button usable for a second attempt.
      expect(submitButton()).toBeEnabled();
    },
  );

  // signUp throws for any status outside DOMAIN_ERRORS (a 500, an offline
  // fetch). Without the catch the button would stay disabled in its
  // "Criando conta…" state with nothing shown.
  it("re-enables submit and shows a generic error when the call throws", async () => {
    vi.mocked(signUp).mockRejectedValue(new Error("offline"));
    renderWithIntl(<SignupCard />);
    const user = userEvent.setup();
    await fill(user);
    await user.click(submitButton());

    await waitFor(() =>
      expect(screen.getByText(ptBR.Signup.errors.bad_body)).toBeVisible(),
    );
    expect(submitButton()).toBeEnabled();
  });

  describe("after a successful sign-up", () => {
    async function signUpThen(user: ReturnType<typeof userEvent.setup>) {
      vi.mocked(signUp).mockResolvedValue({ status: "ok" });
      renderWithIntl(<SignupCard />);
      await fill(user);
      await user.click(submitButton());
      return screen.findByRole("button", { name: ptBR.Signup.resendButton });
    }

    it("resends using the credentials the card kept in state", async () => {
      const user = userEvent.setup();
      vi.mocked(resendVerification).mockResolvedValue({ status: "ok" });
      await user.click(await signUpThen(user));

      // The whole reason the card holds the password after submitting: the
      // resend route is credential-gated and there is no form left to read.
      expect(resendVerification).toHaveBeenCalledWith(EMAIL, PASSWORD);
      await waitFor(() =>
        expect(screen.getByText(ptBR.Signup.resendDone)).toBeVisible(),
      );
    });

    it("renders a resend domain code from the catalog", async () => {
      const user = userEvent.setup();
      vi.mocked(resendVerification).mockResolvedValue({
        status: "error",
        error: "cooldown",
      });
      await user.click(await signUpThen(user));

      await waitFor(() =>
        expect(screen.getByText(ptBR.Signup.errors.cooldown)).toBeVisible(),
      );
      expect(screen.queryByText(ptBR.Signup.resendDone)).toBeNull();
    });

    // The sent state has its OWN generic resend message, distinct from the
    // form's errors.bad_body -- a thrown resend here is not a failed
    // sign-up, and saying "não foi possível criar a conta" would be a lie.
    it("shows resendError, not the sign-up error, when the resend call throws", async () => {
      const user = userEvent.setup();
      vi.mocked(resendVerification).mockRejectedValue(new Error("offline"));
      await user.click(await signUpThen(user));

      await waitFor(() =>
        expect(screen.getByText(ptBR.Signup.resendError)).toBeVisible(),
      );
      expect(screen.queryByText(ptBR.Signup.errors.bad_body)).toBeNull();
      expect(
        screen.getByRole("button", { name: ptBR.Signup.resendButton }),
      ).toBeEnabled();
    });
  });

  it("links back to the login route", () => {
    renderWithIntl(<SignupCard />);
    // loginNote is rich text, so the link label is a chunk of a catalog
    // string rather than a key -- matched by destination instead of by a
    // pasted pt-BR literal.
    expect(
      screen.getAllByRole("link").map((a) => a.getAttribute("href")),
    ).toContain("/login");
  });
});
