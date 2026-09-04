import { describe, it, expect, vi } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  translatorFor,
} from "@/components/test-utils";
import { seedPatternState } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";
import type { PatternVersionEntry } from "@/lib/api-client";
import { VersionList } from "./VersionList";

const tList = translatorFor("VersionList");

function makeVersions(): PatternVersionEntry[] {
  const seeded = seedPatternState(t).pattern;
  const spec: GarmentSpec = {
    type: "blouse",
    gender: "female",
    measurementOverrides: {},
    style: {},
  };
  const base = {
    id: "id",
    spec,
    sizes: seeded.sizes,
    baseSize: seeded.baseSize,
    sizeTable: seeded.sizeTable,
    sizeChartName: null,
    engine: null,
  };
  return [
    {
      ...base,
      id: "pv3",
      version: 3,
      reason: "graduate",
      cost: 6,
      createdAt: "2026-08-17T14:00:00.000Z",
    },
    {
      ...base,
      id: "pv2",
      version: 2,
      reason: "conflict_fix",
      cost: 0,
      createdAt: "2026-08-17T13:00:00.000Z",
    },
    {
      ...base,
      id: "pv1",
      version: 1,
      reason: "generate",
      cost: 1,
      createdAt: "2026-08-17T12:00:00.000Z",
    },
  ];
}

function renderList(
  overrides: Partial<{
    activeVersion: number;
    compareFrom: number;
    compareTo: number;
  }> = {},
) {
  const onSelect = vi.fn();
  const onRestore = vi.fn();
  const versions = makeVersions();
  renderWithIntl(
    <VersionList
      versions={versions}
      activeVersion={overrides.activeVersion ?? 3}
      compareFrom={overrides.compareFrom ?? 2}
      compareTo={overrides.compareTo ?? 3}
      onSelect={onSelect}
      restoring={false}
      onRestore={onRestore}
    />,
  );
  return { versions, onSelect, onRestore };
}

describe("VersionList", () => {
  it("renders one selectable card per version, each with a real drafted thumbnail", () => {
    renderList();
    const svgs = document.querySelectorAll("svg[viewBox]");
    expect(svgs.length).toBe(3);
    // Real drafted geometry, not an empty placeholder svg -- each thumbnail
    // must actually contain outline shapes (a blouse drafts several pieces,
    // each a <polygon> or <path> via OutlineShape).
    svgs.forEach((svg) => {
      expect(svg.querySelectorAll("polygon, path").length).toBeGreaterThan(0);
    });
  });

  // Two real <button> elements must never nest -- the design's own mockup
  // does this (Versoes.dc.html:116,136), which is invalid ARIA (interactive
  // content inside interactive content). VersionList deliberately puts the
  // restore button as a sibling instead (see the comment in VersionList.tsx).
  it("never nests the restore button inside the selection button", () => {
    renderList();
    document.querySelectorAll("button").forEach((button) => {
      expect(button.querySelector("button")).toBeNull();
    });
  });

  it("marks the current version 'Versão atual' instead of offering to restore it", () => {
    renderList({ activeVersion: 3 });
    expect(
      screen.getByText(ptBR.VersionList.currentVersionLabel),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: tList("restoreButton", { version: 3 }),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: tList("restoreButton", { version: 1 }),
      }),
    ).toBeInTheDocument();
  });

  it("badges the 'to' selection as Para and 'from' as De", () => {
    renderList({ compareFrom: 2, compareTo: 3 });
    expect(screen.getByText(ptBR.VersionList.toBadge)).toBeInTheDocument();
    expect(screen.getByText(ptBR.VersionList.fromBadge)).toBeInTheDocument();
  });

  it("shows the section hint and the real total across all versions", () => {
    renderList();
    expect(screen.getByText(ptBR.VersionList.compareHint)).toBeInTheDocument();
    // 6 + 0 + 1 = 7 credits total.
    expect(
      screen.getByText(tList("totalSpent", { total: 7 })),
    ).toBeInTheDocument();
  });

  // Mirrors the design's own select(version) rule exactly (Versoes.dc.html).
  it("clicking the current 'to' card swaps it into 'from'", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderList({ compareFrom: 2, compareTo: 3 });

    const toBadge = screen.getByText(ptBR.VersionList.toBadge);
    const toButton = toBadge.closest("button")!;
    await user.click(toButton);

    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("clicking the current 'from' card is a no-op", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderList({ compareFrom: 2, compareTo: 3 });

    const fromBadge = screen.getByText(ptBR.VersionList.fromBadge);
    const fromButton = fromBadge.closest("button")!;
    await user.click(fromButton);

    // The click still reaches onSelect (the component always calls it) --
    // it's VersionsShell's selection rule that treats "clicking from" as a
    // no-op, so this is really testing that click routing wires the correct
    // version through, not the no-op rule itself (covered in VersionsShell).
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("clicking an unselected card selects it via onSelect", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderList({ compareFrom: 2, compareTo: 3 });
    await user.click(
      screen.getByRole("button", {
        name: tList("selectHint", { version: 1 }),
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("restoring a card does not also select it for comparison", async () => {
    const user = userEvent.setup();
    const { onSelect, onRestore } = renderList({
      compareFrom: 2,
      compareTo: 3,
    });

    await user.click(
      screen.getByRole("button", {
        name: tList("restoreButton", { version: 1 }),
      }),
    );
    // The restore click must not have also fired the card's onSelect.
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: ptBR.VersionList.restoreModalConfirmButton,
      }),
    );
    expect(onRestore).toHaveBeenCalledWith("pv1");
  });
});

describe("VersionList thumbnail sizing", () => {
  // The thumbnail box is `aspect-[4/3]`, but the SVG inside was sized with
  // `h-full` alone -- a percentage against a parent whose height comes from
  // an aspect ratio rather than a resolved length, so it fell back to the
  // SVG's own intrinsic ratio. A portrait pattern then drove the box, making
  // every card ~330px tall against the design's ~210px and turning a compact
  // filmstrip into a third of the screen. Taking the SVG out of flow is what
  // lets the ratio decide the box.
  it("takes the thumbnail SVG out of flow so the 4:3 box owns the height", () => {
    renderList();
    const svgs = document.querySelectorAll("svg[viewBox]");
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => {
      expect(svg).toHaveClass("absolute", "inset-0");
      const box = svg.parentElement!;
      expect(box.className).toContain("aspect-[4/3]");
      expect(box).toHaveClass("relative");
    });
  });

  it("keeps every card at the design's 152px width", () => {
    renderList();
    document.querySelectorAll("svg[viewBox]").forEach((svg) => {
      const card = svg.closest('div[class*="rounded-card"]')!;
      expect(card).toHaveClass("w-[152px]", "flex-none");
    });
  });
});
