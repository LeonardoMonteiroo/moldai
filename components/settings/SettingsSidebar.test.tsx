import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithIntl, screen, ptBR } from "@/components/test-utils";
import { SettingsSidebar } from "./SettingsSidebar";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

describe("SettingsSidebar", () => {
  beforeEach(() => replace.mockReset());

  // #22: SettingsSidebar's entries were already real Buttons (focusable), but
  // the current section was exposed only through the "soft" variant's
  // styling -- nothing told a screen reader which one is the current page.
  it("marks the active section as the current page", () => {
    renderWithIntl(<SettingsSidebar active="usage" />);

    expect(
      screen.getByRole("button", { name: ptBR.SettingsSidebar.usageLabel }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("does not mark an inactive section as the current page", () => {
    renderWithIntl(<SettingsSidebar active="usage" />);

    expect(
      screen.getByRole("button", { name: ptBR.SettingsSidebar.profileLabel }),
    ).not.toHaveAttribute("aria-current");
  });
});
