import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import { MEASUREMENT_RANGES, SIZE_TABLE } from "@/lib/measurements";
import type { SizeChartData, SizeChartListEntry } from "@/lib/types";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";
import { SizeChartTable } from "./SizeChartTable";

const BASE: SizeChartData = {
  name: "Minha grade",
  gender: "female",
  bodyType: "straight",
  isSystem: false,
  sizes: ["P", "M", "G"],
  baseSizeIndex: 1,
  baseMeasurements: { ...SIZE_TABLE.M },
  progressionRule: { bust: 4 },
  overrides: {},
};

function seed(draft: Partial<SizeChartData> = {}) {
  const data = { ...BASE, ...draft };
  useSizeChartsStore.setState({
    draft: data,
    selectedId: "g1",
    editingRule: false,
    dirty: false,
    charts: [
      {
        id: "g1",
        updatedAt: "2026-08-21T00:00:00.000Z",
        isActive: false,
        ...data,
      } as SizeChartListEntry,
    ],
  });
}

// #46: findable by its own name (measurement · size), not by scanning for a
// value that happens to be unique in the fixture -- 45 identical, unlabelled
// spinbuttons is exactly the bug this issue is about, so a test that can
// only distinguish a cell by its numeric value would not actually catch a
// regression here.
function bustBaseCell() {
  return screen.getByRole("spinbutton", {
    name: `${ptBR.SizeChartTable.measurement.bust} · M`,
  }) as HTMLInputElement;
}

describe("SizeChartTable measurement cells", () => {
  beforeEach(() => seed());

  // The inputs carried no bounds at all, so nothing told the user (or the
  // browser) what a plausible bust measurement even is.
  it("bounds each cell by its measurement's real range", () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();
    expect(cell).toHaveAttribute("min", String(MEASUREMENT_RANGES.bust.min));
    expect(cell).toHaveAttribute("max", String(MEASUREMENT_RANGES.bust.max));
  });

  // Number("") is 0, which was written straight into the chart and then
  // resolved back out clamped to the range minimum -- so clearing the bust cell
  // silently turned 92 into 70.
  it("does not turn a cleared cell into the range minimum", async () => {
    renderWithIntl(<SizeChartTable />);

    await userEvent.clear(bustBaseCell());

    expect(useSizeChartsStore.getState().draft!.baseMeasurements.bust).toBe(92);
  });

  it("shows the field empty while it is being cleared, not a substituted number", async () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();

    await userEvent.clear(cell);

    expect(cell).toHaveValue(null);
  });

  it("commits a valid edit", async () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();

    await userEvent.clear(cell);
    await userEvent.type(cell, "96");
    await userEvent.tab();

    expect(useSizeChartsStore.getState().draft!.baseMeasurements.bust).toBe(96);
  });

  // Typing 500 used to display 140 (the clamp) with no explanation.
  it("flags an out-of-range value instead of silently substituting one", async () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();

    await userEvent.clear(cell);
    await userEvent.type(cell, "500");

    expect(cell).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText(
        ptBR.SizeChartTable.rangeHint
          .replace("{min}", String(MEASUREMENT_RANGES.bust.min))
          .replace("{max}", String(MEASUREMENT_RANGES.bust.max)),
      ),
    ).toBeInTheDocument();
  });

  it("does not commit an out-of-range value to the chart", async () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();

    await userEvent.clear(cell);
    await userEvent.type(cell, "500");
    await userEvent.tab();

    expect(useSizeChartsStore.getState().draft!.baseMeasurements.bust).toBe(92);
  });

  it("restores the stored value when an abandoned edit loses focus", async () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();

    await userEvent.clear(cell);
    await userEvent.tab();

    expect(cell).toHaveValue(92);
  });

  // #46: MEASUREMENT_KEYS × sizes is a 9x5 (or larger) grid of spinbuttons
  // that all previously announced identically -- a screen-reader user could
  // not tell the Busto/M cell from the Quadril/GG cell, and this grid feeds
  // buildSizeTable -> the frozen Pattern.sizeTable -> draftGarment, so a
  // mis-entered cell was silent and undiagnosable by name alone.
  it("gives every cell a distinct accessible name pairing its measurement and size", () => {
    renderWithIntl(<SizeChartTable />);

    expect(
      screen.getByRole("spinbutton", {
        name: `${ptBR.SizeChartTable.measurement.hip} · G`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", {
        name: `${ptBR.SizeChartTable.measurement.waist} · P`,
      }),
    ).toBeInTheDocument();
    // Same measurement, different size -- these must be two distinguishable
    // elements, not the same node matched twice.
    expect(
      screen.getByRole("spinbutton", {
        name: `${ptBR.SizeChartTable.measurement.bust} · P`,
      }),
    ).not.toBe(bustBaseCell());
  });

  // aria-invalid alone told a screen-reader user "invalid" with no way to
  // reach the accepted range, which lived in a separate, unlinked region.
  it("points the invalid cell's aria-describedby at the visible range hint", async () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();

    await userEvent.clear(cell);
    await userEvent.type(cell, "500");

    const describedBy = cell.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const hint = screen.getByText(
      ptBR.SizeChartTable.rangeHint
        .replace("{min}", String(MEASUREMENT_RANGES.bust.min))
        .replace("{max}", String(MEASUREMENT_RANGES.bust.max)),
    );
    expect(hint.id).toBe(describedBy);
  });

  it("clears aria-describedby once the cell is valid again", async () => {
    renderWithIntl(<SizeChartTable />);
    const cell = bustBaseCell();

    await userEvent.clear(cell);
    await userEvent.type(cell, "500");
    expect(cell).toHaveAttribute("aria-describedby");

    await userEvent.clear(cell);
    await userEvent.type(cell, "96");

    expect(cell).not.toHaveAttribute("aria-describedby");
  });
});

