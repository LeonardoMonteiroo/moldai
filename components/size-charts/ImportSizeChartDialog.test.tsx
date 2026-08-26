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
