# MoldAI

AI-powered 2D pattern editor (chat → GarmentSpec → sewing pieces). Next.js 16 (App Router) + TypeScript, real auth (Auth.js v5 + Postgres/Prisma), and per-user molde persistence (Postgres/Prisma). Only billing/credits remain a mock top-up (Phase C pending).

## Prerequisites

- Node 22 (host flow) and/or Docker Desktop (containerized flow).
- `.env.local` at the repo root with:
  - `ANTHROPIC_API_KEY` — Anthropic API key (chat uses `claude-sonnet-5`).
  - `AUTH_SECRET` — Auth.js secret (`npx auth secret` or `openssl rand -base64 32`).
  - `DATABASE_URL` — `postgresql://moldai:moldai@localhost:5433/moldai?schema=public` (host flow).

## Run with Docker (app + Postgres together)

```bash
npm run docker:up     # dev, hot reload — http://localhost:3000
npm run docker:prod   # production image (next start)
```

One command brings up the app and Postgres; the entrypoint applies migrations and seeds the dev accounts. Inside the container the app talks to Postgres at `db:5432`; secrets come from `.env.local` at runtime (never baked into the image).

> After changing dependencies (`package.json`), recreate the anonymous `node_modules` volume: `docker compose down -v` (or `docker compose up --build --renew-anon-volumes`).

## Run on the host (without containerizing the app)

```bash
npm run db:up        # bring up Postgres only (Docker), host port 5433
npm run db:migrate   # apply Prisma migrations
npm run db:seed      # seed dev accounts
npm run dev          # app at http://localhost:3000
```

## Login (seeded dev accounts)

`dev@moldai.local` / `moldai-dev`. Self-signup doesn't exist yet (shown as "em breve").

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
