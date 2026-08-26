import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Metric } from "./Metric";

describe("Metric", () => {
  it("renders the label, value and hint it's given", () => {
    render(<Metric label="Folga (busto)" value="8,0 cm" hint="hint text" />);
    expect(screen.getByText("Folga (busto)")).toBeInTheDocument();
    expect(screen.getByText("8,0 cm")).toBeInTheDocument();
    expect(screen.getByText("hint text")).toBeInTheDocument();
  });
});
