# Dashboard onboarding checklist — design

Resolves #232.

## Problem

The redesign handoff (`docs/design/README.md` item 1, `docs/design/screenshots/dashboard.png`) adds a "Comece com o pé direito · N de 5" checklist card at the top of the dashboard: 5 steps (gerar primeiro molde, configurar tabela de medidas, exportar um PDF, importar moldes existentes, convidar alguém da equipe), a progress bar, and a close button. `DashboardShell.tsx` renders none of this today.

Two of the five steps have no honest way to detect completion as the app stands, and one implies a capability (multi-user accounts) the schema doesn't have. This spec resolves all three before implementation.

## Decisions (confirmed with the user)

1. **Exportar um PDF / Importar moldes existentes** get a new, minimal, per-account tracking signal — not localStorage, not "never show as done." A tiny dedicated endpoint records a one-bit "this happened" flag; the export/import mechanics themselves stay otherwise unchanged.
2. **Convidar alguém da equipe** ships as a permanently disabled, `Badge variant="soon"` step (the existing "em breve" convention) — never wired to any completion check, never hidden.
3. **Dismissing the card** (× button) is `localStorage`-only, browser-local. It is not a `User` column and does not sync across devices.

## Drift found while scoping this (fixed as part of this work)

Two lines in `CLAUDE.md`'s Screens section, about `/import`, are stale — `#238` shipped real import-to-pattern creation after that section was written, and it was never updated:

- _"Entirely client-side: it makes no server call at all"_ — false. `VerificationPanel`'s "Importar molde" button (`lib/importStore.ts`'s `createPatternFromImport`) already calls `POST /api/patterns` + `POST /api/patterns/[id]/generate` for real.
- _"Creating a `Pattern` from the parsed geometry is explicitly 'em breve'"_ — false; it's real, costs `COSTS.adjust`, and is backed by its own spec at `docs/superpowers/specs/2026-08-28-dxf-import-pattern-creation-design.md`.

The implementation plan corrects both lines in `CLAUDE.md` (per its own "when a change makes a rule here wrong, fix it here" instruction) alongside the new work. This also means the "Importar moldes existentes" step tracks real import-to-pattern completion, not merely "opened the parse screen."

## Per-step completion source

