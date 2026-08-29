import { describe, it, expect, beforeEach } from "vitest";
import { renderWithIntl } from "@/components/test-utils";
import { useImportStore } from "@/lib/importStore";
import { LayerPreviewCanvas } from "./LayerPreviewCanvas";
import { parseDxf } from "@/lib/import/dxf";

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
