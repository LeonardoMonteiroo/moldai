# design-sync notes for moldai

## Repo shape

- `moldai` is a Next.js **app**, not a publishable component library: `package.json` has no `main`/`module`/`exports`, and `tsconfig.json` sets `noEmit: true`. There is no `dist/` to point the converter at.
- The design-system scope is `components/ui/` (20 files, shadcn-derived primitives on top of Radix). Everything else under `components/` (`shared/`, `dashboard/`, `size-charts/`, the editor panels, …) is app/screen-specific composition, not synced.
- JS bundle: synthesized directly from `components/ui/*.tsx` source (no dist build), using `tsconfig.json`'s `@/*` path alias for resolution.
- CSS/tokens: `app/globals.css` (Tailwind v4 `@theme` block + the shadcn alias layer) has no standalone compiled output — it's only ever compiled as part of `next build`. `cssEntry` points at the **compiled** production CSS chunk under `.next/static/chunks/`, not the source file, so the tokens/utilities/fonts are fully resolved.

## Re-sync risk: the compiled CSS filename is content-hashed — and it's more fragile than "changes on next build"

`cfg.cssEntry` points at a content-hashed chunk under `.next/static/chunks/` (currently `0gppl7wsiyr5w.css`). **This bit us mid-session, not just across sessions**: the chunk from the first build (`2nrdpthp2m5l1.css`) went missing from disk later in the _same_ sync (`.next/` output isn't a stable artifact — don't assume a hash survives even a few minutes). When the configured `cssEntry` path stops resolving, the build does NOT fail — it silently falls back to `[CSS_RUNTIME]` (a styles.css with **no `@import`s at all**, i.e. every design built with this DS would render completely unstyled) and only shows up as an informational, non-blocking warning in `package-validate.mjs`'s output. **Always check the validate log for `[CSS_RUNTIME]`/`styles.css: N @import(s)` before trusting a build — a rebuild that "succeeds" can still have silently lost all styling.**

Before any build (first sync, re-sync, or just re-running after a while):

1. `npm run build`
2. `Glob(".next/static/chunks/*.css")` and find the new hash (NOT `.next/dev/static/chunks/`, which is stale dev-mode output and split per-source instead of bundled — don't point cssEntry there)
3. Update `cfg.cssEntry` to the new filename BEFORE running the converter, and confirm the validate log shows `styles.css: 2 @import(s), all resolve` afterward.

Verified in the first sync: the compiled chunk correctly includes the `--color-*` custom properties from `app/globals.css`'s `@theme` block, real `@font-face` rules (17, across weight/subset splits) for both Bricolage Grotesque and Archivo with working relative `url(../media/...)` paths into `.next/static/media/`, and Tailwind v4's content-based class scanning picks up `components/ui/*.tsx` utility classes without needing a `content:` config (this repo has no `tailwind.config.ts` — Tailwind v4 scans project source directly).

## componentSrcMap: why ~84 exports are excluded

`components/ui/` uses shadcn's flat-export pattern (`export { Dialog, DialogTrigger, DialogContent, ... }`), not a namespace pattern (`Dialog.Trigger`). The converter's automatic compound-detection (`partitionSubcomponents` in `lib/dts.mjs`) only groups namespace-style exports — for flat exports it "conservatively does nothing" per its own comment. Left alone, all ~110 exported functions in `components/ui/` would each become a separate top-level design-system component, including things like `DialogPortal`, `TableRow`, `PopoverAnchor` that can't render (or don't make sense) outside their parent.

Fix: `cfg.componentSrcMap` nulls out every Radix-style sub-part, leaving 23 primary components (Avatar, AvatarGroup, AlertDialog, Dialog, Bubble, Button, Badge, Label, Empty, Input, Marker, Select, Field, Table, Toggle, DropdownMenu, Textarea, Popover, ToggleGroup, Progress, Tabs, Separator, ScrollArea). Excluded sub-parts stay in the bundle (still importable) — they're just not their own card/`.d.ts`/`.prompt.md`. Each primary's authored preview (`.design-sync/previews/<Name>.tsx`) composes the real sub-parts, so the synthesized `.prompt.md` still teaches the compound usage.

If a future shadcn `add` introduces a new file, re-run the export grep (`^(export (function|const)|function) [A-Z]\w*` over `components/ui/`) and extend `componentSrcMap` the same way before re-syncing — don't let a new component's sub-parts leak in unreviewed.

## dtsPropsFor: every component needed a hand-written props body