// #47: removing the base column had nowhere to re-anchor to, so
// baseSizeIndex silently pointed at a different size afterward and every
// pattern drafted from this chart used measurements the user never entered.
describe("SizeChartTable base column removal", () => {
  it("disables the remove button on the base column, with a reason", () => {
    seed(); // BASE: sizes ["P","M","G"], baseSizeIndex: 1 -> base is "M"

    renderWithIntl(<SizeChartTable />);

    const baseRemoveButton = screen.getByRole("button", {
      name: ptBR.SizeChartTable.removeBaseSizeTitle,
    });
    expect(baseRemoveButton).toBeDisabled();
    // aria-label alone reaches only assistive tech -- a sighted mouse user
    // hovering a disabled control needs the same reason, so it's also a
    // native tooltip (the AttachmentChips "em breve" precedent).
    expect(baseRemoveButton).toHaveAttribute(
      "title",
      ptBR.SizeChartTable.removeBaseSizeTitle,
    );
  });

  it("keeps the remove button enabled on non-base columns", () => {
    seed();
    renderWithIntl(<SizeChartTable />);

    const removeButtons = screen.getAllByRole("button", {
      name: ptBR.SizeChartTable.removeSizeTitle,
    });
    // P and G -- M (the base) is excluded by its own distinct label.
    expect(removeButtons).toHaveLength(2);
    removeButtons.forEach((button) => expect(button).toBeEnabled());
  });

  it("leaves baseSizeIndex and the size list unchanged when the base button is clicked", async () => {
    seed();
    renderWithIntl(<SizeChartTable />);

    const baseRemoveButton = screen.getByRole("button", {
      name: ptBR.SizeChartTable.removeBaseSizeTitle,
    });
    await userEvent.click(baseRemoveButton);

    const draft = useSizeChartsStore.getState().draft!;
    expect(draft.sizes).toEqual(["P", "M", "G"]);
    expect(draft.baseSizeIndex).toBe(1);
  });

  it("still removes a non-base size and shifts baseSizeIndex correctly", async () => {
    seed();
    renderWithIntl(<SizeChartTable />);

    const removeButtons = screen.getAllByRole("button", {
      name: ptBR.SizeChartTable.removeSizeTitle,
    });
    // The first enabled remove button is "P", which sits before the base.
    await userEvent.click(removeButtons[0]);

    const draft = useSizeChartsStore.getState().draft!;
    expect(draft.sizes).toEqual(["M", "G"]);
    // "M" is still the base, now at index 0.
    expect(draft.baseSizeIndex).toBe(0);
  });
});

