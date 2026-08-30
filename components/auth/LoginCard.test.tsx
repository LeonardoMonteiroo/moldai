import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

vi.mock("@/lib/api-client", () => ({ resendVerification: vi.fn() }));

import LoginCard from "./LoginCard";
import { resendVerification } from "@/lib/api-client";

/**
 * #168: the credentials path had no component test at all. What makes it
 * worth covering is not the happy path but the three-way branch on
 * Auth.js's `code`: `authorizeUser` returns
 * "invalid" | "unverified" | "rate_limited" and auth.ts maps the last two to
 * CredentialsSignin subclasses carrying a code precisely so this card can
 * tell an unconfirmed account from a wrong password. Collapse that branch
 * and the screen tells a user with the right password that their password is
 * wrong -- a wrong answer, not a missing one, and invisible to any test that
 * only checks "an error appeared".
 */

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  email = "ana@example.com",
  password = "secret-123",
) {
  await user.type(screen.getByLabelText(ptBR.Login.emailLabel), email);
  await user.type(screen.getByLabelText(ptBR.Login.passwordLabel), password);
  await user.click(
    screen.getByRole("button", { name: ptBR.Login.submitButton }),
  );
}

describe("LoginCard", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    signIn.mockReset();
    vi.mocked(resendVerification).mockReset();
  });

  it("signs in with the typed credentials and never lets Auth.js redirect", async () => {
    signIn.mockResolvedValue({ ok: true });
    renderWithIntl(<LoginCard />);
    const user = userEvent.setup();
    await fillAndSubmit(user);

    // redirect:false is what keeps the error branch reachable at all -- with
    // Auth.js's own redirect the card would never see `code`.
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "ana@example.com",
      password: "secret-123",
      redirect: false,
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    // refresh(), not push() alone: the dashboard is a Server Component, so
    // without it the header renders with no session on the first paint.
    expect(refresh).toHaveBeenCalled();
  });

  // The three codes, asserted against the three DISTINCT catalog strings.
  // Matching a substring or a regex here would pass even if the card
  // collapsed all three into invalidCredentials.
  it.each([
    ["unverified_email", ptBR.Login.unverifiedEmail],
    ["rate_limited", ptBR.Login.rateLimited],
    [undefined, ptBR.Login.invalidCredentials],
    ["something_new", ptBR.Login.invalidCredentials],
  ] as [string | undefined, string][])(
    "renders its own message for code %s",
    async (code, message) => {
      signIn.mockResolvedValue({ error: "CredentialsSignin", code });
      renderWithIntl(<LoginCard />);
      const user = userEvent.setup();
      await fillAndSubmit(user);

      await waitFor(() => expect(screen.getByText(message)).toBeVisible());
      expect(push).not.toHaveBeenCalled();
    },
  );

  it("marks the password field invalid and never navigates on a failed sign-in", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    renderWithIntl(<LoginCard />);
    const user = userEvent.setup();
    await fillAndSubmit(user);

    await waitFor(() =>
      expect(screen.getByLabelText(ptBR.Login.passwordLabel)).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  // The resend button is the whole point of distinguishing unverified_email:
  // it must appear for that code and for no other, or the user is told to
  // confirm an email with no way to get the link resent.
  it("offers the resend button only for an unverified account", async () => {
    signIn.mockResolvedValue({
      error: "CredentialsSignin",
      code: "rate_limited",
    });
    const { unmount } = renderWithIntl(<LoginCard />);
    let user = userEvent.setup();
    await fillAndSubmit(user);
    await waitFor(() =>
      expect(screen.getByText(ptBR.Login.rateLimited)).toBeVisible(),
    );
    expect(
      screen.queryByRole("button", { name: ptBR.Login.resendButton }),
    ).toBeNull();
    unmount();

    signIn.mockResolvedValue({
      error: "CredentialsSignin",
      code: "unverified_email",
    });
    renderWithIntl(<LoginCard />);
    user = userEvent.setup();
    await fillAndSubmit(user);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: ptBR.Login.resendButton }),
      ).toBeVisible(),
    );
  });

  it("resends the link with the credentials already typed into the form", async () => {
    signIn.mockResolvedValue({
      error: "CredentialsSignin",
      code: "unverified_email",
    });
    vi.mocked(resendVerification).mockResolvedValue({ status: "ok" });
    renderWithIntl(<LoginCard />);
    const user = userEvent.setup();
    await fillAndSubmit(user);

    await user.click(
      await screen.findByRole("button", { name: ptBR.Login.resendButton }),
    );

    // The route is credential-gated, so the card has to reuse the password
    // it already holds -- it cannot ask for it a second time.
    expect(resendVerification).toHaveBeenCalledWith(
      "ana@example.com",
      "secret-123",
    );
    await waitFor(() =>
      expect(screen.getByText(ptBR.Login.resendDone)).toBeVisible(),
    );
    // The unverified error is replaced by the confirmation, not stacked
    // under it.
    expect(screen.queryByText(ptBR.Login.unverifiedEmail)).toBeNull();
  });

  it.each([
    ["cooldown", ptBR.Login.errors.cooldown],
    ["already_verified", ptBR.Login.errors.already_verified],
    ["mail_unavailable", ptBR.Login.errors.mail_unavailable],
  ])("renders the %s resend code from the catalog", async (code, message) => {
    signIn.mockResolvedValue({
      error: "CredentialsSignin",
      code: "unverified_email",
    });
    vi.mocked(resendVerification).mockResolvedValue({
      status: "error",
      error: code as "cooldown",
    });
    renderWithIntl(<LoginCard />);
    const user = userEvent.setup();
    await fillAndSubmit(user);
    await user.click(
      await screen.findByRole("button", { name: ptBR.Login.resendButton }),
    );

    await waitFor(() => expect(screen.getByText(message)).toBeVisible());
    expect(screen.queryByText(ptBR.Login.resendDone)).toBeNull();
  });

  // resendVerification throws on any status outside DOMAIN_ERRORS (a 500, an
  // offline fetch). Without the catch the button would stay in its
  // "Reenviando…" state forever with nothing shown.
  it("re-enables the resend button and shows a generic error when the call throws", async () => {
    signIn.mockResolvedValue({
      error: "CredentialsSignin",
      code: "unverified_email",
    });
    vi.mocked(resendVerification).mockRejectedValue(new Error("offline"));
    renderWithIntl(<LoginCard />);
    const user = userEvent.setup();
    await fillAndSubmit(user);
    const button = await screen.findByRole("button", {
      name: ptBR.Login.resendButton,
    });
    await user.click(button);

    await waitFor(() =>
      expect(screen.getByText(ptBR.Login.errors.bad_body)).toBeVisible(),
    );
    expect(
      screen.getByRole("button", { name: ptBR.Login.resendButton }),
    ).not.toBeDisabled();
  });

  it("links to the password-reset and signup routes", () => {
    renderWithIntl(<LoginCard />);
    expect(
      screen.getByRole("link", { name: ptBR.Login.forgotPasswordLink }),
    ).toHaveAttribute("href", "/password-reset");
    // signupNote is rich text, so the label is a chunk of a catalog string
    // rather than a key of its own -- matched by destination instead of by a
    // pasted pt-BR literal, per the no-hardcoded-display-text rule.
    expect(
      screen.getAllByRole("link").map((a) => a.getAttribute("href")),
    ).toContain("/signup");
  });

  it("starts the Google OAuth flow with a real redirect", async () => {
    renderWithIntl(<LoginCard />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: ptBR.Login.continueWithGoogle }),
    );
    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/" });
  });
});