`findTypesRoot()` (`lib/dts.mjs`) walks `['build/ts', 'dist/types', 'types', 'lib', 'dist']` looking for the first that exists — and this repo happens to have its OWN `types/` directory at the repo root (ambient Next-Auth/global declarations, unrelated to `components/ui/`) which contains at least one `.d.ts` file. `findTypesRoot` doesn't check that the directory's `.d.ts` files actually correspond to the components being synced — it just picks `types/` because it exists, and every component's prop extraction silently fell back to `{[key: string]: unknown}` (no `[DTS_PARSE]`/`[DTS_REACT]` warning fires for this — it's a wrong-root problem, not a parse-failure one). Fix: `cfg.dtsPropsFor` has a hand-written props body for **all 23** components (not just the ones with complex generics) — this is why every `.prompt.md`'s `## Props` section has real, useful types. **If a `components/ui/*.tsx` file's own props change (a new Button variant, a new Field prop, etc.), the matching `cfg.dtsPropsFor` entry must be updated by hand** — it does not re-derive from source automatically. Grep the component's `export function <Name>({...}: ...)` signature and diff against the config entry when re-syncing after a real UI change.

## Authoring gotcha: a className override that isn't already used elsewhere in the app silently loses its effect

`Popover.tsx`'s `SizeChartInfo` preview passed `className="w-64"` to override `PopoverContent`'s own `w-72`. Because `tailwind-merge` (via `cn()`) resolves the conflict at the STRING level — it drops `w-72` from the class list in favor of `w-64` — but `w-64` was never used anywhere in the real app source, so it was never scanned into the compiled CSS at `next build` time. Net effect: the element ended up with **no** width utility at all (neither the original nor the override actually applied), and a long paragraph rendered unconstrained-width and got cropped by the card frame. This is invisible in isolation (nothing errors) and only shows up as a visual defect in the graded screenshot. **Rule for any future authored preview**: only override a Tailwind utility via `className` if the new value is either (a) a class already used somewhere in `components/` or `app/` (so it's guaranteed to be in the compiled CSS), or (b) accept the component's own default class instead of fighting it. Prefer inline `style={{...}}` for preview-only layout tweaks (wrapper divs, spacing) — that sidesteps the compiled-CSS dependency entirely, which is why most of this sync's previews use `style` for their own wrapper `<div>`s and only pass `className` through to real component props that already carry real, scanned classes.

## Preview authoring

First sync scope: all 23 primary components authored (user chose "author all" over a core subset or floor-cards-everywhere, given the small total count). Authored via 5 parallel subagents (4 components each) plus 3 done solo by the orchestrator first (Badge, Dialog, Table) to calibrate. All 23 graded `good` on every cell; `package-capture.mjs`'s final full run printed `carried forward` for all 23 with zero `grade cleared`.

`cfg.overrides` needed for presentation, beyond the componentSrcMap/dtsPropsFor fixes above:

- Overlay/menu components (`AlertDialog`, `Dialog`, `Popover`, `DropdownMenu`, `Select`) need `{"cardMode": "single", "viewport": "WxH"}` — otherwise their "open" Radix content escapes or collapses the card.
- Wide compositions (`Table`, `Field`, `ScrollArea`, `Tabs`, `Progress`) need `{"cardMode": "column"}` — `[GRID_OVERFLOW]` in `package-validate.mjs`'s output names exactly which ones; add them as flagged, don't guess ahead of time (Progress only needed it after a full-CSS rebuild changed its rendered width — the flag is authoritative, not the story content alone).

## Re-sync risks (forward-looking — read before the next sync)

- **The `cssEntry` hash WILL be stale** — see above. This is the single most likely thing to silently break a re-sync; always confirm `styles.css: N @import(s)` in the validate log, not just "build exited 0".
- **`dtsPropsFor` drifts from real component props** — it's hand-maintained, not derived. A shadcn `add`/update that changes a `components/ui/*.tsx` file's own prop signature won't be reflected until someone updates the matching config entry.
- **`componentSrcMap`'s ~84 null exclusions are enumerated, not ruled** — a new file added to `components/ui/` needs its own exports triaged (primary vs. sub-part) and added to the map, or its sub-parts will leak in as top-level cards.
- **The `types/` root collision (`findTypesRoot` picking up this repo's own ambient `types/` dir) is silent** — no warning tag fires for it. If `dtsPropsFor` is ever removed for a component, check its `.d.ts` isn't back to the `{[key: string]: unknown}` stub before trusting it.
- **`.design-sync/docs-stubs/*.md`** are category-only frontmatter stubs (no real doc body) — that's deliberate (see `docsDir`/`readmeHeader` in config), not a placeholder that needs filling in.
