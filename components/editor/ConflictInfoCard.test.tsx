import { describe, it, expect } from "vitest";
import { renderWithIntl, screen, translatorFor } from "@/components/test-utils";
import type { ConflictInfo } from "@/lib/types";
import { ConflictInfoCard } from "./ConflictInfoCard";

// Resolves the catalog's own ICU strings (gapLabel is a select; valueCm
// interpolates), which a hand-written literal could not do without pasting
// display text into a test. On a missing key next-intl renders the key path
// rather than throwing — and the component would render that same path, so
// comparing the two would pass over a catalog gap. Hence the guard (built
// into translatorFor): it fails here, at the source, if the message did not
// actually resolve.
const t = translatorFor("ConflictInfoCard");

function conflict(overrides: Partial<ConflictInfo> = {}): ConflictInfo {
  return {
    id: "conf-1",
    title: "Cava e manga não batem",
    description: "A cava do corpo ficou 3,1 cm maior que a copa da manga.",
    diffCm: 3.1,
    suggestion: "“Corrigir manga” refaz a copa.",
    pieceAId: "body-front",
    pieceBId: "sleeve",
    markers: [
      { cx: 10, cy: 10, r: 14 },
      { cx: 50, cy: 50, r: 14 },
    ],
    ...overrides,
  };
}

describe("ConflictInfoCard", () => {
  // EDCH-03: top-[58px] clears the floating tab bar (Editor.dc.html:227's
  // clearance value), which now overlaps this corner's old top-5.
  it("clears the floating tab bar with a top-[58px] inset", () => {
    const { container } = renderWithIntl(
      <ConflictInfoCard conflict={conflict()} />,
    );
    expect(container.firstElementChild).toHaveClass("top-[58px]");
    expect(container.firstElementChild).not.toHaveClass("top-5");
  });

  it("compares both seam lengths and names the gap on the shorter one", () => {
    renderWithIntl(
      <ConflictInfoCard
        conflict={conflict()}
        armholeLenCm={22.84}
        sleeveArmholeCm={19.7}
      />,
    );
    expect(screen.getByText(t("bodyRowLabel"))).toBeInTheDocument();
    expect(screen.getByText(t("sleeveRowLabel"))).toBeInTheDocument();
    expect(
      screen.getByText(t("valueCm", { value: "22,8" })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t("valueCm", { value: "19,7" })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t("gapLabel", { direction: "larger", diff: "3,1" })),
    ).toBeInTheDocument();
    // The bare difference line is the fallback, not a second copy of the gap.
    expect(
      screen.queryByText(t("diffLabel", { diff: "3,1" })),
    ).not.toBeInTheDocument();
  });

  it("says the gap is on the body when the cap is the longer seam", () => {
    renderWithIntl(
      <ConflictInfoCard
        conflict={conflict({ diffCm: 2.5 })}
        armholeLenCm={19.7}
        sleeveArmholeCm={22.2}
      />,
    );
    expect(
      screen.getByText(t("gapLabel", { direction: "smaller", diff: "2,5" })),
    ).toBeInTheDocument();
  });

  it("falls back to the difference alone when the lengths are unavailable", () => {
    renderWithIntl(<ConflictInfoCard conflict={conflict()} />);
    expect(
      screen.getByText(t("diffLabel", { diff: "3,1" })),
    ).toBeInTheDocument();
    expect(screen.queryByText(t("bodyRowLabel"))).not.toBeInTheDocument();
    expect(screen.queryByText(t("sleeveRowLabel"))).not.toBeInTheDocument();
  });

  it("keeps the section label, title and suggestion", () => {
    const c = conflict();
    renderWithIntl(
      <ConflictInfoCard
        conflict={c}
        armholeLenCm={22.84}
        sleeveArmholeCm={19.7}
      />,
    );
    expect(screen.getByText(t("sectionLabel"))).toBeInTheDocument();
    expect(screen.getByText(c.title)).toBeInTheDocument();
    expect(screen.getByText(c.suggestion)).toBeInTheDocument();
  });
});

