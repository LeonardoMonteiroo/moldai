# Standard app shell — one frame, one header

**Date:** 2026-08-21
**Status:** approved, ready for implementation plan

## Problem

The header changes from screen to screen. Three of the four full-page screens already
render `components/shared/PageHeader.tsx`; the dashboard renders a second, divergent
header (`components/dashboard/DashboardTopbar.tsx`). The two are not merely styled
differently — they carry different capabilities:

- `DashboardTopbar` only: the account dropdown, which is the **only** navigation to
  `/settings?section=plan|profile|password|danger`, plus a credits _pill_ (`Badge`).
- `PageHeader` only: `← Voltar`, title/subtitle, the credits progress **bar**,
  "Comprar créditos", and a standalone "Sair" button.

Separately, every screen re-implements its own page frame: each `page.tsx` wraps its
shell in `<div className="flex min-h-0 flex-1 flex-col">` and each `*Shell` repeats the
same wrapper — eight duplications of the same scaffolding — and each shell decides for
itself where the header sits relative to its loading and error states.

The `Mold<span>AI</span>` wordmark is copy-pasted in five places.

## Goal

One standard system screen: a single frame component that owns the header, so no screen
can hand-roll one. Keep the editor's header (`PageHeader`) as the single header, merged
with the capabilities `DashboardTopbar` had, losing nothing.

## Decisions taken during brainstorming

| Question                                                                            | Decision                                                               |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Scope                                                                               | A shared `AppShell` frame + one header, not just a header swap.        |
| A persistent global nav sidebar on every screen?                                    | **No.** Each screen keeps the nav column it owns today.                |
| Does the editor get a nav column?                                                   | No — it stays a full-bleed workspace (chat + canvas + footer).         |
| Where do the `/settings` sections get reached from, once `DashboardTopbar` is gone? | The account dropdown folds into `PageHeader`, triggered by the avatar. |
| `/settings` sidebar                                                                 | Unchanged — it is the sidebar that screen passes to `AppShell`.        |
| Wordmark                                                                            | Extracted to a shared component.                                       |
| Auth screens (`/login`, `/signup`, `/verify`)                                       | Out of scope — centered cards with no header, a different frame.       |

## Architecture

### `components/shared/Wordmark.tsx`

The `Mold<span className="text-olive">AI</span>` lockup with its
`font-display text-title tracking-wordmark font-bold` treatment. One presentational
component, no props. Replaces five copies: `PageHeader`, `DashboardTopbar` (deleted),
`app/login/page.tsx`, `app/signup/page.tsx`, `app/verify/page.tsx`.

The auth screens stay out of `AppShell`, but they still consume `Wordmark` — it is the
brand lockup, not part of the app frame.

### `components/shared/AppShell.tsx`

The standard system screen. Every full-page screen renders through it.

```tsx
<AppShell
  title={string}
  subtitle={string | undefined}
  backHref={string | undefined}
  credits={Credits | null}
  userEmail={string}
  sidebar={ReactNode | undefined}
  footer={ReactNode | undefined}
>
  {children}
</AppShell>
```

It constructs `PageHeader` internally from
`title`/`subtitle`/`backHref`/`credits`/`userEmail` — screens pass data, never a header
element. That is what makes the convention enforceable rather than merely documented.

Layout it owns:

- the outer `flex min-h-0 flex-1 flex-col` column (removing the duplicate wrappers in
  every `page.tsx` and every `*Shell`),
- the header row,
- a `flex min-h-0 flex-1` body row: the `sidebar` node (when passed) then the content
  region holding `children`,
- the `footer` node below the body, when passed.

`AppShell` does not own the sidebar's own chrome
(`w-[186px] border-r bg-surface p-[14px]`) — that stays with each sidebar component,
since the two existing sidebars already agree on it.

### `components/shared/PageHeader.tsx` — absorbs `DashboardTopbar`

