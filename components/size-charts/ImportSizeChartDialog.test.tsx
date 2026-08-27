import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
} from "@/components/test-utils";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";
import { ImportSizeChartDialog } from "./ImportSizeChartDialog";

// Bust and cintura are recognised; every other MEASUREMENT_KEYS member is
// absent from this file on purpose, so parsing it always produces a handful
// of missing_measurement warnings to render.
const CSV = "Medida;38;40;42\nBusto;88;92;96\nCintura;66;70;76\n";

function csvFile(content = CSV, name = "grade.csv") {
  return new File([content], name, { type: "text/csv" });
}

// DialogContent renders through a Radix Portal onto document.body, outside
// the render()-returned container, so the hidden file input has to be found
// on the document rather than scoped to `container`.
function fileInput() {
  return document.body.querySelector('input[type="file"]') as HTMLInputElement;
}

async function openDialog() {
  renderWithIntl(<ImportSizeChartDialog />);
  await userEvent.click(
    screen.getByRole("button", { name: ptBR.SizeChartImport.trigger }),
  );
  expect(
    screen.getByText(ptBR.SizeChartImport.dialogTitle),
  ).toBeInTheDocument();
}

describe("ImportSizeChartDialog", () => {
  beforeEach(() => {
    useSizeChartsStore.setState({ importChart: vi.fn() });
  });

  it("opens from the trigger and states the accepted formats before any file is picked", async () => {
    await openDialog();
    expect(
      screen.getByText(ptBR.SizeChartImport.formatNote),
    ).toBeInTheDocument();
  });

  it("keeps create disabled before any file is chosen", async () => {
    await openDialog();
    expect(
      screen.getByRole("button", { name: ptBR.SizeChartImport.createButton }),
    ).toBeDisabled();
  });

  it("shows a preview and enables create once a valid file parses", async () => {
    await openDialog();
    await userEvent.upload(fileInput(), csvFile());

    expect(
      await screen.findByText(ptBR.SizeChartImport.previewTitle),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ptBR.SizeChartImport.createButton }),
    ).toBeEnabled();
  });

  // Catalog-text assertions must compare against the exported ptBR object,
  // never a pasted literal -- next-intl renders the key path on a missing
  // key and the test would still pass otherwise.
  it("renders a missing-measurement warning from the real catalog", async () => {
    await openDialog();
    await userEvent.upload(fileInput(), csvFile());
    await screen.findByText(ptBR.SizeChartImport.previewTitle);

    const expected = ptBR.SizeChartImport.warnings.missing_measurement.replace(
      "{detail}",
      ptBR.SizeChartTable.measurement.hip,
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("shows a catalog error and keeps create disabled for an unsupported file type", async () => {
    await openDialog();
    await userEvent.upload(fileInput(), csvFile(CSV, "grade.xlsx"));

    expect(
      await screen.findByText(
        ptBR.SizeChartImport.errors.unsupported_file_type,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ptBR.SizeChartImport.createButton }),
    ).toBeDisabled();
    expect(
      screen.queryByText(ptBR.SizeChartImport.previewTitle),
    ).not.toBeInTheDocument();
  });

  it("calls importChart with a reviewed, non-system chart and closes on success", async () => {
    const importChart = vi.fn().mockResolvedValue({ id: "g9" });
    useSizeChartsStore.setState({ importChart });
    await openDialog();
    await userEvent.upload(fileInput(), csvFile());
    await screen.findByText(ptBR.SizeChartImport.previewTitle);

    await userEvent.click(
      screen.getByRole("button", { name: ptBR.SizeChartImport.createButton }),
    );

    await waitFor(() => expect(importChart).toHaveBeenCalledTimes(1));
    const [chart] = importChart.mock.calls[0];
    expect(chart.isSystem).toBe(false);
    expect(chart.sizes).toEqual(["38", "40", "42"]);

    await waitFor(() =>
      expect(
        screen.queryByText(ptBR.SizeChartImport.dialogTitle),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps the dialog open when importChart fails, so the file isn't lost", async () => {
    const importChart = vi.fn().mockResolvedValue(null);
    useSizeChartsStore.setState({ importChart });
    await openDialog();
    await userEvent.upload(fileInput(), csvFile());
    await screen.findByText(ptBR.SizeChartImport.previewTitle);

    await userEvent.click(
      screen.getByRole("button", { name: ptBR.SizeChartImport.createButton }),
    );

    await waitFor(() => expect(importChart).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(ptBR.SizeChartImport.dialogTitle),
    ).toBeInTheDocument();
  });

  it("cancel closes the dialog without calling importChart", async () => {
    const importChart = vi.fn();
    useSizeChartsStore.setState({ importChart });
    await openDialog();

    await userEvent.click(
      screen.getByRole("button", { name: ptBR.SizeChartImport.cancelButton }),
    );

    expect(importChart).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByText(ptBR.SizeChartImport.dialogTitle),
      ).not.toBeInTheDocument(),
    );
  });
});

// ---------------------------------------------------------------------------
// #168: the review controls. The dialog's whole purpose is that an import is
// REVIEWED before it becomes a chart, and three of its four selects had no
// test -- yet two of them re-parse the file rather than just relabelling it,
// which is exactly where a silent mistake lands: pick the wrong gender or
// base size and the numbers themselves change, because the progression rule
// is reconstructed around the chosen base column.
// ---------------------------------------------------------------------------

