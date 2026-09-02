import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  translatorFor,
} from "@/components/test-utils";
import type { SloperListItem } from "@/lib/types";
import { useSlopersStore } from "@/lib/slopersStore";
import { SloperGrid } from "./SloperGrid";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const SLOPER: SloperListItem = {
  id: "s1",
  name: "base corpo reto",
  garmentType: "blouse",
  baseSize: "M",
  sizeChartName: "Feminino adulto",
  updatedAt: "2026-08-22T00:00:00.000Z",
  thumbnailSvg: "<svg />",
};

function resetStore() {
  useSlopersStore.setState({ slopers: [], search: "", typeFilter: "all" });
}

// #106: CLDR puts 0 in pt's "one" plural category, so this label read
// "0 base" whenever the library was empty -- correct by CLDR, wrong in
// Brazilian usage. Covers 0 (the explicit =0 branch), 1 and 2, the same
// boundary PatternGrid's countLabel guards.
describe("SloperGrid count label (#106)", () => {
  const tSlopers = translatorFor("Slopers");

  beforeEach(resetStore);

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

// The design shows search + a garment-type filter above the grid; before
// this, useSlopersStore had no such state at all.
describe("SloperGrid search and type filter", () => {
  beforeEach(() => {
    resetStore();
    push.mockReset();
    useSlopersStore.setState({
      slopers: [
        {
          ...SLOPER,
          id: "s1",
          name: "Base vestido festa",
          garmentType: "dress",
        },
        {
          ...SLOPER,
          id: "s2",
          name: "Base camiseta básica",
          garmentType: "tshirt",
        },
      ],
    });
  });

  it("filters the grid as the user types into the search field", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SloperGrid onUse={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText(ptBR.Slopers.searchPlaceholder),
      "vestido",
    );

    expect(screen.getByText("Base vestido festa")).toBeInTheDocument();
    expect(screen.queryByText("Base camiseta básica")).not.toBeInTheDocument();
  });

  it("shows the no-matches state when a filter narrows a nonzero list to zero", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SloperGrid onUse={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText(ptBR.Slopers.searchPlaceholder),
      "calça",
    );

    expect(screen.getByText(ptBR.Slopers.noMatchesTitle)).toBeInTheDocument();
    // Distinct from the truly-empty state's CTA -- no-matches offers none.
    expect(
      screen.queryByRole("button", { name: ptBR.Slopers.emptyAction }),
    ).not.toBeInTheDocument();
  });
});

describe("SloperGrid empty state", () => {
  beforeEach(() => {
    resetStore();
    push.mockReset();
  });

  it("offers a CTA back to the pattern dashboard when there are no slopers at all", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SloperGrid onUse={vi.fn()} />);

    expect(screen.getByText(ptBR.Slopers.emptyTitle)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: ptBR.Slopers.emptyAction }),
    );
    expect(push).toHaveBeenCalledWith("/");
  });
});
