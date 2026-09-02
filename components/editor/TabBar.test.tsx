import { describe, it, expect, vi } from "vitest";
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
        onExport={() => {}}
        exportDisabled={false}
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

// EDCH-02/redesign-fidelity-pass round 2: Exportar moved here from
// Footer.tsx as a Link to the dedicated /export screen, then from a Link
// into opening ExportModal in-editor (Editor.dc.html's own "Exportar").
describe("TabBar — Exportar (moved from Footer, #17/#116, modal round 2)", () => {
  it("calls onExport when enabled", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    renderTabBar({ onExport, exportDisabled: false });
    await user.click(
      screen.getByRole("button", { name: ptBR.Footer.exportButton }),
    );
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a blank pattern", ptBR.Footer.exportDisabledBlankTitle],
    ["an active conflict", ptBR.Footer.exportDisabledConflictTitle],
    ["a regeneration in progress", ptBR.Footer.exportDisabledGeneratingTitle],
  ])("renders disabled with a reason for %s", (_label, title) => {
    renderTabBar({ exportDisabled: true, exportTitle: title });
    const button = screen.getByRole("button", {
      name: ptBR.Footer.exportButton,
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", title);
  });

  // Editor.dc.html: "a aba Prova 3D não exporta e esconde o botão" -- not a
  // permanently-disabled button, no button at all.
  it("hides the Exportar button entirely on the Prova 3D tab", () => {
    renderTabBar({ activeTab: "proof3d" });
    expect(
      screen.queryByRole("button", { name: ptBR.Footer.exportButton }),
    ).not.toBeInTheDocument();
  });
});
