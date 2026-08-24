import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";

vi.mock("@/lib/api-client", () => ({ updateProfile: vi.fn() }));

import { ProfileSection } from "./ProfileSection";
import { updateProfile, ApiError } from "@/lib/api-client";

describe("ProfileSection", () => {
  // afterEach, not beforeEach: resetting before a test that configures a
  // rejecting mockImplementation makes Vitest 2.1.9 misreport the rejection
  // as unhandled even though the try/catch here does handle it -- see the
  // identical note in UsageSection.test.tsx (#44).
  afterEach(() => vi.mocked(updateProfile).mockReset());

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

  // Regression: requireUser() answers a 401 body with error:"unauthorized",
  // and postJson/updateProfile parse it regardless of status, so an expired
  // session must resolve to real catalog copy here, not a raw key path.
  it("renders the catalog text for an unauthorized code", async () => {
    vi.mocked(updateProfile).mockResolvedValue({
      status: "error",
      error: "unauthorized",
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
        screen.getByText(ptBR.ProfileSection.errors.unauthorized),
      ).toBeInTheDocument();
    });
  });

  // #33: updateProfile() throws on a 5xx or a rejected fetch -- previously
  // uncaught here, so `status` stayed "saving" forever and the button never
  // re-enabled, with no error shown.
  it("re-enables the button and shows an error when the save call throws", async () => {
    vi.mocked(updateProfile).mockImplementation(async () => {
      throw new ApiError(500, "server_error");
    });
    renderWithIntl(
      <ProfileSection initialName="Dev" email="dev@moldai.local" />,
    );

    const user = userEvent.setup();
    const button = screen.getByRole("button", {
      name: ptBR.ProfileSection.saveButton,
    });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(ptBR.ProfileSection.saveError)).toBeVisible();
    });
    expect(button).not.toBeDisabled();
  });
});
