# MoldAI

AI-powered 2D pattern editor (chat → GarmentSpec → sewing pieces). Next.js 16 (App Router) + TypeScript, real auth (Auth.js v5 + Postgres/Prisma), and per-user molde persistence (Postgres/Prisma). Only billing/credits remain a mock top-up (Phase C pending).

## Prerequisites

- Node 22 (host flow) and/or Docker Desktop (containerized flow).
- `.env.local` at the repo root with:
  - `ANTHROPIC_API_KEY` — Anthropic API key (chat uses `claude-sonnet-5`).
  - `AUTH_SECRET` — Auth.js secret (`npx auth secret` or `openssl rand -base64 32`).
  - `POSTGRES_PASSWORD` / `REDIS_PASSWORD` — required, no default (`openssl rand -hex 20` each). The Docker stack fails to start without them rather than falling back to a weak, previously-committed password.
  - `DATABASE_URL` — `postgresql://moldai:<POSTGRES_PASSWORD>@localhost:5433/moldai?schema=public` (host flow; must carry the same password as `POSTGRES_PASSWORD` above).

## Run with Docker (app + Postgres together)

```bash
npm run docker:up     # dev, hot reload — http://localhost:3000
npm run docker:prod   # production image (next start)
```

One command brings up the app and Postgres; the entrypoint applies migrations. Inside the container the app talks to Postgres at `db:5432` and Redis at `redis:6379`; secrets come from `.env.local` at runtime (never baked into the image, and also passed as `--env-file` so Compose can resolve the `${POSTGRES_PASSWORD}`/`${REDIS_PASSWORD}` placeholders in `docker-compose.yml` itself).

The dev stack (`npm run docker:up`) publishes `db`/`redis` to the host (`localhost:5433`/`localhost:6380`) for local inspection. **The production stack does not** — `docker-compose.prod.yml` resets both to no published ports, since a host-published database/cache on a public VPS is reachable from the internet regardless of any firewall rule (Docker's published ports bind `0.0.0.0` and bypass `ufw`). Production reaches both only over the compose network.

> After changing dependencies (`package.json`), recreate the anonymous `node_modules` volume: `docker compose down -v` (or `docker compose up --build --renew-anon-volumes`).

## Run on the host (without containerizing the app)

```bash
npm run db:up        # bring up Postgres + Redis (Docker), host ports 5433 / 6380
npm run db:migrate   # apply Prisma migrations
npm run dev          # app at http://localhost:3000
```

Without Redis running, every rate-limit check hits its fail-open branch (`[rate-limit] … failing open` in the console) — signup/login stay functional but unthrottled. `db:up` starts both so the host flow isn't silently unprotected.

## Database inspection (DBHub MCP)

`Pattern.data` and `SizeChart.data` are JSON blob columns, so the real shape of persisted
data is invisible in `prisma/schema.prisma` — reading an actual row is the only way to
confirm a blob change didn't orphan existing data. The `moldai-db` MCP server (`.mcp.json`
plus `dbhub.toml`) exists for that, and it connects as a dedicated read-only role.

Create the role once, against the dev database. Generate a password first
(`openssl rand -hex 20`) and substitute it for `<password>` in both blocks below:

```bash
npm run db:up   # Postgres must be up first
docker exec -i moldai-db psql -U moldai -d moldai <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moldai_ro') THEN
    CREATE ROLE moldai_ro LOGIN PASSWORD '<password>'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE moldai TO moldai_ro;
GRANT USAGE   ON SCHEMA   public TO moldai_ro;
GRANT SELECT  ON ALL TABLES IN SCHEMA public TO moldai_ro;
REVOKE CREATE ON SCHEMA public FROM moldai_ro;

-- Prisma migrations create tables as `moldai`; this keeps future ones readable
-- without re-running the GRANT above.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO moldai_ro;
SQL
```

Then point the MCP server at it. `dbhub.toml` is safe to commit because it holds only a
variable reference (`${MOLDAI_DEV_DSN}`), never the credential — DBHub interpolates it
from the process environment at config load, so the value lives in your shell:

```powershell
[Environment]::SetEnvironmentVariable('MOLDAI_DEV_DSN',
  'postgres://moldai_ro:<password>@localhost:5433/moldai?sslmode=disable', 'User')
```

Restart the terminal **and** Claude Code afterwards — the variable is read at launch, so
reconnecting via `/mcp` alone won't pick it up. If either the variable or Postgres is
missing, DBHub exits non-zero before the stdio handshake and Claude Code reports only
`CONNECTION_CLOSED`; run the command from `.mcp.json` by hand to see the real error.

Read-only is enforced at two layers on Postgres (DBHub sets
`default_transaction_read_only` and wraps every execution in `BEGIN READ ONLY`, which
also blocks DDL). The `moldai_ro` grants above are the third layer, so a DBHub
misconfiguration still cannot write.

## Login

Create an account at `/signup`, then confirm it via the verification link — in the Docker dev stack, that mail lands in Mailpit at `http://localhost:8025`.

## Tests and build

```bash
npm test             # vitest (doesn't need Postgres running)
npm run build        # production build + TypeScript check
npm run smoke:prod   # brings up the production stack and does a real login (auth smoke test)
npm run smoke        # just the login checker, against a server already running (SMOKE_URL=...)
```

`smoke` runs the full login flow (CSRF → credentials → session) and requires a valid session at the end — it catches regressions a plain "home responded 200" check wouldn't (e.g. the `trustHost`/`UntrustedHost` issue that only breaks in production).

## Architecture

See `CLAUDE.md` for the architecture decisions. Auth, users, and the molde are real (Postgres/Prisma); billing/credits remain a mock top-up until Phase C.
