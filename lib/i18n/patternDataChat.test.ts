import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import messages from "@/messages/pt-BR.json";
import { formatList } from "@/lib/format";
import type { Translate } from "@/lib/i18n/translate";

// This exercises the REAL pt-BR catalog (not lib/i18n/test-translate.ts's
// echo fake, and not app/api/patterns/[id]/graduate/route.test.ts's own
// `getTranslations` mock — an echo too, `vi.fn(async () => (key) => key)`,
// which discards the second argument to `t()` entirely). It is the only
// place that can catch a broken interpolation on these two keys.
//
// Both PatternData.chat.creditChip ({cost}) and PatternData.chat.graduated
// ({list}) are server-produced strings persisted into the pattern's chat
// history. A wrong or missing param name doesn't throw: next-intl logs
// `IntlError: FORMATTING_ERROR` and either renders the raw key path or,
// when the param is simply omitted, persists the literal unresolved
// "Graduação aplicada para {list}." straight into the chat the user reads.
// A mocked/echo translator can't exercise this — only the real catalog
// through createTranslator can.
describe("PatternData.chat", () => {
  const t = createTranslator({
    locale: "pt-BR",
    messages,
    namespace: "PatternData",
  });
  // formatList now takes an injected Translate scoped to the Format
  // namespace (lib/format.ts) — a second real translator, same reasoning
  // as the PatternData one above: only the real catalog can catch a broken
  // "listConjunction" interpolation. The cast is type-only: createTranslator
  // infers `key` as the literal union of messages.Format's own keys (from
  // the imported JSON's structural type), narrower than Translate's plain
  // `string`; at runtime it's still the same real-catalog translator.
  const tFormat = createTranslator({
    locale: "pt-BR",
    messages,
    namespace: "Format",
  }) as unknown as Translate;

  describe("chat.creditChip", () => {
    // The "−" is U+2212 MINUS SIGN, not a hyphen-minus, and must survive
    // ICU pluralization untouched. Costs mirror the two real call sites
    // (generate: COSTS.adjust=1, graduate: COSTS.graduate=6 — lib/types.ts).
    it("renders the singular form at cost 1 (generate's COSTS.adjust)", () => {
      expect(t("chat.creditChip", { cost: 1 })).toBe("−1 crédito");
    });

    it("renders the plural form at cost 6 (graduate's COSTS.graduate)", () => {
      expect(t("chat.creditChip", { cost: 6 })).toBe("−6 créditos");
    });
  });

  describe("chat.graduated", () => {
    // `list` is built by lib/format.ts's formatList, exactly as
    // graduate/route.ts calls it — reuse the real helper rather than
    // pasting a pre-joined string, so this test tracks the actual
    // production call shape.
    it("interpolates a multi-size list the way graduate/route.ts builds it", () => {
      expect(
        t("chat.graduated", { list: formatList(tFormat, ["P", "M", "G"]) }),
      ).toBe("Graduação aplicada para P, M e G.");
    });

    it("interpolates a single-size list", () => {
      expect(t("chat.graduated", { list: formatList(tFormat, ["G"]) })).toBe(
        "Graduação aplicada para G.",
      );
    });
  });
});
