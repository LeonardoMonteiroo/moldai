import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";

vi.mock("@/lib/api-client", () => ({ updateProfile: vi.fn() }));

import { ProfileSection } from "./ProfileSection";
import { updateProfile } from "@/lib/api-client";

describe("ProfileSection", () => {
  beforeEach(() => vi.mocked(updateProfile).mockReset());

  it("renders the catalog text for a bad_body code", async () => {
    vi.mocked(updateProfile).mockResolvedValue({
      status: "error",
      error: "bad_body",
    });
    renderWithIntl(
      <ProfileSection initialName="Dev" email="dev@moldai.local" />,
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: ptBR.ProfileSection.saveButton }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.ProfileSection.errors.bad_body),
      ).toBeInTheDocument();
    });
  });

  it("renders the catalog text for an invalid_name code", async () => {
    vi.mocked(updateProfile).mockResolvedValue({
      status: "error",
      error: "invalid_name",
    });
    renderWithIntl(
      <ProfileSection initialName="Dev" email="dev@moldai.local" />,
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: ptBR.ProfileSection.saveButton }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.ProfileSection.errors.invalid_name),
      ).toBeInTheDocument();
    });
  });
});
