import { describe, it, expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithIntl, screen } from "@/components/test-utils";
import { CutPlanPreview } from "./CutPlanPreview";
import type { CutPlan } from "@/lib/export/cutplan";

function planOf(): CutPlan {
  return {
    fabricWidthCm: 150,
    lengthCm: 100,
    usedAreaCm2: 200,
    efficiency: 0.5,
    overflow: false,
    overlaps: [],
    instances: [
      {
        id: "a#1",
        name: "A",
        outline: {
          start: { x: 0, y: 0 },
          segs: [
            { kind: "line", to: { x: 20, y: 0 } },
            { kind: "line", to: { x: 20, y: 20 } },
            { kind: "line", to: { x: 0, y: 20 } },
            { kind: "line", to: { x: 0, y: 0 } },
          ],
        },
        widthCm: 20,
        heightCm: 20,
        originCm: { x: 4, y: 4 },
      },
    ],
  };
}

// identity mapping: 1 user unit per client pixel, no offset -- the simplest
// injectable screenToUser, mirroring the jsdom-can't-getScreenCTM precedent
// documented on PatternCanvas.test.tsx.
const identity = (clientX: number, clientY: number) => ({
  x: clientX,
  y: clientY,
});

describe("CutPlanPreview", () => {
  // The production wiring, with NO injected screenToUser. CutPlanTab used to
  // pass a mapper backed by an svgRef it never attached, so every real drag
  // resolved to {0,0} and no piece moved -- while every test here passed,
  // because they all inject `identity` and so never touched that path.
  it("drags using its own <svg> when no screenToUser is injected", () => {
    const onMove = vi.fn();
    renderWithIntl(
      <CutPlanPreview
        plan={planOf()}
        fabricWidthCm={150}
        manual
        overlapIds={[]}
        onMove={onMove}
        onNudgeAnnounce={vi.fn()}
        labelFor={(it) => `${it.name}`}
      />,
    );
    const g = screen.getByRole("button", { name: "A" });
    const svg = g.closest("svg") as SVGSVGElement;
    // 2 client px per user unit, origin offset by (30, 20).
    svg.getScreenCTM = () =>
      ({ a: 2, b: 0, c: 0, d: 2, e: 30, f: 20 }) as unknown as DOMMatrix;

    fireEvent.pointerDown(g, { clientX: 30, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 50, clientY: 40, pointerId: 1 });

    // 20 client px / 2 = 10 user cm on each axis, from origin (4, 4).
    expect(onMove).toHaveBeenCalledWith("a#1", { x: 14, y: 14 });
  });

  it("ends the drag on the svg's own pointerup, not the piece's", () => {
    const onMove = vi.fn();
    renderWithIntl(
      <CutPlanPreview
        plan={planOf()}
        fabricWidthCm={150}
        manual
        overlapIds={[]}
        screenToUser={identity}
        onMove={onMove}
        onNudgeAnnounce={vi.fn()}
        labelFor={(it) => `${it.name}`}
      />,
    );
    const g = screen.getByRole("button", { name: "A" });
    const svg = g.closest("svg") as SVGSVGElement;
    fireEvent.pointerDown(g, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 15, clientY: 10, pointerId: 1 });
    expect(onMove).toHaveBeenCalledTimes(1);

    // setPointerCapture targets the <svg>, so the browser retargets every
    // later pointer event there -- a pointerup handler on the <g> would never
    // fire, leaving the drag latched and the piece stuck to the cursor.
    fireEvent.pointerUp(svg, { clientX: 15, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 90, pointerId: 1 });
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it("manual drag: pointerDown -> pointerMove -> pointerUp calls onMove with the clamped delta", () => {
    const onMove = vi.fn();
    renderWithIntl(
      <CutPlanPreview
        plan={planOf()}
        fabricWidthCm={150}
        manual
        overlapIds={[]}
        screenToUser={identity}
        onMove={onMove}
        onNudgeAnnounce={vi.fn()}
        labelFor={(it) => `${it.name}`}
      />,
    );
    const g = screen.getByRole("button", { name: "A" });
    fireEvent.pointerDown(g, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(g, { clientX: 15, clientY: 12, pointerId: 1 });
    fireEvent.pointerUp(g, { clientX: 15, clientY: 12, pointerId: 1 });
    expect(onMove).toHaveBeenCalledWith("a#1", { x: 9, y: 6 });
  });

  it("ArrowRight nudges 1cm, Shift+ArrowRight nudges 5cm", () => {
    const onMove = vi.fn();
    const onNudgeAnnounce = vi.fn();
    renderWithIntl(
      <CutPlanPreview
        plan={planOf()}
        fabricWidthCm={150}
        manual
        overlapIds={[]}
        screenToUser={identity}
        onMove={onMove}
        onNudgeAnnounce={onNudgeAnnounce}
        labelFor={(it) => `${it.name}`}
      />,
    );
    const g = screen.getByRole("button", { name: "A" });
    fireEvent.keyDown(g, { key: "ArrowRight" });
    expect(onMove).toHaveBeenLastCalledWith("a#1", { x: 5, y: 4 });
    expect(onNudgeAnnounce).toHaveBeenCalledWith("a#1");

    fireEvent.keyDown(g, { key: "ArrowRight", shiftKey: true });
    expect(onMove).toHaveBeenLastCalledWith("a#1", { x: 9, y: 4 });
  });

  it("ArrowLeft at x=0 clamps to 0 rather than going negative", () => {
    const onMove = vi.fn();
    const plan = planOf();
    plan.instances[0].originCm = { x: 0, y: 4 };
    renderWithIntl(
      <CutPlanPreview
        plan={plan}
        fabricWidthCm={150}
        manual
        overlapIds={[]}
        screenToUser={identity}
        onMove={onMove}
        onNudgeAnnounce={vi.fn()}
        labelFor={(it) => `${it.name}`}
      />,
    );
    const g = screen.getByRole("button", { name: "A" });
    fireEvent.keyDown(g, { key: "ArrowLeft" });
    expect(onMove).toHaveBeenLastCalledWith("a#1", { x: 0, y: 4 });
  });

  it("with manual=false, no pointer/keyboard handler fires", () => {
    const onMove = vi.fn();
    renderWithIntl(
      <CutPlanPreview
        plan={planOf()}
        fabricWidthCm={150}
        manual={false}
        overlapIds={[]}
        screenToUser={identity}
        onMove={onMove}
        onNudgeAnnounce={vi.fn()}
        labelFor={(it) => `${it.name}`}
      />,
    );
    // not exposed as an interactive button when not in manual mode
    expect(screen.queryByRole("button", { name: "A" })).not.toBeInTheDocument();
    const g = document.querySelector("[data-instance-id='a#1']")!;
    fireEvent.pointerDown(g, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(g, { clientX: 15, clientY: 12, pointerId: 1 });
    fireEvent.pointerUp(g, { clientX: 15, clientY: 12, pointerId: 1 });
    fireEvent.keyDown(g, { key: "ArrowRight" });
    expect(onMove).not.toHaveBeenCalled();
  });
});
