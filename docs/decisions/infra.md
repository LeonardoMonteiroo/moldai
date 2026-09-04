# Infra: formatting, lint, hooks

> This is the _why_. For the operative rule, see [`../architecture/infra.md`](../architecture/infra.md).
> For universal, cross-cutting rules, see the root [`CLAUDE.md`](../../CLAUDE.md).

## Formatting and lint: local must predict CI

It exists because `pre-commit` only formats **staged** files (lint-staged), which leaves three holes that all happened: a merge commit (lint-staged's stash-based flow is unsafe mid-merge, so merge commits routinely skip it), any `--no-verify`, and — the real one — **nothing ever checked the tree as a whole**, so CI was the first thing to look at the repository. That is the entire mechanism behind the recurring "prettier passes locally, CI fails": not a difference between the two prettiers (same 3.9.6, same config, no CRLF involved), but a file no local command had ever been asked about.

`set -e`'s load-bearing role was pinned by breaking each check on purpose and confirming the hook fails; do that again if a third check is added.

While only prettier ignored `.claude/`/`.agents/skills/`/`docs/design/screens/`, `npm run lint` reported 10 errors and 13 warnings from vendored agent tooling and the design handoff's own editor runtime — none of it this repo's code, none of it actionable — while CI, which lints `app lib components`, stayed green.

The `docs/reference/tshirt-benchmark/comparison-report.md` prettier-only exception: that file is rewritten by `lib/draft/tshirtBenchmark.test.ts` on **every** test run, unpadded, so leaving prettier to pad it made `npm test` itself dirty the tree and fail the push hook's `format:check` for a reason unrelated to anything the developer changed.

## Commands

```bash
npm run dev      # start dev server (Turbopack) at http://localhost:3000
npm run build    # production build (also runs the TypeScript check)
npm run lint     # eslint
npm test         # vitest run — two projects (see vitest.workspace.ts)
                 #   node: lib/**/*.test.{ts,tsx} + app/**/*.test.{ts,tsx}  (pure logic, no DOM)
                 #   dom:  components/**/*.test.{ts,tsx}                    (jsdom + React Testing Library)
                 # scope one: npx vitest run --project dom
npm run db:up          # bring up local Postgres + Redis (docker compose up -d db redis), host ports 5433 / 6380
npm run db:migrate     # apply Prisma migrations
npm run docker:up     # bring up app + Postgres together in Docker (dev, hot reload) at http://localhost:3000
npm run docker:prod   # bring up the production image (next start) + Postgres
npm run smoke:prod    # brings up the prod stack and does a REAL login (catches regressions like UntrustedHost)
npm run smoke         # just the HTTP login checker, against a server already running (SMOKE_URL)
```

Also in `package.json`: `test:watch`, `typecheck`, `format`/`format:check`, `cron:renew` (one wallet-renewal sweep — see Billing). There is no seed script anymore — a dev account is created the same way a production one is, through `/signup`, then confirmed via the verification link in Mailpit's inbox at `:8025` (dev stack only). `smoke`/`smoke:prod` therefore need `SMOKE_EMAIL`/`SMOKE_PASSWORD` pointed at an account created that way.

**Docker vs host:** Inside the container, the app talks to Postgres at `db:5432` (Docker Compose DNS) and Redis at `redis:6379`. On the host — dev stack only, see below — Postgres is at `localhost:5433` and Redis at `localhost:6380`. Secrets (`.env.local`) come in via `env_file` at runtime — never baked into the image — and the npm docker scripts also pass `.env.local` as `--env-file`, since Compose's own `${VAR}` interpolation in `docker-compose.yml` (below) reads a project-level env file, not each service's `env_file:`. A third compose service, `cron`, runs the hourly wallet-renewal loop (defined in `docker-compose.yml`, so it runs in both the dev and prod stacks). **`docker-compose.prod.yml` overrides `cron` to build the `runner` target** (`#73`) — the base file's `dev` target carries no application code (it's bind-mounted in at runtime), so on an image-only deploy host the loop found nothing to run; `cron` also gets `restart: unless-stopped` there, matching `app`/`db`/`redis`, and its own entrypoint (`docker-entrypoint-cron.sh`, waits for Postgres but skips `prisma migrate deploy`) so it no longer races the app container's migration on every stack start. The base `app` service also carries a `healthcheck` now (`GET /api/health` via Node's own `fetch`, `#100`) — `restart:` alone only reacts to the process exiting, not to one that's up but wedged. A fourth base-compose service, `redis`, backs rate limiting in both the dev and prod stacks. `docker-compose.override.yml` adds a dev-only **Mailpit** (SMTP **1025**, web inbox at **:8025**) and points the app's `SMTP_*` at it; Compose auto-merges an override file for a bare `docker compose up` (`npm run docker:up`) and ignores it for the explicit two-file prod stack (`npm run docker:prod`), so production never gets Mailpit. `.env.example` documents every variable.

**`db`/`redis` publish to the host only in the dev stack.** `POSTGRES_PASSWORD`/`REDIS_PASSWORD` have no default in `docker-compose.yml` (`${VAR:?...}`) — `docker compose up` fails loudly if either is unset, rather than the committed `moldai`/no-password dev defaults silently reaching a real deploy. `docker-compose.prod.yml` additionally resets both services' `ports:` to nothing: Docker's published ports bind `0.0.0.0` and its iptables `DOCKER` chain bypasses `ufw`, so a host-published db/redis on a VPS is reachable from the internet regardless of any firewall rule — an unauthenticated-before-this-fix Redis in particular is both a `FLUSHALL`-away rate-limiter kill switch (`consume()` fails open) and, via `CONFIG SET dir/dbfilename`, a known RCE primitive. Production reaches both exclusively over the compose network; the host ports (`5433`/`6380`) exist only for the dev stack's local inspection convenience.

**Two dev-stack traps, both bind-mount-related and neither an app bug.** Turbopack's watcher misses edits through the Windows bind mount and the HMR socket never handshakes, so `docker restart moldai-app` after editing (or run `npm run dev` on the host instead). Worse, one route silently isn't served: **`POST /api/patterns/[id]/conflict/resolve` answers 404 in the Docker dev stack**, so the seam-conflict buttons ("Corrigir manga" / "Ignorar") appear broken there. Measured, on a freshly rebuilt container with renewed volumes: its depth-1 siblings (`[id]/generate`, `size-charts/[id]/activate`) and a depth-2 route with no dynamic segment (`verify-email/resend`) all answer 401, so the guard is reached; only the route two static segments below a dynamic one — whose intermediate `conflict/` directory holds no `route.ts` — 404s. The same request answers 401 against `next dev` on the host, and `npm run build` lists the route, so verify anything touching it on the host, not in the container. (Cause unconfirmed: presumably Turbopack's route discovery over the mount.) Also: the container's `node_modules` and `.next` are anonymous volumes, so `--renew-anon-volumes` against a stale image resets dependencies to whatever that image baked — rebuild the image first (`docker compose up -d --build app`), then renew, or the app boots unable to resolve packages added since.

---
