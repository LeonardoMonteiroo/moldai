# User settings (Configurações do usuário) — design

Date: 2026-08-18
Status: approved for planning

## Why

This is the first of a 5-subsystem MVP roadmap (editor + dashboard already
shipped; user settings, credit management, measurement grids, and moldes
base remain). `CLAUDE.md` previously listed measurement-grid screens and
"Bases do ateliê" as explicitly out of scope — that's been updated to bring
all five into the documented roadmap (see "CLAUDE.md updates" below).

There is no existing design in `docs/design/` for a user-settings screen —
only three inert placeholder buttons in the dashboard's account menu
(`components/dashboard/DashboardTopbar.tsx:42-50`: "Créditos e uso", "Plano
e cobrança", "Preferências"). This design covers wiring up "Preferências"
into a real screen. "Créditos e uso"/"Plano e cobrança" back the next
subsystem (credit management) and are out of scope here.

Decisions locked in during brainstorming:

- Scope: profile (name editable, email read-only), change password, account
  deletion. No default-molde-preferences section in v1.
- Email is **read-only** in v1 — it's the Auth.js Credentials login
  identifier; editing it opens uniqueness/re-verification/session questions
  not worth taking on yet.
- Presented as a **dedicated page** (`/configuracoes`), not a modal — same
  reasoning as the editor living at its own route rather than in a dialog:
  three sections' worth of content needs room.
- Account deletion is gated by typing the account's email (client-side
  intent-confirmation) **and** re-entering the password (server-verified) —
  stronger than the existing `ConfirmModal` used for single-molde deletion,
  because this cascades away every molde plus the wallet/transaction
  history in one irreversible action.
- Password change does **not** force sign-out / invalidate the current JWT
  session — acceptable for this single-device, personal-use MVP. Documented
  as a deliberate choice, not an oversight.
- The settings page header must be **the same component** as the editor's
  `Topbar`, not a lookalike — extracted into a shared `PageHeader` so both
  (and any future full-page screen, e.g. the credit-management page) stay
  in sync automatically.

## Data model

No schema changes. `User` already has `name String?`, `email String @unique`,
`passwordHash String`, and cascading deletes are already wired:
`Molde.user`, `Wallet.user`, and `Transaction.wallet` all specify
`onDelete: Cascade`. Deleting the `User` row is sufficient to clean up
every dependent row — no manual multi-table delete needed.

## Routing

- `/configuracoes` — new. Server component, session check (redirect to
  `/login` if none), loads `{id, name, email}` via a new `getUserById` in
  `lib/db/users.ts`, renders `SettingsShell`. Mirrors the shape of
  `app/page.tsx` / `app/molde/[id]/page.tsx` (thin server wrapper, session
  check only).
- `PageHeader`'s back button always returns to `/` (both the editor and
  settings are subpages of the dashboard; no per-screen back-destination
  prop needed yet).

## API

Three new account-level routes (alongside the existing
`GET /api/account/summary`), all gated by `requireUser()`:

- `PATCH /api/account/profile` — body `{name}`. Validates via
  `validateName` (trim, non-empty, max length), updates `User.name`, returns
  `{name, email}`.
- `POST /api/account/password` — body `{currentPassword, newPassword}`.
  Verifies `currentPassword` against the stored hash via
  `lib/auth/hash.ts`'s `verifyPassword`; 400 on mismatch. Validates
  `newPassword` via `validateNewPassword` (min 8 chars — the first password
  policy in this codebase, since self-signup has always been deferred).
  Hashes with `hashPassword` and updates `User.passwordHash`. Returns
  `{ok: true}`.
- `DELETE /api/account` — body `{password}`. Verifies password the same
  way, 400 on mismatch. On success, `prisma.user.delete({where: {id}})` —
  cascades handle `Molde`/`Wallet`/`Transaction` cleanup. Returns
  `{ok: true}`.

All three 401 via `requireUser()` when unauthenticated, same as every other
route in the app.

## Server logic

New `lib/account/settings.ts` — pure, DB-free, dependency-injected like
`lib/auth/authorize.ts`:

- `validateName(name: string): string | null` — returns the trimmed name or
  `null` if invalid.
- `validateNewPassword(password: string): boolean` — length check.
- `changePassword(deps, currentPassword, newPassword, storedHash)` /
  `verifyForDeletion(deps, password, storedHash)` — take injected
  `{verify, hash}` (same shape as `AuthorizeDeps`) so the verify/hash flow
  is unit-testable without a live DB.

