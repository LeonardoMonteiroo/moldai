import { describe, it, expect, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";
import type { PatternListItem } from "@/lib/api-client";

const DISMISSED_KEY = "moldai.onboardingChecklistDismissed";

function pattern(overrides: Partial<PatternListItem> = {}): PatternListItem {
  return {
    id: "p1",
    name: "Novo molde",
    garmentType: "blouse",
    updatedAt: "2026-08-30T00:00:00.000Z",
    thumbnailSvg: "<svg/>",
    ...overrides,
  };
}

const noProgress = {
  hasCustomSizeChart: false,
  hasExported: false,
  hasImported: false,
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("OnboardingChecklistCard", () => {
  it("renders all 5 step titles", () => {
    renderWithIntl(
      <OnboardingChecklistCard patterns={[]} checklist={noProgress} />,
    );
    expect(
      screen.getByText(ptBR.OnboardingChecklistCard.step1Title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.OnboardingChecklistCard.step5Title),
    ).toBeInTheDocument();
  });

  it("marks 'gerar primeiro molde' done only once a pattern has been drafted", () => {
    renderWithIntl(
      <OnboardingChecklistCard
        patterns={[pattern({ garmentType: null })]}
        checklist={noProgress}
      />,
    );
    expect(
      screen.queryAllByText(ptBR.OnboardingChecklistCard.doneLabel),
    ).toHaveLength(0);
  });

  it("marks 'gerar primeiro molde' done once a real pattern exists", () => {
    renderWithIntl(
      <OnboardingChecklistCard
        patterns={[pattern({ garmentType: "blouse" })]}
        checklist={noProgress}
      />,
    );
    expect(
      screen.getAllByText(ptBR.OnboardingChecklistCard.doneLabel),
    ).toHaveLength(1);
  });

  it("reflects hasCustomSizeChart/hasExported/hasImported independently", () => {
    renderWithIntl(
      <OnboardingChecklistCard
        patterns={[]}
        checklist={{
          hasCustomSizeChart: true,
          hasExported: true,
          hasImported: false,
        }}
      />,
    );
    expect(
      screen.getAllByText(ptBR.OnboardingChecklistCard.doneLabel),
    ).toHaveLength(2);
  });

  it("step 5 is always disabled and badged, never a checkmark", () => {
    renderWithIntl(
      <OnboardingChecklistCard
        patterns={[pattern({ garmentType: "blouse" })]}
        checklist={{
          hasCustomSizeChart: true,
          hasExported: true,
          hasImported: true,
        }}
      />,
    );
    // All 4 real steps done, step 5 can never be.
    expect(
      screen.getAllByText(ptBR.OnboardingChecklistCard.doneLabel),
    ).toHaveLength(4);
    expect(
      screen.getByText(ptBR.OnboardingChecklistCard.step5Badge),
    ).toBeInTheDocument();
  });

  it("links the 'exportar' step to the most recently updated pattern's export screen", () => {
    renderWithIntl(
      <OnboardingChecklistCard
        patterns={[
          pattern({ id: "recent", garmentType: "blouse" }),
          pattern({ id: "older", garmentType: "dress" }),
        ]}
        checklist={noProgress}
      />,
    );
    expect(
      screen.getByRole("link", { name: ptBR.OnboardingChecklistCard.step3Cta }),
    ).toHaveAttribute("href", "/pattern/recent/export");
  });

  it("has no 'exportar' link when there are no patterns yet", () => {
    renderWithIntl(
      <OnboardingChecklistCard patterns={[]} checklist={noProgress} />,
    );
    expect(
      screen.queryByRole("link", {
        name: ptBR.OnboardingChecklistCard.step3Cta,
      }),
    ).not.toBeInTheDocument();
  });

  it("dismissing hides the card and persists to localStorage", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <OnboardingChecklistCard patterns={[]} checklist={noProgress} />,
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.OnboardingChecklistCard.dismissLabel,
      }),
    );
    expect(
      screen.queryByText(ptBR.OnboardingChecklistCard.title),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("1");
  });

  it("renders nothing when already dismissed", () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    renderWithIntl(
      <OnboardingChecklistCard patterns={[]} checklist={noProgress} />,
    );
    expect(
      screen.queryByText(ptBR.OnboardingChecklistCard.title),
    ).not.toBeInTheDocument();
  });

  // DASH-01/02/03/04: docs/design/screens/Dashboard.dc.html:128-140 specifies
  // 14px/16px card padding, a 10px inter-block gap, the title at the
  // text-control (13.5px) scale, a 5px-tall progress track, and a 1px
  // top-border divider between every item row.
  it("matches the redesign reference's card padding, gap and title scale", () => {
    const { container } = renderWithIntl(
      <OnboardingChecklistCard patterns={[]} checklist={noProgress} />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveClass("px-[16px]", "py-[14px]", "gap-[10px]");
    expect(card).not.toHaveClass("p-[18px]");
    expect(
      screen.getByText(ptBR.OnboardingChecklistCard.title, { exact: false }),
    ).toHaveClass("text-control");
  });

  it("renders the progress track at the thin (5px) size", () => {
    const { container } = renderWithIntl(
      <OnboardingChecklistCard patterns={[]} checklist={noProgress} />,
    );
    const track = container.querySelector('[data-slot="progress"]');
    expect(track).toHaveClass("h-[5px]");
    expect(track).not.toHaveClass("h-2");
  });

  it("separates every checklist row with a top-border divider", () => {
    renderWithIntl(
      <OnboardingChecklistCard patterns={[]} checklist={noProgress} />,
    );
    const rows = screen
      .getAllByText(ptBR.OnboardingChecklistCard.step1Title, {
        exact: false,
      })[0]
      .closest("ul")!.children;
    expect(rows.length).toBe(5);
    for (const row of Array.from(rows)) {
      expect(row).toHaveClass("border-t");
    }
  });
});
