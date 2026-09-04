# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It is deliberately short — an index and a set of non-negotiables, not the full rulebook. Subsystem detail lives in `docs/architecture/`; read the topic file for whatever you're touching before you touch it.

## Project stage, and how these docs work

This project is early-stage. **This file, together with `docs/architecture/*.md`, `docs/decisions/*.md`, and `docs/learnings/*.md`, is the source of truth for documented decisions/architecture.** If a user request conflicts with something stated in these docs (an architecture choice, a scope boundary, a convention), don't silently follow the new request or silently keep the old one — ask the user whether the docs should be updated to reflect the change before proceeding.

**Four tiers, four jobs:**

- **`CLAUDE.md` (this file)** — universal rules that apply regardless of what you're touching, plus the map below telling you where to read more. Loaded every session; keep it that way.
- **`docs/architecture/<topic>.md`** — the operative rules for one subsystem. Read the matching file _before_ working in that subsystem.
- **`docs/decisions/<topic>.md`** — the _why_: what shipped broken, what was measured, why a decision went the way it did. Read the matching file before you change or argue with a rule, or when a bug looks like it might be a repeat of one already paid for. Same filename as its architecture counterpart, so a rule and its rationale are always one predictable path apart.
- **`docs/learnings/<topic>.md`** — agent-facing session notes: hook/tooling gotchas, silent failures, dev-stack traps, dead ends already tried. Not rules, not rationale — just what a session would otherwise waste time rediscovering. Same filename convention; see [`docs/learnings/README.md`](docs/learnings/README.md) for the scope boundary and entry format.

