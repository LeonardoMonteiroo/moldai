## Using the MoldAI component library

No provider or root wrapper is required — every component is a plain function component; drop any of them straight into a layout. Styling comes entirely from Tailwind utility classes on the `className` prop (there is no theme/context object to pass in).

### The styling idiom: real tokens, not raw colors or pixel sizes

This is a Tailwind v4 project with its own named design tokens layered over Tailwind's defaults — never write a hex color or a `text-[Npx]`/`w-[Npx]` arbitrary value; use the names below.

**Color** (semantic, not raw): `bg-primary`/`text-primary-foreground` (the brand olive + its foreground), `bg-surface` / `bg-surface-alt` / `bg-paper` (three warm neutral surface steps, `paper` is the AI/secondary surface), `text-muted-foreground` / `text-muted-2` (secondary text, two strengths), `border-border`, `bg-accent`/`text-accent-foreground` (selected/active chrome), `bg-destructive`/`text-destructive` (errors, red), `bg-amber-bg`/`border-amber-border`/`text-amber-text` (warnings and notices — amber, deliberately distinct from `destructive`).

**Type scale** (7 named sizes, use these instead of `text-sm`/`text-base`/etc.): `text-tick` (10.5px, smallest chrome) · `text-meta` (11.5px, small print) · `text-ui` (12.5px, the default UI text size) · `text-control` (13.5px, buttons/inputs/tabs) · `text-body` (16px, body copy/headings) · `text-title` (21px) · `text-display` (26px, hero text). Uppercase labels also take `tracking-eyebrow`. Two font families ship as CSS vars: `font-display` (Bricolage Grotesque, for titles/wordmark) and the default sans body font (Archivo) — most text needs no font-family class at all, just use `font-display` when something should read as a heading/title.

**Radius**: `rounded-card` (13.5px, cards/panels), `rounded-btn` (9.5px, buttons/inputs), `rounded-md`/`rounded-lg` for smaller/generic elements.

**Layout**: prefer `flex`/`grid` with `gap-*` over margins between siblings.

### Where the real API and examples live

Each component's full prop signature is in its own `<Name>.d.ts`; realistic composed usage (not just a single tag) is in its `<Name>.prompt.md` under a `## Examples` section — read the `.prompt.md` before composing a component you haven't used yet, especially the compound ones (`Dialog`, `AlertDialog`, `Popover`, `DropdownMenu`, `Select`, `Field`, `Table`, `Tabs`) where the real API is a family of parts used together, not the top-level export alone (e.g. `Dialog` + `DialogContent` + `DialogHeader` + `DialogTitle` + `DialogFooter`). The root `README.md` lists the full component index by category.

### A real composition, for reference

```tsx
import { Field, FieldLabel, Input, Button } from "moldai-ui";

<Field>
  <FieldLabel htmlFor="pattern-name">Novo nome do molde</FieldLabel>
  <Input id="pattern-name" defaultValue="Blusa manga longa" />
</Field>
<Button>Salvar</Button>
```
