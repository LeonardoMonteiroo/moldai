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
});
