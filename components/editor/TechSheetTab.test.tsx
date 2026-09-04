import { describe, it, expect } from "vitest";
import { renderWithIntl, ptBR, screen } from "@/components/test-utils";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE } from "@/lib/measurements";
import { TechSheetTab } from "./TechSheetTab";

// buildEaseReport (#137) only checks pieces.length > 0 to know a pattern has
// already been drafted -- it never reads the Piece shape itself (it
// re-drafts in exact cm from spec + sizeTable, the buildExportModel
// precedent), so a single stub entry is enough to signal that.
const STUB_PIECE: Pattern["pieces"][number] = {
  id: "x",
  name: "x",
  qty: 1,
  outline: { kind: "polygon", points: "0,0" },
  label: { x: 0, y: 0 },
  detailRows: [],
};

function pattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: "p1",
    name: "Blusa",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["P", "M", "G"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: {},
    pieces: [],
    spec: {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {},
    },
    ...overrides,
  };
}

describe("TechSheetTab", () => {
  // #115: chipPieces used to show the copies-to-cut total (qty summed
  // across pieces, e.g. a blouse's front×1/back×1/sleeve×2 = 4) mislabeled
  // as "Peças" -- the canvas shows 3 pieces and this summary agreed with
  // neither. chipPieces now agrees with the number of piece cards rendered
  // below, and the copies total gets its own honestly-labeled chip.
  it("labels the distinct piece count and the copies-to-cut total separately, agreeing with the piece cards rendered", () => {
    renderWithIntl(
      <TechSheetTab
        pattern={pattern({
          // A real, complete measurements row -- every other test in this
          // file leaves pieces empty, so this is the first one to actually
          // exercise buildExportModel (gated on pieces.length > 0); an
          // empty/partial sizeTable there hangs the drafting pipeline
          // (a real bug, out of scope for #115, worth its own issue), so
          // this needs a valid row to test the chip labels in isolation.
          sizeTable: { M: SIZE_TABLE.M },
          pieces: [
            {
              id: "front",
              name: "Frente",
              qty: 1,
              outline: { kind: "polygon", points: "0,0" },
              label: { x: 0, y: 0 },
              detailRows: [],
            },
            {
              id: "back",
              name: "Costas",
              qty: 1,
              outline: { kind: "polygon", points: "0,0" },
              label: { x: 0, y: 0 },
              detailRows: [],
            },
            {
              id: "sleeve",
              name: "Manga",
              qty: 2,
              outline: { kind: "polygon", points: "0,0" },
              label: { x: 0, y: 0 },
              detailRows: [],
            },
          ],
        })}
      />,
    );

    expect(screen.getByText(ptBR.TechSheetTab.chipPieces)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // distinct pieces, matches the 3 cards below
    expect(screen.getByText(ptBR.TechSheetTab.chipCopies)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument(); // copies to cut (front×1 + back×1 + sleeve×2)
    expect(screen.getAllByText("Frente")).not.toHaveLength(0);
    expect(screen.getAllByText("Costas")).not.toHaveLength(0);
    expect(screen.getAllByText("Manga")).not.toHaveLength(0);
  });

  // Which grade a pattern was drafted from was recorded nowhere the user could
  // see, which mattered most when generation had substituted a chart.
  it("names the size chart the pattern was drafted from", () => {
    renderWithIntl(
      <TechSheetTab
        pattern={pattern({ sizeChartName: "Feminino adulto · ABNT" })}
      />,
    );

    expect(
      screen.getByText(ptBR.TechSheetTab.chipSizeChart),
    ).toBeInTheDocument();
    expect(screen.getByText("Feminino adulto · ABNT")).toBeInTheDocument();
  });

  // Patterns drafted before the field existed have no name to show; inventing
  // one would be worse than omitting the chip.
  it("omits the chip entirely when the pattern carries no chart name", () => {
    renderWithIntl(<TechSheetTab pattern={pattern()} />);

    expect(
      screen.queryByText(ptBR.TechSheetTab.chipSizeChart),
    ).not.toBeInTheDocument();
  });

  // #267: unlike sizeChartName, the engine chip always renders -- absent
  // pattern.engine resolves through engineFor to the real default, since
  // there's always an actual engine, never a name that would need to be
  // guessed.
  it("names the drafting engine, defaulting to moldai for a pattern with no engine recorded", () => {
    renderWithIntl(<TechSheetTab pattern={pattern()} />);

    expect(screen.getByText(ptBR.TechSheetTab.chipEngine)).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.TechSheetTab.engine.moldai),
    ).toBeInTheDocument();
  });

  it("names the pattern's own frozen engine when one is recorded", () => {
    renderWithIntl(<TechSheetTab pattern={pattern({ engine: "moldai" })} />);

    expect(
      screen.getByText(ptBR.TechSheetTab.engine.moldai),
    ).toBeInTheDocument();
  });

  // #125: a woven garment shows the fit class chip; the ease REPORT (#137)
  // is a separate section, tested below.
  it("shows the fit class for a woven garment", () => {
    renderWithIntl(
      <TechSheetTab
        pattern={pattern({
          sizeTable: { M: SIZE_TABLE.M },
          spec: {
            type: "blouse",
            gender: "female",
            measurementOverrides: {},
            style: { fit: "loose" },
          },
        })}
      />,
    );

    expect(screen.getByText(ptBR.TechSheetTab.chipFit)).toBeInTheDocument();
    expect(screen.getByText(ptBR.PatternData.fit.loose)).toBeInTheDocument();
  });

  it("shows the fabric stretch class for a knit garment", () => {
    renderWithIntl(
      <TechSheetTab
        pattern={pattern({
          sizeTable: { M: SIZE_TABLE.M },
          spec: {
            type: "tshirt",
            gender: "female",
            measurementOverrides: {},
            style: { stretch: "high" },
          },
        })}
      />,
    );

    expect(screen.getByText(ptBR.TechSheetTab.chipFabric)).toBeInTheDocument();
    expect(screen.getByText(ptBR.PatternData.stretch.high)).toBeInTheDocument();
  });

  it("omits the fit/fabric chips for a pattern with no bodice (skirt only)", () => {
    renderWithIntl(
      <TechSheetTab
        pattern={pattern({
          sizeTable: { M: SIZE_TABLE.M },
          spec: {
            type: "skirt",
            gender: "female",
            measurementOverrides: {},
            style: {},
          },
        })}
      />,
    );

    expect(
      screen.queryByText(ptBR.TechSheetTab.chipFit),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(ptBR.TechSheetTab.chipFabric),
    ).not.toBeInTheDocument();
  });

  // #137: the drafted-ease report -- geometry-measured, not the requested
  // fit/stretch style field. Renders bust/waist/hip rows with cm/% and the
  // implied fit class, reusing the same PatternData.fit.* catalog the
  // chipFit chip above reads.
  describe("drafted-ease report (#137)", () => {
    it("renders bust/waist/hip rows with cm, %, and the implied fit class for a woven blouse", () => {
      renderWithIntl(
        <TechSheetTab
          pattern={pattern({
            sizeTable: { M: SIZE_TABLE.M },
            pieces: [STUB_PIECE],
            spec: {
              type: "blouse",
              gender: "female",
              measurementOverrides: {},
              style: { neckline: "round", sleeve: "short", darts: true },
            },
          })}
        />,
      );

      expect(
        screen.getByText(ptBR.TechSheetTab.easeReport.title),
      ).toBeInTheDocument();
      expect(
        screen.getByText(ptBR.TechSheetTab.easeReport.girth.bust),
      ).toBeInTheDocument();
      expect(
        screen.getByText(ptBR.TechSheetTab.easeReport.girth.waist),
      ).toBeInTheDocument();
      expect(
        screen.getByText(ptBR.TechSheetTab.easeReport.girth.hip),
      ).toBeInTheDocument();
      // The default fitted blouse's bust ease reads back near the
      // FIT_EASE_CM.fitted default (8cm) -- the fit class column shows the
      // catalog's own "fitted" label, resolved off the measured (not
      // requested) ease.
      expect(
        screen.getAllByText(ptBR.PatternData.fit.fitted).length,
      ).toBeGreaterThan(0);
      // Cap ease chips, since this blouse has a sleeve.
      expect(
        screen.getByText(ptBR.TechSheetTab.easeReport.capEase),
      ).toBeInTheDocument();
    });

    it("shows negative bust ease for a stretchy knit, not hidden or treated as an error", () => {
      renderWithIntl(
        <TechSheetTab
          pattern={pattern({
            sizeTable: { M: SIZE_TABLE.M },
            pieces: [STUB_PIECE],
            spec: {
              type: "tshirt",
              gender: "female",
              measurementOverrides: {},
              style: { stretch: "high" },
            },
          })}
        />,
      );

      expect(screen.getAllByText(/-\d+,\d cm/).length).toBeGreaterThan(0);
    });

    it("marks bust as unavailable for a bust-less garment (skirt), with a stated reason", () => {
      renderWithIntl(
        <TechSheetTab
          pattern={pattern({
            sizeTable: { M: SIZE_TABLE.M },
            pieces: [STUB_PIECE],
            spec: {
              type: "skirt",
              gender: "female",
              measurementOverrides: {},
              style: { skirt: "straight" },
            },
          })}
        />,
      );

      expect(
        screen.getByText(
          ptBR.TechSheetTab.easeReport.unavailable.noPanel.replace(
            "{girth}",
            ptBR.TechSheetTab.easeReport.girth.bust.toLowerCase(),
          ),
        ),
      ).toBeInTheDocument();
    });

    it("omits the whole report when the pattern's sizeTable has no row for its own baseSize", () => {
      renderWithIntl(
        <TechSheetTab pattern={pattern({ pieces: [STUB_PIECE] })} />,
      );

      expect(screen.getByText(ptBR.TechSheetTab.chipFit)).toBeInTheDocument();
      expect(
        screen.queryByText(ptBR.TechSheetTab.easeReport.title),
      ).not.toBeInTheDocument();
    });
  });
});