| Change                                  | Detail                                                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avatar becomes a `DropdownMenu` trigger | Menu carries the truncated email label, then `Créditos e uso` / `Plano e cobrança` / `Preferências`, a separator, and `Sair` — the items `DashboardTopbar` had. |
| Standalone "Sair" `Button`              | Removed; it is the menu's last item.                                                                                                                            |
| Credits pill (`Badge variant="notice"`) | Removed. The progress bar is the single representation of balance.                                                                                              |
| `credits` prop                          | Widens to `Credits \| null`. When null, the bar and "Comprar créditos" are omitted — the dashboard's transient pre-fetch window.                                |
| `backHref?: string`                     | The `← Voltar` button renders only when passed. `/` does not pass it.                                                                                           |

The avatar must keep an accessible name. `DashboardTopbar` already documents that
`aria-hidden` on a glyph did not keep it out of the computed name and that the trigger
states its label explicitly; the merged trigger keeps an explicit `aria-label` for the
same reason.

i18n: the `DashboardTopbar` namespace's menu keys move into the `PageHeader` namespace
(`usageMenuItem`, `planMenuItem`, `preferencesMenuItem`, `accountMenuLabel`); the
namespace's `signOutMenuItem` collapses into `PageHeader.signOutButton`, and
`creditsPill` is dropped with the pill. The `DashboardTopbar` namespace is deleted.

### Per-screen wiring

| Screen          | title                                        | subtitle              | backHref          | sidebar           | footer   |
| --------------- | -------------------------------------------- | --------------------- | ----------------- | ----------------- | -------- |
| `/`             | `DashboardShell.title` — "Meus moldes" (new) | —                     | none (it is home) | `Sidebar`         | —        |
| `/pattern/[id]` | `pattern.name`                               | `Topbar.savedVersion` | `/`               | —                 | `Footer` |
| `/settings`     | `SettingsShell.title`                        | —                     | `/`               | `SettingsSidebar` | —        |
| `/size-charts`  | `SizeCharts.title`                           | `SizeCharts.subtitle` | `/`               | —                 | —        |

`components/editor/Topbar.tsx` — today a thin wrapper mapping a `Pattern` onto
`PageHeader` — is absorbed: `EditorShell` passes `pattern.name` and the formatted
`savedVersion` straight to `AppShell`. The `Topbar` i18n namespace keeps its
`savedVersion` key, now read by `EditorShell`.

### Loading and error states

`DashboardShell` currently early-returns a full-screen loading or error state that
replaces the header, so the chrome flickers in after the fetch resolves. Under
`AppShell` the header and sidebar are always painted and the loading/error states render
inside the content region — which is what `SizeChartsShell` already does.

`EditorShell` keeps its early return: the header's title _is_ the pattern name, so there
is nothing to render until the store is ready. This asymmetry is deliberate and is the
reason `AppShell` takes `title` as a required string rather than a nullable one.

The dashboard's `credits` arrive from `useDashboardStore` after `/api/account/summary`
resolves, hence `credits: Credits | null` on both `AppShell` and `PageHeader`. The other
three screens pass a value that is always present (server-loaded, or store-gated).

## Files

**New**

- `components/shared/AppShell.tsx`
- `components/shared/Wordmark.tsx`

**Modified**

- `components/shared/PageHeader.tsx` — dropdown, nullable credits, optional back, Wordmark
- `components/dashboard/DashboardShell.tsx` — render through `AppShell`, states move inside
- `components/settings/SettingsShell.tsx` — render through `AppShell`
- `components/size-charts/SizeChartsShell.tsx` — render through `AppShell`
- `components/editor/EditorShell.tsx` — render through `AppShell`, absorb `Topbar`
- `app/page.tsx`, `app/settings/page.tsx`, `app/size-charts/page.tsx`,
  `app/pattern/[id]/page.tsx` — drop the redundant wrapper div
- `app/login/page.tsx`, `app/signup/page.tsx`, `app/verify/page.tsx` — use `Wordmark`
- `messages/pt-BR.json` — merge namespaces, add `DashboardShell.title`
- `CLAUDE.md` — see below

**Deleted**

- `components/dashboard/DashboardTopbar.tsx`
- `components/editor/Topbar.tsx`

## CLAUDE.md changes

This work contradicts three documented decisions; the project-stage rule requires them to
be rewritten rather than silently diverged from. The user approved all three.