/** Opens a Radix Select by its label and picks one option by name. */
async function pickFromSelect(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string | RegExp,
) {
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("ImportSizeChartDialog review controls", () => {
  beforeEach(() => {
    useSizeChartsStore.setState({ importChart: vi.fn() });
  });

  it("defaults the name from the parsed file, and lets it be renamed", async () => {
    await openDialog();
    const user = userEvent.setup();
    await user.upload(fileInput(), csvFile());

    const nameField = await screen.findByLabelText(
      ptBR.SizeChartImport.nameFieldLabel,
    );
    // The parser derives a name from the file itself ("grade.csv"), so the
    // field arrives prefilled rather than empty; the catalog default only
    // stands in when nothing usable was found (asserted below).
    expect(nameField).toHaveValue("grade");

    await user.clear(nameField);
    await user.type(nameField, "Grade da casa");
    expect(nameField).toHaveValue("Grade da casa");
  });

  it("re-parses against the chosen gender, keeping the base column", async () => {
    await openDialog();
    const user = userEvent.setup();
    await user.upload(fileInput(), csvFile());
    await screen.findByLabelText(ptBR.SizeChartImport.genderFieldLabel);

    await pickFromSelect(
      user,
      ptBR.SizeChartImport.genderFieldLabel,
      ptBR.SizeChartImport.gender.male,
    );

    // Gender is not a label: the missing measurements are filled from the
    // matching system table, so the parse has to run again.
    const importChart = vi.fn();
    useSizeChartsStore.setState({ importChart });
    await user.click(
      screen.getByRole("button", { name: ptBR.SizeChartImport.createButton }),
    );
    await waitFor(() => expect(importChart).toHaveBeenCalled());
    expect(importChart.mock.calls[0][0]).toMatchObject({ gender: "male" });
  });

  it("re-parses around the chosen base size", async () => {
    await openDialog();
    const user = userEvent.setup();
    await user.upload(fileInput(), csvFile());
    await screen.findByLabelText(ptBR.SizeChartImport.baseSizeFieldLabel);

    // Column 3 of "38;40;42".
    await pickFromSelect(user, ptBR.SizeChartImport.baseSizeFieldLabel, "42");

    const importChart = vi.fn();
    useSizeChartsStore.setState({ importChart });
    await user.click(
      screen.getByRole("button", { name: ptBR.SizeChartImport.createButton }),
    );
    await waitFor(() => expect(importChart).toHaveBeenCalled());
    // The base column is what baseMeasurements describes and what the
    // progression rule is reconstructed around -- so this is a numbers
    // change, not a display choice.
    const chart = importChart.mock.calls[0][0] as {
      baseSizeIndex: number;
      baseMeasurements: { bust: number };
    };
    expect(chart.baseSizeIndex).toBe(2);
    expect(chart.baseMeasurements.bust).toBe(96);
  });

  it("carries the chosen body type onto the created chart", async () => {
    await openDialog();
    const user = userEvent.setup();
    await user.upload(fileInput(), csvFile());
    await screen.findByLabelText(ptBR.SizeChartImport.bodyTypeFieldLabel);

    await pickFromSelect(
      user,
      ptBR.SizeChartImport.bodyTypeFieldLabel,
      ptBR.SizeChartTable.bodyType.hourglass,
    );

    const importChart = vi.fn();
    useSizeChartsStore.setState({ importChart });
    await user.click(
      screen.getByRole("button", { name: ptBR.SizeChartImport.createButton }),
    );
    await waitFor(() => expect(importChart).toHaveBeenCalled());
    expect(importChart.mock.calls[0][0]).toMatchObject({
      bodyType: "hourglass",
    });
  });

  it("falls back to the catalog default when the name is cleared", async () => {
    const importChart = vi.fn();
    await openDialog();
    const user = userEvent.setup();
    await user.upload(fileInput(), csvFile());
    await user.clear(
      await screen.findByLabelText(ptBR.SizeChartImport.nameFieldLabel),
    );

    useSizeChartsStore.setState({ importChart });
    await user.click(
      screen.getByRole("button", { name: ptBR.SizeChartImport.createButton }),
    );

    await waitFor(() => expect(importChart).toHaveBeenCalled());
    // A nameless chart would render as a blank card in the library.
    expect(importChart.mock.calls[0][0]).toMatchObject({
      name: ptBR.SizeChartImport.defaultName,
    });
  });

  // Closing discards everything: the next open must not start from a
  // previous attempt's file, name and gender. This is what caught the
  // Cancel button driving the controlled `open` prop directly and so
  // skipping reset() (fixed in the same change as this test).
  it("resets the whole form when the dialog is closed and reopened", async () => {
    await openDialog();
    const user = userEvent.setup();
    await user.upload(fileInput(), csvFile());
    await screen.findByLabelText(ptBR.SizeChartImport.nameFieldLabel);

    await user.click(
      screen.getByRole("button", { name: ptBR.SizeChartImport.cancelButton }),
    );
    await waitFor(() =>
      expect(screen.queryByText(ptBR.SizeChartImport.dialogTitle)).toBeNull(),
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.SizeChartImport.trigger }),
    );

    expect(
      await screen.findByText(ptBR.SizeChartImport.noFileChosen),
    ).toBeVisible();
    expect(
      screen.queryByLabelText(ptBR.SizeChartImport.nameFieldLabel),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: ptBR.SizeChartImport.createButton }),
    ).toBeDisabled();
  });

  // Nothing to re-parse before a file exists: the handlers guard on
  // fileText, and without that guard a gender change on an empty dialog
  // would parse an empty string and surface a spurious error.
  it("does not surface a parse error when no file has been chosen", async () => {
    await openDialog();
    expect(screen.queryByRole("alert")).toBeNull();
    // The gender/base-size selects do not exist yet, which is the guard
    // being satisfied structurally rather than by a runtime check.
    expect(
      screen.queryByLabelText(ptBR.SizeChartImport.genderFieldLabel),
    ).toBeNull();
  });
});
