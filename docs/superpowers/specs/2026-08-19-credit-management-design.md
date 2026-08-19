# Credit management (Créditos e uso / Plano e cobrança) — design

## Context

CLAUDE.md's MVP roadmap lists **Gerenciamento de crédito** as not yet built: the `Wallet`/`Transaction` backend has been real since Phase C, but there are no dedicated screens for it — only the dashboard's `CreditsCard`/`RecentUsageCard` (last 3 debits) and the editor's insufficient-balance paywall (`5d`). The dashboard's account menu (`components/dashboard/DashboardTopbar.tsx`) already has two stubbed, unwired buttons for this — `usageMenuItem` ("Créditos e uso") and `planMenuItem` ("Plano e cobrança") — sitting next to the working `preferencesMenuItem` that opens the settings page. This spec wires those two up.

## Decisions

1. **One unified settings shell, not separate pages.** All 5 sections (Perfil, Alterar senha, Excluir conta, Créditos e uso, Plano e cobrança) live under one route with a sidebar for navigation, the same shape as the dashboard's own `Sidebar.tsx` (fixed-width nav column). The existing 3 settings sections stop being stacked unconditionally — the shell now shows exactly one section at a time.
2. **Route renamed `/configuracoes` → `/settings`, and this is a deliberate convention change, not a one-off.** CLAUDE.md currently documents `/configuracoes` by name as a settled decision, and every existing full-page screen route in the app is Portuguese (`/configuracoes`, `/molde/[id]`). Going forward, **new** full-page screen routes are English (matching the existing EN-code/pt-BR-UI-text split already used for identifiers and enum values) — UI text inside the screen stays pt-BR as always. `/molde/[id]` is **not** touched by this change; it's out of scope today. CLAUDE.md's Configurações paragraph gets updated to record this.
3. **Section switching is a query param**, `?section=profile|password|danger|usage|plan` (default `profile` when absent), read via `useSearchParams()`. Sidebar clicks call `router.replace` (not `push`) so clicking around sections doesn't spam browser history. The three relevant `DashboardTopbar` menu items become `router.push("/settings?section=...")` calls (`usageMenuItem` → `usage`, `planMenuItem` → `plan`, `preferencesMenuItem` → `profile`, i.e. `/settings` with no param).
4. **"Créditos e uso" (`UsageSection`) shows the full ledger, not just spend.** Unlike `RecentUsageCard` (last 3, debit-only), this section shows up to the last 30 transactions of **every** type (`debit`/`refund`/`topup`/`subscribe`/`renew`), each with type label, reason (when present), signed amount, and relative date — it reads like a statement. It also carries the "Comprar créditos avulsos" top-up action.
5. **"Plano e cobrança" (`PlanSection`) reflects what the backend actually supports today — it does not add real multi-plan switching.** `lib/billing/wallet.ts`'s `applyPurchase` only ever issues one subscribed plan (hardcoded to Ateliê, 500cr/R$59). The section shows all 4 plans from design doc `5c` (Grátis/Ateliê/Estúdio/Confecção) as static display cards for parity with the design, with Ateliê marked "Plano atual" and the other 3 disabled with an **"em breve"** badge — honest about the limitation, per the codebase's existing convention (no fake plan-switching). A footer repeats the cost-per-action table, sourced from the existing `COSTS` constant (`lib/types.ts`), not hand-typed.
6. **No new Zustand store.** Section state lives in the URL; each section keeps local `useState`, same call as the original `SettingsShell` design.

## Architecture

### Routing & shell

- `app/configuracoes/page.tsx` moves to `app/settings/page.tsx`. Same shape as today: server component, session check, loads `{id, name, email}` via `getUserById`, the account `Wallet` via `loadWallet`, and now also the ledger via a new `getLedgerHistory(userId, 30)`. All three are passed into `SettingsShell` as props — no client-side round-trip for the initial render, matching how this page already works and how `app/page.tsx`/`app/molde/[id]/page.tsx` work.
- `SettingsShell.tsx` renders `PageHeader` (unchanged) then a row: `SettingsSidebar` (new, left) + the active section's component (right, scrollable). It reads the active section from `useSearchParams()` and picks one of `ProfileSection | PasswordSection | DangerZoneSection | UsageSection | PlanSection` to render — the other 4 are not mounted, matching the existing conflict-panel-style "one slot, mutually exclusive" idiom already used elsewhere in this codebase (`CanvasArea`'s `PieceDetailsPanel`/`ConflictInfoCard`).

### New components

