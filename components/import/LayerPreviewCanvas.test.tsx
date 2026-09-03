import { describe, it, expect, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  translatorFor,
  act,
} from "@/components/test-utils";
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

describe("LayerPreviewCanvas pan and zoom", () => {
  beforeEach(() => {
    useImportStore.setState({ doc, roles: { CUTLAYER: "cut" } });
  });

  function previewSvg(container: HTMLElement) {
    return container.querySelector("svg") as SVGSVGElement;
  }

  function transformOf(container: HTMLElement) {
    return container.querySelector("g")!.getAttribute("transform");
  }

  it("offers the design's reset control and view hint", () => {
    renderWithIntl(<LayerPreviewCanvas />);
    expect(
      screen.getByRole("button", { name: tImport("previewResetZoom") }),
    ).toBeVisible();
    expect(screen.getByText(tImport("previewViewHint"))).toBeVisible();
  });

  it("starts at an untransformed view", () => {
    const { container } = renderWithIntl(<LayerPreviewCanvas />);
    expect(transformOf(container)).toBe("translate(0 0) scale(1)");
  });

  // The editor's own convention, deliberately kept rather than the design's
  // literal bare-wheel zoom: one trackpad gesture emits dozens of ticks, and
  // this panel sits inside a scrolling page.
  it("pans on a plain wheel without touching the scale", () => {
    const { container } = renderWithIntl(<LayerPreviewCanvas />);
    act(() => {
      previewSvg(container).dispatchEvent(
        new WheelEvent("wheel", { deltaX: 10, deltaY: 40, bubbles: true }),
      );
    });
    expect(transformOf(container)).toBe("translate(-10 -40) scale(1)");
  });

  it("zooms on ctrl + wheel instead of panning", () => {
    const { container } = renderWithIntl(<LayerPreviewCanvas />);
    const svg = previewSvg(container);
    // jsdom implements neither getScreenCTM nor DOMPoint's matrix transform,
    // so the component's screen->user conversion needs a real matrix here
    // (the CutPlanPreview precedent).
    svg.getScreenCTM = () =>
      ({ a: 1, inverse: () => ({}) }) as unknown as DOMMatrix;
    const original = globalThis.DOMPoint;
    globalThis.DOMPoint = class {
      constructor(
        public x: number,
        public y: number,
      ) {}
      matrixTransform() {
        return { x: this.x, y: this.y };
      }
    } as unknown as typeof DOMPoint;

    act(() => {
      svg.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true }),
      );
    });
    globalThis.DOMPoint = original;

    expect(transformOf(container)).toContain("scale(1.1)");
  });

  it("restores the identity view from the reset control", async () => {
    const { container } = renderWithIntl(<LayerPreviewCanvas />);
    act(() => {
      previewSvg(container).dispatchEvent(
        new WheelEvent("wheel", { deltaY: 40, bubbles: true }),
      );
    });
    expect(transformOf(container)).not.toBe("translate(0 0) scale(1)");

    act(() => {
      screen.getByRole("button", { name: tImport("previewResetZoom") }).click();
    });
    expect(transformOf(container)).toBe("translate(0 0) scale(1)");
  });
});
