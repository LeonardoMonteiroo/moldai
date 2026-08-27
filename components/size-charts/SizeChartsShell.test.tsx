import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
  waitFor,
  act,
} from "@/components/test-utils";
import type { Credits, SizeChartListEntry } from "@/lib/types";
import { SizeChartsShell } from "./SizeChartsShell";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return { ...actual, listSizeCharts: vi.fn(() => new Promise(() => {})) };
});

import { listSizeCharts, ApiError } from "@/lib/api-client";

const CREDITS: Credits = {
  plan: "free",
  balance: 30,
  total: 30,
  renewsInDays: 12,
};

const CHART: SizeChartListEntry = {
  id: "sc1",
  name: "Feminino adulto",
  gender: "female",
  bodyType: "straight",
  isSystem: true,
  isActive: true,
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
  updatedAt: "2026-08-21T00:00:00.000Z",
};

// #117: the subtitle used to claim the active grade "vale para toda geração
// e graduação" -- but pickSizeChartForGeneration falls back to the system
// chart whenever the garment's gender differs, exactly what the library's
// own "activeScope" badge already admits. The two must not contradict.
describe("SizeChartsShell", () => {
  it("states the gender-scoped rule in the subtitle, not a blanket claim", () => {
    renderWithIntl(<SizeChartsShell userEmail="a@b.com" credits={CREDITS} />);

    expect(screen.getByText(ptBR.SizeCharts.subtitle)).toBeInTheDocument();
    expect(
      screen.queryByText(
        "A grade escolhida vale para toda geração e graduação",
      ),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// #168: the shell's three mutually-exclusive states, plus the load-vs-action
// error split -- the same shape SlopersShell.test.tsx pins, asserted here
// too because each screen owns its own store and its own notice. The failure
// that matters is the quiet one: a failed save used to leave `dirty` true
// and say nothing, so the user kept editing a chart that was not persisting.
// ---------------------------------------------------------------------------

describe("SizeChartsShell states", () => {
  beforeEach(() => {
    vi.mocked(listSizeCharts).mockReset();
    useSizeChartsStore.setState({
      ready: false,
      error: false,
      actionError: null,
      charts: [],
      selectedId: null,
      draft: null,
    });
  });

  it("announces the load through a live region while the list is in flight", () => {
    vi.mocked(listSizeCharts).mockReturnValue(new Promise(() => {}));
    renderWithIntl(<SizeChartsShell userEmail="a@b.com" credits={CREDITS} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      ptBR.SizeCharts.loading,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the library and the selected chart's table once the list lands", async () => {
    vi.mocked(listSizeCharts).mockResolvedValue([CHART]);
    renderWithIntl(<SizeChartsShell userEmail="a@b.com" credits={CREDITS} />);

    // The system chart card carries this note on its own line (the badge
    // itself sits inside a span with sibling text, so it is not matchable
    // whole); a spinbutton proves the table mounted, which it only does
    // once a draft exists.
    expect(
      await screen.findByText(ptBR.SizeChartLibrary.houseStandardNote),
    ).toBeVisible();
    expect(screen.getAllByRole("spinbutton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("replaces the content region with an alert when the load fails", async () => {
    vi.mocked(listSizeCharts).mockRejectedValue(
      new ApiError(500, "server_error"),
    );
    renderWithIntl(<SizeChartsShell userEmail="a@b.com" credits={CREDITS} />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        ptBR.SizeCharts.loadError,
      ),
    );
    // No half-rendered library behind the message.
    expect(
      screen.queryByText(ptBR.SizeChartLibrary.houseStandardNote),
    ).toBeNull();
  });

  it("keeps the editor usable and shows a dismissible notice on a failed mutation", async () => {
    vi.mocked(listSizeCharts).mockResolvedValue([CHART]);
    renderWithIntl(<SizeChartsShell userEmail="a@b.com" credits={CREDITS} />);
    await screen.findByText(ptBR.SizeChartLibrary.houseStandardNote);

    // A failed save/activate/delete records its code on the store; the
    // screen it happened on is where it has to surface.
    act(() => useSizeChartsStore.setState({ actionError: "server_error" }));
    expect(screen.getByText(ptBR.ActionErrorNotice.message)).toBeVisible();
    // The library is still there -- a failed mutation is not a failed load.
    expect(
      screen.getByText(ptBR.SizeChartLibrary.houseStandardNote),
    ).toBeVisible();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: ptBR.ActionErrorNotice.dismiss }),
    );
    expect(screen.queryByText(ptBR.ActionErrorNotice.message)).toBeNull();
  });
});