// #97: the size list is what gets resolved into sizeTable and frozen into
// every pattern's blob, then re-sent on every subsequent generation for that
// pattern -- so the UI has to stop the count from growing past the server's
// own cap, not just report the server's clamp after the fact.
describe("SizeChartTable size-list cap", () => {
  it("disables adding a size once the chart is at the cap, with a visible reason", () => {
    seed({ sizes: Array.from({ length: 40 }, (_, i) => `s${i}`) });
    renderWithIntl(<SizeChartTable />);

    expect(screen.getByText(ptBR.SizeChartTable.addSizeButton)).toBeDisabled();
    expect(
      screen.getByText(
        ptBR.SizeChartTable.maxSizesReachedHint.replace("{max}", "40"),
      ),
    ).toBeInTheDocument();
  });

  it("leaves adding a size enabled, with no reason shown, below the cap", () => {
    seed({ sizes: ["P", "M", "G"] });
    renderWithIntl(<SizeChartTable />);

    expect(screen.getByText(ptBR.SizeChartTable.addSizeButton)).toBeEnabled();
    expect(
      screen.queryByText(
        ptBR.SizeChartTable.maxSizesReachedHint.replace("{max}", "40"),
      ),
    ).not.toBeInTheDocument();
  });
});

// #107: `{draft.progressionRule[key]} cm` was a raw JS number in JSX, so
// React stringified it with a dot -- the PROGRESSÃO card showed "0.3 cm"
// while the measurement table directly above it correctly showed "20,3".
// bust:4 (BASE's own default fixture, used elsewhere in this file) is a
// whole number and wouldn't have shown the bug either way, so this needs
// its own non-integer fixture.
describe("SizeChartTable progression card", () => {
  it("formats a non-integer progression value with a pt-BR comma, not a dot", () => {
    seed({ progressionRule: { bust: 0.3 } });
    renderWithIntl(<SizeChartTable />);

    expect(screen.getByText("0,3 cm")).toBeInTheDocument();
    expect(screen.queryByText("0.3 cm")).not.toBeInTheDocument();
  });
});

