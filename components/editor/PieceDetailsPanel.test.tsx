import { describe, it, expect, vi } from "vitest";
import { renderWithIntl, ptBR, screen } from "@/components/test-utils";
import type { Pattern, Piece } from "@/lib/types";
import { PieceDetailsPanel } from "./PieceDetailsPanel";

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
});