| #   | Step                         | Source                                                      | New work?                                                                                                                                                                                                                                                              |
| --- | ---------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Gerar primeiro molde         | `dashboardStore.patterns.some(p => p.garmentType !== null)` | No — `garmentType` is already `null` for a blank (undrafted) pattern (`lib/db/pattern.ts`'s `listPatternsForUser`), non-null once drafted, regardless of origin (chat, import, or sloper copy). Purely a client-side derivation off state the dashboard already loads. |
| 2   | Configurar tabela de medidas | `User.activeSizeChart.isSystem === false`                   | Yes — a new small server-side check (see below), surfaced on `GET /api/account/summary`.                                                                                                                                                                               |
| 3   | Exportar um PDF              | `User.firstExportedAt !== null`                             | Yes — new column + ping.                                                                                                                                                                                                                                               |
| 4   | Importar moldes existentes   | `User.firstImportedAt !== null`                             | Yes — new column + ping.                                                                                                                                                                                                                                               |
| 5   | Convidar alguém da equipe    | Always `false`                                              | No completion logic; renders disabled + `Badge variant="soon"`.                                                                                                                                                                                                        |

Step 1 needs no new query or column — it's free.

## Data model

Additive, nullable columns on `User` (the `onboardedAt`/`passwordChangedAt` precedent — null honestly means "not known to have happened," no backfill: an existing account's true export/import history before this shipped is genuinely unknowable, and leaving it null is a low-severity, dismissable-anyway inaccuracy, unlike the email-verification grandfather clause where the alternative was locking accounts out):

```prisma
firstExportedAt DateTime?
firstImportedAt DateTime?
```

One additive migration, no backfill needed.

## API surface

**`GET /api/account/summary`** gains one boolean, computed via a small new helper in `lib/db/sizeChart.ts` (alongside `getActiveSizeChartId`) that loads `User.activeSizeChart.isSystem` in the same query shape as the existing helpers there:

```ts
export interface AccountSummary {
  credits: Credits;
  recentUsage: RecentUsageEntry[];
  checklist: {
    hasCustomSizeChart: boolean;
    hasExported: boolean;
    hasImported: boolean;
  };
}
```

(`hasGeneratedPattern` is deliberately absent from this payload — it's derived client-side from `patterns`, already loaded by the same `dashboardStore.init()` call.)

**`POST /api/account/checklist-progress`** — new route, `requireUser()`-gated like every other `/api/account/*` route. Body: `{event: "exported" | "imported"}`, validated by an `isChecklistEvent` guard (the `isPurchaseType` trust-boundary shape — unrecognised value → 400, no write). Writes are idempotent and one-directional (first-write-wins, via `updateMany` scoped to `id` AND the target column still `null`, so a duplicate ping after the flag is already set is a no-op, not a timestamp overwrite):

```ts
await prisma.user.updateMany({
  where: { id: userId, firstExportedAt: null },
  data: { firstExportedAt: new Date() },
});
```

Answers `{status: "ok"}` unconditionally (even on the no-op branch) — there is nothing about this write a caller needs to react to differently.

## Client wiring

**Firing the ping** — both call sites are best-effort and must never affect the actual export/import outcome:

- `lib/export/index.ts`'s `exportPattern()`, after a successful `downloadFile()` call, fires `api.recordChecklistEvent("exported")` and swallows any rejection (`.catch(() => {})`) — this is the one new server touchpoint export gets, and it must not become a new failure mode for exporting.
- `lib/importStore.ts`'s `createPatternFromImport()`, after it resolves a real pattern id (success path only, not on `insufficient_credits`/`image_failed`/`create_failed`), fires `api.recordChecklistEvent("imported")` the same fire-and-forget way.

**New store state** — `dashboardStore` gains `checklist: AccountSummary["checklist"] | null`, set alongside `credits`/`recentUsage` in `init()`. No new store actions beyond that; the card reads `patterns` + `checklist` from the existing store.

## UI

New `components/dashboard/OnboardingChecklistCard.tsx`, rendered in `DashboardShell.tsx` between the header/search row and `PatternGrid` (inside the existing `ScrollArea`, so it scrolls with the rest of the content — matching how the design screenshot places it above the grid, in-flow). Own catalog namespace `OnboardingChecklistCard` (the `CreditsCard`/`RecentUsageCard` per-component precedent), covering the title, progress label ("N de 5"), all 5 step titles/descriptions, per-step CTA labels ("Configurar", "Exportar", "Importar", "Convidar"), "Concluído" state text, and the close button's `aria-label`.

Behavior:

- Hidden entirely when `localStorage["moldai:onboarding-checklist-dismissed"]` is set, checked on mount (client-only component to avoid a hydration mismatch, the `ExportShell`-preset precedent of always matching server-render on first paint — here, first paint renders nothing until the localStorage check resolves).
- Progress bar and "N de 5" count the 4 real steps plus step 5's fixed `false` — so it can show at most "4 de 5" until multi-user ships, which is honest (5 real steps exist; one has no path to completion yet).
- Each incomplete step renders its CTA as a link to the relevant screen, per the mockup's "→" affordance: "Configurar" → `/size-charts`, "Importar" → `/import`. "Exportar" has no dashboard-level target of its own (export is always per-pattern) — it links to `/pattern/{id}/export` for the most recently updated pattern (`patterns[0]`, since `listPatternsForUser` already orders by `updatedAt desc`), and is itself disabled with no CTA when `patterns` is empty, since there is nothing yet to export — the natural consequence of step 1 preceding it.
- Step 5 always renders disabled with `Badge variant="soon"` in place of a CTA, never a checkmark.
- No auto-hide on reaching 4/5 — stays visible until the user dismisses it, matching the mockup showing no such behavior.
- Close button persists the dismissal to `localStorage` and hides the card immediately (no reload needed).

## Testing

- `dom` project: `OnboardingChecklistCard.test.tsx` — renders all 5 steps, correct checked/unchecked state from props, dismiss hides the card and sets localStorage, step 5 always disabled+badged regardless of other props.
- `node` project: the new `isChecklistEvent` guard, the `checklist-progress` route (valid event sets the column once and is idempotent on repeat; invalid event → 400 with no write), and the `hasCustomSizeChart` helper (system chart active → false, custom chart active → true, no active chart → false).

## Out of scope

- Multi-user accounts / real team invites (tracked separately if ever prioritized).
- Any change to the actual export or import _flows_ beyond the one best-effort ping each.
- Server-persisted dismissal state.
