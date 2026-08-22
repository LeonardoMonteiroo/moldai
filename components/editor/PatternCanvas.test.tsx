import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { fireEvent } from "@testing-library/react";
import { renderWithIntl, screen } from "@/components/test-utils";
import { PatternCanvas } from "./PatternCanvas";
import type { Piece } from "@/lib/types";

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