// #133: bodyType is documented as descriptive metadata that never affects
// the drafted geometry -- the control has to say so on screen, not just in
// CLAUDE.md, or a user reasonably assumes changing it reshapes the pattern.
// The header row's state badge/activate button reflect the REAL isActive
// flag, not "every editable chart" the design's own single-editable-chart
// demo data implies -- an inactive custom chart must not read as active.
describe("SizeChartTable header state", () => {
  it("badges a read-only chart as a system chart, with a header activate button", async () => {
    seed({ isSystem: true });
    useSizeChartsStore.setState({
      charts: [
        {
          id: "g1",
          updatedAt: "2026-08-21T00:00:00.000Z",
          isActive: false,
          ...BASE,
          isSystem: true,
        } as SizeChartListEntry,
      ],
    });
    const realActivate = useSizeChartsStore.getState().activate;
    const activate = vi.fn();
    useSizeChartsStore.setState({ activate });
    const user = userEvent.setup();
    renderWithIntl(<SizeChartTable />);

    expect(
      screen.getByText(ptBR.SizeChartTable.systemChartBadge),
    ).toBeInTheDocument();
    const activateButtons = screen.getAllByRole("button", {
      name: ptBR.SizeChartTable.useSizeChartButton,
    });
    // One in the header row (new), one at the bottom of the page (unchanged).
    expect(activateButtons).toHaveLength(2);
    await user.click(activateButtons[0]);
    expect(activate).toHaveBeenCalledWith("g1");
    useSizeChartsStore.setState({ activate: realActivate });
  });

  it("shows no header activate button once a read-only chart is the real active one", () => {
    seed({ isSystem: true });
    useSizeChartsStore.setState({
      charts: [
        {
          id: "g1",
          updatedAt: "2026-08-21T00:00:00.000Z",
          isActive: true,
          ...BASE,
          isSystem: true,
        } as SizeChartListEntry,
      ],
    });
    renderWithIntl(<SizeChartTable />);

    expect(
      screen.queryByRole("button", {
        name: ptBR.SizeChartTable.useSizeChartButton,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(ptBR.SizeChartTable.systemChartBadge),
    ).toBeInTheDocument();
  });

  it("badges the real active editable chart, with no header activate button", () => {
    seed();
    useSizeChartsStore.setState({
      charts: [
        {
          id: "g1",
          updatedAt: "2026-08-21T00:00:00.000Z",
          isActive: true,
          ...BASE,
        } as SizeChartListEntry,
      ],
    });
    renderWithIntl(<SizeChartTable />);

    // "Grade ativa" also labels the (disabled) bottom activate button --
    // the badge itself is the non-button occurrence.
    const matches = screen.getAllByText(
      ptBR.SizeChartTable.activeSizeChartNote,
    );
    expect(matches.some((el) => el.tagName !== "BUTTON")).toBe(true);
    expect(
      screen.queryByRole("button", {
        name: ptBR.SizeChartTable.useSizeChartButton,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows no badge for an inactive editable chart, and keeps its bottom activate button", () => {
    seed();
    renderWithIntl(<SizeChartTable />);

    expect(
      screen.queryByText(ptBR.SizeChartTable.activeSizeChartNote),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(ptBR.SizeChartTable.systemChartBadge),
    ).not.toBeInTheDocument();
    // The design gives no header placement for this case -- the only real
    // activate affordance stays at the bottom of the page, unchanged.
    expect(
      screen.getByRole("button", {
        name: ptBR.SizeChartTable.useSizeChartButton,
      }),
    ).toBeInTheDocument();
  });

  it("shows the override-legend caption for an editable chart, not the read-only note", () => {
    seed();
    renderWithIntl(<SizeChartTable />);

    expect(
      screen.getByText(ptBR.SizeChartTable.overrideLegend),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(ptBR.SizeChartTable.systemReadOnlyNote),
    ).not.toBeInTheDocument();
  });

  it("shows the read-only note for a system chart, not the override legend", () => {
    seed({ isSystem: true });
    renderWithIntl(<SizeChartTable />);

    expect(
      screen.getByText(ptBR.SizeChartTable.systemReadOnlyNote),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(ptBR.SizeChartTable.overrideLegend),
    ).not.toBeInTheDocument();
  });
});

describe("SizeChartTable delete confirmation", () => {
  it("asks for confirmation before deleting a custom chart", async () => {
    seed();
    const realRemove = useSizeChartsStore.getState().remove;
    const remove = vi.fn();
    useSizeChartsStore.setState({ remove });
    const user = userEvent.setup();
    renderWithIntl(<SizeChartTable />);

    await user.click(
      screen.getByRole("button", { name: ptBR.SizeChartTable.deleteButton }),
    );
    expect(
      screen.getByText(ptBR.SizeChartTable.deleteModalTitle),
    ).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: ptBR.SizeChartTable.deleteCancelButton,
      }),
    );
    expect(remove).not.toHaveBeenCalled();
    expect(
      screen.queryByText(ptBR.SizeChartTable.deleteModalTitle),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: ptBR.SizeChartTable.deleteButton }),
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.SizeChartTable.deleteConfirmButton,
      }),
    );
    expect(remove).toHaveBeenCalledWith("g1");
    useSizeChartsStore.setState({ remove: realRemove });
  });
});

describe("SizeChartTable body type note", () => {
  it("states that the body type is descriptive and does not affect the draft", () => {
    seed();
    renderWithIntl(<SizeChartTable />);

    expect(
      screen.getByText(ptBR.SizeChartTable.bodyTypeNote),
    ).toBeInTheDocument();
  });
});

