/**
 * #135: an HPGL/2 reader, written from the format's own semantics and
 * deliberately importing NOTHING from `./plt`.
 *
 * It exists to break a circularity: `plt.test.ts`'s assertions were written
 * against the same understanding of HPGL that wrote the serializer, so a
 * shared misconception could pass every one of them. This module re-derives
 * what a *plotter* would actually do with the byte stream — including the
 * parts a `toContain("LB…")` string assertion cannot see, such as label mode
 * swallowing every following command until its terminator.
 *
 * Test-only, the `components/test-utils.tsx` precedent: nothing under `app/`
 * or `components/` imports it, so it never reaches a bundle. It is not a
 * pattern-import feature and must not grow into one — `/import` (issue #11)
 * is where a real user-facing importer would live.
 *
 * Scope: the command subset a plotter needs to reproduce the drawing —
 * IN, SP, PU, PD, PA, CI, PG, DI, DT, LB. Anything else is skipped as an
 * unknown-but-well-formed command rather than treated as an error, which is
 * how a real device tolerates a richer dialect than it implements.
 */

/** One drawn segment, in plotter units, with the pen that drew it. */
export interface PltStroke {
  pen: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface PltCircle {
  pen: number;
  center: { x: number; y: number };
  r: number;
}

export interface PltLabel {
  pen: number;
  at: { x: number; y: number };
  text: string;
  /**
   * True when label mode ran to end-of-input without ever meeting its
   * terminator. On a real plotter that means every byte after this `LB` was
   * printed as text instead of executed — the rest of the plot is lost.
   */
  unterminated: boolean;
}

export interface PltDocument {
  strokes: PltStroke[];
  circles: PltCircle[];
  labels: PltLabel[];
  /** `PG;` count — one page/roll advance each. */
  pageAdvances: number;
  /** Mnemonics encountered that this reader does not model. */
  unknownCommands: string[];
  /**
   * Commands that were consumed as label text because an `LB` never
   * terminated. Empty on a well-formed file.
   */
  swallowedAfterLabel: number;
}

const ETX = "\x03";

function parseParams(raw: string): number[] {
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  return trimmed
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

export function readPlt(src: string): PltDocument {
  const doc: PltDocument = {
    strokes: [],
    circles: [],
    labels: [],
    pageAdvances: 0,
    unknownCommands: [],
    swallowedAfterLabel: 0,
  };

  let pen = 0;
  let penDown = false;
  let cur = { x: 0, y: 0 };
  let labelTerminator = ETX;
  let i = 0;

  const isAlpha = (c: string) => /[A-Za-z]/.test(c);

  while (i < src.length) {
    // Skip separators between commands. A real parser tolerates the
    // newlines this serializer joins with, and bare whitespace.
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }
    if (!isAlpha(src[i])) {
      // Stray byte outside any command — skip it rather than derailing.
      i++;
      continue;
    }
    const mnemonic = src.slice(i, i + 2).toUpperCase();
    if (mnemonic.length < 2 || !isAlpha(src[i + 1])) {
      i++;
      continue;
    }
    i += 2;

    // LB is the one command whose argument is not ';'-delimited: it reads
    // raw text up to the label terminator. This is the whole reason this
    // reader exists — a string search for "LB…" in the output cannot tell
    // a terminated label from one that eats the rest of the file.
    if (mnemonic === "LB") {
      const end = src.indexOf(labelTerminator, i);
      const unterminated = end === -1;
      const text = unterminated ? src.slice(i) : src.slice(i, end);
      doc.labels.push({ pen, at: { ...cur }, text, unterminated });
      if (unterminated) {
        // Count how many well-formed commands were lost to label mode, so a
        // test can assert on the blast radius rather than just the symptom.
        doc.swallowedAfterLabel = (
          text.match(/[A-Za-z]{2}[^;]*;/g) ?? []
        ).length;
        i = src.length;
      } else {
        i = end + labelTerminator.length;
      }
      continue;
    }

    // Every other command runs to the next ';'.
    const semi = src.indexOf(";", i);
    const rawParams = semi === -1 ? src.slice(i) : src.slice(i, semi);
    i = semi === -1 ? src.length : semi + 1;
    const params = parseParams(rawParams);

    switch (mnemonic) {
      case "IN":
        pen = 0;
        penDown = false;
        cur = { x: 0, y: 0 };
        labelTerminator = ETX;
        break;
      case "SP":
        pen = params[0] ?? 0;
        break;
      case "DT":
        // Redefines the label terminator; the raw (unparsed) first char.
        if (rawParams.length > 0) labelTerminator = rawParams[0];
        break;
      case "PU":
      case "PD": {
        penDown = mnemonic === "PD";
        for (let k = 0; k + 1 < params.length; k += 2) {
          const next = { x: params[k], y: params[k + 1] };
          if (penDown) doc.strokes.push({ pen, from: { ...cur }, to: next });
          cur = next;
        }
        break;
      }
      case "PA": {
        for (let k = 0; k + 1 < params.length; k += 2) {
          const next = { x: params[k], y: params[k + 1] };
          if (penDown) doc.strokes.push({ pen, from: { ...cur }, to: next });
          cur = next;
        }
        break;
      }
      case "CI":
        if (params.length > 0) {
          doc.circles.push({ pen, center: { ...cur }, r: params[0] });
        }
        break;
      case "PG":
        doc.pageAdvances++;
        break;
      case "DI":
        break;
      default:
        doc.unknownCommands.push(mnemonic);
        break;
    }
  }

  return doc;
}
