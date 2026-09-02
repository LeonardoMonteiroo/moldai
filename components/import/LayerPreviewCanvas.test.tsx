import { describe, it, expect, beforeEach } from "vitest";
import { renderWithIntl, screen, translatorFor } from "@/components/test-utils";
import { useImportStore } from "@/lib/importStore";
import { LayerPreviewCanvas } from "./LayerPreviewCanvas";
import { parseDxf } from "@/lib/import/dxf";

const tImport = translatorFor("Import");

function docFrom(codes: (string | number)[]) {
  return parseDxf(
    [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      ...codes.map(String),
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n"),
  );
}

const doc = docFrom([
  "0",
  "LWPOLYLINE",
  "8",
  "CUTLAYER",
  "70",
  "1",
  "10",
  "0",
  "20",
  "0",
  "10",
  "5",
  "20",
  "0",
  "10",
  "5",
  "20",
  "5",
]);

describe("LayerPreviewCanvas — per-piece highlight", () => {
  beforeEach(() => {
    useImportStore.setState({
      doc,
      hoveredLayers: null,
      hoveredPieceKey: null,
      roles: {},
    });
  });

  it("renders no extra highlighted path when nothing is hovered", () => {
    const { container } = renderWithIntl(<LayerPreviewCanvas />);
    expect(container.querySelectorAll("path")).toHaveLength(1);
  });

  it("renders one additional highlighted path for the hovered piece", () => {
    useImportStore.setState({ hoveredPieceKey: "0" });
    const { container } = renderWithIntl(<LayerPreviewCanvas />);
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });
});

describe("LayerPreviewCanvas — no-cut-mapped hint", () => {
  beforeEach(() => {
    useImportStore.setState({
      doc,
      hoveredLayers: null,
      hoveredPieceKey: null,
    });
  });

  it("shows the hint while no layer is mapped to the cut role", () => {
    useImportStore.setState({ roles: { CUTLAYER: "ignore" } });
    renderWithIntl(<LayerPreviewCanvas />);
    expect(screen.getByText(tImport("noCutLineMapped"))).toBeInTheDocument();
  });

  it("hides the hint once a layer is mapped to the cut role", () => {
    useImportStore.setState({ roles: { CUTLAYER: "cut" } });
    renderWithIntl(<LayerPreviewCanvas />);
    expect(
      screen.queryByText(tImport("noCutLineMapped")),
    ).not.toBeInTheDocument();
  });
});
