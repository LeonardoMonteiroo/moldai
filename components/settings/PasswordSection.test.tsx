import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";

vi.mock("@/lib/api-client", () => ({ changePassword: vi.fn() }));

import { PasswordSection } from "./PasswordSection";
import { changePassword, ApiError } from "@/lib/api-client";

describe("PasswordSection", () => {
  // afterEach, not beforeEach: see the identical note in
  // ProfileSection.test.tsx / UsageSection.test.tsx (#44/#33).
  afterEach(() => vi.mocked(changePassword).mockReset());

  it("renders the catalog text for a wrong_password code", async () => {
    vi.mocked(changePassword).mockResolvedValue({
      status: "error",
      error: "wrong_password",
    });
    renderWithIntl(<PasswordSection hasPassword={true} />);

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.currentLabel),
      "old-password",
    );
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.newLabel),
      "new-password-1",
    );
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.confirmLabel),
      "new-password-1",
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.PasswordSection.submitButton }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.PasswordSection.errors.wrong_password),
      ).toBeInTheDocument();
    });
  });

  it("renders the catalog text for a weak_password code", async () => {
    vi.mocked(changePassword).mockResolvedValue({
      status: "error",
      error: "weak_password",
    });
    renderWithIntl(<PasswordSection hasPassword={true} />);

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.currentLabel),
      "old-password",
    );
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.newLabel),
      "new-password-1",
    );
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.confirmLabel),
      "new-password-1",
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.PasswordSection.submitButton }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.PasswordSection.errors.weak_password),
      ).toBeInTheDocument();
    });
  });

  // Regression: requireUser() answers a 401 body with error:"unauthorized",
  // and postJson/changePassword parse it regardless of status, so an expired
  // session must resolve to real catalog copy here, not a raw key path.
  it("renders the catalog text for an unauthorized code", async () => {
    vi.mocked(changePassword).mockResolvedValue({
      status: "error",
      error: "unauthorized",
    });
    renderWithIntl(<PasswordSection hasPassword={true} />);

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.currentLabel),
      "old-password",
    );
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.newLabel),
      "new-password-1",
    );
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.confirmLabel),
      "new-password-1",
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.PasswordSection.submitButton }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.PasswordSection.errors.unauthorized),
      ).toBeInTheDocument();
    });
  });

  // #33: changePassword() throws on a 5xx or a rejected fetch -- previously
  // uncaught here, so `status` stayed "saving" forever and the button never
  // re-enabled, with no error shown.
  it("re-enables the button and shows an error when the save call throws", async () => {
    vi.mocked(changePassword).mockImplementation(async () => {
      throw new ApiError(500, "server_error");
    });
    renderWithIntl(<PasswordSection hasPassword={true} />);

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.currentLabel),
      "old-password",
    );
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.newLabel),
      "new-password-1",
    );
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.confirmLabel),
      "new-password-1",
    );
    const button = screen.getByRole("button", {
      name: ptBR.PasswordSection.submitButton,
    });
    await user.click(button);

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.PasswordSection.errors.bad_body),
      ).toBeVisible();
    });
    expect(button).not.toBeDisabled();
  });
});

describe("PasswordSection when the account has no password yet", () => {
  afterEach(() => vi.mocked(changePassword).mockReset());

  it("renders the 'Definir senha' heading with no current-password field", () => {
    renderWithIntl(<PasswordSection hasPassword={false} />);

    expect(
      screen.getByRole("heading", { name: ptBR.PasswordSection.setHeading }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText(ptBR.PasswordSection.currentLabel),
    ).toBeNull();
  });

  it("submits with no current password and shows the set-specific success message", async () => {
    vi.mocked(changePassword).mockResolvedValue({ status: "ok" });
    renderWithIntl(<PasswordSection hasPassword={false} />);

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.newLabel),
      "new-password-1",
    );
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.confirmLabel),
      "new-password-1",
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.PasswordSection.setSubmitButton,
      }),
    );

    expect(changePassword).toHaveBeenCalledWith(undefined, "new-password-1");
    await waitFor(() => {
      expect(
        screen.getByText(ptBR.PasswordSection.setSuccessMessage),
      ).toBeVisible();
    });
  });
});
