import { describe, it, expect } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import { Tabs } from "@/components/ui/tabs";
import { TabBar } from "./TabBar";

function renderTabBar(
  overrides: Partial<React.ComponentProps<typeof TabBar>> = {},
) {
  return renderWithIntl(
    <Tabs defaultValue="pattern2d">
      <TabBar
        activeTab="pattern2d"
        baseSize="M"
        sizes={["P", "M", "G"]}
        detailsOpen={false}
        onToggleDetails={() => {}}
        hasSelectedPiece={false}
        exportHref={`/pattern/p1/export`}
        {...overrides}
      />
    </Tabs>,
  );
}

describe("TabBar — floating chrome (EDCH-01)", () => {
  it("renders as a translucent, blurred, absolutely-positioned overlay", () => {
    renderTabBar();
    const bar = screen.getByRole("tablist").closest(".absolute");
    expect(bar).not.toBeNull();
    expect(bar).toHaveClass("bg-surface/86", "backdrop-blur-sm", "shadow-card");
  });
});

describe("TabBar — tabs/size/details (unchanged behavior)", () => {
  it("switches the active tab on click", async () => {
    const user = userEvent.setup();
    renderTabBar();
    const proof3d = screen.getByRole("tab", {
      name: ptBR.TabBar.tabProof3d,
    });
    expect(proof3d).toHaveAttribute("aria-selected", "false");
    await user.click(proof3d);
    expect(proof3d).toHaveAttribute("aria-selected", "true");
  });

  it("opens the size selector popover", async () => {
    const user = userEvent.setup();
    renderTabBar();
    await user.click(
      screen.getByRole("button", {
        name: ptBR.TabBar.sizeButton.replace("{size}", "M"),
      }),
    );
    expect(
      await screen.findByText(ptBR.TabBar.sizeChangeNote),
    ).toBeInTheDocument();
  });

  it("only shows the piece-details toggle on the pattern2d tab", () => {
    renderTabBar({ activeTab: "proof3d" });
    expect(
      screen.queryByRole("button", { name: ptBR.TabBar.pieceDetailsButton }),
    ).not.toBeInTheDocument();
  });

  it("disables the piece-details toggle without a selected piece", () => {
    renderTabBar({ hasSelectedPiece: false });
    expect(
      screen.getByRole("button", { name: ptBR.TabBar.pieceDetailsButton }),
    ).toBeDisabled();
  });
});

// EDCH-02: Exportar moved here from Footer.tsx -- same enabled-link vs
// disabled-button-with-reason contract, same Footer.* copy.
describe("TabBar — Exportar (moved from Footer, #17/#116)", () => {
  it("links to the export screen when enabled", () => {
    renderTabBar({ exportHref: "/pattern/p1/export" });
    expect(
      screen.getByRole("link", { name: ptBR.Footer.exportButton }),
    ).toHaveAttribute("href", "/pattern/p1/export");
  });

  it.each([
    ["a blank pattern", ptBR.Footer.exportDisabledBlankTitle],
    ["an active conflict", ptBR.Footer.exportDisabledConflictTitle],
    ["a regeneration in progress", ptBR.Footer.exportDisabledGeneratingTitle],
  ])("renders disabled with a reason for %s", (_label, title) => {
    renderTabBar({ exportHref: null, exportTitle: title });
    const button = screen.getByRole("button", {
      name: ptBR.Footer.exportButton,
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", title);
  });

  it("renders no link at all while disabled", () => {
    renderTabBar({ exportHref: null, exportTitle: undefined });
    expect(
      screen.queryByRole("link", { name: ptBR.Footer.exportButton }),
    ).not.toBeInTheDocument();
  });
});
