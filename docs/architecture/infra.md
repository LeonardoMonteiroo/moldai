# Infra: formatting/lint gates, Docker, Compose

> For the why behind these rules, see [`../decisions/infra.md`](../decisions/infra.md).
> For universal, cross-cutting rules, see the root [`CLAUDE.md`](../../CLAUDE.md).

## Formatting and lint: local must predict CI

**`.husky/pre-push` runs `npm run format:check` and `npm run lint` over the whole tree** — the same two invocations `.github/workflows/ci.yml`'s `format` and `lint` jobs run, so a green pre-push means those two jobs are green. `pre-commit` only formats **staged** files (lint-staged), which is not the same guarantee.

**`set -e` in that hook is load-bearing.** Without it the hook returns only the last command's status, so a failing `format:check` followed by a passing `lint` exits 0 and the push goes through.

**`eslint.config.mjs`'s ignores must stay in step with `.prettierignore`.** Both exclude `.claude/`, `.agents/skills/` and `docs/design/screens/` — vendored agent tooling and the design handoff's own editor runtime that this repo doesn't own and can't fix. CI lints `app lib components` only, so **do not narrow CI's lint scope or widen the ignore list on one side only** — a local command that cannot predict CI gets worked around instead of fixed. The one entry that is deliberately prettier-only is `docs/reference/tshirt-benchmark/comparison-report.md`: it's rewritten by `lib/draft/tshirtBenchmark.test.ts` on **every** test run, unpadded, so leaving prettier to pad it made `npm test` itself dirty the tree. **A generated artifact is committed exactly as its generator emits it**, or the two fight forever.

Build, tests, migrations and the coverage gate deliberately stay CI-only: they need minutes and a Postgres service, and a push hook that slow gets bypassed.

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

Also in `package.json`: `test:watch`, `typecheck`, `format`/`format:check`, `cron:renew`. **There is no seed script** — a dev account is created the same way a production one is, through `/signup`, then confirmed via the link in Mailpit's inbox at `:8025` (dev stack only). `smoke`/`smoke:prod` therefore need `SMOKE_EMAIL`/`SMOKE_PASSWORD` pointed at an account created that way.

**Docker vs host:** inside the container the app reaches Postgres at `db:5432` and Redis at `redis:6379`; on the host (dev stack only) they are `localhost:5433` and `localhost:6380`. Secrets come in via `env_file` at runtime — **never baked into the image** — and the npm docker scripts also pass `.env.local` as `--env-file`, since Compose's own `${VAR}` interpolation reads a project-level env file, not each service's `env_file:`. `.env.example` documents every variable.

**Compose services.** `cron` runs the hourly wallet-renewal loop in both stacks; **`docker-compose.prod.yml` overrides it to build the `runner` target**, because the base `dev` target carries no application code (it's bind-mounted at runtime). It also gets `restart: unless-stopped` there and its own entrypoint that skips `prisma migrate deploy`. `app` carries a `healthcheck` (`GET /api/health`). `redis` backs rate limiting in both stacks (see [`rate-limiting.md`](rate-limiting.md)). `docker-compose.override.yml` adds a dev-only **Mailpit** (SMTP 1025, inbox at :8025); Compose auto-merges it for a bare `docker compose up` and ignores it for the explicit two-file prod stack, **so production never gets Mailpit.**

**`db`/`redis` publish to the host only in the dev stack.** `POSTGRES_PASSWORD`/`REDIS_PASSWORD` have no default (`${VAR:?...}`). `docker-compose.prod.yml` additionally resets both services' `ports:` to nothing: **Docker's published ports bind `0.0.0.0` and its iptables `DOCKER` chain bypasses `ufw`**, so production reaches both exclusively over the compose network.

**Two dev-stack traps, both bind-mount-related and neither an app bug:**

1. Turbopack's watcher misses edits through the Windows bind mount and the HMR socket never handshakes — `docker restart moldai-app` after editing, or run `npm run dev` on the host instead.
2. **`POST /api/patterns/[id]/conflict/resolve` answers 404 in the Docker dev stack**, so the seam-conflict buttons appear broken there. The same request answers 401 against `next dev` on the host, and `npm run build` lists the route. **Verify anything touching it on the host, not in the container.**

Also: the container's `node_modules` and `.next` are anonymous volumes, so `--renew-anon-volumes` against a stale image resets dependencies to whatever that image baked — **rebuild the image first** (`docker compose up -d --build app`), then renew.