`lib/db/users.ts` gains thin Prisma wrappers: `getUserById`,
`updateUserName`, `updateUserPasswordHash`, `deleteUser`. Simple single-row
updates — no lock/transaction needed (unlike `Molde`/`Wallet`, there's no
concurrent-mutation risk worth guarding against here).

## Client architecture

- `lib/api-client.ts` gains `updateProfile(name)`, `changePassword(current,
next)`, `deleteAccount(password)` — components never call `fetch` directly,
  per existing convention. Follows the file's existing `getJson`/`postJson`
  helper pattern; `deleteAccount` needs a new `deleteJson`-style helper (the
  existing `deleteMolde` inlines a bare `fetch(..., {method: "DELETE"})`
  with no body — this one needs a JSON body, so it can't reuse that as-is).
- No new Zustand store. Settings has no cross-component shared state or
  derived view logic (unlike the dashboard's list+filters or the editor's
  rich pattern state) — local `useState` per form section is enough, and
  matches this codebase's "don't add abstractions beyond what's needed"
  convention.

## UI composition

- **New `components/shared/PageHeader.tsx`** — extracted from
  `components/editor/Topbar.tsx`'s current inline markup. Props: `{title,
subtitle?, credits, userEmail}`. Renders: logo, divider, back button (→
  `/`), title/subtitle block, credits bar, "Comprar créditos" button,
  avatar, sign out.
- `components/editor/Topbar.tsx` becomes a thin wrapper: `<PageHeader
title={pattern.name} subtitle={t("savedVersion", {...})} credits={credits}
userEmail={userEmail} />`. No behavior change for the editor.
- **New `components/settings/SettingsShell.tsx`** — renders `<PageHeader
title={t("title")} credits={credits} userEmail={userEmail} />` (no
  subtitle) followed by three stacked sections:
  - `ProfileSection` — name input (editable) + email field (read-only) +
    "Salvar" button. Inline success/error text below the button (no toast
    system exists anywhere in this app; nothing introduces one here either).
  - `PasswordSection` — current/new/confirm password fields + "Alterar
    senha" button. Submit is disabled while `new !== confirm` (client-side
    only — confirm is never sent to the server), with an inline mismatch
    message. Wrong current password (server-side) shows inline error on
    that field; success clears the fields and shows inline confirmation.
  - `DangerZoneSection` — styled with the `alert` token (`#b5502f`, the
    same color already reserved for seam-conflict warnings) to visually
    separate it from the other two sections. "Type your email to confirm"
    input + password input; "Excluir conta" button stays disabled until the
    typed email exactly matches the session email (case-sensitive) and a
    password is entered. On success: `signOut({callbackUrl: "/login"})`.
- Wires up `DashboardTopbar`'s "Preferências" button
  (`components/dashboard/DashboardTopbar.tsx:48-50`, currently has no
  `onClick`) to `router.push("/configuracoes")`.
- New `Settings` namespace in `messages/pt-BR.json` for all labels/errors
  (component-per-namespace convention, same as `Topbar`/`ChatPanel`/etc).

## States & edge cases

- **Wrong current password** (password-change): 400, inline field error,
  form not cleared.
- **Wrong password on delete**: 400, inline error, account not deleted.
- **Email mismatch on delete**: submit button simply stays disabled — no
  server round-trip until the typed email matches.
- **Name validation failure** (empty/too long): 400, inline error, no DB
  write.
- **Session loss mid-form** (e.g. token expired): any of the three routes
  401s via `requireUser()`; client shows a generic "sessão expirada" inline
  message (no dedicated recovery flow — same as how every other route in
  this app already behaves under `requireUser()`).

## Testing

- Vitest unit tests for `lib/account/settings.ts` (`validateName`,
  `validateNewPassword`, `changePassword`/`verifyForDeletion` with injected
  fake `verify`/`hash` deps) — mirrors `lib/auth/authorize.test.ts`'s style,
  no live DB.
- No component-level test suite (matches this codebase's existing
  convention — editor/dashboard components aren't unit-tested either).
  Verified by running the dev server and exercising the golden path +
  edge cases above, per this project's UI-testing guidance.

## CLAUDE.md updates

Already applied as part of this brainstorming session (not deferred): the
"What this is" section now documents the 5-subsystem MVP roadmap and
reverses the earlier out-of-scope call on measurement-grid screens and
"Bases do ateliê". A further update is needed once this design is
implemented: document the `PageHeader` extraction and the new
`/api/account/*` routes in the Architecture section, the same way the
dashboard's routes and store got documented after that migration shipped.
