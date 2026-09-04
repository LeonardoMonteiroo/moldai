import { describe, it, expect, vi } from "vitest";
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
    engine: null,
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
    engine: null,
    reason: "adjust",
    cost: 1,
    createdAt: "2026-08-17T12:00:00.000Z",
  };
  return [older, newer];
}

describe("VersionCompare", () => {
  it("shows a placeholder rather than comparing with fewer than two versions", () => {
    const [older] = makeVersions();
    renderWithIntl(
      <VersionCompare
        versions={[older]}
        fromVersion={1}
        toVersion={1}
        restoring={false}
        onRestore={vi.fn()}
      />,
    );
    expect(
      screen.getByText(ptBR.VersionCompare.needsTwoVersions),
    ).toBeInTheDocument();
  });

  it("overlays the older version dashed and the newer solid; toggling sobrepor off leaves only the newer", async () => {
    const [older, newer] = makeVersions();
    // Newest-first, the real API's own order (lib/db/patternVersion.ts).
    const { container } = renderWithIntl(
      <VersionCompare
        versions={[newer, older]}
        fromVersion={1}
        toVersion={2}
        restoring={false}
        onRestore={vi.fn()}
      />,
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
    renderWithIntl(
      <VersionCompare
        versions={[newer, older]}
        fromVersion={1}
        toVersion={2}
        restoring={false}
        onRestore={vi.fn()}
      />,
    );

    expect(
      screen.getByText(ptBR.VersionCompare.armholeDeltaLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.VersionCompare.consumptionDeltaLabel),
    ).toBeInTheDocument();
    // The armhole was deepened by 3cm between versions -- the two rendered
    // numbers must differ (not asserting exact cm, which would duplicate
    // the drafting engine's own tests; only that a real delta reaches the UI,
    // with a real +/− sign, not the unchanged "—" placeholder).
    const armholeRow = screen
      .getByText(ptBR.VersionCompare.armholeDeltaLabel)
      .closest("li");
    expect(armholeRow?.textContent).toMatch(/→/);
    expect(armholeRow?.textContent).toMatch(/[+−]/);
    // A real (non-"—") delta is colored olive-dark, not the muted
    // unchanged color.
    const spans = armholeRow?.querySelectorAll("span") ?? [];
    const deltaCell = spans[spans.length - 1];
    expect(deltaCell).toHaveClass("text-olive-dark");
    expect(deltaCell).not.toHaveClass("text-muted");
  });

  it("shows a comprimento delta alongside cava and consumo (#234)", () => {
    const [older, newer] = makeVersions();
    renderWithIntl(
      <VersionCompare
        versions={[newer, older]}
        fromVersion={1}
        toVersion={2}
        restoring={false}
        onRestore={vi.fn()}
      />,
    );

    const lengthRow = screen
      .getByText(ptBR.VersionCompare.lengthDeltaLabel)
      .closest("li");
    expect(lengthRow?.textContent).toMatch(/→/);
    expect(lengthRow?.textContent).toMatch(/cm/);
    // Shown alongside the existing two, not replacing them.
    expect(
      screen.getByText(ptBR.VersionCompare.armholeDeltaLabel),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.VersionCompare.consumptionDeltaLabel),
    ).toBeInTheDocument();
  });

  // The design shows an unchanged metric as "—" in muted color, not a
  // spurious "+0,0" -- both versions here share the exact same spec, so
  // every metric is identical.
  it("shows the unchanged placeholder, not a spurious delta, when a metric hasn't moved", () => {
    const [older] = makeVersions();
    const sameSpecTwin: PatternVersionEntry = {
      ...older,
      id: "pv1b",
      version: 3,
      createdAt: "2026-08-17T13:00:00.000Z",
    };
    renderWithIntl(
      <VersionCompare
        versions={[sameSpecTwin, older]}
        fromVersion={1}
        toVersion={3}
        restoring={false}
        onRestore={vi.fn()}
      />,
    );

    const armholeRow = screen
      .getByText(ptBR.VersionCompare.armholeDeltaLabel)
      .closest("li");
    expect(armholeRow?.textContent).toContain("—");
    // Muted, not the changed-delta olive-dark color -- the delta cell is the
    // row's last span (label, range, delta, in that DOM order).
    const spans = armholeRow?.querySelectorAll("span") ?? [];
    const deltaCell = spans[spans.length - 1];
    expect(deltaCell).toHaveClass("text-muted");
    expect(deltaCell).not.toHaveClass("text-olive-dark");
  });

  it("derives the compare canvas caption from the real drafted piece names", () => {
    const [older, newer] = makeVersions();
    renderWithIntl(
      <VersionCompare
        versions={[newer, older]}
        fromVersion={1}
        toVersion={2}
        restoring={false}
        onRestore={vi.fn()}
      />,
    );

    // Never a hardcoded "Frente · Costas · Manga" -- derived from whatever
    // pieces this garment actually drafted, joined the same way.
    const caption = document.querySelector(
      '[data-slot="version-compare-overlay"] span',
    );
    expect(caption?.textContent).toContain("·");
  });

  it("restoring the 'from' version opens the confirm flow and calls onRestore with its id", async () => {
    const [older, newer] = makeVersions();
    const onRestore = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <VersionCompare
        versions={[newer, older]}
        fromVersion={1}
        toVersion={2}
        restoring={false}
        onRestore={onRestore}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: ptBR.VersionList.restoreButton.replace("{version}", "1"),
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.VersionList.restoreModalConfirmButton,
      }),
    );

    expect(onRestore).toHaveBeenCalledWith("pv1");
  });
});
