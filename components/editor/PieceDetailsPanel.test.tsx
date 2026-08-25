import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  translatorFor,
} from "@/components/test-utils";
import type { Pattern, Piece } from "@/lib/types";
import { COSTS } from "@/lib/types";
import { formatList } from "@/lib/format";
import { PieceDetailsPanel } from "./PieceDetailsPanel";

// #106: mocked the same way as PlanSection.test.tsx -- a shallow, mutable
// copy of COSTS lets these tests force each plural boundary (0, 1, 2)
// through the real cost the component reads.
vi.mock("@/lib/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/types")>();
  return { ...actual, COSTS: { ...actual.COSTS } };
});

const t = ptBR.PieceDetailsPanel;

const PIECE: Piece = {
  id: "front",
  name: "Frente",
  qty: 1,
  outline: { kind: "polygon", points: "0,0 10,0 10,10 0,10" },
  label: { x: 0, y: 0 },
  detailRows: [],
};

const PATTERN: Pattern = {
  id: "p1",
  name: "Blusa",
  version: 1,
  baseSize: "M",
  unit: "cm",
  sizes: ["P", "M", "G"],
  sizesApplied: [],
  sizesPending: ["P", "M", "G"],
  sizeTable: {},
  pieces: [PIECE],
};

describe("PieceDetailsPanel", () => {
  // #31: the graduate button had no in-flight signal at all -- a double
  // click sent two grade requests, and the server's row lock serialized
  // them without deduplicating, so the second one debited again.
  it("disables the graduate button while a graduation is already in flight", () => {
    renderWithIntl(
      <PieceDetailsPanel
        piece={PIECE}
        pattern={PATTERN}
        onClose={vi.fn()}
        onGraduate={vi.fn()}
        graduating={true}
      />,
    );

    expect(
      screen.getByRole("button", { name: t.graduateButton }),
    ).toBeDisabled();
  });

  it("leaves the graduate button enabled when there is nothing in flight and sizes are pending", () => {
    renderWithIntl(
      <PieceDetailsPanel
        piece={PIECE}
        pattern={PATTERN}
        onClose={vi.fn()}
        onGraduate={vi.fn()}
        graduating={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: t.graduateButton }),
    ).toBeEnabled();
  });

  it("stays disabled with nothing to grade even when not in flight", () => {
    const allGraduated: Pattern = {
      ...PATTERN,
      sizesPending: [],
    };
    renderWithIntl(
      <PieceDetailsPanel
        piece={PIECE}
        pattern={allGraduated}
        onClose={vi.fn()}
        onGraduate={vi.fn()}
        graduating={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: t.graduateButton }),
    ).toBeDisabled();
  });

  // #50: the ungraded size chip used text-placeholder (2.68:1 on surface),
  // below WCAG 1.4.3's 4.5:1 for plain text -- this chip isn't a disabled
  // control, it's the only place the graded/ungraded distinction is shown.
  it("colors an ungraded size chip with text-muted, not the placeholder token", () => {
    renderWithIntl(
      <PieceDetailsPanel
        piece={PIECE}
        pattern={PATTERN}
        onClose={vi.fn()}
        onGraduate={vi.fn()}
        graduating={false}
      />,
    );

    const chip = screen.getByText("G");
    expect(chip.className).toContain("text-muted");
    expect(chip.className).not.toContain("text-placeholder");
  });

  // #106: "{cost} créditos" was a hardcoded plural noun in graduateSummary.
  describe("graduate summary pluralization (#106)", () => {
    const ORIGINAL_COSTS = { ...COSTS };
    afterEach(() => Object.assign(COSTS, ORIGINAL_COSTS));

    it("pluralizes the graduate cost at 0, 1 and 2 credits", () => {
      const tPanel = translatorFor("PieceDetailsPanel");
      const tFormat = translatorFor("Format");
      const gradable = PATTERN.sizesPending.filter(
        (s) => s !== PATTERN.baseSize,
      );
      const list = formatList(tFormat, gradable);
      for (const cost of [0, 1, 2]) {
        Object.assign(COSTS, { graduate: cost });
        const { unmount } = renderWithIntl(
          <PieceDetailsPanel
            piece={PIECE}
            pattern={PATTERN}
            onClose={vi.fn()}
            onGraduate={vi.fn()}
            graduating={false}
          />,
        );
        expect(
          screen.getByText(tPanel("graduateSummary", { list, cost })),
        ).toBeInTheDocument();
        unmount();
      }
    });
  });
});
