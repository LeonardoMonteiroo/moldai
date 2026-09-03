import { describe, it, expect } from "vitest";
import { renderWithIntl } from "@/components/test-utils";
import { Progress } from "./progress";

describe("Progress", () => {
  // Every progress track in the design handoff is #ece8dd -- the --color-track
  // token -- never a tint of the olive fill. shadcn ships `bg-primary/20`, and
  // three call sites had each been overriding it back to `bg-track` one at a
  // time; the default belongs in the primitive.
  it("paints its track with the design's track token, not an olive tint", () => {
    const { container } = renderWithIntl(<Progress value={40} />);
    const track = container.querySelector('[data-slot="progress"]');
    expect(track).toHaveClass("bg-track");
    expect(track).not.toHaveClass("bg-primary/20");
  });

  it("keeps the fill on the primary token", () => {
    const { container } = renderWithIntl(<Progress value={40} />);
    const fill = container.querySelector('[data-slot="progress-indicator"]');
    expect(fill).toHaveClass("bg-primary");
  });

  it("offers a thin (5px) track alongside the default", () => {
    const { container: def } = renderWithIntl(<Progress value={10} />);
    expect(def.querySelector('[data-slot="progress"]')).toHaveClass("h-2");

    const { container: thin } = renderWithIntl(
      <Progress value={10} size="thin" />,
    );
    expect(thin.querySelector('[data-slot="progress"]')).toHaveClass("h-[5px]");
  });
});
