# Dashboard (4b) + multi-molde migration — design

Date: 2026-08-18
Status: approved for planning

## Why

The pattern editor (`4a`) is the only screen this repo builds today. `CLAUDE.md`
explicitly lists Dashboard as out of scope, and the backend models exactly one
`Molde` per user (`Molde.userId` is the primary key). This brings the
dashboard (`4b`, `docs/design/README.md:78-80`) into scope, which requires the
data model to move from **1 molde per user** to **N moldes per user** — the
dashboard's whole reason to exist is letting an account hold a list of
moldes ("14 moldes · 4 graduados", grid of cards, "+ Novo molde").

Decisions locked in during brainstorming:

- Full multi-molde migration now, not a single-molde-shell placeholder.
- Existing dev/seed data is **not** migrated — same precedent as the earlier
  `reset_moldes_english` migration. Accounts start with an empty dashboard.
- v1 ships the full `4b` layout (grid, search, filter, credits card, recent
  usage card) rather than a stripped-down version — the parts of `4b` that
  depend on screens still out of scope (Medidas e grades, Bases do ateliê,
  Audaces/.dxf import) are shown but disabled with an **"em breve"** badge,
  per the existing CLAUDE.md convention (`Prova 3D` tab is the anchor
  example).
- Molde cards show **no state badge** in v1 (rascunho/graduado/exportado from
  the design spec). Export never touches the server (client-side transform,
  no API call — `CLAUDE.md`), so "exportado" can't be derived honestly
  without adding a tracking endpoint, and rather than ship a partial 2-state
  badge, v1 drops the badge entirely.
- Rename and delete are in v1 scope (not explicit in the `4b` spec text, but
  necessary once an account can accumulate multiple moldes).
- API surface is nested resources under `/api/moldes`, not a flat
  `/api/pattern/*` with a `moldeId` in the body.
- `POST /api/pattern/reset` is removed. Its only purpose was letting a user
  wipe their single molde; with delete available, that's redundant. The
  editor's existing "Resetar" button becomes "Excluir molde" (deletes the
  current molde, redirects to `/`).

## Data model

```prisma
model Molde {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data      Json
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@index([userId, updatedAt])
}
```

`Molde.userId` stops being the primary key; `id` is. `User.molde Molde?`
becomes `User.moldes Molde[]`.

`Wallet`/`Transaction` are **unchanged** — credits stay 1:1 with the account,
not per molde, matching the design's "Créditos do mês" card living at the
account level, shared across all moldes.

