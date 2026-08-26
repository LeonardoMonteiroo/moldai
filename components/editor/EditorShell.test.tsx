import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  waitFor,
  userEvent,
  act,
} from "@/components/test-utils";
import type { PatternRecord } from "@/lib/types";

// PageHeader (rendered via AppShell) calls useRouter() for the avatar menu's
// sign-out; jsdom has no App Router mounted, so it's mocked like the other
// AppShell/PageHeader/DashboardShell tests do.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// jsdom doesn't implement scrollTo; ChatPanel's own auto-scroll effect (not
// a Radix primitive, so vitest.setup.ts's guarded stubs don't cover it) calls
// it directly. Scoped to this file rather than the shared setup.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// EditorShell calls store.init(patternId) on mount, which calls
// api.fetchPattern. Mocked to a never-resolving promise so it never
// overwrites the state we seed directly below, keeping the assertion
// deterministic without needing to await anything async here.
vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return {
    ApiError: actual.ApiError,
    errorCode: actual.errorCode,
    fetchPattern: vi.fn(() => new Promise(() => {})),
    generate: vi.fn(),
    graduate: vi.fn(),
    resolveConflict: vi.fn(),
    purchase: vi.fn(),
  };
});

import { useEditorStore } from "@/lib/store";
import { ApiError, fetchPattern } from "@/lib/api-client";
import { EditorShell } from "./EditorShell";

function pattern(updatedAt: string): PatternRecord {
  return {
    id: "p1",
    name: "Vestido",
    version: 3,
    updatedAt,
    baseSize: "M",
    unit: "cm",
    sizes: ["M"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: {},
    pieces: [],
  };
}

describe("EditorShell", () => {
  beforeEach(() => {
    useEditorStore.setState({
      // #32: init() now resets the whole per-pattern slice when the store's
      // patternId differs from the one it's asked to load, treating that as
      // a genuine pattern switch. Every test here renders <EditorShell
      // patternId="p1" /> against state it seeds directly (not through
      // init), so patternId has to already read "p1" too, or that same-id
      // check sees a (false) switch and wipes the seeded pattern/ready
      // right back out before the assertions run.
      patternId: "p1",
      generationStatus: "idle",
      conflict: null,
      paywall: {
        open: false,
        required: 0,
        balance: 0,
        action: null,
        retry: null,
      },
      credits: { plan: "free", balance: 30, total: 30, renewsInDays: 30 },
    });
  });

  it("derives the saved-time label live from pattern.updatedAt, not a frozen string", () => {
    // 5 minutes before "now": the render happens a few ms later, never
    // enough to roll into the next minute bucket (lib/format.ts floors).
    const updatedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    useEditorStore.setState({ ready: true, pattern: pattern(updatedAt) });

    renderWithIntl(<EditorShell userEmail="user@example.com" patternId="p1" />);

    const expected = ptBR.EditorShell.savedVersion
      .replace("{savedAgo}", ptBR.Format.relativeMinutes.replace("{n}", "5"))
      .replace("{version}", "3");
    expect(screen.getByText(expected)).toBeInTheDocument();
    // Pins the bug fix, not just the i18n move: the old behavior was a
    // persisted "salvo agora" that never changed after reload.
    expect(screen.queryByText(/salvo agora/i)).not.toBeInTheDocument();
  });

  // A failed load used to leave `ready` false forever, so this screen showed
  // its "Carregando molde…" state permanently with no hint of what went wrong.
  it("shows a load error with a retry instead of loading forever", async () => {
    useEditorStore.setState({ ready: false, error: null, pattern: null });
    vi.mocked(fetchPattern).mockRejectedValueOnce(
      new ApiError(500, "request_failed"),
    );

    renderWithIntl(<EditorShell userEmail="user@example.com" patternId="p1" />);

    await waitFor(() => {
      expect(screen.getByText(ptBR.EditorShell.loadError)).toBeInTheDocument();
    });
    expect(
      screen.queryByText(ptBR.EditorShell.loading),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ptBR.EditorShell.retryButton }),
    ).toBeInTheDocument();
  });

  it("tells the user to sign in again when the session expired", async () => {
    useEditorStore.setState({ ready: false, error: null, pattern: null });
    vi.mocked(fetchPattern).mockRejectedValueOnce(
      new ApiError(401, "unauthorized"),
    );

    renderWithIntl(<EditorShell userEmail="user@example.com" patternId="p1" />);

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.EditorShell.sessionExpired),
      ).toBeInTheDocument();
    });
  });

  // A failed action on an already-loaded pattern must not be silent: the store
  // rolls the optimistic message back, so without this the click just seemed
  // to do nothing at all.
  it("shows a dismissible notice when an action fails on a loaded pattern", async () => {
    useEditorStore.setState({
      ready: true,
      pattern: pattern(new Date().toISOString()),
      error: null,
    });

    renderWithIntl(<EditorShell userEmail="user@example.com" patternId="p1" />);
    // Set after mount, because init() clears `error` as it starts — which is
    // also the real sequence: the pattern loads, then an action fails.
    await act(async () => {
      useEditorStore.setState({ error: "request_failed" });
    });

    expect(
      screen.getByText(ptBR.ActionErrorNotice.message),
    ).toBeInTheDocument();
    // The pattern is still on screen — this is a notice, not a replacement.
    expect(screen.getByText("Vestido")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: ptBR.ActionErrorNotice.dismiss }),
    );
    expect(
      screen.queryByText(ptBR.ActionErrorNotice.message),
    ).not.toBeInTheDocument();
  });

  it("recomputes the label from a different updatedAt across renders (proves it's live)", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    useEditorStore.setState({ ready: true, pattern: pattern(oneHourAgo) });

    renderWithIntl(<EditorShell userEmail="user@example.com" patternId="p1" />);

    const expected = ptBR.EditorShell.savedVersion
      .replace("{savedAgo}", ptBR.Format.relativeHours.replace("{n}", "1"))
      .replace("{version}", "3");
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
