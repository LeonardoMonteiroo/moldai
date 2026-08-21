import { describe, it, expect } from "vitest";
import { useTranslations } from "next-intl";
import { renderWithIntl, ptBR, screen } from "./test-utils";

function Probe() {
  const t = useTranslations("PageHeader");
  return <span>{t("buyCreditsButton")}</span>;
}

describe("renderWithIntl", () => {
  it("supplies the real pt-BR catalog to the tree", () => {
    renderWithIntl(<Probe />);
    // Resolves to the catalog value, not the key name — which is what makes a
    // missing key a test failure in every component test that follows.
    expect(
      screen.getByText(ptBR.PageHeader.buyCreditsButton),
    ).toBeInTheDocument();
  });
});
