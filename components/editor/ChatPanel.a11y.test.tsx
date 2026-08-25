import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  act,
  translatorFor,
} from "@/components/test-utils";
import type { ChatMessage } from "@/lib/types";
import { COSTS } from "@/lib/types";

vi.mock("@/lib/api-client", () => ({
  fetchPattern: vi.fn(() => new Promise(() => {})),
  generate: vi.fn(),
  graduate: vi.fn(),
  resolveConflict: vi.fn(),
  purchase: vi.fn(),
}));

// #106: mocked the same way as PlanSection.test.tsx -- a shallow, mutable
// copy of COSTS lets these tests force each plural boundary (0, 1, 2)
// through the real cost the component reads.
vi.mock("@/lib/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/types")>();
  return { ...actual, COSTS: { ...actual.COSTS } };
});

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

import { useEditorStore } from "@/lib/store";
import { ChatPanel } from "./ChatPanel";
import { GeneratingOverlay } from "./GeneratingOverlay";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    author: "ai",
    text: "Pronto, montei a blusa.",
    createdAt: 1,
    ...overrides,
  };
}

describe("editor live regions", () => {
  beforeEach(() => {
    useEditorStore.setState({
      chat: [],
      conflict: null,
      generationStatus: "idle",
      generationStepIndex: 0,
      credits: { plan: "free", balance: 30, total: 30, renewsInDays: 30 },
    });
  });

  // The whole core flow — send a request, get a pattern back — produced no
  // announcement at all, so a screen reader user had no way to know a reply
  // had arrived.
  it("marks the chat thread as a log so new replies are announced", () => {
    useEditorStore.setState({ chat: [message()] });

    renderWithIntl(<ChatPanel />);

    const log = screen.getByRole("log");
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log).toContainElement(screen.getByText("Pronto, montei a blusa."));
  });

  it("announces a reply that arrives after the first render", async () => {
    renderWithIntl(<ChatPanel />);

    await act(async () => {
      useEditorStore.setState({ chat: [message({ text: "Manga refeita." })] });
    });

    expect(screen.getByRole("log")).toContainElement(
      screen.getByText("Manga refeita."),
    );
  });

  it("announces generation progress", () => {
    renderWithIntl(<GeneratingOverlay stepIndex={1} onCancel={vi.fn()} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(ptBR.GeneratingOverlay.steps.stage2);
  });
});

// #106: "−{cost} crédito · gerando…" was hardcoded singular -- it read
// "−2 crédito · gerando…" (or "−0 crédito · gerando…") at any COSTS.adjust
// value other than exactly 1.
describe("ChatPanel generating cost pluralization (#106)", () => {
  const ORIGINAL_COSTS = { ...COSTS };
  afterEach(() => Object.assign(COSTS, ORIGINAL_COSTS));

  it("pluralizes the in-flight generation cost at 0, 1 and 2", () => {
    const tChat = translatorFor("ChatPanel");
    for (const cost of [0, 1, 2]) {
      Object.assign(COSTS, { adjust: cost });
      useEditorStore.setState({
        chat: [],
        conflict: null,
        generationStatus: "generating",
        generationStepIndex: 0,
        credits: { plan: "free", balance: 30, total: 30, renewsInDays: 30 },
      });
      const { unmount } = renderWithIntl(<ChatPanel />);
      expect(
        screen.getByText(tChat("generatingCost", { cost })),
      ).toBeInTheDocument();
      unmount();
    }
  });
});
