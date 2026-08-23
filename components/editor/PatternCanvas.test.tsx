import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { fireEvent } from "@testing-library/react";
import { renderWithIntl, screen } from "@/components/test-utils";
import { PatternCanvas } from "./PatternCanvas";
import type { Piece } from "@/lib/types";
import {
  MAX_LABEL_FONT_SIZE,
  MIN_LABEL_FONT_SIZE,
  estimateTextWidth,
} from "@/lib/canvas/pieceLabel";

// A pointerdown immediately followed by a pointerup at the same coordinates
// (no pointermove) is what a real click resolves to once the browser has
// retargeted the click event to the capturing <svg> — see PatternCanvas'
// handlePointerDown. Firing a real "click" event here would not reproduce
// the bug: jsdom's setPointerCapture is a no-op stub, so it never retargets
// anything, and a click would reach <g onClick> under both the buggy and
// the fixed implementation.
function clickPoint(target: Element, pointerId = 1) {
  fireEvent.pointerDown(target, { clientX: 10, clientY: 10, pointerId });
  fireEvent.pointerUp(target, { clientX: 10, clientY: 10, pointerId });
}

const frontPiece: Piece = {
  id: "front",
  name: "Frente",
  qty: 1,
  outline: { kind: "polygon", points: "0,0 100,0 100,100 0,100" },
  label: { x: 10, y: 50 },
  detailRows: [],
};

const backPiece: Piece = {
  id: "back",
  name: "Costas",
  qty: 1,
  outline: { kind: "polygon", points: "150,0 250,0 250,100 150,100" },
  label: { x: 160, y: 50 },
  detailRows: [],
};

function renderCanvas(
  overrides: Partial<Parameters<typeof PatternCanvas>[0]> = {},
) {
  const onSelectPiece = vi.fn();
  const onPan = vi.fn();
  const svgRef = createRef<SVGSVGElement>();

  const utils = renderWithIntl(
    <PatternCanvas
      pieces={[frontPiece, backPiece]}
      selectedPieceId={null}
      conflict={null}
      viewport={{ x: 0, y: 0, w: 300, h: 200 }}
      scale={1}
      activeTool="cursor"
      measurements={[]}
      svgRef={svgRef}
      onSelectPiece={onSelectPiece}
      onWheelZoom={vi.fn()}
      onPan={onPan}
      screenToUser={(x, y) => ({ x, y })}
      onAddMeasurement={vi.fn()}
      onRemoveMeasurement={vi.fn()}
      {...overrides}
    />,
  );

  return { ...utils, onSelectPiece, onPan, svgRef };
}

describe("PatternCanvas piece selection", () => {
  it("selects a piece on pointer down+up with no drag", () => {
    const { onSelectPiece } = renderCanvas();

    const group = screen.getByText(/COSTAS/).closest("g")!;
    clickPoint(group);

    expect(onSelectPiece).toHaveBeenCalledWith("back");
  });

  it("changes the selection when a different piece is clicked", () => {
    const { onSelectPiece } = renderCanvas();

    clickPoint(screen.getByText(/FRENTE/).closest("g")!);
    clickPoint(screen.getByText(/COSTAS/).closest("g")!);

    expect(onSelectPiece).toHaveBeenNthCalledWith(1, "front");
    expect(onSelectPiece).toHaveBeenNthCalledWith(2, "back");
  });

  it("still pans on a drag started over blank canvas, without selecting", () => {
    const { onPan, onSelectPiece, svgRef } = renderCanvas();
    const svg = svgRef.current!;

    fireEvent.pointerDown(svg, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 320, clientY: 280, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 320, clientY: 280, pointerId: 1 });

    expect(onPan).toHaveBeenCalledWith(20, -20);
    expect(onSelectPiece).not.toHaveBeenCalled();
  });
});

