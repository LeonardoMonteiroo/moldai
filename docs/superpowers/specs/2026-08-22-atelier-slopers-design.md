# Bases do ateliê — saved slopers — design

Date: 2026-08-22
Status: approved
Issue: #1 (`feat(patterns): implement Bases do ateliê base-saving flow`)

## Problem

CLAUDE.md's Scope section lists "Bases do ateliê" as the one MVP subsystem not shipped.
Today it exists only as a disabled, `soon`-badged `<span>` in
`components/dashboard/Sidebar.tsx`, and the design handoff's other half of the idea — the
`＋ salvar molde como base` chip inside screen `5i` — was scoped out of `/size-charts`
entirely.

The cost is concrete: an atelier that tunes a straight-body blouse block has no way to
start the next garment from it. Every pattern begins blank, is re-described to the AI in
prose, and is re-drafted from scratch — paying `COSTS.adjust` per round trip to
reconstruct a shape the account already owns.

## Naming

The pt-BR domain term is "base" (`base corpo reto 40`, `base manga camisa` in the
prototype). Per CLAUDE.md's translate-don't-transliterate rule (grades → `SizeChart`,
molde → `Pattern`), the English patternmaking term for a fitted foundation you derive
garments from is **sloper** (US) or **block** (UK).

`Block` is unavailable: `lib/draft/body.ts` already exports `BlockOpts`, and the
body/sleeve/skirt drafters are "blocks" throughout the engine. `PatternBase` reads as an
abstract parent class. So: **`Sloper`**.

Note the term is already in the repo's vocabulary —
`docs/superpowers/specs/2026-08-15-real-sloper-drafting-and-camiseta-archetype-design.md`
uses it for the block geometry the drafter produces, and `lib/draft/body.test.ts:24`
describes `draftBody` as drafting a sloper. That is prose and a test description, not an
identifier, and the two senses agree: the drafter builds sloper-quality blocks, and a
`Sloper` row is one saved for reuse. UI display text stays pt-BR ("Bases do ateliê",
"Salvar como base", "Usar base"), per the language boundary.

## Design

### 1. A sloper stores the snapshot, never the geometry

```prisma
model Sloper {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data      Json
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@index([userId, updatedAt])
}
```

Additive migration `20260822120000_add_sloper` — a new table plus `slopers Sloper[]` on
`User`. Nothing existing changes shape, so no reset migration (contrast
`reset_moldes_english`).

```ts
// lib/types.ts
export interface SloperData {
  name: string;
  spec: GarmentSpec;
  sizes: string[];
  baseSize: SizeLabel;
  sizeTable: Record<string, Measurements>;
  sizeChartName?: string;
}
```

That is exactly the set a `Pattern` needs to be redrafted: the spec plus the frozen size
snapshot it was drafted against. `pieces`, `viewBox` and `baseMeasurements` are **not**
stored — `draftGarment` is deterministic, so persisting them would duplicate what `spec` +
`sizeTable` already determine. This is the `savedAgo` / `planLabel` / `measureSeams`
lesson applied before the fact rather than after it.

`sizeChartName` stays optional for the same reason it is on `Pattern`: a pattern drafted
before that key existed does not carry one, and the card omits the row rather than
inventing a name.

The name reuses `MAX_PATTERN_NAME_LENGTH` (80) rather than declaring a parallel constant.
A sloper _is_ a saved pattern base; one cap is one fewer thing to drift, and it reaches a
layout, so the card `truncate`s with `min-w-0` like every other display name.

### 2. `lib/slopers/convert.ts` — pure, DB-free, round-trippable

```ts
sloperFromPattern(pattern: Pattern, name: string): SloperData;
patternFromSloper(sloper: SloperData, t: Translate): PatternState;
```

`patternFromSloper` builds on the existing path rather than a parallel one:
`seedPatternState(t)` for the shell, the sloper's snapshot written over `sizes` /
`baseSize` / `sizeTable` / `sizeChartName`, then `applyGarmentSpec(state, spec, t)` to
draft — so `pieces`, `viewBox`, `baseMeasurements`, the version bump and even
seam-conflict detection all come from the same function a generation uses.

