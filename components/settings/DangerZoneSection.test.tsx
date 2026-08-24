import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";

vi.mock("@/lib/api-client", () => ({ deleteAccount: vi.fn() }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

import { DangerZoneSection } from "./DangerZoneSection";
import { deleteAccount, ApiError } from "@/lib/api-client";

const USER_EMAIL = "dev@moldai.local";

describe("DangerZoneSection", () => {
  // afterEach, not beforeEach: see the identical note in
  // ProfileSection.test.tsx / UsageSection.test.tsx (#44/#33).
  afterEach(() => vi.mocked(deleteAccount).mockReset());

  it("renders the catalog text for a wrong_password code", async () => {
    vi.mocked(deleteAccount).mockResolvedValue({
      status: "error",
      error: "wrong_password",
    });
    renderWithIntl(<DangerZoneSection userEmail={USER_EMAIL} />);

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(
        ptBR.DangerZoneSection.emailConfirmLabel.replace("{email}", USER_EMAIL),
      ),
      USER_EMAIL,
    );
    await user.type(
      screen.getByLabelText(ptBR.DangerZoneSection.passwordLabel),
      "wrong-password",
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.DangerZoneSection.submitButton,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.DangerZoneSection.errors.wrong_password),
      ).toBeInTheDocument();
    });
  });

  it("renders the catalog text for an account_not_found code", async () => {
    vi.mocked(deleteAccount).mockResolvedValue({
      status: "error",
      error: "account_not_found",
    });
    renderWithIntl(<DangerZoneSection userEmail={USER_EMAIL} />);

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(
        ptBR.DangerZoneSection.emailConfirmLabel.replace("{email}", USER_EMAIL),
      ),
      USER_EMAIL,
    );
    await user.type(
      screen.getByLabelText(ptBR.DangerZoneSection.passwordLabel),
      "some-password",
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.DangerZoneSection.submitButton,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.DangerZoneSection.errors.account_not_found),
      ).toBeInTheDocument();
    });
  });

  // Regression: requireUser() answers a 401 body with error:"unauthorized",
  // and postJson/deleteAccount parse it regardless of status, so an expired
  // session must resolve to real catalog copy here, not a raw key path.
  it("renders the catalog text for an unauthorized code", async () => {
    vi.mocked(deleteAccount).mockResolvedValue({
      status: "error",
      error: "unauthorized",
    });
    renderWithIntl(<DangerZoneSection userEmail={USER_EMAIL} />);

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(
        ptBR.DangerZoneSection.emailConfirmLabel.replace("{email}", USER_EMAIL),
      ),
      USER_EMAIL,
    );
    await user.type(
      screen.getByLabelText(ptBR.DangerZoneSection.passwordLabel),
      "some-password",
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.DangerZoneSection.submitButton,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.DangerZoneSection.errors.unauthorized),
      ).toBeInTheDocument();
    });
  });

  // #33: deleteAccount() throws on a 5xx or a rejected fetch -- previously
  // uncaught here, so `status` stayed "deleting" forever and the button
  // never re-enabled, with no error shown.
  it("re-enables the button and shows an error when the delete call throws", async () => {
    vi.mocked(deleteAccount).mockImplementation(async () => {
      throw new ApiError(500, "server_error");
    });
    renderWithIntl(<DangerZoneSection userEmail={USER_EMAIL} />);

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(
        ptBR.DangerZoneSection.emailConfirmLabel.replace("{email}", USER_EMAIL),
      ),
      USER_EMAIL,
    );
    await user.type(
      screen.getByLabelText(ptBR.DangerZoneSection.passwordLabel),
      "some-password",
    );
    const button = screen.getByRole("button", {
      name: ptBR.DangerZoneSection.submitButton,
    });
    await user.click(button);

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.DangerZoneSection.genericError),
      ).toBeVisible();
    });
    expect(button).not.toBeDisabled();
  });
});