// #49: in rule-edit mode the header still listed every size column with a
// live remove button, while the body had already swapped to one unlabelled
// rule input per row -- the columns no longer matched the cells beneath them,
// and the sentence explaining what the number means (ruleHint) was written
// into the catalog but never rendered anywhere.
describe("SizeChartTable rule-edit mode", () => {
  it("hides the per-size remove buttons and shows the rule hint", () => {
    seed();
    useSizeChartsStore.setState({ editingRule: true });

    renderWithIntl(<SizeChartTable />);

    expect(
      screen.queryAllByRole("button", {
        name: ptBR.SizeChartTable.removeSizeTitle,
      }),
    ).toHaveLength(0);
    expect(screen.getByText(ptBR.SizeChartTable.ruleHint)).toBeInTheDocument();
  });

  it("keeps the size columns and remove buttons when not editing the rule", () => {
    seed();
    useSizeChartsStore.setState({ editingRule: false });

    renderWithIntl(<SizeChartTable />);

    expect(
      screen.getAllByRole("button", {
        name: ptBR.SizeChartTable.removeSizeTitle,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(ptBR.SizeChartTable.ruleHint),
    ).not.toBeInTheDocument();
  });
});

// #34: nothing gated the Save button against a request already in flight —
// dirty stayed true for the whole round trip, so a second click fired a
// second PATCH and the button gave no sign a save was even happening.
describe("SizeChartTable save button", () => {
  it("disables the Save button and shows a saving label while a save is in flight", () => {
    seed();
    useSizeChartsStore.setState({ dirty: true, saving: true });
    renderWithIntl(<SizeChartTable />);

    const button = screen.getByRole("button", {
      name: ptBR.SizeChartTable.saveButtonSaving,
    });
    expect(button).toBeDisabled();
  });

  it("keeps the Save button enabled with its normal label when not saving", () => {
    seed();
    useSizeChartsStore.setState({ dirty: true, saving: false });
    renderWithIntl(<SizeChartTable />);

    const button = screen.getByRole("button", {
      name: ptBR.SizeChartTable.saveButton,
    });
    expect(button).toBeEnabled();
  });

  it("hides the unsaved-changes note and Descartar button when not dirty", () => {
    seed();
    useSizeChartsStore.setState({ dirty: false });
    renderWithIntl(<SizeChartTable />);
    expect(
      screen.queryByText(ptBR.SizeChartTable.unsavedChangesNote),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: ptBR.SizeChartTable.discardButton,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows the unsaved-changes note and a Descartar button while dirty", () => {
    seed();
    useSizeChartsStore.setState({ dirty: true });
    renderWithIntl(<SizeChartTable />);
    expect(
      screen.getByText(ptBR.SizeChartTable.unsavedChangesNote),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ptBR.SizeChartTable.discardButton }),
    ).toBeInTheDocument();
  });

  it("Descartar reverts the draft to the last-saved chart", async () => {
    seed();
    useSizeChartsStore.setState({
      draft: { ...BASE, name: "Editado sem salvar" },
      dirty: true,
    });
    const user = userEvent.setup();
    renderWithIntl(<SizeChartTable />);

    await user.click(
      screen.getByRole("button", { name: ptBR.SizeChartTable.discardButton }),
    );
    expect(useSizeChartsStore.getState().draft?.name).toBe(BASE.name);
    expect(useSizeChartsStore.getState().dirty).toBe(false);
  });
});

// #132: the six new fields are picked up from MEASUREMENT_KEYS generically
// (no per-key edits to this component), and BASE's fixture never sets them
// — the same shape as a real chart persisted before this issue shipped.
describe("SizeChartTable extended measurement rows (#132)", () => {
  it("renders a row, with its catalog label, for every extended measurement", () => {
    seed();
    renderWithIntl(<SizeChartTable />);

    expect(
      screen.getByText(ptBR.SizeChartTable.measurement.neckGirth),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.SizeChartTable.measurement.bicep),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.SizeChartTable.measurement.rise),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.SizeChartTable.measurement.bustPointHeight),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.SizeChartTable.measurement.bustSpan),
    ).toBeInTheDocument();
  });

  // The fixture's baseMeasurements (SIZE_TABLE.M) never sets highBust --
  // it's one of the four fields #269 left genuinely EXTENDED (bicep,
  // bustPointHeight, neckGirth and bustSpan were promoted to CORE, so
  // SIZE_TABLE now always carries those four). resolveSizeChartSize
  // resolves highBust as undefined, and the cell must show that as blank
  // rather than crashing or substituting 0.
  it("shows a blank cell, not 0, for an extended field the chart never set", () => {
    seed();
    renderWithIntl(<SizeChartTable />);

    const cell = screen.getByRole("spinbutton", {
      name: `${ptBR.SizeChartTable.measurement.highBust} · M`,
    }) as HTMLInputElement;
    expect(cell).toHaveValue(null);
  });

  it("exposes a guided definition for a measurement, reachable from its row", async () => {
    seed();
    renderWithIntl(<SizeChartTable />);

    const trigger = screen.getByRole("button", {
      name: ptBR.SizeChartTable.measurementGuideLabel.replace(
        "{name}",
        ptBR.SizeChartTable.measurement.neckGirth,
      ),
    });
    await userEvent.click(trigger);

    expect(
      screen.getByText(ptBR.SizeChartTable.measurementGuide.neckGirth),
    ).toBeInTheDocument();
  });

  it("exposes a guided definition for the new bustSpan measurement, reachable from its row", async () => {
    seed();
    renderWithIntl(<SizeChartTable />);

    const trigger = screen.getByRole("button", {
      name: ptBR.SizeChartTable.measurementGuideLabel.replace(
        "{name}",
        ptBR.SizeChartTable.measurement.bustSpan,
      ),
    });
    await userEvent.click(trigger);

    expect(
      screen.getByText(ptBR.SizeChartTable.measurementGuide.bustSpan),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// #168: the write paths that had no test at all -- clearing a per-cell
// override, editing the progression rule, adding a size, changing the body
// type, and Escape abandoning an edit. Every one of them goes through
// `updateDraft`, and the failure mode they share is not a crash but a WRONG
// PATCH: a cleared override that leaves its row behind, a rule edit that
// replaces the whole rule instead of one key, an added size that silently
// duplicates an existing column. None of that is visible on screen until the
// chart is saved and a pattern drafts from it.
// ---------------------------------------------------------------------------

function ruleCell(measurement: string) {
  return screen.getByRole("spinbutton", { name: measurement });
}

/** The draft as it stands after a patch -- what would actually persist. */
function patched(): Partial<SizeChartData> {
  return useSizeChartsStore.getState().draft as Partial<SizeChartData>;
}

describe("SizeChartTable override reset", () => {
  // A per-cell override wins over the progression rule, so the dot beside it
  // is the only way back to the rule-derived value.
  it("shows the reset dot only on an overridden, non-base, editable cell", () => {
    seed({ overrides: { G: { bust: 99 } } });
    renderWithIntl(<SizeChartTable />);

    expect(
      screen.getAllByRole("button", {
        name: ptBR.SizeChartTable.resetOverrideTitle,
      }),
    ).toHaveLength(1);
  });

  it("offers no reset on a chart with no overrides", () => {
    seed({ overrides: {} });
    renderWithIntl(<SizeChartTable />);

    expect(
      screen.queryByRole("button", {
        name: ptBR.SizeChartTable.resetOverrideTitle,
      }),
    ).toBeNull();
  });

  // The row itself has to go when its last key does -- an empty {} left
  // behind is a size that still reads as overridden to every later consumer
  // of the blob.
  it("drops the size's whole override row when its last key is reset", async () => {
    seed({ overrides: { G: { bust: 99 } } });
    renderWithIntl(<SizeChartTable />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", {
        name: ptBR.SizeChartTable.resetOverrideTitle,
      }),
    );

    expect(patched().overrides).toEqual({});
  });

  it("keeps the size's other overridden keys when one is reset", async () => {
    seed({ overrides: { G: { bust: 99, waist: 80 } } });
    renderWithIntl(<SizeChartTable />);
    const user = userEvent.setup();

    // Two dots now; the first in DOM order belongs to the bust row.
    const dots = screen.getAllByRole("button", {
      name: ptBR.SizeChartTable.resetOverrideTitle,
    });
    expect(dots).toHaveLength(2);
    await user.click(dots[0]);

    expect(patched().overrides).toEqual({ G: { waist: 80 } });
  });
});

describe("SizeChartTable progression-rule editing", () => {
  beforeEach(() => {
    seed();
    useSizeChartsStore.setState({ editingRule: true });
  });

  // Deliberately NOT a MeasurementCell: the rule input is not clamped on
  // display, so it has no feedback loop to protect against, and 0 is a
  // meaningful rule value that a commit-on-blur gate would fight.
  it("patches only the edited key, leaving the rest of the rule alone", async () => {
    useSizeChartsStore.setState({
      draft: { ...BASE, progressionRule: { bust: 4, waist: 3 } },
    });
    renderWithIntl(<SizeChartTable />);
    const user = userEvent.setup();

    const cell = ruleCell(ptBR.SizeChartTable.measurement.bust);
    await user.clear(cell);
    await user.type(cell, "5");

    expect(patched().progressionRule).toEqual({ bust: 5, waist: 3 });
  });

  it("accepts 0 as a real rule value rather than treating it as empty", async () => {
    renderWithIntl(<SizeChartTable />);
    const user = userEvent.setup();

    const cell = ruleCell(ptBR.SizeChartTable.measurement.bust);
    await user.clear(cell);
    await user.type(cell, "0");

    // A chart where one measurement does not grade at all is a real,
    // expressible chart -- not a cleared field.
    expect(patched().progressionRule?.bust).toBe(0);
  });
});

describe("SizeChartTable adding a size", () => {
  beforeEach(() => seed());

  async function addSize(label: string, confirm = true) {
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: ptBR.SizeChartTable.addSizeButton }),
    );
    if (label) {
      await user.type(
        screen.getByLabelText(ptBR.SizeChartTable.addSizeFieldLabel),
        label,
      );
    }
    await user.click(
      screen.getByRole("button", {
        name: confirm
          ? ptBR.SizeChartTable.addSizeSaveButton
          : ptBR.SizeChartTable.addSizeCancelButton,
      }),
    );
    return user;
  }

  it("appends the typed label to the size list", async () => {
    renderWithIntl(<SizeChartTable />);
    await addSize("GG");
    expect(patched().sizes).toEqual(["P", "M", "G", "GG"]);
  });

  it("trims the label rather than creating a padded duplicate column", async () => {
    renderWithIntl(<SizeChartTable />);
    await addSize("  GG  ");
    expect(patched().sizes).toEqual(["P", "M", "G", "GG"]);
  });

  // A duplicate column would give two columns the same accessible name and
  // the same overrides key -- unresolvable afterwards.
  it("refuses a label that already exists, without adding anything", async () => {
    renderWithIntl(<SizeChartTable />);
    await addSize("M");
    expect(patched().sizes).toEqual(["P", "M", "G"]);
  });

  it("keeps the save action disabled for a blank or whitespace-only label", async () => {
    renderWithIntl(<SizeChartTable />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: ptBR.SizeChartTable.addSizeButton }),
    );
    const save = screen.getByRole("button", {
      name: ptBR.SizeChartTable.addSizeSaveButton,
    });
    expect(save).toBeDisabled();

    await user.type(
      screen.getByLabelText(ptBR.SizeChartTable.addSizeFieldLabel),
      "   ",
    );
    expect(save).toBeDisabled();
  });

  it("closes without patching when the dialog is cancelled", async () => {
    renderWithIntl(<SizeChartTable />);
    await addSize("GG", false);
    expect(patched().sizes).toEqual(["P", "M", "G"]);
  });

  // The field is cleared by the OPEN handler, not by closing, so a
  // cancelled draft label must not still be sitting there next time.
  it("reopens the dialog with an empty field after a cancelled attempt", async () => {
    renderWithIntl(<SizeChartTable />);
    const user = await addSize("GG", false);

    await user.click(
      screen.getByRole("button", { name: ptBR.SizeChartTable.addSizeButton }),
    );
    expect(
      screen.getByLabelText(ptBR.SizeChartTable.addSizeFieldLabel),
    ).toHaveValue("");
  });
});