`sizesApplied` starts empty and `sizesPending` holds the full list: a base is a base size
and a chart, not a graded set. Grading does not carry over.

The round trip (`pattern → sloper → pattern` yields identical `pieces`) is the unit test
that justifies not persisting geometry. If it ever fails, the fix is the drafter's
determinism, not a wider blob.

### 3. `lib/db/sloper.ts` — the only Prisma touchpoint

Every function scoped to `(sloperId, userId)`, returning `null` / `false` when the row is
missing _or_ not owned, exactly like `lib/db/pattern.ts` — never throwing, never leaking
whether the row exists:

- `listSlopersForUser(userId, t)` → `SloperListItem[]`
- `createSloper(userId, data: SloperData, t)` → `SloperListItem`
- `renameSloper(sloperId, userId, name)` → `boolean`
- `deleteSloper(sloperId, userId)` → `boolean`
- `loadSloper(sloperId, userId)` → `SloperData | null`

`createSloper` takes finished `SloperData`, not a `patternId`: the route already owns
`loadPattern` for the ownership-scoped read, and it is the route that has to tell 404
(pattern not yours) from 400 (pattern not drafted) — a repository returning a bare `null`
would collapse the two. So `lib/db/sloper.ts` never learns what a `Pattern` is.

No `withSloper` transaction helper: a sloper is immutable apart from its name, so there is
no load → mutate → save race worth a row lock. Rename is a scoped `updateMany`.

### 4. Wire shape

```ts
export interface SloperListItem {
  id: string;
  name: string;
  garmentType: GarmentType;
  baseSize: string;
  sizeChartName?: string;
  updatedAt: string;
  thumbnailSvg: string;
}
```

The `PatternListItem` precedent: a projection, not the blob. The client has no use for
`sizeTable`, and `garmentType` comes off `spec.type` server-side.

`thumbnailSvg` is built server-side by drafting the sloper and passing the result to the
existing `buildThumbnailSvg` — the same per-row work `listPatternsForUser` already does,
except the pieces come from `draftGarment` instead of the stored blob. Pure geometry, no
AI call.

### 5. Routes

| Route                      | Behavior                             |
| -------------------------- | ------------------------------------ |
| `GET /api/slopers`         | list for the session user            |
| `POST /api/slopers`        | `{patternId, name}` → create from it |
| `PATCH /api/slopers/[id]`  | `{name}`                             |
| `DELETE /api/slopers/[id]` | delete                               |
| `POST /api/patterns`       | gains optional `{sloperId}`          |

All `requireUser()`-gated, all reading bodies through `readJsonObject`. They live at the
top level rather than under `/api/patterns/[id]/*` because the resource created is a
`Sloper` — the pattern is only _read_, never mutated. `POST /api/slopers {patternId}`
mirrors `POST /api/size-charts {sourceId}` (create X from source Y), and
`POST /api/patterns {sloperId}` mirrors it again, tolerating an unusable body the same way
that route does — `api.createPattern()` sends none today, and that must keep meaning
"blank".

`POST /api/slopers` composes rather than delegating: validate the name → `loadPattern`
(404) → check it is drafted (400) → `createSloper(userId, sloperFromPattern(pattern, name),
t)`, answering with the new `SloperListItem`. `PATCH` and `DELETE` answer `{status: "ok"}`
and the store patches its own list, the `dashboardStore.rename` precedent.

**The client never sends a spec.** `POST /api/slopers` takes a `patternId` and the server
copies the snapshot off the pattern it just read under the ownership scope, so the only
new validation surface is the name. There is no second `validateSpec`-shaped trust
boundary to forget (the mistake `lib/sizeCharts/validate.ts` exists to correct).

Errors:

- pattern missing / not owned → `patternNotFound()` (404 `pattern_not_found`)
- pattern not drafted (`pieces.length === 0 || !spec`) → 400 `pattern_not_drafted`,
  reusing the graduate route's existing code
