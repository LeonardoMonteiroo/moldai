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
