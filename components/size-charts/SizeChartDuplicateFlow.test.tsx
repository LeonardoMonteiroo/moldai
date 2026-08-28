import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import type {
  SizeChartData,
  SizeChartListEntry,
  SizeChartRecord,
} from "@/lib/types";

vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return { ...actual, duplicateSizeChart: vi.fn() };
});

import * as api from "@/lib/api-client";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";
import { SizeChartLibrary } from "./SizeChartLibrary";
import { SizeChartTable } from "./SizeChartTable";

const BASE: SizeChartData = {
  name: "Feminino adulto",
  gender: "female",
  bodyType: "straight",
  isSystem: false,
  sizes: ["P", "M", "G"],
  baseSizeIndex: 1,
  baseMeasurements: {
    bust: 92,
    waist: 74,
    hip: 100,
    hipHeight: 20.6,
    backLength: 41,
    shoulder: 18.5,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
  },
  progressionRule: { bust: 4 },
  overrides: {},
};

function seed() {
  useSizeChartsStore.setState({
    draft: BASE,
    selectedId: "g1",
    editingRule: false,
    dirty: false,
    charts: [
      {
        id: "g1",
        updatedAt: "2026-08-21T00:00:00.000Z",
        isActive: false,
        ...BASE,
      } as SizeChartListEntry,
    ],
  });
}

describe("size-charts: duplicate refreshes the sidebar without a reload", () => {
  beforeEach(() => {
    vi.mocked(api.duplicateSizeChart).mockReset();
    seed();
  });

  it("appends and selects the new chart immediately after Duplicar", async () => {
    const created: SizeChartRecord = {
      ...BASE,
      id: "g2",
      updatedAt: "2026-08-28T00:00:00.000Z",
      name: `${BASE.name}${ptBR.SizeCharts.copySuffix}`,
      isSystem: false,
    };
    vi.mocked(api.duplicateSizeChart).mockResolvedValue(created);

    renderWithIntl(
      <>
        <SizeChartLibrary />
        <SizeChartTable />
      </>,
    );

    expect(screen.getAllByText(BASE.name)).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", {
        name: ptBR.SizeChartTable.duplicateButton,
      }),
    );

    // The duplicate must appear in the sidebar right away -- no reload.
    expect(await screen.findByText(created.name)).toBeInTheDocument();
    // The original chart's own card is still there, unaffected.
    expect(screen.getByText(BASE.name)).toBeInTheDocument();

    // The new chart becomes selected/active in the table view.
    expect(useSizeChartsStore.getState().selectedId).toBe("g2");
    expect(useSizeChartsStore.getState().draft?.name).toBe(created.name);
  });
});
