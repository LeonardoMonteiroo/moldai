import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

// #50: `quiet` styled its text with --color-placeholder (2.68:1 on surface),
// a token meant for real input placeholders and disabled controls, not plain
// informational text -- its only consumer (TabBar's non-base size chips) is
// a plain <span>, not a disabled control, so it owes WCAG 1.4.3's 4.5:1.
describe("Badge quiet variant", () => {
  it("uses text-muted, not the placeholder token", () => {
    render(<Badge variant="quiet">PP</Badge>);

    const badge = screen.getByText("PP");
    expect(badge.className).toContain("text-muted");
    expect(badge.className).not.toContain("text-placeholder");
  });
});
