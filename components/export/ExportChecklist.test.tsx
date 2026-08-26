import { useState } from "react";
import { describe, it, expect } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
} from "@/components/test-utils";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec, Pattern } from "@/lib/types";
import { buildExportModel } from "@/lib/export/model";
import { planCutLayout, FABRIC_WIDTHS_CM } from "@/lib/export/cutplan";
import { ExportChecklist, isOutlineClosed } from "./ExportChecklist";

const BLOUSE: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: {},
};

function draftedPattern(): Pattern {
  const state = seedPatternState(t);
  applyGarmentSpec(state, BLOUSE, t);
  return state.pattern;
}

const meters = (cm: number) => (cm / 100).toFixed(2).replace(".", ",") + " m";

function Host({
  pattern,
  conflictActive,
}: {
  pattern: Pattern;
  conflictActive: boolean;
}) {
  const [fabricWidthCm, setFabricWidthCm] = useState<number>(150);
  return (
    <ExportChecklist
      pattern={pattern}
      conflictActive={conflictActive}
      fabricWidthCm={fabricWidthCm}
      onFabricWidthChange={setFabricWidthCm}
    />
  );
}

describe("isOutlineClosed", () => {
  it("is true for a loop whose last segment returns to start", () => {
    expect(
      isOutlineClosed({
        start: { x: 0, y: 0 },
        segs: [
          { kind: "line", to: { x: 10, y: 0 } },
          { kind: "line", to: { x: 10, y: 10 } },
          { kind: "line", to: { x: 0, y: 0 } },
        ],
      }),
    ).toBe(true);
  });

  it("is false for an outline that never comes back to its start", () => {
    expect(
      isOutlineClosed({
        start: { x: 0, y: 0 },
        segs: [
          { kind: "line", to: { x: 10, y: 0 } },
          { kind: "line", to: { x: 10, y: 10 } },
        ],
      }),
    ).toBe(false);
  });

  it("is false for an outline with no segments at all", () => {
    expect(isOutlineClosed({ start: { x: 0, y: 0 }, segs: [] })).toBe(false);
  });
});

// #17 AC: "An active seam conflict blocks the download and says so" — this
// covers the checklist half of that (Footer/ExportShell disabling the
// download button is covered separately).
describe("ExportChecklist — conflito de costura", () => {
  it("passes the conflict row when there is no active conflict", () => {
    renderWithIntl(<Host pattern={draftedPattern()} conflictActive={false} />);
    expect(
      screen.getByText(ptBR.Export.checklistConflictPass),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(ptBR.Export.checklistConflictFail),
    ).not.toBeInTheDocument();
  });

  it("fails the conflict row while a conflict is active", () => {
    renderWithIntl(<Host pattern={draftedPattern()} conflictActive={true} />);
    expect(
      screen.getByText(ptBR.Export.checklistConflictFail),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(ptBR.Export.checklistConflictPass),
    ).not.toBeInTheDocument();
  });
});

describe("ExportChecklist — peças fechadas", () => {
  it("reports every piece as closed for a freshly drafted pattern", () => {
    const pattern = draftedPattern();
    const model = buildExportModel(pattern, t);
    const total = model.pieces.length;
    const closed = model.pieces.filter((p) =>
      isOutlineClosed(p.outline),
    ).length;
    expect(total).toBeGreaterThan(0);
    expect(closed).toBe(total);

    renderWithIntl(<Host pattern={pattern} conflictActive={false} />);
    const expected = ptBR.Export.checklistPiecesPass
      .replace("{closed}", String(closed))
      .replace("{total}", String(total));
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe("ExportChecklist — consumo estimado (lib/export/cutplan#planCutLayout)", () => {
  it("shows a consumption value derived from planCutLayout for the selected fabric width", () => {
    const pattern = draftedPattern();
    renderWithIntl(<Host pattern={pattern} conflictActive={false} />);

    const plan = planCutLayout(pattern, 150, t);
    const expected = ptBR.Export.checklistConsumptionValue
      .replace("{length}", meters(plan.lengthCm))
      .replace("{width}", meters(150));
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("recomputes the consumption value when a different fabric width is chosen", async () => {
    const user = userEvent.setup();
    const pattern = draftedPattern();
    renderWithIntl(<Host pattern={pattern} conflictActive={false} />);

    const otherWidth = FABRIC_WIDTHS_CM.find((w) => w !== 150)!;
    await user.click(screen.getByText(meters(otherWidth)));

    const plan = planCutLayout(pattern, otherWidth, t);
    const expected = ptBR.Export.checklistConsumptionValue
      .replace("{length}", meters(plan.lengthCm))
      .replace("{width}", meters(otherWidth));
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });
});

describe("ExportChecklist — molde em branco", () => {
  it("reports the consumption row as unavailable rather than crashing", () => {
    renderWithIntl(
      <Host pattern={seedPatternState(t).pattern} conflictActive={false} />,
    );
    expect(
      screen.getByText(ptBR.Export.checklistConsumptionUnavailable),
    ).toBeInTheDocument();
  });
});
