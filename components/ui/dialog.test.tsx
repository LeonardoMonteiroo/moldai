import { describe, it, expect } from "vitest";
import { renderWithIntl, ptBR, screen } from "@/components/test-utils";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "./dialog";

// #110: the close icon's screen-reader label shipped as shadcn's stock
// English "Close" and was never retuned -- it survived because the
// hardcoded-pt-BR-text check looks for an accent-class pattern, and an
// English literal matches nothing. The primitive can't call useTranslations
// itself (that stays the caller's job everywhere else in this codebase), so
// the fix is a `closeLabel` prop whose default is asserted here against the
// real catalog value rather than a pasted literal.
describe("Dialog close button", () => {
  it("announces the catalog's pt-BR label by default", () => {
    renderWithIntl(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Título</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(
      screen.getByRole("button", { name: ptBR.Dialog.close }),
    ).toBeInTheDocument();
  });

  it("accepts an override for a context that needs a different label", () => {
    renderWithIntl(
      <Dialog open>
        <DialogContent closeLabel="Cancelar">
          <DialogTitle>Título</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(
      screen.getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
  });

  it("DialogFooter's optional close button also uses the catalog default", () => {
    renderWithIntl(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Título</DialogTitle>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>,
    );

    // Two buttons now share the label: the icon close (sr-only) and the
    // footer's visible fallback button.
    expect(
      screen.getAllByRole("button", { name: ptBR.Dialog.close }),
    ).toHaveLength(2);
  });
});
