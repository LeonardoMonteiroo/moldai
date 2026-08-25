import { describe, it, expect } from "vitest";
import {
  renderWithIntl,
  screen,
  translatorFor,
} from "@/components/test-utils";
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
