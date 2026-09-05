---
name: add-export-format
description: Add a new downloadable pattern format to lib/export/*, wired into EXPORT_FORMATS so every consumer (editor export menu, landing page format strip) picks it up automatically, with an honest inline beta/limitation note if it's a partial implementation. Use when asked to add a new export format, a new CAD/plotter output, or a new file type the pattern editor can download — also invocable with /add-export-format. Do not use for a bug fix inside an existing format's serializer.
---

# Add export format

Export is entirely client-side — no server call, no `app/api/*` route (see `docs/architecture/export.md`). Seven formats exist today (`svg`, `dxf`, `dxf-aama`, `pdf-a4`, `pdf-single`, `pdf-layered`, `plt`), each a serializer file + a `.test.ts` sibling in `lib/export/`. Adding an eighth follows the same shape.

## The one source of truth: `lib/export/formats.ts`

This file is deliberately the *only* place a format id and its metadata live — read its own header comment about why (`FormatsSection` on the landing page used to hardcode a duplicate list of five formats and silently fell two formats behind when `plt`/`pdf-layered` shipped; that's the drift this file exists to make structurally impossible).

1. **`EXPORT_FORMATS`** (line 5) — add the new id to the array. `ExportFormat` is derived from it (`(typeof EXPORT_FORMATS)[number]`), so every `Record<ExportFormat, ...>` elsewhere becomes a compile error until you fill in the new key — that's intentional; follow the compiler.
2. **`EXPORT_FORMAT_LABELS`** (line 30) — add `{ labelKey: "formatX" }`, plus `noteKey: "formatXNote"` if the format ships with a known gap (see the honesty step below).
3. **`EXPORT_FORMAT_USE_CASE`** (line 51) — classify it `"plotter" | "cad" | "print"`, whichever the landing page's grouped strip should file it under.

## The serializer

1. Write `lib/export/<format>.ts` exporting a `toX(model, ...)` function that takes the already-built `ExportModel` (`lib/export/model.ts`'s `buildExportModel`) — never re-derive geometry from `Pattern` directly; every existing serializer (`svg.ts`, `dxf.ts`, `pdf.ts`, `plt.ts`) consumes the same shared model so a piece-geometry bug fix doesn't need fixing once per format.
2. Reuse `lib/export/bezier.ts` / `offset.ts` / `strips.ts` for curve flattening, seam-allowance offsetting, and roll-width splitting — don't reimplement any of the three per format; `pdf-single`/`plt` already share the strip-splitting logic via `strips.ts` and a new roll-fed format should too.
3. Write `lib/export/<format>.test.ts` alongside it, mirroring an existing sibling's structure (`dxf-aama.test.ts` is a good template if the new format is a subset/beta of an existing one; `plt.test.ts` if it's genuinely new).
4. Wire the dispatch in `lib/export/index.ts`'s `exportPattern` — add a `case "<format>":` calling your serializer, then `finishDownload(...)`.

## Honesty: partial support gets a note, never silent gaps

`conventions.md`'s Convention 3 (surface limitations on-screen, never silently) has a live anchor here: `dxf-aama` ships tagged **"beta"** in its own label (`formatDxfAama: "DXF · Audaces/AAMA-ASTM · beta"`) with `formatDxfAamaNote` stating the exact gap ("Camadas numeradas D6673. Ainda sem piques/furos/linha de costura.") rendered inline at the menu item.

If the new format is a full, complete implementation of what it claims to be, it needs no `noteKey`. If it's a subset (missing notches, missing seam allowance, a specific CAD dialect's optional field left out — anything a pattern-maker would notice and need to know before trusting the file), it needs both the "beta" qualifier in its `labelKey` string and a `noteKey` spelling out exactly what's missing. Never ship a silently-partial format with a label indistinguishable from a complete one.

## i18n

Add to `messages/pt-BR.json`, `Footer` namespace (the export menu's namespace, even though the component rendering it today is `components/editor/ExportModal.tsx` — the namespace name is a wire/catalog concern, independent of which component currently renders it):

```json
"formatX": "FORMAT · description · [beta]",
"formatXNote": "The specific known gap, if beta."
```

`ExportModal.tsx` reads `EXPORT_FORMAT_LABELS[id].labelKey` generically — you do not need to touch `ExportModal.tsx` itself unless the new format needs a genuinely new UI affordance (a size/resolution picker beyond the existing `pageSize`/`rollWidthCm` render options in `ExportRenderOptions`, `lib/export/index.ts:31`).

## Nothing else should need a hardcoded format list

Grep for the previous format count (`grep -rn "seven\|EXPORT_FORMATS.length\|pdf-layered.*plt\|svg.*dxf.*pdf" --include=*.tsx --include=*.md`) before finishing — a component or doc holding its own copy of "all N formats" instead of deriving from `EXPORT_FORMATS`/`EXPORT_FORMAT_LABELS` is the exact drift this file's own header comment warns about. Update `docs/architecture/export.md`'s format count and list.

## Verification

`npx vitest run lib/export` scoped first, then the full `/verify` sequence.
