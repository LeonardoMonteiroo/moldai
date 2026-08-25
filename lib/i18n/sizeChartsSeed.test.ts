import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import messages from "@/messages/pt-BR.json";

// This exercises the REAL pt-BR catalog (not lib/i18n/test-translate.ts's
// echo fake, and not a route's own `getTranslations: vi.fn(async () => (key)
// => key)` mock, which discards interpolation and existence checks alike).
// next-intl does not throw on a missing key -- it renders the literal key
// path and logs IntlError: MISSING_MESSAGE, and the calling code (and any
// test using an echo translator) keeps working regardless. This is the only
// test that can catch systemChartName.female/.male going missing or
// misspelled, mirroring lib/i18n/patternDataChat.test.ts.
describe("SizeCharts.systemChartName", () => {
  const t = createTranslator({
    locale: "pt-BR",
    messages,
    namespace: "SizeCharts",
  });

  // #133: the female chart's name used to claim ABNT provenance the repo
  // cannot substantiate (the numbers come from this repo's own legacy
  // SIZE_TABLE, not an ABNT document, and the norm it would name is flagged
  // cancelled) -- both names are now plain, honest house-standard labels.
  it("resolves the female chart name with no standards-body claim", () => {
    expect(t("systemChartName.female")).toBe("Feminino adulto");
  });

  it("resolves the male chart name", () => {
    expect(t("systemChartName.male")).toBe("Masculino adulto");
  });
});