- name empty after trim, or over `MAX_PATTERN_NAME_LENGTH` → 400 `invalid_name`
- sloper missing / not owned → 404 **`sloper_not_found`**, a new member of `NotFoundCode`
  in `lib/api/errors.ts` with `ERROR_STATUS` 404 and `STATUS_WORD` `"not_found"`, matching
  its two siblings

**Creating a pattern from a sloper costs 0 credits.** It runs `draftGarment` locally and
makes no Anthropic call — the same reason `POST /api/patterns/[id]/conflict/resolve` is
free. Creating a blank pattern is already free, so this adds no new way to spend nothing.

### 6. Saving — the editor footer

`components/editor/Footer.tsx` gains a `Salvar como base` button beside `Exportar`,
opening a `Dialog` with one `Field`/`Input` defaulted to the pattern's name and capped at
`MAX_PATTERN_NAME_LENGTH`.

It is gated by the **same** condition as export — conflict active, generating, no pieces,
or no spec. Founding future garments on divergent seams is the same mistake as cutting
fabric from them, so a conflict blocks both. The button carries a `title` naming the
reason rather than being silently inert.

The call goes through a new `useEditorStore.saveAsSloper(name): Promise<boolean>` — the
store owns the real `patternId` (`pattern.id` inside the blob is literally `"demo"`), and
every server call goes through `lib/api-client.ts`. It touches no editor state: the
pattern is unchanged by being saved as a base.

Failure surfaces as the inline, self-clearing message the Footer already renders for
`exportError`, not as the editor store's `error` — a failed save leaves a perfectly usable
screen, so it gets a notice, not a takeover. Success closes the dialog and shows the same
inline strip with a confirmation.

### 7. Listing — `/slopers`

- `app/slopers/page.tsx` — thin server component: session check → `/login`, `loadWallet` →
  `buildCredits`, render the shell. The `/size-charts` idiom.
- `components/slopers/SlopersShell.tsx` — `AppShell` with `title` / `subtitle` /
  `backHref="/"` / `credits` / `sidebar={<Sidebar active="slopers" …/>}`, the `ready` /
  `error` / `actionError` triad rendered exactly as `DashboardShell` does (`role="status"`
  loading, `role="alert"` load error, `ActionErrorNotice` above the content).