// #134: the generalised, `entries`-based rendering path -- what every LIVE
// conflict uses now (the fixtures above, with no `entries`, cover only the
// legacy fallback a pre-#134 persisted blob still needs).
describe("ConflictInfoCard with entries (#134)", () => {
  function entryConflict(
    entries: ConflictInfo["entries"],
    overrides: Partial<ConflictInfo> = {},
  ): ConflictInfo {
    return {
      id: "conf-1",
      title: "2 costuras não fecham",
      description: "Confira o detalhe de cada uma abaixo.",
      diffCm: 3.1,
      suggestion: "“Corrigir manga” refaz a copa.",
      pieceAId: "body-front",
      pieceBId: "sleeve",
      markers: [],
      entries,
      ...overrides,
    };
  }

  it("renders one label+two-bar group per entry, from the matching seamGraph measurement", () => {
    const entries: ConflictInfo["entries"] = [
      {
        key: "armhole-cap",
        label: "Cava e manga",
        aLabel: "Cava · frente",
        bLabel: "Cava · copa",
        aPieceId: "body-front",
        bPieceId: "sleeve",
        diffCm: 3.1,
        fixable: true,
        markers: [],
      },
      {
        key: "waist-join-front",
        label: "Cintura · frente",
        aLabel: "Cintura · corpo (frente)",
        bLabel: "Cintura · saia (frente)",
        aPieceId: "body-front",
        bPieceId: "skirt",
        diffCm: 4.2,
        fixable: false,
        markers: [],
      },
    ];
    renderWithIntl(
      <ConflictInfoCard
        conflict={entryConflict(entries)}
        seamGraph={[
          {
            key: "armhole-cap",
            labelKey: "armholeCap",
            aPieceId: "body-front",
            bPieceId: "sleeve",
            aLenCm: 22.8,
            bLenCm: 19.7,
            diffCm: 3.1,
            fixable: true,
            easeCm: 2.5,
          },
          {
            key: "waist-join-front",
            labelKey: "waistJoinFront",
            aPieceId: "body-front",
            bPieceId: "skirt",
            aLenCm: 48.0,
            bLenCm: 43.8,
            diffCm: 4.2,
            fixable: false,
            easeCm: 0,
          },
        ]}
      />,
    );
    // Both entries' own headings render (more than one entry -> heading shown).
    expect(screen.getByText("Cava e manga")).toBeInTheDocument();
    expect(screen.getByText("Cintura · frente")).toBeInTheDocument();
    // Both entries' own row labels render.
    expect(screen.getByText("Cava · frente")).toBeInTheDocument();
    expect(screen.getByText("Cava · copa")).toBeInTheDocument();
    expect(screen.getByText("Cintura · corpo (frente)")).toBeInTheDocument();
    expect(screen.getByText("Cintura · saia (frente)")).toBeInTheDocument();
    // Both entries' own lengths render (from seamGraph, not from the entry).
    expect(
      screen.getByText(t("valueCm", { value: "22,8" })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t("valueCm", { value: "19,7" })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t("valueCm", { value: "48,0" })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t("valueCm", { value: "43,8" })),
    ).toBeInTheDocument();
    // Both entries' own diff lines render, direction-aware (both are
    // "a longer than b" here, so both read "falta").
    expect(
      screen.getByText(
        t("entryGapLabel", { direction: "larger", diff: "3,1" }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        t("entryGapLabel", { direction: "larger", diff: "4,2" }),
      ),
    ).toBeInTheDocument();
  });

  it("omits the redundant per-entry heading when there's only one entry", () => {
    const entries: ConflictInfo["entries"] = [
      {
        key: "armhole-cap",
        label: "Cava e manga",
        aLabel: "Cava · frente",
        bLabel: "Cava · copa",
        aPieceId: "body-front",
        bPieceId: "sleeve",
        diffCm: 3.1,
        fixable: true,
        markers: [],
      },
    ];
    renderWithIntl(
      <ConflictInfoCard
        conflict={entryConflict(entries, { title: "Cava e manga não batem" })}
        seamGraph={[
          {
            key: "armhole-cap",
            labelKey: "armholeCap",
            aPieceId: "body-front",
            bPieceId: "sleeve",
            aLenCm: 22.8,
            bLenCm: 19.7,
            diffCm: 3.1,
            fixable: true,
            easeCm: 2.5,
          },
        ]}
      />,
    );
    // The card's own title already says this; a duplicate entry heading
    // with the identical text would be redundant.
    expect(screen.getAllByText("Cava e manga não batem")).toHaveLength(1);
  });

  it("reads 'sobra' instead of 'falta' when the b side is the longer one", () => {
    const entries: ConflictInfo["entries"] = [
      {
        key: "armhole-cap",
        label: "Cava e manga",
        aLabel: "Cava · frente",
        bLabel: "Cava · copa",
        aPieceId: "body-front",
        bPieceId: "sleeve",
        diffCm: 1.5,
        fixable: true,
        markers: [],
      },
    ];
    renderWithIntl(
      <ConflictInfoCard
        conflict={entryConflict(entries)}
        seamGraph={[
          {
            key: "armhole-cap",
            labelKey: "armholeCap",
            aPieceId: "body-front",
            bPieceId: "sleeve",
            aLenCm: 18.0,
            bLenCm: 19.5,
            diffCm: 1.5,
            fixable: true,
            easeCm: 2.5,
          },
        ]}
      />,
    );
    expect(
      screen.getByText(
        t("entryGapLabel", { direction: "smaller", diff: "1,5" }),
      ),
    ).toBeInTheDocument();
  });

  it("falls back to the bare diff line when the matching seamGraph measurement is missing", () => {
    const entries: ConflictInfo["entries"] = [
      {
        key: "waist-join-front",
        label: "Cintura · frente",
        aLabel: "Cintura · corpo (frente)",
        bLabel: "Cintura · saia (frente)",
        aPieceId: "body-front",
        bPieceId: "skirt",
        diffCm: 4.2,
        fixable: false,
        markers: [],
      },
    ];
    renderWithIntl(
      <ConflictInfoCard conflict={entryConflict(entries)} seamGraph={null} />,
    );
    expect(
      screen.getByText(t("entryDiffLabel", { diff: "4,2" })),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Cintura · corpo (frente)"),
    ).not.toBeInTheDocument();
  });
});