describe("SizeChartTable body type", () => {
  // #133: descriptive metadata only. The control is real and must patch the
  // draft -- what it must NOT do is imply a geometry change, which the
  // caption tied to it by aria-describedby is what states.
  it("patches bodyType from the select", async () => {
    seed();
    renderWithIntl(<SizeChartTable />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.click(
      screen.getByRole("option", {
        name: ptBR.SizeChartTable.bodyType.hourglass,
      }),
    );

    expect(patched().bodyType).toBe("hourglass");
  });

  it("disables the control entirely on a read-only system chart", () => {
    seed({ isSystem: true });
    renderWithIntl(<SizeChartTable />);

    expect(screen.getByRole("combobox")).toBeDisabled();
    // ...and says why, rather than just refusing the click.
    expect(
      screen.getByText(ptBR.SizeChartTable.systemReadOnlyNote),
    ).toBeVisible();
  });
});

describe("SizeChartTable cell keyboard commits", () => {
  beforeEach(() => seed());

  it("commits on Enter without needing to leave the field", async () => {
    renderWithIntl(<SizeChartTable />);
    const user = userEvent.setup();

    await user.clear(bustBaseCell());
    await user.type(bustBaseCell(), "96{Enter}");

    expect(patched().baseMeasurements?.bust).toBe(96);
  });

  // Escape restores rather than committing -- and it also has to clear the
  // range hint, or an abandoned out-of-range edit leaves a stale error
  // sitting in the live region with no invalid cell to match it.
  it("abandons the edit and clears the range hint on Escape", async () => {
    renderWithIntl(<SizeChartTable />);
    const user = userEvent.setup();

    await user.clear(bustBaseCell());
    await user.type(bustBaseCell(), "999");
    expect(screen.getByRole("status")).toBeVisible();

    await user.type(bustBaseCell(), "{Escape}");

    expect(bustBaseCell()).toHaveValue(92);
    expect(patched().baseMeasurements?.bust).toBe(92);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("SizeChartTable panel structure", () => {
  // The screen is three regions in the design, not one long flow: a fixed
  // toolbar, the scrolling measurement rows, and a pinned action bar. Laid
  // out as one flow, the Save button sat at the end of the table -- off
  // screen on any chart long enough to scroll, i.e. every real one.
  it("pins the unsaved-changes bar outside the scrolling region", () => {
    seed();
    useSizeChartsStore.setState({ dirty: true });
    const { container } = renderWithIntl(<SizeChartTable />);

    const bar = screen
      .getByText(ptBR.SizeChartTable.unsavedChangesNote)
      .closest("div")!;
    expect(bar).toHaveClass("flex-none", "border-t");

    const scroll = container.querySelector('[data-slot="size-chart-rows"]');
    expect(scroll).not.toBeNull();
    expect(scroll!.contains(bar)).toBe(false);
  });

  it("keeps the chart's toolbar out of the scrolling region too", () => {
    seed();
    const { container } = renderWithIntl(<SizeChartTable />);
    const scroll = container.querySelector('[data-slot="size-chart-rows"]')!;
    const duplicate = screen.getByRole("button", {
      name: ptBR.SizeChartTable.duplicateButton,
    });
    expect(scroll.contains(duplicate)).toBe(false);
  });

  it("shows no unsaved-changes bar while the draft is clean", () => {
    seed();
    useSizeChartsStore.setState({ dirty: false });
    renderWithIntl(<SizeChartTable />);
    expect(
      screen.queryByText(ptBR.SizeChartTable.unsavedChangesNote),
    ).toBeNull();
  });
});

describe("SizeChartTable body type and base column labelling", () => {
  it("labels the body-type control and names it for assistive tech", () => {
    seed();
    renderWithIntl(<SizeChartTable />);
    const label = screen.getByText(ptBR.SizeChartTable.bodyTypeLabel);
    expect(label).toBeVisible();

    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveAttribute("aria-labelledby", label.id);
  });

  // The base row is what every other column is derived FROM. Its only signal
  // used to be the boxed cells in that column, which reads as "selected".
  it("tags the base size column in the header, and only that one", () => {
    seed();
    renderWithIntl(<SizeChartTable />);
    const tags = screen.getAllByText(ptBR.SizeChartTable.baseSizeTag);
    expect(tags).toHaveLength(1);
    // BASE.baseSizeIndex is 1 -> "M".
    expect(tags[0].parentElement!.textContent).toContain("M");
  });
});
