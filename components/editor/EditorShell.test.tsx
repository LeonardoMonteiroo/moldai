import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithIntl, ptBR, screen } from "@/components/test-utils";
import type { Pattern } from "@/lib/types";

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
vi.mock("@/lib/api-client", () => ({
  fetchPattern: vi.fn(() => new Promise(() => {})),
  generate: vi.fn(),
  graduate: vi.fn(),
  resolveConflict: vi.fn(),
  purchase: vi.fn(),
}));

import { useEditorStore } from "@/lib/store";
import { EditorShell } from "./EditorShell";

function pattern(updatedAt: string): Pattern {
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
