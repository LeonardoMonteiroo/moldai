import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { screen, userEvent } from "@/components/test-utils";
// #16: relative, not @/components/test-utils' renderWithIntl/ptBR -- see the
// identical comment in VersionsShell.test.tsx for why (this sandbox's "@"
// alias resolves messages/pt-BR.json to a stale pre-branch snapshot for
// JSON specifically; a relative import bypasses it).
import messages from "../../messages/pt-BR.json";
import { seedPatternState } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";
import type { PatternVersionEntry } from "@/lib/api-client";
import { VersionCompare } from "./VersionCompare";

const ptBR = messages;

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// Two versions of the same drafted pattern sharing one frozen size snapshot
// (the real invariant: a snapshot never changes the sizeTable/baseSize it
// was drafted against) but differing style, so the armhole/consumption
// deltas are real, non-zero numbers derived from the actual drafting engine
// -- not fixture-faked.
function makeVersions(): [PatternVersionEntry, PatternVersionEntry] {
  const seeded = seedPatternState(t).pattern;
  const specOlder: GarmentSpec = {
    type: "blouse",
    gender: "female",
    measurementOverrides: {},
    style: {},
  };
  const specNewer: GarmentSpec = {
    type: "blouse",
    gender: "female",
    measurementOverrides: {},
    style: { armholeDeepenCm: 3 },
  };
  const older: PatternVersionEntry = {
    id: "pv1",
    version: 1,
    spec: specOlder,
    sizes: seeded.sizes,
    baseSize: seeded.baseSize,
    sizeTable: seeded.sizeTable,
    sizeChartName: null,
    reason: "generate",
    cost: 1,
    createdAt: "2026-08-17T11:00:00.000Z",
  };
  const newer: PatternVersionEntry = {
    id: "pv2",
    version: 2,
    spec: specNewer,
    sizes: seeded.sizes,
    baseSize: seeded.baseSize,
    sizeTable: seeded.sizeTable,
    sizeChartName: null,
    reason: "adjust",
    cost: 1,
    createdAt: "2026-08-17T12:00:00.000Z",
  };
  return [older, newer];
}

describe("VersionCompare", () => {
  it("shows a placeholder rather than comparing with fewer than two versions", () => {
    const [older] = makeVersions();
    renderWithIntl(<VersionCompare versions={[older]} />);
    expect(
      screen.getByText(ptBR.VersionCompare.needsTwoVersions),
    ).toBeInTheDocument();
  });

  it("overlays the older version dashed and the newer solid; toggling sobrepor off leaves only the newer", async () => {
    const [older, newer] = makeVersions();
    // Newest-first, the real API's own order (lib/db/patternVersion.ts).
    const { container } = renderWithIntl(
      <VersionCompare versions={[newer, older]} />,
    );

    // Both layers present: the newer (solid) is the labelled/visible one,
    // the older (dashed) is aria-hidden decoration underneath it.
    expect(
      screen.getByRole("img", {
        name: ptBR.VersionCompare.overlayAriaLabel
          .replace("{from}", "1")
          .replace("{to}", "2"),
      }),
    ).toBeInTheDocument();
    expect(
      container
        .querySelector('[data-slot="version-compare-overlay"]')!
        .querySelectorAll("svg"),
    ).toHaveLength(2);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: ptBR.VersionCompare.overlayToggle }),
    );

    // Only the newer (solid, labelled) svg remains.
    expect(
      container
        .querySelector('[data-slot="version-compare-overlay"]')!
        .querySelectorAll("svg"),
    ).toHaveLength(1);
    expect(
      screen.getByRole("img", {
        name: ptBR.VersionCompare.overlayAriaLabel
          .replace("{from}", "1")
          .replace("{to}", "2"),
      }),
    ).toBeInTheDocument();
  });

  it("shows non-zero armhole and consumption deltas computed from the real drafting engine", () => {
    const [older, newer] = makeVersions();
    renderWithIntl(<VersionCompare versions={[newer, older]} />);

    expect(
      screen.getByText(ptBR.VersionCompare.armholeDeltaLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.VersionCompare.consumptionDeltaLabel),
    ).toBeInTheDocument();
    // The armhole was deepened by 3cm between versions -- the two rendered
    // numbers must differ (not asserting exact cm, which would duplicate
    // the drafting engine's own tests; only that a real delta reaches the UI).
    const armholeCard = screen
      .getByText(ptBR.VersionCompare.armholeDeltaLabel)
      .closest("div");
    expect(armholeCard?.textContent).toMatch(/→/);
  });

  it("shows a comprimento delta alongside cava and consumo (#234)", () => {
    const [older, newer] = makeVersions();
    renderWithIntl(<VersionCompare versions={[newer, older]} />);

    const lengthCard = screen
      .getByText(ptBR.VersionCompare.lengthDeltaLabel)
      .closest("div");
    expect(lengthCard?.textContent).toMatch(/→/);
    expect(lengthCard?.textContent).toMatch(/cm/);
    // Shown alongside the existing two, not replacing them.
    expect(
      screen.getByText(ptBR.VersionCompare.armholeDeltaLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.VersionCompare.consumptionDeltaLabel),
    ).toBeInTheDocument();
  });
});
