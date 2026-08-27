import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { screen, waitFor, userEvent } from "@/components/test-utils";
// #16: imported relatively rather than through @/components/test-utils'
// renderWithIntl/ptBR/translatorFor -- this sandbox's vitest resolves the
// "@" alias for messages/pt-BR.json to a stale snapshot of the catalog that
// predates this branch's own edits (reproduced with a minimal probe: a
// relative import of the same file sees the current content, the aliased
// one does not; unrelated to any caching this session could clear). A
// relative import bypasses it, so this file builds its own tiny
// renderWithIntl/translatorFor against the real, current catalog instead of
// silently asserting against stale or missing keys.
import messages from "../../messages/pt-BR.json";
import type { PatternVersionEntry } from "@/lib/api-client";
import { VersionsShell } from "./VersionsShell";

const ptBR = messages;

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function translatorFor(namespace: keyof typeof messages) {
  const translate = createTranslator({
    locale: "pt-BR",
    messages,
    namespace,
  } as never);
  return function t(key: string, values?: Record<string, string | number>) {
    const resolved = (translate as (k: string, v?: unknown) => string)(
      key,
      values,
    );
    expect(resolved).not.toContain(key);
    return resolved;
  };
}

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { listVersions, restoreVersion, errorCode } = vi.hoisted(() => ({
  listVersions: vi.fn(),
  restoreVersion: vi.fn(),
  errorCode: vi.fn(() => "request_failed"),
}));

vi.mock("@/lib/api-client", () => ({
  listVersions,
  restoreVersion,
  errorCode,
}));

const tList = translatorFor("VersionList");

const CREDITS = {
  plan: "free",
  balance: 30,
  total: 30,
  renewsInDays: 30,
} as const;

function makeRows(): PatternVersionEntry[] {
  const spec = {
    type: "blouse" as const,
    gender: "female" as const,
    measurementOverrides: {},
    style: {},
  };
  // Real measurements, not an empty stub -- VersionCompare (rendered
  // alongside the list) redrafts from this via draftGarment, which throws
  // on a non-finite/missing field.
  const sizeTable = {
    M: {
      bust: 92,
      waist: 74,
      hip: 100,
      hipHeight: 20.6,
      backLength: 41,
      shoulder: 18.5,
      skirtLength: 60,
      shortSleeveLength: 18,
      longSleeveLength: 58,
    } as never,
  };
  return [
    {
      id: "pv3",
      version: 3,
      spec,
      sizes: ["M"],
      baseSize: "M",
      sizeTable,
      sizeChartName: null,
      reason: "graduate",
      cost: 6,
      createdAt: "2026-08-17T14:00:00.000Z",
    },
    {
      id: "pv2",
      version: 2,
      spec,
      sizes: ["M"],
      baseSize: "M",
      sizeTable,
      sizeChartName: null,
      reason: "conflict_fix",
      cost: 0,
      createdAt: "2026-08-17T13:00:00.000Z",
    },
    {
      id: "pv1",
      version: 1,
      spec,
      sizes: ["M"],
      baseSize: "M",
      sizeTable,
      sizeChartName: null,
      reason: "generate",
      cost: 1,
      createdAt: "2026-08-17T12:00:00.000Z",
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VersionsShell", () => {
  it("lists rows with reason codes resolved from the real catalog, and the footer total equals the sum of the row costs", async () => {
    listVersions.mockResolvedValue(makeRows());
    renderWithIntl(
      <VersionsShell
        userEmail="dev@moldai.local"
        credits={CREDITS}
        patternId="m1"
        patternName="Blusa"
        activeVersion={3}
      />,
    );

    // Each row's reason and cost render as one combined text node ("Graduação
    // · 6 créditos") -- a RegExp matcher checks the real catalog value is a
    // substring of it, rather than pasting a second, hand-split literal.
    await waitFor(() =>
      expect(
        screen.getByText(new RegExp(ptBR.VersionList.reason.graduate)),
      ).toBeVisible(),
    );
    expect(
      screen.getByText(new RegExp(ptBR.VersionList.reason.conflict_fix)),
    ).toBeVisible();
    expect(
      screen.getByText(new RegExp(ptBR.VersionList.reason.generate)),
    ).toBeVisible();

    // 6 + 0 + 1 = 7 credits total.
    expect(
      screen.getByText(tList("totalSpent", { total: 7 })),
    ).toBeInTheDocument();
  });

  it("shows a load error and no list when the fetch fails", async () => {
    listVersions.mockRejectedValue(new Error("boom"));
    renderWithIntl(
      <VersionsShell
        userEmail="dev@moldai.local"
        credits={CREDITS}
        patternId="m1"
        patternName="Blusa"
        activeVersion={1}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      ptBR.VersionsShell.loadError,
    );
  });

  it("restoring an old version calls the API and navigates back to the editor", async () => {
    listVersions.mockResolvedValue(makeRows());
    restoreVersion.mockResolvedValue({ status: "ok" });
    const user = userEvent.setup();
    renderWithIntl(
      <VersionsShell
        userEmail="dev@moldai.local"
        credits={CREDITS}
        patternId="m1"
        patternName="Blusa"
        activeVersion={3}
      />,
    );

    await user.click(
      await screen.findByRole("button", {
        name: tList("restoreButton", { version: 1 }),
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.VersionList.restoreModalConfirmButton,
      }),
    );

    await waitFor(() =>
      expect(restoreVersion).toHaveBeenCalledWith("m1", "pv1"),
    );
    expect(push).toHaveBeenCalledWith("/pattern/m1");
  });

  it("shows an inline notice and stays on screen when restore fails", async () => {
    listVersions.mockResolvedValue(makeRows());
    restoreVersion.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderWithIntl(
      <VersionsShell
        userEmail="dev@moldai.local"
        credits={CREDITS}
        patternId="m1"
        patternName="Blusa"
        activeVersion={3}
      />,
    );

    await user.click(
      await screen.findByRole("button", {
        name: tList("restoreButton", { version: 1 }),
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.VersionList.restoreModalConfirmButton,
      }),
    );

    expect(
      await screen.findByText(ptBR.ActionErrorNotice.message),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });
});
