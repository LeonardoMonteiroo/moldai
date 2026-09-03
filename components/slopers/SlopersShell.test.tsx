import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  within,
  userEvent,
  waitFor,
  translatorFor,
} from "@/components/test-utils";
import type { Credits, SloperListItem } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return {
    ...actual,
    listSlopers: vi.fn(),
    createPattern: vi.fn(),
  };
});

import { SlopersShell } from "./SlopersShell";
import { useSlopersStore } from "@/lib/slopersStore";
import { listSlopers, createPattern, ApiError } from "@/lib/api-client";

/**
 * #168: /slopers had no shell-level test. The three states it can be in are
 * mutually exclusive on purpose, and the load-vs-action error split is the
 * part worth pinning: `error` replaces the content region (a failed load has
 * nothing to show), while `actionError` leaves a usable screen and adds a
 * notice. Collapsing the two either hides a real list behind an error or
 * leaves a failed "Usar base" completely silent.
 *
 * The store is a module-level Zustand singleton shared across tests, so each
 * case resets it explicitly rather than relying on RTL cleanup.
 */

const CREDITS: Credits = {
  plan: "free",
  balance: 30,
  total: 30,
  renewsInDays: 12,
};

const SLOPER: SloperListItem = {
  id: "sl1",
  name: "Base blusa",
  garmentType: "blouse",
  baseSize: "M",
  updatedAt: new Date("2026-08-01T12:00:00Z").toISOString(),
  thumbnailSvg: "<svg/>",
};

function renderShell() {
  return renderWithIntl(
    <SlopersShell userEmail="ana@example.com" credits={CREDITS} />,
  );
}

describe("SlopersShell", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(listSlopers).mockReset();
    vi.mocked(createPattern).mockReset();
    useSlopersStore.setState({
      ready: false,
      error: false,
      actionError: null,
      slopers: [],
    });
  });

  it("announces the load through a live region while the list is in flight", () => {
    // Never resolves: the loading state is the whole assertion.
    vi.mocked(listSlopers).mockReturnValue(new Promise(() => {}));
    renderShell();

    // role="status", so a screen reader hears it -- the core-flow-must-be
    // -audible rule, same as every other screen's loading state.
    expect(screen.getByRole("status")).toHaveTextContent(ptBR.Slopers.loading);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the saved bases once the list lands", async () => {
    vi.mocked(listSlopers).mockResolvedValue([SLOPER]);
    renderShell();

    expect(await screen.findByText(SLOPER.name)).toBeVisible();
    // countLabel is an ICU plural -- resolved through the real catalog
    // rather than pasted, so a copy change is a one-place edit (#106).
    const t = translatorFor("Slopers");
    expect(screen.getByText(t("countLabel", { count: 1 }))).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the empty state, not an error, for an account with no bases", async () => {
    vi.mocked(listSlopers).mockResolvedValue([]);
    renderShell();

    expect(await screen.findByText(ptBR.Slopers.emptyTitle)).toBeVisible();
    // The description points at where a base is actually created, since
    // there is no create affordance on this screen at all.
    expect(screen.getByText(ptBR.Slopers.emptyDescription)).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("replaces the content region with an alert when the load fails", async () => {
    vi.mocked(listSlopers).mockRejectedValue(new ApiError(500, "server_error"));
    renderShell();

    // role="alert", not "status": a failed load is an error, not progress.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        ptBR.Slopers.loadError,
      ),
    );
    // And the grid is gone entirely -- no empty state pretending the
    // account simply has no bases, which is the honest-failure rule.
    expect(screen.queryByText(ptBR.Slopers.emptyTitle)).toBeNull();
  });

  it("navigates to the new pattern when a base is used", async () => {
    vi.mocked(listSlopers).mockResolvedValue([SLOPER]);
    vi.mocked(createPattern).mockResolvedValue({ id: "p9" });
    renderShell();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: ptBR.SloperCard.useButton }),
    );

    // The base's id is what makes this a free, already-drafted create
    // rather than a blank pattern.
    expect(createPattern).toHaveBeenCalledWith(SLOPER.id);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pattern/p9"));
  });

  // Bases.dc.html's sidebar has no "＋ Nova base" of its own -- a base is
  // only ever created from the editor's "Salvar como base", so this screen
  // must not offer a blank-pattern shortcut anywhere (unlike Dashboard).
  it("renders no new-pattern button in its sidebar", async () => {
    vi.mocked(listSlopers).mockResolvedValue([SLOPER]);
    renderShell();

    await screen.findByText(SLOPER.name);
    expect(
      screen.queryByRole("button", { name: /novo molde/i }),
    ).not.toBeInTheDocument();
  });

  // The point of this screen owning its own store: a failed create here has
  // to surface HERE, not on the dashboard whose ActionErrorNotice is not
  // rendered.
  it("keeps the list usable and shows a dismissible notice when a create fails", async () => {
    vi.mocked(listSlopers).mockResolvedValue([SLOPER]);
    vi.mocked(createPattern).mockRejectedValue(
      new ApiError(429, "rate_limited"),
    );
    renderShell();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: ptBR.SloperCard.useButton }),
    );

    await waitFor(() =>
      expect(screen.getByText(ptBR.ActionErrorNotice.message)).toBeVisible(),
    );
    // Never navigates on a failed create -- createPattern resolves to null
    // rather than rejecting precisely so the caller can skip the push.
    expect(push).not.toHaveBeenCalled();
    // The list is still there: a failed mutation is not a failed load.
    expect(screen.getByText(SLOPER.name)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: ptBR.ActionErrorNotice.dismiss }),
    );
    expect(screen.queryByText(ptBR.ActionErrorNotice.message)).toBeNull();
  });

  it("renders through AppShell, with a back button to the dashboard", async () => {
    vi.mocked(listSlopers).mockResolvedValue([]);
    renderShell();
    const user = userEvent.setup();

    await screen.findByText(ptBR.Slopers.emptyTitle);
    // By role: the sidebar's own studioBasesLabel is the same words as the
    // header title, so getByText would match two nodes.
    expect(
      screen.getByRole("heading", { name: ptBR.Slopers.title }),
    ).toBeVisible();

    // The design moves the subtitle out of the top PageHeader into the
    // content column -- scoped to each landmark so a regression that puts it
    // back in the header (or drops it from the content column) is caught,
    // not just "the text is somewhere on screen."
    expect(
      within(screen.getByRole("banner")).queryByText(ptBR.Slopers.subtitle),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).getByText(ptBR.Slopers.subtitle),
    ).toBeVisible();

    // The screen cannot hand-roll a header, so this is really an assertion
    // that it goes through AppShell/PageHeader at all.
    await user.click(
      screen.getByRole("button", { name: ptBR.PageHeader.backTitle }),
    );
    expect(push).toHaveBeenCalledWith("/");
  });
});
