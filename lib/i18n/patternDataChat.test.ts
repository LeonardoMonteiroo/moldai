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
describe("PatternData", () => {
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
  // A single assertion is deliberate — `as unknown as` would also silence a
  // future next-intl change that made the shapes genuinely incompatible,
  // whereas this still makes TS confirm the two types structurally overlap.
  const tFormat = createTranslator({
    locale: "pt-BR",
    messages,
    namespace: "Format",
  }) as Translate;

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

  // PatternData.pdf.pageLabel / rulerLabel were the two survivors of the
  // hardcoded-pt-BR sweep: pageLabel was a backtick template (invisible to a
  // double-quote-anchored grep) and rulerLabel starts with a digit (invisible
  // to a leading-letter-anchored one). Both are drawn directly onto the
  // exported PDF page by lib/export/pdf.ts's toPdf, so a broken interpolation
  // here would ship straight into the downloaded file, unnoticed by any
  // component test. Only the real catalog through createTranslator can catch
  // that — same reasoning as chat.creditChip/chat.graduated above.
  describe("pdf.pageLabel", () => {
    // "·" here is U+00B7 MIDDLE DOT (matches lib/export/pdf.ts's separator,
    // not U+2212 MINUS SIGN used by chat.creditChip above). Values mirror the
    // real call site: tile.row/tile.col are 0-indexed, +1'd before this call.
    // #120: pageNumber/totalPages count the tiles actually emitted after
    // blank ones are skipped, so they needn't line up arithmetically with
    // rowNumber/colNumber/totalRows/totalCols -- this is the 4th emitted
    // page of 7, sitting at grid position row 2/col 1 of a 3x3 grid.
    it("renders the tile position exactly as pdf.ts's old template literal did", () => {
      expect(
        t("pdf.pageLabel", {
          pageNumber: 4,
          totalPages: 7,
          rowNumber: 2,
          colNumber: 1,
          totalRows: 3,
          totalCols: 3,
        }),
      ).toBe("Página 4 de 7 · Linha 2 · Coluna 1 de 3x3");
    });
  });

  describe("pdf.rulerLabel", () => {
    // No placeholders — this key exists only so the calibration-ruler label
    // resolves from the catalog instead of a hardcoded string. The "-" is a
    // plain hyphen-minus (U+002D), not an en dash — confirmed against the
    // original literal byte-for-byte.
    it("renders the calibration-ruler label exactly as pdf.ts's old literal did", () => {
      expect(t("pdf.rulerLabel")).toBe("10 cm - confira a escala");
    });
  });

  // #107: {diffCm} was a BARE placeholder -- intl-messageformat stringifies a
  // non-string argument with JS's default Number#toString rather than
  // running it through Intl.NumberFormat, so a real seam conflict's chat
  // message rendered "ficou 4.1 cm maior" beside ConflictInfoCard's own
  // correctly-formatted "23,7 cm" / "19,7 cm". Only the real catalog through
  // createTranslator can catch this -- a stub/echo translator (or a mocked
  // getTranslations) never exercises intl-messageformat's actual number
  // handling at all, so it would pass whether the placeholder were bare or
  // typed. `::.0` (not the plain `number` type) is deliberate too: verified
  // empirically that the plain form drops the decimal for a whole-number
  // diff (4.0 renders "4 cm", inconsistent with ConflictInfoCard's
  // `.toFixed(1)`), while the skeleton forces exactly one decimal always.
  describe("conflict.description", () => {
    it("renders a non-integer diffCm with a pt-BR comma, not a dot", () => {
      const out = t("conflict.description", {
        diffCm: 4.1,
        direction: "larger",
      });
      expect(out).toContain("4,1 cm");
      expect(out).not.toContain("4.1");
    });

    it("keeps a trailing .0 for a whole-number diffCm, matching ConflictInfoCard's own formatting", () => {
      const out = t("conflict.description", {
        diffCm: 4,
        direction: "smaller",
      });
      expect(out).toContain("4,0 cm");
    });

    it("selects the direction word correctly alongside the formatted number", () => {
      expect(
        t("conflict.description", { diffCm: 3.7, direction: "larger" }),
      ).toBe(
        "A cava do corpo ficou 3,7 cm maior que a copa da manga, então as costuras não vão fechar.",
      );
      expect(
        t("conflict.description", { diffCm: 3.7, direction: "smaller" }),
      ).toBe(
        "A cava do corpo ficou 3,7 cm menor que a copa da manga, então as costuras não vão fechar.",
      );
    });
  });
});
