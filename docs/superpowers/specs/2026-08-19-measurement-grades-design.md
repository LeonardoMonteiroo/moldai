# Measurement Grades (`5i`) — Design

## Goal

Replace the app's hardcoded size tables (`SIZE_TABLE`/`SIZE_TABLE_MALE`/`ALL_SIZES`) with a real, per-account **grade** system: users can create, edit, and duplicate measurement grids (custom size lists + a progression rule + manual per-cell overrides), and the grade they mark active actually drives pattern generation and grading. This is the "Medidas e grades" (`5i`) screen from `docs/design/`, scoped down from the full wireframe — see Non-Goals.

This is the next unshipped MVP subsystem per `CLAUDE.md`'s roadmap (`5i`, high-fidelity design already exists).

## Non-Goals (deferred, shown as inert "em breve" placeholders)

- **"Bases do ateliê"** (saving a drafted pattern's pieces as a reusable base) — `CLAUDE.md` already flags this as a sub-section of `5i`, not its own screen, and not yet built. Rendered as a visible-but-inert block on the new `/grades` screen, same convention as the dashboard's inert import card.
- **Audaces spreadsheet import** — same treatment (dashed, badged, inert). This is screen `5g`'s domain, already out of scope.
- **"Infantil" grade category** — no measurement data source exists for it; not included in the library at all (not even as a placeholder), rather than fabricating data.
- **Body-type-aware drafting** — `bodyType` is stored as descriptive metadata only; it does not shape drafted geometry. A known, honest limitation (see Data Model).
- **Per-pattern grade override** — grade selection is account-level ("the active grade"), not a per-pattern control in the editor toolbar.

## Data Model

### `Grade` (new Prisma model, JSON-blob-per-row shape, matching `Pattern`/`Wallet`)

```prisma
model Grade {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data      Json
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@index([userId, updatedAt])
}
```

`data` shape (`GradeData`, `lib/types.ts`):

```typescript
interface GradeData {
  name: string;
  gender: Gender; // existing "female" | "male"
  bodyType: BodyType; // "straight" | "hourglass" | "pear" | "apple" — metadata only, no drafting effect
  isSystem: boolean; // seeded, read-only (no edit/delete), duplicable
  sizes: string[]; // ordered size labels, e.g. ["PP","P","M","G","GG"] or ["36","38","40","42","44","46"]
  baseSizeIndex: number; // index into sizes[] — the highlighted/base column
  baseMeasurements: Measurements; // the 9 existing fields, values at the base size
  progressionRule: Partial<Record<keyof Measurements, number>>; // cm delta per size step, relative to baseSizeIndex
  overrides: Record<string, Partial<Measurements>>; // size -> field -> manual value, wins over the rule
}
```

`User.activeGradeId: String?` — the account-level grade in use, defaulting to the seeded female-adult system grade.

### System grades

Not special-cased data — every account gets two seeded `Grade` rows (`isSystem: true`) lazily on first access to `/grades` (or first pattern generation, whichever comes first): "Feminino adulto · ABNT" and "Masculino adulto", built from today's `SIZE_TABLE`/`SIZE_TABLE_MALE` constants (`progressionRule`/`overrides` computed by diffing the existing per-size rows against the `M` base row, `baseSizeIndex` = index of `"M"`). Lazy-seed precedent: same as `Wallet`'s "lazily reseeded to default on first access" (`CLAUDE.md`). System grades can be **duplicated** but not edited or deleted.

### `SizeLabel` widens from a fixed union to `string`

`SizeLabel = "PP" | "P" | "M" | "G" | "GG"` becomes `type SizeLabel = string`. `ALL_SIZES` is deleted. Every current consumer already reads its size list from pattern-instance data, not a global constant:

- `Pattern.baseSize` / `sizesApplied` / `sizesPending` — unaffected in shape, just typed as `string`.
- `components/editor/TabBar.tsx`'s `SizeSelector` — maps over `pattern.sizes` (new field, see below) instead of `ALL_SIZES`.
- `components/editor/PieceDetailsPanel.tsx` — same, grading chips map over `pattern.sizes`.
- `lib/export/model.ts`'s `ExportModel.size` — becomes `string`.
- `app/api/patterns/[id]/graduate/route.ts` — validates requested sizes against `state.pattern.sizes` instead of `ALL_SIZES`.

This is a type-widening pass, not a rewrite: the drafters (`lib/draft/*`) never consumed `SizeLabel` for anything but a `resolveMeasurements` lookup key, so none of the drafting logic changes.

### `Pattern` snapshots its grade at first generation, not creation

A blank pattern doesn't know `spec.gender` yet (gender only becomes known once the AI drafts the first spec). So `applyGarmentSpec` (`lib/editor/state.ts`), the first time it runs for a pattern with no existing `sizeTable`, resolves:

- the account's active grade, if its `gender` matches `spec.gender`,
- else the system default grade for that gender (silent fallback — no chat/UI notice in v1),

and freezes onto the pattern: `sizes: string[]`, `baseSize: string`, `sizeTable: Record<string, Measurements>` (every size in the grade, fully resolved via `resolveGradeSize`). `sizesPending` is seeded from the full `sizes` list (including `baseSize`) and `sizesApplied` starts empty — unchanged from today's `seedPattern` behavior (`sizesPending: ALL_SIZES`, `sizesApplied: []`); grading the base size is still a distinct, explicit action like any other size.

Later regenerations reuse the existing frozen snapshot — same precedent as the already-documented locale-snapshot limitation (a pattern holds a draft-time snapshot, not a live reference). Editing or reassigning the account's active grade never retroactively changes an in-progress pattern. Grading (`applySizes`) draws its candidate sizes from the frozen `sizes` list, not a live grade lookup. No new lock is needed inside `withPatternAndWallet` — the grade is read once, before the transaction, same as today's pattern.

Pre-snapshot (blank pattern), `baseMeasurements`/`baseSize` keep today's placeholder values (`"M"`, system female defaults) — irrelevant since no pieces are shown yet.

## Progression + Override Computation (`lib/grades/compute.ts`, pure, DB-free)

```typescript
function resolveGradeSize(grade: GradeData, size: string): Measurements;
```

For each of the 9 `Measurements` fields:

```
value = baseMeasurements[field] + (progressionRule[field] ?? 0) * (sizeIndex - baseSizeIndex)
if overrides[size]?.[field] is set: value = overrides[size][field]
value = clamp(value, MEASUREMENT_RANGES[field])
```

`resolveMeasurements` (`lib/measurements.ts`) simplifies to `resolveMeasurements(base: Measurements, overrides: Partial<Measurements>): Measurements` — it no longer does a table lookup by size/gender, just applies the AI's chat-driven `measurementOverrides` on top of an already-resolved base row, same clamp step as today. `SIZE_TABLE`/`SIZE_TABLE_MALE` remain as constants (seed data for system grades, and the pre-snapshot AI-prompt fallback — see Wiring).

This decouples the draft engine from `SizeLabel`/grades entirely: `draftAll`/`draftPiecesCm`/`draftGarment` (`lib/draft/garment.ts`) change their second parameter from `size: SizeLabel` to `baseMeasurements: Measurements` — they never again look anything up by size, they just receive the resolved row. `gender` stays a `draftAll` input (still needed for `BlockOpts`, unrelated to measurement lookup). Callers now resolve the row themselves first:

- `applyGarmentSpec` (`lib/editor/state.ts`): ensures `state.pattern.sizeTable` exists (snapshotting on first call, per above), then calls `draftGarment(spec, state.pattern.sizeTable[state.pattern.baseSize], t)`.
- `buildExportModel` (`lib/export/model.ts`): already holds the whole `pattern`, so it changes its `draftPiecesCm(spec, pattern.baseSize, t)` call to `draftPiecesCm(spec, pattern.baseMeasurements, t)` — `pattern.baseMeasurements` already exists today (it's `applyGarmentSpec`'s resolved-row output), so no new field is needed for export specifically.

## Wiring into Generate/Graduate/AI Prompt

- `lib/ai.ts`'s `buildSystem`: pre-snapshot (blank pattern), keep sending `SIZE_TABLE`/`SIZE_TABLE_MALE` as today (gender unknown). Post-snapshot, send the pattern's own frozen `sizeTable[baseSize]` instead, so the AI's suggested `measurementOverrides` are relative to the account's actual chosen grade.
- `app/api/patterns/[id]/graduate/route.ts` validates requested sizes against `state.pattern.sizes`.
- Gender-mismatch fallback is silent in v1 (documented above).

## API, Repository, Store, Screen

### `lib/db/grade.ts` (thin repo, mirrors `lib/db/pattern.ts`)

- `ensureSystemGrades(userId)` — lazy-seed, called at the top of `listGradesForUser`.
- `listGradesForUser(userId): GradeListItem[]`
- `createGrade(userId, sourceGradeId?)` — duplicates `sourceGradeId`'s data (or the system female-adult default if omitted); backs both "＋ Nova grade" and "Duplicar".
- `updateGrade(gradeId, userId, patch)` — rejects when `isSystem`.
- `deleteGrade(gradeId, userId)` — rejects when `isSystem`.
- `setActiveGrade(userId, gradeId)` — writes `User.activeGradeId`.

### Routes (all `requireUser()`-gated)

- `GET /api/grades`, `POST /api/grades`
- `PATCH /api/grades/[id]`, `DELETE /api/grades/[id]`
- `POST /api/grades/[id]/duplicate`
- `POST /api/grades/[id]/activate`

### `useGradesStore` (Zustand, mirrors `useDashboardStore`)

`grades`, `activeGradeId`, `selectedGradeId`, local in-progress edits to the selected grade's table, `init/select/create/duplicate/save/delete/activate`. Edits are **local until an explicit "Salvar" action** — no autosave/debounce, matching the app's explicit-submit convention (`ProfileSection`, rename-via-`window.prompt`).

### `/grades` screen

English route (matches the `/settings` convention), `PageHeader` shared header, thin server component doing the session check (same shape as `/settings`, `/pattern/[id]`). Reached by removing the "em breve" badge from the dashboard `Sidebar`'s `measurementsLabel` entry and linking it to `/grades`.

Layout (per the wireframe, `docs/design/MoldAI Wireframes.dc.html#5i`):

- **Left column:** grade library list (system + custom grades, active one highlighted in olive-tint), plus the inert "Bases do ateliê" and "Importar planilha" blocks (both visible, both badged "em breve").
- **Right column:** header (name, body-type chip, "Duplicar", "Editar regra de progressão"), the measurement table (**9 rows**, not the wireframe's 5, to cover every field the drafters actually consume — `bust, waist, hip, hipHeight, backLength, shoulder, skirtLength, shortSleeveLength, longSleeveLength`), a read-only-except-via-rule progression summary card, and the "Usar esta grade" CTA (calls `activate`).

Table interactions: base-row cells edit `baseMeasurements` directly; "Editar regra de progressão" opens per-row editable delta inputs that recompute every non-overridden cell live; any individual cell can be edited directly to set an `overrides[size][field]` entry (visually marked, with a "resetar para regra" affordance); adding/removing a size column edits `sizes[]` (and `baseSizeIndex` if needed).

## Testing & Migration

- New additive Prisma migration: `Grade` table + `User.activeGradeId` column. No data loss — existing `Pattern` rows are untouched (they simply lack a `sizeTable` until their next generation, which doesn't happen retroactively).
- `lib/grades/compute.test.ts` — rule/override/clamp logic, unit tests (no DB).
- `lib/db/grade.test.ts` — real-Postgres repo tests, same pattern as `lib/db/pattern.test.ts`.
- `lib/gradesStore.test.ts` — same shape as `lib/dashboardStore.test.ts`.
- Route tests per new endpoint.
- Existing tests updated (not net-new) for every `SizeLabel`-widening call site: `TabBar`, `PieceDetailsPanel`, `lib/export/model.ts`, the graduate route, `lib/ai.ts` — behavior is unchanged for the default system-grade path.
- `i18n`: new `Grades`/`GradeTable`/`GradeCard` message namespaces in `messages/pt-BR.json`; `bodyType.*` catalog keys resolved the same way as `garmentType.*`/`gender.*` (EN enum value, pt-BR label via lookup).

## Known Limitations (surfaced honestly, not silently)

- `bodyType` is descriptive metadata only — it does not affect drafted geometry.
- A pattern's grade snapshot is frozen at first generation; editing the account's active grade afterward never retroactively affects an in-progress pattern (same precedent as the existing i18n locale-snapshot limitation).
- Gender/grade mismatch at snapshot time falls back silently to the system default for that gender — no chat/UI notice in v1.
- "Bases do ateliê" and spreadsheet import are inert placeholders, not functional in this pass.
