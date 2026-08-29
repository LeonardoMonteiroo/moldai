import { describe, it, expect, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  translatorFor,
} from "@/components/test-utils";
import { useImportStore } from "@/lib/importStore";
import { PieceLabelPanel } from "./PieceLabelPanel";

const tImport = translatorFor("Import");

beforeEach(() => {
  useImportStore.setState({
    pieces: [
      { key: "0", widthCm: 32.4, heightCm: 45.1 },
      { key: "1", widthCm: 10, heightCm: 12, suggestedLabel: "front" },
    ],
    pieceLabels: {},
    hoveredPieceKey: null,
  });
});

describe("PieceLabelPanel", () => {
  it("renders one row per detected piece, with dimensions", () => {
    renderWithIntl(<PieceLabelPanel />);
    expect(screen.getByText(/32\.4/)).toBeInTheDocument();
    expect(screen.getByText(/10/)).toBeInTheDocument();
  });

  it("pre-fills the select from suggestedLabel", () => {
    renderWithIntl(<PieceLabelPanel />);
    expect(
      screen.getByRole("combobox", {
        name: tImport("pieceRowLabel", { index: 2 }),
      }),
    ).toHaveTextContent(tImport("pieceLabel.front"));
  });

  it("choosing a label calls setPieceLabel", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PieceLabelPanel />);
    await user.click(
      screen.getByRole("combobox", {
        name: tImport("pieceRowLabel", { index: 1 }),
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: tImport("pieceLabel.back") }),
    );
    expect(useImportStore.getState().pieceLabels["0"]).toEqual({
      label: "back",
    });
  });

  it("choosing 'Outro' reveals a free-text input", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PieceLabelPanel />);
    await user.click(
      screen.getByRole("combobox", {
        name: tImport("pieceRowLabel", { index: 1 }),
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: tImport("pieceLabel.other") }),
    );
    expect(
      screen.getByPlaceholderText(tImport("pieceCustomNamePlaceholder")),
    ).toBeInTheDocument();
  });

  it("hovering a row calls setHoveredPieceKey, and leaving clears it", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PieceLabelPanel />);
    const row = screen.getByText(/32\.4/).closest("li")!;
    await user.hover(row);
    expect(useImportStore.getState().hoveredPieceKey).toBe("0");
    await user.unhover(row);
    expect(useImportStore.getState().hoveredPieceKey).toBeNull();
  });
});
