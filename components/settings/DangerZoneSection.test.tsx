import { describe, it, expect, vi, beforeEach } from "vitest";
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
import { deleteAccount } from "@/lib/api-client";

const USER_EMAIL = "dev@moldai.local";

describe("DangerZoneSection", () => {
  beforeEach(() => vi.mocked(deleteAccount).mockReset());

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
});
