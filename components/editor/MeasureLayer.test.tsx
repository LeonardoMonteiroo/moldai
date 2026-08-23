import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Measurement } from "@/lib/types";
import { MeasureLayer } from "./MeasureLayer";

// #107: was `.toFixed(1)` with no comma replace at all -- the measure tool's
// on-canvas distance rendered "12.3 cm" in a pt-BR interface, next to the
// seam labels beside it which already got the comma right. 14px at
// lib/draft/core.ts's SCALE=4 px/cm is 3.5cm -- a non-integer distance, so a
// dropped comma is actually visible in the assertion.
describe("MeasureLayer", () => {
  it("renders the on-canvas distance with a pt-BR comma, not a dot", () => {
    const measurements: Measurement[] = [
      { id: "m1", a: { x: 0, y: 0 }, b: { x: 14, y: 0 } },
    ];
    render(
      <svg>
        <MeasureLayer
          measurements={measurements}
          pending={null}
          cursor={null}
          snap={null}
          scale={1}
        />
      </svg>,
    );

    expect(screen.getByText("3,5 cm")).toBeInTheDocument();
    expect(screen.queryByText("3.5 cm")).not.toBeInTheDocument();
  });
});
