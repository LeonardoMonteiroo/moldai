import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";

vi.mock("@/lib/api-client", () => ({ changePassword: vi.fn() }));

import { PasswordSection } from "./PasswordSection";
import { changePassword } from "@/lib/api-client";

describe("PasswordSection", () => {
  beforeEach(() => vi.mocked(changePassword).mockReset());

  it("renders the catalog text for a wrong_password code", async () => {
    vi.mocked(changePassword).mockResolvedValue({
      status: "error",
      error: "wrong_password",
    });
    renderWithIntl(<PasswordSection />);

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
    renderWithIntl(<PasswordSection />);

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
});
