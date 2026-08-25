import { describe, it, expect, vi } from "vitest";
import { renderWithIntl, screen, translatorFor } from "@/components/test-utils";
import type { SloperListItem } from "@/lib/types";
import { useSlopersStore } from "@/lib/slopersStore";
import { SloperGrid } from "./SloperGrid";

const SLOPER: SloperListItem = {
  id: "s1",
  name: "base corpo reto",
  garmentType: "blouse",
  baseSize: "M",
  sizeChartName: "Feminino adulto",
  updatedAt: "2026-08-22T00:00:00.000Z",
  thumbnailSvg: "<svg />",
};

// #106: CLDR puts 0 in pt's "one" plural category, so this label read
// "0 base" whenever the library was empty -- correct by CLDR, wrong in
// Brazilian usage. Covers 0 (the explicit =0 branch), 1 and 2, the same
// boundary PatternGrid's countLabel guards.
describe("SloperGrid count label (#106)", () => {
  const tSlopers = translatorFor("Slopers");

  it("reads 'Nenhuma base' for zero, and pluralizes correctly at 1 and 2", () => {
    useSlopersStore.setState({ slopers: [] });
    const zero = renderWithIntl(<SloperGrid onUse={vi.fn()} />);
    expect(
      screen.getByText(tSlopers("countLabel", { count: 0 })),
    ).toBeInTheDocument();
    expect(tSlopers("countLabel", { count: 0 })).toBe("Nenhuma base");
    zero.unmount();

    useSlopersStore.setState({ slopers: [SLOPER] });
    const one = renderWithIntl(<SloperGrid onUse={vi.fn()} />);
    expect(
      screen.getByText(tSlopers("countLabel", { count: 1 })),
    ).toBeInTheDocument();
    one.unmount();

    useSlopersStore.setState({ slopers: [SLOPER, { ...SLOPER, id: "s2" }] });
    const two = renderWithIntl(<SloperGrid onUse={vi.fn()} />);
    expect(
      screen.getByText(tSlopers("countLabel", { count: 2 })),
    ).toBeInTheDocument();
    two.unmount();
  });
});