The molde's display name stays inside the JSON blob
(`MoldeState.pattern.name`) — no denormalized `name` column. Per-account
molde counts are small (a person's own pattern library), so the list
endpoint can read the blobs directly; no need for DB-level full-text search.

**Migration:** drop and recreate `Molde` with the new shape (reset, no data
carried over), same precedent as `reset_moldes_english`.

## Routing

- `/` — dashboard (new home). Redirects to `/login` if unauthenticated.
- `/molde/[id]` — the editor, scoped to one molde. Redirects to `/` if the
  molde doesn't exist or isn't owned by the session user (same "don't leak
  existence" shape as a 404 API response).
- `/login` — unchanged.

## API

Replaces `app/api/pattern/*` entirely:

- `GET /api/moldes` — list the user's moldes: `{id, name, garmentType,
updatedAt, thumbnailSvg}[]`, sorted by `updatedAt desc`. `garmentType` is
  `null` for a still-blank molde (drives the "blank" state client-side).
  `thumbnailSvg` is a small multi-piece path built server-side from the
  molde's already-persisted `pieces` via the existing `buildPathD`
  (`lib/export/model.ts`) — no redraft, no AI call.
- `POST /api/moldes` — create a new blank molde (`seedMoldeState()`), returns
  `{id}`. Client navigates to `/molde/[id]`.
- `GET /api/moldes/[id]` — full `EditorState` for that molde (same shape
  `GET /api/pattern` returns today), via `composeEditorState`. 404 if not
  found or not owned.
- `PATCH /api/moldes/[id]` — body `{name}`, renames the molde.
- `DELETE /api/moldes/[id]` — deletes the molde.
- `POST /api/moldes/[id]/generate` — unchanged behavior, now scoped to `id`.
- `POST /api/moldes/[id]/graduate` — unchanged behavior, now scoped to `id`.
- `POST /api/moldes/[id]/conflict/resolve` — unchanged behavior, now scoped
  to `id`.
- `GET /api/account/summary` — new, account-level (not molde-scoped):
  `{credits: Credits, recentUsage: {reason, amount, createdAt}[]}` (last 3
  debit-type `Transaction` rows for the "Uso recente" card). Backs the
  dashboard's credits + recent-usage cards; the editor's topbar keeps getting
  credits from `GET /api/moldes/[id]`, unchanged.
- `POST /api/billing/purchase` — unchanged, still account-level.
- `POST /api/pattern/reset` — **removed**.

**Ownership check:** `lockMolde`/`loadMolde` (`lib/db/molde.ts`) take
`(moldeId, userId)` and filter `WHERE "id" = $1 AND "userId" = $2` — a row
that exists but belongs to someone else reads as "not found," same as a row
that doesn't exist. `withMoldeAndWallet` (`lib/db/molde-wallet.ts`) gets the
same signature change; lock order (Molde row, then Wallet row) is unchanged.

## Client architecture

- `lib/api-client.ts` gains `listMoldes()`, `createMolde()`,
  `renameMolde(id, name)`, `deleteMolde(id)`, `getAccountSummary()`; the
  existing `generate`/`graduate`/`resolveConflict` functions gain a leading
  `moldeId` parameter routed into the new nested URLs.
- `lib/store.ts` (`useEditorStore`) is unchanged in shape except `init()`
  becomes `init(moldeId: string)`, threading `moldeId` through to every API
  call it already makes. It still represents exactly one molde at a time —
  the store doesn't need to know other moldes exist.
- New `lib/dashboardStore.ts` (`useDashboardStore`), same
  fetch-through-api-client-into-Zustand pattern as the editor store: `moldes:
MoldeListItem[]`, `accountSummary`, `search: string`, `typeFilter:
GarmentType | "all"`, loading/error flags, plus `init()`, `create()`,
  `rename(id, name)`, `remove(id)`. Search/type-filter are applied
  client-side over the already-fetched list (small N, no server-side
  filtering needed).

## UI composition

- `app/page.tsx` — server component, checks session, renders
  `<DashboardShell userEmail={...} />` (replaces today's direct
  `<EditorShell>` render).
- `app/molde/[id]/page.tsx` — server component, checks session, renders
  `<EditorShell userEmail={...} moldeId={params.id} />`.
- `components/dashboard/DashboardShell.tsx` — top-level layout: topbar +
  sidebar + main content, owns `useDashboardStore` init.
- `components/dashboard/DashboardTopbar.tsx` — logo, amber credit pill
  ("◆ 320 créditos"), "◍ Conta ▾" menu (Créditos e uso / Plano e cobrança /
  Preferências / Sair). "Sair" reuses the same `signOut()` call as the
  editor's `Topbar.tsx`.
- `components/dashboard/Sidebar.tsx` — "Meus moldes" (active), "Medidas e
  grades" and "Bases do ateliê" (disabled + "em breve" badge); footer:
  disabled "Importar molde · Audaces · Molde.me · .dxf" card ("em breve") +
  ink "+ Novo molde" button (calls `useDashboardStore.create()`, then
  navigates to `/molde/[id]`).
- `components/dashboard/MoldeGrid.tsx` — title + count ("14 moldes · 4
  graduados" becomes "N moldes" without the graduated count, since that
  would need the badge data we're deliberately not tracking — revisit if a
  future phase adds it), search input, "Tipo" filter dropdown, 4-column
  card grid, trailing disabled dashed "Importar .dxf" card.
- `components/dashboard/MoldeCard.tsx` — thumb (the server-built mini-SVG),
  name, relative "updated" date, hover-revealed "⋯" menu (Renomear /
  Excluir). Click navigates to `/molde/[id]`. No state badge (see decisions).
- `components/dashboard/CreditsCard.tsx` — reuses `GET /api/account/summary`
  `credits`, same shape/formatting as the editor topbar's credit block.
- `components/dashboard/RecentUsageCard.tsx` — renders the 3
  `recentUsage` entries from the same endpoint.
- `components/shared/ConfirmModal.tsx` — small generic confirm dialog
  (title/body/confirm/cancel), styled like the existing
  `components/editor/PaywallModal.tsx`. Used for delete-molde confirmation
  (dashboard card menu and the editor's repurposed "Excluir molde" button).
- `components/editor/Topbar.tsx` — "Resetar" button and `resetPattern`
  store action are replaced by "Excluir molde", which opens `ConfirmModal`,
  calls `useDashboardStore`-less direct `deleteMolde(moldeId)` via
  `api-client`, then `router.push("/")`.

## States & edge cases

- **Empty dashboard** (0 moldes): grid area shows an empty-state message +
  prominent "+ Novo molde" CTA, consistent with `CanvasArea`'s existing
  "Molde em branco" empty state pattern.
- **Loading**: skeleton grid while `GET /api/moldes` / `GET
/api/account/summary` are in flight.
- **List fetch error**: inline retry message in the grid area (no silent
  failure, per CLAUDE.md's "surface limitations on-screen" rule extended to
  errors).
- **Delete**: confirm-modal gated (destructive); deleting the molde
  currently open in the editor redirects to `/`.
- **Direct navigation to `/molde/[id]` for a molde that doesn't exist or
  isn't yours**: redirect to `/`, no error page.
- **Search/filter with zero matches**: "nenhum molde encontrado" message
  inside the grid, distinct from the true-empty-dashboard state.

## Testing

- `lib/db/molde.ts`, `lib/db/molde-wallet.ts`: existing test style
  (integration against the local Postgres, matching `molde.test.ts` /
  `molde-wallet.test.ts`) extended to cover the new `moldeId` ownership
  filter and the new list/create/rename/delete functions.
- New `lib/db/account.ts` (recent-usage query) gets the same test treatment.
- `lib/api-client.ts` additions get unit tests matching the existing file's
  coverage style.
- `lib/dashboardStore.ts` gets unit tests matching `lib/store.test.ts`'s
  style (mocked `api-client`).
- Dashboard components follow this codebase's existing convention: no
  component-level test suite (there isn't one for the editor's components
  either) — verified by running the dev server and exercising the golden
  path + the edge cases listed above, per this project's UI-testing
  guidance.

## CLAUDE.md updates (part of this work, not deferred)

- Remove "Dashboard" from the out-of-scope screens line; the remaining list
  (landing, onboarding, plans, import, export **screen**, version history,
  measurement-grid) stays out of scope.
- Rewrite the "Architecture" molde paragraph: N moldes per user (`id`-keyed,
  ownership-checked), not 1 (`userId`-keyed).
- Replace `/api/pattern/*` route descriptions with the new
  `/api/moldes/[id]/*` shape; document the new `/api/account/summary`
  endpoint; note `/api/pattern/reset`'s removal.
- Add a new architecture paragraph for the dashboard: its store, the
  server-built thumbnail, and which `4b` sub-parts are marked "em breve" and
  why (Medidas e grades / Bases do ateliê / import screens still out of
  scope).