// A sleeve-shaped piece: wide at the bicep, tapering to a narrower hem, which
// is where the label sits. Its stored `label.x` is deliberately absurd — the
// drafted anchor is measured from the bounding box, and the renderer has to
// derive the placement from the outline instead.
const sleevePiece: Piece = {
  id: "sleeve",
  name: "Manga",
  qty: 2,
  outline: {
    kind: "polygon",
    points: "0,26 14,8 35,0 56,8 70,26 63,98 7,98",
  },
  label: { x: 999, y: 999 },
  detailRows: [],
  vertices: [
    { x: 0, y: 26 },
    { x: 14, y: 8 },
    { x: 35, y: 0 },
    { x: 56, y: 8 },
    { x: 70, y: 26 },
    { x: 63, y: 98 },
    { x: 7, y: 98 },
  ],
};

const widePiece: Piece = {
  id: "wide",
  name: "Frente",
  qty: 1,
  outline: { kind: "polygon", points: "0,0 100,0 100,100 0,100" },
  label: { x: 6, y: 94 },
  detailRows: [],
  vertices: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
};

describe("PatternCanvas piece labels", () => {
  it("floors a narrow piece's label at MIN_LABEL_FONT_SIZE, shortening the text rather than shrinking further, and anchors it to the outline, not the bbox", () => {
    renderCanvas({ pieces: [sleevePiece] });
    // #81: "MANGA · 2×" no longer fits this synthetic narrow piece even at
    // the floor size -- it shortens to the bare piece name instead of
    // shrinking below --text-tick.
    const label = screen.getByText("MANGA");

    const fontSize = parseFloat(label.style.fontSize);
    expect(fontSize).toBeGreaterThanOrEqual(MIN_LABEL_FONT_SIZE);
    expect(fontSize).toBeLessThan(MAX_LABEL_FONT_SIZE);

    // the discarded bbox anchor, and the outline it has to sit inside
    const x = Number(label.getAttribute("x"));
    const y = Number(label.getAttribute("y"));
    expect(x).not.toBe(999);
    expect(y).not.toBe(999);
    expect(x + estimateTextWidth("MANGA", fontSize)).toBeLessThanOrEqual(63.58);
  });

  it("leaves a wide piece's label at the design's full size", () => {
    renderCanvas({ pieces: [widePiece] });
    const label = screen.getByText("FRENTE · 1×");
    expect(parseFloat(label.style.fontSize)).toBe(MAX_LABEL_FONT_SIZE);
  });
});

const seamConflict = {
  id: "conf-1",
  title: "Cava e manga não batem",
  description: "…",
  diffCm: 3.1,
  suggestion: "…",
  pieceAId: "body-front",
  pieceBId: "sleeve",
  markers: [
    { cx: 40, cy: 30, r: 14 },
    { cx: 200, cy: 120, r: 14 },
  ],
};

describe("PatternCanvas conflict markers", () => {
  it("labels each marker with its own seam length, body first", () => {
    renderCanvas({
      conflict: seamConflict,
      armholeLenCm: 22.84,
      sleeveArmholeCm: 19.7,
    });
    const body = screen.getByText("22,8 cm");
    const sleeve = screen.getByText("19,7 cm");
    // Anchored outside its circle, so the value never sits on the piece.
    expect(Number(body.getAttribute("x"))).toBe(40 + 14 + 4);
    expect(Number(sleeve.getAttribute("x"))).toBe(200 + 14 + 4);
  });

  it("draws bare circles when the seam lengths are unavailable", () => {
    const { container } = renderCanvas({ conflict: seamConflict });
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(screen.queryByText(/cm$/)).not.toBeInTheDocument();
  });

  it("labels nothing when a marker is missing, rather than mislabelling the survivor", () => {
    renderCanvas({
      conflict: { ...seamConflict, markers: [seamConflict.markers[1]] },
      armholeLenCm: 22.84,
      sleeveArmholeCm: 19.7,
    });
    expect(screen.queryByText("22,8 cm")).not.toBeInTheDocument();
    expect(screen.queryByText("19,7 cm")).not.toBeInTheDocument();
  });
});