- **`components/settings/SettingsSidebar.tsx`** — 5 nav buttons (Perfil / Alterar senha / Excluir conta / Créditos e uso / Plano e cobrança), same 186px-column idiom as `components/dashboard/Sidebar.tsx`; active section highlighted olive-tint (reusing the same visual language as the dashboard sidebar's active "Meus moldes" item). Calls `router.replace` on click.
- **`components/settings/UsageSection.tsx`** — balance/total/renewal header (same numbers as `CreditsCard`, different chrome to fit inline in the settings shell rather than a dashboard grid card), a top-up button, and the ledger list. Top-up calls the existing `purchase("topup")` (already generic, works without a `moldeId`, already returns bare `{credits}`); on success the section updates its local balance and **prepends a synthetic ledger row client-side** (type `topup`, amount 100, the returned balance, `createdAt: new Date()`) rather than refetching — same optimistic-update idiom the chat panel already uses for `sendMessage`.
- **`components/settings/PlanSection.tsx`** — 4 static plan cards + cost-table footer, as described in decision 5. Plan copy is keyed off the existing `PlanId` enum values (`free`/`atelier`/`studio`/`factory`) in the i18n catalog, per the established EN-enum-keyed-lookup convention (e.g. `TechSheetTab`'s `garmentType.*`), not a hand-written label map.

### Data / API

- **New**: `getLedgerHistory(userId, limit = 30)` in `lib/db/account.ts` — same shape as the existing `getRecentUsage` but without the `type: "debit"` filter (all ledger types), same `RecentUsageEntry`-like return shape plus `type`.
- **New**: `GET /api/account/ledger` route, `requireUser()`-gated like every other route, calls `getLedgerHistory`. A matching client fetch helper is added to `lib/api-client.ts` for completeness and its own route test, but the initial `UsageSection` UI does not call it: the first render comes from the server-loaded props, and the top-up flow stays fully optimistic (per above) with no refetch. It exists as the read API for this data, not because the v1 UI needs a client-side refresh path.
- **Reused, unchanged**: `POST /api/billing/purchase` (topup path), `GET /api/account/summary` (still backs the dashboard's own cards, untouched).

### i18n

New catalog namespaces: `SettingsSidebar` (5 nav labels — reusing existing strings where they already exist, e.g. `DashboardTopbar.usageMenuItem`'s "Créditos e uso" text, kept consistent rather than re-worded), `UsageSection`, `PlanSection` (plan cards keyed by `PlanId`, e.g. `plans.free.name`/`plans.free.price`/`plans.free.credits`). `SettingsShell`'s existing single `title` key stays but the header no longer needs a page-specific title per section since the sidebar now carries that labeling — kept as "Configurações" (unchanged, still pt-BR UI text; only the route path changed, not the on-screen title).

### CLAUDE.md update

The "Configurações do usuário" paragraph is amended to: (a) reflect the new `/settings` path instead of `/configuracoes`, (b) describe the new unified-shell-with-sidebar shape instead of "stacks three sections" with no nav, (c) add a short note that new full-page screen routes are now English by convention (UI text remains pt-BR), while previously-shipped routes (`/molde/[id]`) are unaffected.

## Error handling

- `GET /api/account/ledger` follows the exact same 401-via-`requireUser()` gate as every other account route; no new failure modes (it's a read-only query, no ownership dimension beyond the session's own `userId`).
- Top-up failure (network/API error) surfaces inline in `UsageSection` the same way `ProfileSection`/`PasswordSection` already show inline errors — `status: "idle" | "loading" | "ok" | "error"` local state, no toast system exists in this codebase and none is introduced here.
- Disabled plan cards (Grátis/Estúdio/Confecção) are inert — no click handler, no error path, just the "em breve" badge, consistent with `Sidebar.tsx`'s existing disabled nav items.

## Testing

- `lib/db/account.ts`'s new `getLedgerHistory` gets a unit test alongside the existing `getRecentUsage` one (same file, same DB-mocking approach).
- `app/api/account/ledger/route.ts` gets a `route.test.ts` matching the shape of `app/api/account/summary/route.test.ts`.
- No new pure-logic module is introduced (no `lib/settings/*` needed) — `UsageSection`/`PlanSection` are presentational plus the already-tested `purchase` client call, so no new unit-test surface beyond the two items above.

## Out of scope (explicitly)

- Real multi-plan subscribe/switch/downgrade logic (backend still only issues Ateliê).
- Payment method / invoice management (no real payment gateway exists; purchases stay mocked-instant-success).
- Renaming `/molde/[id]` or any other existing route.
- Pagination beyond the last 30 ledger entries.