1. _"Reuse `components/shared/PageHeader.tsx` for any full-page screen's header … The
   editor's `Topbar` is a thin wrapper over it"_ → becomes: render every full-page screen
   through `components/shared/AppShell.tsx`, which owns the header; there is no per-screen
   header component.
2. The Dashboard bullet's _"`DashboardTopbar` (account-menu credit pill)"_ → the dashboard
   uses the same shell and header as every other screen.
3. _"`/settings` … reached only from the dashboard's account-menu — its three items
   ("Créditos e uso", "Plano e cobrança", "Preferências", in `DashboardTopbar.tsx`)"_ →
   the items live in the shared header's avatar menu and are reachable from every screen,
   including the editor, which previously had no route to settings.

## Non-goals

- No global/persistent nav sidebar. Explicitly rejected.
- No nav column in the editor.
- No change to what any sidebar contains, or to any content region's internals.
- Auth screens keep their centered-card frame; they gain only `Wordmark`.
- No new abstraction beyond `AppShell` + `Wordmark` — no slot system, no header registry.

## Test harness (added to this scope)

The repo had no way to test a component: `vitest.config.ts` was `environment: "node"` with
`include: ["lib/**/*.test.ts", "app/**/*.test.ts"]`. This work adds one.

`vitest.config.ts` is replaced by `vitest.workspace.ts` with **two projects**, so the 20+
existing pure-logic suites keep running exactly as they do today and never load the DOM
setup file:

- `node` — `lib/**/*.test.ts` + `app/**/*.test.ts`, no setup file. Unchanged.
- `dom` — `components/**/*.test.tsx`, jsdom, `vitest.setup.ts`.

`vitest.setup.ts` installs the jest-dom matchers, RTL auto-cleanup, and the browser APIs
jsdom lacks that the Radix primitives in `components/ui/` call: `ResizeObserver`, pointer
capture, `scrollIntoView`, `matchMedia`.

`components/test-utils.tsx` exports `renderWithIntl`, which wraps the tree in
`NextIntlClientProvider` with the **real** `messages/pt-BR.json` rather than a stub
translator — so a component reading a key that does not exist fails the test instead of
rendering the key name — plus the catalog itself as `ptBR`. Tests assert against `ptBR`
values, never against pasted pt-BR literals: the repo's no-hardcoded-display-text rule
applies to tests too, and it makes the suite catch catalog drift, which is exactly what
the `DashboardTopbar` → `PageHeader` namespace merge needs.

New devDependencies (installed with `--legacy-peer-deps`, as `Dockerfile` and CI do):
`jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`,
`@testing-library/user-event`. Both `Dockerfile` and `.github/workflows/ci.yml` run
`npm ci --legacy-peer-deps` **without** `--omit=dev`, so `next build`'s typecheck resolves
the test files' imports.

Coverage: `Wordmark`, `PageHeader` (back button opt-in, nullable credits, the account
menu reaching all three settings sections and sign out) and `AppShell` (title, children,
sidebar/footer slots) directly; `DashboardShell`'s header-and-nav-painted-before-the-fetch
behavior. The dashboard's _resolved_ state renders `PatternGrid` (Radix `Select`) and is
left to the manual pass.

## Verification

- `npm run build` (the TypeScript check; bare `tsc` reports a spurious `app/layout.tsx`
  `LayoutProps` error under Next 16).
- `npm run lint -- app lib components` (scoped: a repo-root run crawls nested worktrees).
- `npm test` — now two Vitest projects (`vitest.workspace.ts`): the pre-existing `node`
  suite over `lib/*` and `app/api/**`, plus a new `dom` project (jsdom + React Testing
  Library) over `components/**/*.test.tsx`. The harness is added as part of this work
  (see below) and covers `Wordmark`, `PageHeader` and `AppShell` directly, plus the
  dashboard's header-stays-painted-during-loading behavior.
- Manual pass on the host dev server (`npm run dev`, not the Docker dev stack) over all
  four screens plus the three auth screens: header identical everywhere, avatar menu
  reaches all three settings sections from each screen, `← Voltar` absent on `/` and
  present elsewhere, dashboard header stable across its loading window.