**When a change makes a rule wrong, fix it where it lives** — in the architecture file if the rule itself changed, in the decisions file if you're recording why, in the learnings file if it's a repo-operating gotcha worth saving for next session. A learning that hardens into something every agent must follow moves into the architecture file and is deleted from `learnings/`, not kept in both places. A rule nobody trusts is worse than no rule; several claims here had drifted from the code before this split existed (a screen's import block called an "inert placeholder" long after it shipped real, a rate-limit table missing two buckets, a token scale that had grown a step) — that's what regular auditing is for.

## Document map

Read the matching file before touching the area in its trigger column. This table is the retrieval mechanism — if you can't find a topic here, it's likely covered by a non-negotiable below instead.

| Topic                                                                                | Read when touching                                                           |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [`docs/architecture/overview.md`](docs/architecture/overview.md)                     | Getting oriented; what's shipped vs. scoped out                              |
| [`docs/architecture/conventions.md`](docs/architecture/conventions.md)               | Any UI copy, commit message, or new domain term                              |
| [`docs/architecture/design-system.md`](docs/architecture/design-system.md)           | `app/globals.css`, `components/ui/*`, any styling, `AppShell`/`PageHeader`   |
| [`docs/architecture/testing.md`](docs/architecture/testing.md)                       | Any `*.test.ts(x)`, `vi.mock`, or component test                             |
| [`docs/architecture/infra.md`](docs/architecture/infra.md)                           | `docker-compose*.yml`, `.husky/`, `eslint.config.mjs`, `.prettierignore`, CI |
| [`docs/architecture/design-handoff.md`](docs/architecture/design-handoff.md)         | `docs/design/`, a screenshot-alignment pass, `scripts/design-review/`        |
| [`docs/architecture/data-layer.md`](docs/architecture/data-layer.md)                 | `lib/db/pattern.ts`, `lib/editor/state.ts`, `Pattern`'s Prisma shape         |
| [`docs/architecture/rate-limiting.md`](docs/architecture/rate-limiting.md)           | `lib/rate-limit/*`, any new sensitive endpoint                               |
| [`docs/architecture/observability.md`](docs/architecture/observability.md)           | `lib/observability/`, `lib/security/headers.ts`, `/api/health`               |
| [`docs/architecture/seo.md`](docs/architecture/seo.md)                               | `lib/seo/*`, `app/robots.ts`, `app/sitemap.ts`, metadata                     |
| [`docs/architecture/auth.md`](docs/architecture/auth.md)                             | `auth.ts`, `lib/auth/*`, anything Credentials or Google OAuth                |
| [`docs/architecture/billing.md`](docs/architecture/billing.md)                       | `lib/billing/*`, `Wallet`, `Transaction`, Stripe, any purchase/plan flow     |
| [`docs/architecture/api-routes.md`](docs/architecture/api-routes.md)                 | Any file under `app/api/*`                                                   |
| [`docs/architecture/generation-flow.md`](docs/architecture/generation-flow.md)       | `lib/ai/*`, `POST /api/patterns/[id]/generate`                               |
| [`docs/architecture/seams-and-assembly.md`](docs/architecture/seams-and-assembly.md) | `lib/draft/seams.ts`, `lib/draft/assembly.ts`, seam-conflict UI              |
| [`docs/architecture/drafting.md`](docs/architecture/drafting.md)                     | `lib/draft/*` (drafters, engine, vocabulary, measurements)                   |
| [`docs/architecture/size-charts.md`](docs/architecture/size-charts.md)               | `lib/sizeCharts/*`, `/size-charts`                                           |
| [`docs/architecture/slopers.md`](docs/architecture/slopers.md)                       | `lib/slopers/*`, `/slopers`                                                  |
| [`docs/architecture/client-state.md`](docs/architecture/client-state.md)             | Any Zustand store, `lib/api-client.ts`                                       |
| [`docs/architecture/screens.md`](docs/architecture/screens.md)                       | Any file under `app/` or `components/` that renders a full page              |
| [`docs/architecture/export.md`](docs/architecture/export.md)                         | `lib/export/*`, `/pattern/[id]/export`                                       |
| [`docs/architecture/i18n.md`](docs/architecture/i18n.md)                             | `messages/pt-BR.json`, `lib/i18n/*`, any wire error code                     |

Any row above may also have a `docs/learnings/<topic>.md` — read it alongside the architecture file when it exists, and append to it when a session learns something about working in that area (see the scope boundary in [`docs/learnings/README.md`](docs/learnings/README.md) before adding one).

**Before writing Next.js-specific code**, also see the version warning near the end of this file — `node_modules/next/dist/docs/` is the primary source, not training data.

## Non-negotiables

These are cross-cutting and must survive an agent that never opens a topic file. Each one has a full explanation in its topic file above — this is the one-line version.

- **Untrusted input is re-validated at its own trust boundary, never assumed safe.** `validateSpec` (AI + user size-chart input), `validateSizeChartPatch`, `validateExportPreset`, `parseBody`/`readJsonObject` — each drops or clamps, never throws on garbage, and none of them may be bypassed by a "the client already checked this" argument.
- **The wire and the database carry machine-readable codes, never pt-BR prose.** `{status, error: <code>}`; the client resolves the code through the i18n catalog.
- **Code identifiers, wire keys, Prisma models/columns and routes are English; UI display text is pt-BR.** Translate domain terms, don't transliterate them (`SizeChart`, not `Grade`).
- **UI labels come from catalog lookups keyed by the EN enum value**, never a hand-written label map.
- **Derive, don't store.** A value computable from a spec + frozen measurements (seam lengths, ease, sewing order, sloper geometry) is recomputed at render/request time, never persisted a second time.
- **Never a second copy of a fact that already has an owner.** `Wallet.planLabel` and `Pattern.savedAgo` both shipped and both had to be removed because nothing kept them in sync with the field they duplicated.
- **A persisted-blob or Prisma-schema shape change is the expensive kind of change.** Before editing `PatternState`/`EditorState`/`SizeChartData`/`Measurements`/`prisma/schema.prisma`, or adding a migration, invoke the `migration-safety` agent.
- **Every `app/api/*` route is `requireUser()`-gated**, with exactly six named exceptions (signup, email verification, password reset, `/api/health`, the Stripe webhook, NextAuth's own handlers) — see [`api-routes.md`](docs/architecture/api-routes.md).
- **Every pattern-scoped DB query is `(patternId, userId)`-scoped and returns `null`/`false`, never throws** — a route turns that into a uniform 404, never distinguishing "not found" from "not yours."
- **The only lock order across `Pattern` and `Wallet` is Pattern first, then Wallet** (`withPatternAndWallet`) — reversing it is how you get a deadlock.
- **The rate limiter fails open.** A Redis outage means throttling is briefly lost, never that the app locks everyone out.
- **Surface feature limitations on-screen, never silently.** "Em breve" for planned work, disabled+badged over hidden, an explicit note over a silent no-op.
- **Type comes from the named `--text-*` scale, never `text-[Npx]`.** Tokens live in `app/globals.css`, never a hardcoded hex.
- **No direct `fetch()` in components** — every server call goes through `lib/api-client.ts`.
- **An icon-only control carries both `aria-label` and `title`**, resolved from the same catalog key.
- **A control must not rewrite what you typed.** Commit on blur/Enter, validate, reject or clamp with feedback — never reformat every keystroke.
- **Tests assert against the exported `ptBR` catalog object, never a pasted literal** — `next-intl` doesn't throw on a missing key, so a substring/regex assertion is vacuous.
- **A `vi.mock(...)` specifier must resolve to the same module the subject imports** — an `@/...` alias and a relative path to the same file are not interchangeable, and a mismatch fails silently (the mock never intercepts, the test just stops testing anything).

## Next.js version warning

@AGENTS.md

This project uses **Next.js 16**, which has breaking changes vs. older Next.js you may know from training data. Before writing Next.js-specific code (route handlers, config, App Router APIs), check `node_modules/next/dist/docs/` for the current conventions rather than assuming. `AGENTS.md` above is auto-regenerated by `next dev` — don't hand-edit it, just keep it committed.

## Commands

```bash
npm run dev      # start dev server (Turbopack) at http://localhost:3000
npm run build    # production build (also runs the TypeScript check)
npm run lint     # eslint
npm test         # vitest run — two projects (see vitest.workspace.ts)
                 #   node: lib/**/*.test.{ts,tsx} + app/**/*.test.{ts,tsx}  (pure logic, no DOM)
                 #   dom:  components/**/*.test.{ts,tsx}                    (jsdom + React Testing Library)
                 # scope one: npx vitest run --project dom
npm run db:up          # local Postgres + Redis (host ports 5433 / 6380)
npm run db:migrate     # apply Prisma migrations
npm run docker:up     # app + Postgres in Docker (dev, hot reload) at http://localhost:3000
npm run docker:prod   # the production image (next start) + Postgres
npm run smoke:prod    # brings up the prod stack and does a REAL login (catches regressions like UntrustedHost)
npm run smoke         # just the HTTP login checker, against a server already running (SMOKE_URL)
```

Also in `package.json`: `test:watch`, `typecheck`, `format`/`format:check`, `cron:renew`. **There is no seed script** — a dev account is created through `/signup`, confirmed via the link in Mailpit's inbox at `:8025` (dev stack only). Full Docker/Compose topology, dev-stack traps, and the formatting/lint CI-parity mechanism: [`docs/architecture/infra.md`](docs/architecture/infra.md).

## Architecture at a glance

- **Data layer:** pure logic + thin repositories. `lib/` is framework- and DB-free; `lib/db/*` is the only layer touching Prisma. Editor-state logic (`lib/editor/state.ts`), auth logic (`lib/auth/authorize.ts`), billing logic (`lib/billing/wallet.ts`) are all pure and unit-tested without a live DB. See [`data-layer.md`](docs/architecture/data-layer.md).
- **Client state:** five Zustand stores, one per screen family, none sharing an instance, each with its own load-vs-action error split. See [`client-state.md`](docs/architecture/client-state.md).
- **The core product pipeline:** chat → `lib/ai/*` (Anthropic call, forced tool-use) → `validateSpec` → `lib/draft/*` (the drafting engine, swappable behind `lib/draft/engine/facade.ts`) → seam graph (`lib/draft/seams.ts`) → persisted `Pattern` → `lib/export/*` (seven downloadable formats, client-side, no server call). See [`generation-flow.md`](docs/architecture/generation-flow.md), [`drafting.md`](docs/architecture/drafting.md), [`seams-and-assembly.md`](docs/architecture/seams-and-assembly.md), [`export.md`](docs/architecture/export.md).
- **API shape:** every route under `app/api/*`, `requireUser()`-gated, bodies parsed through `lib/api/body.ts`, errors as machine-readable codes. See [`api-routes.md`](docs/architecture/api-routes.md).
- **Money:** one `Wallet` + append-only `Transaction` ledger per account, real Stripe integration behind a mock-by-default flag, four invariants holding the whole thing together under concurrent/out-of-order webhooks. See [`billing.md`](docs/architecture/billing.md).
- **i18n:** single-locale pt-BR via `next-intl`, no routing; `lib/` takes an injected `Translate` resolver so it never imports `next-intl` directly. See [`i18n.md`](docs/architecture/i18n.md).
- **Screens:** every full-page route renders through `components/shared/AppShell.tsx`, with four centered-card exceptions (`/login`, `/signup`, `/verify`, `/onboarding`). See [`screens.md`](docs/architecture/screens.md).
