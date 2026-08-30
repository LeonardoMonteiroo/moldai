import { describe, it, expect, vi } from "vitest";
import { renderWithIntl, ptBR, screen } from "@/components/test-utils";
import type { Credits, LedgerHistoryEntry } from "@/lib/types";
import { SETTINGS_SECTIONS } from "@/lib/settings/sections";
import type { SettingsSection } from "@/lib/settings/sections";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

import { SettingsShell } from "./SettingsShell";

/**
 * #168: /settings had no shell-level test, only per-section ones. What the
 * shell itself owns is the section switch, and its one real invariant is
 * exclusivity: `activeSection` selects exactly ONE of five panels. Five
 * independent `&&` expressions is a shape where a copy-paste slip renders
 * two panels at once, or none -- and "none" is the worse failure, because
 * the page still renders its header and its sidebar and reads as merely
 * empty rather than broken.
 *
 * The cases are generated from SETTINGS_SECTIONS itself, so a sixth section
 * added without a panel fails here instead of shipping blank.
 */

const CREDITS: Credits = {
  plan: "free",
  balance: 30,
  total: 30,
  renewsInDays: 12,
};

const LEDGER: LedgerHistoryEntry[] = [
  {
    type: "debit",
    reason: "generate",
    amount: 2,
    createdAt: new Date("2026-08-20T10:00:00Z").toISOString(),
  },
];

/**
 * One catalog string per section that ONLY that section renders. Taken from
 * each section's own namespace, so the assertion is "this panel is mounted"
 * rather than "some text appeared -- and deliberately not each section's
 * heading, because every heading is word-for-word identical to its own
 * sidebar item, which would match two nodes.
 */
const PANEL_MARKER: Record<SettingsSection, string> = {
  profile: ptBR.ProfileSection.emailHint,
  password: ptBR.PasswordSection.currentLabel,
  danger: ptBR.DangerZoneSection.warning,
  usage: ptBR.UsageSection.historyHeading,
  plan: ptBR.PlanSection.costsHeading,
};

function renderShell(
  activeSection: SettingsSection,
  hasPassword: boolean = true,
) {
  return renderWithIntl(
    <SettingsShell
      userEmail="ana@example.com"
      initialName="Ana"
      hasPassword={hasPassword}
      credits={CREDITS}
      ledger={LEDGER}
      activeSection={activeSection}
    />,
  );
}

describe("SettingsShell", () => {
  it.each(SETTINGS_SECTIONS.map((s) => [s] as const))(
    "renders the %s panel and no other",
    (section) => {
      renderShell(section);

      expect(screen.getByText(PANEL_MARKER[section])).toBeVisible();
      for (const other of SETTINGS_SECTIONS) {
        if (other === section) continue;
        expect(screen.queryByText(PANEL_MARKER[other])).toBeNull();
      }
    },
  );

  it("keeps the marker map complete against SETTINGS_SECTIONS", () => {
    // The map above is the part that can go stale, so it is checked against
    // the section list rather than assumed complete.
    expect(Object.keys(PANEL_MARKER).sort()).toEqual(
      [...SETTINGS_SECTIONS].sort(),
    );
  });

  it("renders through AppShell with the settings title and the credits bar", () => {
    renderShell("profile");

    expect(
      screen.getByRole("heading", { name: ptBR.SettingsShell.title }),
    ).toBeVisible();
    // `credits` is never null here -- the page component loads the wallet
    // server-side -- so the header's buy affordance is present, unlike the
    // dashboard's deferred one.
    expect(
      screen.getByRole("button", { name: ptBR.PageHeader.buyCreditsButton }),
    ).toBeVisible();
  });

  it("marks the active item in its own sidebar, not a global nav", () => {
    renderShell("plan");

    // SettingsSidebar is this screen's own column; the app has no global nav
    // sidebar, so the active marker has to come from here.
    expect(
      screen.getByRole("button", { name: ptBR.SettingsSidebar.planLabel }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("button", { name: ptBR.SettingsSidebar.profileLabel }),
    ).not.toHaveAttribute("aria-current");
  });

  it("passes the server-rendered name and email straight into the profile panel", () => {
    renderShell("profile");

    // No API round trip for first render: the page component loads both.
    expect(screen.getByDisplayValue("Ana")).toBeVisible();
    // Email is not editable -- it is the Credentials login identifier, and
    // changing it is out of scope.
    expect(screen.getByDisplayValue("ana@example.com")).toBeDisabled();
  });

  it("passes the server-rendered ledger straight into the usage panel", () => {
    renderShell("usage");

    // The row is present with no fetch at all: getLedgerHistory only backs
    // later refreshes, so a shell that dropped `ledger` would still look
    // fine until a real account had history.
    // The row's label is type and reason joined in one span, so it is
    // matched as a whole from the two catalog values rather than by
    // substring.
    expect(
      screen.getByText(
        `${ptBR.UsageSection.typeDebit} · ${ptBR.UsageSection.reasonGenerate}`,
      ),
    ).toBeVisible();
  });
});
