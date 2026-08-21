import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import messages from "@/messages/pt-BR.json";

// This exercises the REAL pt-BR catalog (not lib/i18n/test-translate.ts's
// echo fake) because it is the one property no mocked translator can prove:
// that the ICU plural in PatternData.chat.creditChip reproduces, character
// for character, the two hardcoded chips it replaces
// (generate: "−1 crédito" at COSTS.adjust=1, graduate: "−6 créditos" at
// COSTS.graduate=6 — lib/types.ts). The "−" is U+2212 MINUS SIGN, not a
// hyphen-minus, and must survive ICU pluralization untouched.
describe("PatternData.chat.creditChip", () => {
  const t = createTranslator({
    locale: "pt-BR",
    messages,
    namespace: "PatternData",
  });

  it("renders the singular form at cost 1 (generate's COSTS.adjust)", () => {
    expect(t("chat.creditChip", { cost: 1 })).toBe("−1 crédito");
  });

  it("renders the plural form at cost 6 (graduate's COSTS.graduate)", () => {
    expect(t("chat.creditChip", { cost: 6 })).toBe("−6 créditos");
  });
});