- `components/slopers/SloperGrid.tsx` — the same 4-column grid as `PatternGrid`, minus the
  search and type filter (YAGNI: a base library is small; add them when it isn't). Its
  `Empty` state points the user at the editor, since that is the only place a base can be
  created.
- `components/slopers/SloperCard.tsx` — thumbnail, name, a meta line
  `{garmentType} · base {baseSize}`, `sizeChartName` on a second muted line when present, a
  primary `Usar base` action, and the `⋯` menu carrying `Renomear` (`Dialog`) and `Excluir`
  (`ConfirmModal`) — the `PatternCard` shape.
- `lib/slopersStore.ts` — `ready` / `error` / `actionError` / `slopers`, with `init`,
  `createPattern(sloperId)` (resolves to the new pattern's id or `null`, so the caller
  navigates — the `dashboardStore.create` precedent), `rename`, `remove`,
  `clearActionError`. Mutations update local state only after the server confirms.

`Usar base` creates the pattern and pushes `/pattern/[id]`, landing the user in the editor
on a drafted v1 rather than a blank canvas.

### 8. The sidebar becomes navigable

`components/dashboard/Sidebar.tsx` gains `active: "patterns" | "slopers"`. "Bases do
ateliê" loses its `soon` badge and its disabled `<span>`, becoming a real nav `Button` that
pushes `/slopers`; on `/slopers` it is the olive-tint active span and "Meus moldes" becomes
the button pushing `/`.

It also loses its direct `useDashboardStore` dependency for `＋ Novo molde`, taking an
`onNewPattern: () => void` prop instead. Without that, a failed create on `/slopers` would
record its `actionError` on the _dashboard_ store, which that screen does not render — the
click would look like it had done nothing, the exact failure mode `actionError` was
introduced to end. Each shell now owns the handler against its own store.

### 9. Copy

New namespaces in `messages/pt-BR.json`:

- `Slopers` — `title` ("Bases do ateliê"), `subtitle`, `loading`, `loadError`,
  `emptyTitle`, `emptyDescription` (naming the editor as the place to save one).
- `SloperCard` — `useButton` ("Usar base"), `menuAriaLabel`, `renameOption`,
  `deleteOption`, the rename dialog's title/prompt/save/cancel, the delete modal's
  title/description/confirm/cancel, and `meta` (`{garmentType} · base {baseSize}`).

Extended:

- `Footer` — `saveAsBaseButton`, `saveAsBaseTitle` (the dialog's), `saveAsBasePrompt`,
  `saveAsBaseSave`, `saveAsBaseCancel`, `saveAsBaseSaved`, `saveAsBaseError`,
  `saveAsBaseDisabledTitle`.
- `PatternData` — `fromSloperMessage` (`{name}`), the neutral opening `ai` chat turn a
  pattern created from a base carries. Without it the editor holds no trace of where the
  pattern came from; it lives in `PatternData` because it is drafter-adjacent text resolved
  server-side through the injected `Translate`, and `buildHistory` drops leading assistant
  turns, so it never reaches the model.
- `Sidebar` — `comingSoonBadge` stops being used here (the key stays; other namespaces own
  their own).

Garment-type words come from the existing `garmentType.*` catalog keyed by the EN enum,
never a hand-written label map.

## Non-goals

- **The `5i` chips.** The design handoff also puts a `Bases do ateliê` chip row inside the
  size-chart screen. The issue's acceptance criteria name the dashboard entry only, and a
  second surface for the same list is a second thing to keep in sync. Not built.
- **Editing a base.** Rename and delete only. Changing a base's spec is what the editor is
  for: use it, adjust the pattern, save a new base.
- **Grading carried into a base.** `sizesApplied` resets; a base is a base size.
- **Sharing bases between accounts**, and any system-seeded starter bases (contrast
  `ensureSystemSizeCharts`). Every sloper is user-created.
- **Search / type filter on `/slopers`.**

## Testing

- `lib/slopers/convert.test.ts` (node) — the round trip across several garment types and
  styles; `sizesApplied` reset; `sizeChartName` preserved when present and absent when not;
  a spec with `style.sleeveRefit` survives (it is internal, not AI-settable, and a refitted
  sleeve is exactly the kind of tuned base worth saving).
- `app/api/slopers/route.test.ts` and `app/api/slopers/[id]/route.test.ts` (node) — 401
  unauthenticated; 404 for another account's pattern and for another account's sloper; 400
  `pattern_not_drafted` against a genuinely blank pattern (drafting one first, per the
  lesson the graduate route's tests encoded); 400 `invalid_name` on empty and on
  over-length; the happy path returning a `SloperListItem`.
- `app/api/patterns/route.test.ts` (node) — no body still creates a blank pattern;
  `{sloperId}` creates a drafted one; an unknown `sloperId` 404s and creates nothing.
- `components/slopers/SloperCard.test.tsx` and `components/editor/Footer.test.tsx` (dom) —
  render through `renderWithIntl`, asserting catalog text against the exported `ptBR` object
  rather than pasted literals, since a missing key renders the key path and passes a
  substring match.
- Full `npm test`, `npm run lint` (scoped to `app lib components`), `npm run build`.

## Evidence

The Docker dev-stack 404 caveat does not apply here (no route sits two static segments
below a dynamic one), but the flow is verified on the host against `npm run dev` with a
real Postgres anyway: draft a blouse → `Salvar como base` → `/slopers` lists it with a
thumbnail → `Usar base` → the editor opens on a drafted v1 whose pieces match the original,
with the wallet balance unchanged across the whole sequence. Screenshot attached to the
issue on close.
