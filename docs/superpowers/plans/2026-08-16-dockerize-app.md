# Dockerizar a aplicação completa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir app Next.js + Postgres juntos com um comando (`docker compose up`), em dev (hot reload) por padrão e produção via override, mantendo o fluxo host intacto.

**Architecture:** Um `Dockerfile` multi-stage (`node:22-alpine`) com targets `dev` e `runner`; um `docker-entrypoint.sh` compartilhado que roda `prisma migrate deploy` + seed idempotente antes de iniciar o app; `docker-compose.yml` (dev: db+app, bind mount, hot reload) e `docker-compose.prod.yml` (override: target runner, sem bind mount). Segredos entram por `env_file: .env.local` em runtime; `DATABASE_URL` é sobrescrito para `db:5432` dentro da rede do compose.

**Tech Stack:** Docker + Docker Compose, Node 22 alpine, Next.js 16, Prisma v6, Postgres 16.

## Global Constraints

- **Branch:** todo o trabalho em `feat/dockerize-app` (a partir de `main`). Não commitar em `main`.
- **Aditivo:** o fluxo host (`npm run dev` + `docker compose up -d` só do db em `localhost:5433`, `npm test`) DEVE continuar funcionando. Não quebrar nada existente.
- **Segredos nunca na imagem:** `.env*` no `.dockerignore`; segredos só via `env_file`/`environment` em runtime. Nenhum valor de segredo em arquivo commitado.
- **DATABASE_URL no container = `postgresql://moldai:moldai@db:5432/moldai?schema=public`** (rede do compose), sobrescrito via `environment:` do serviço app. O host segue em `localhost:5433`.
- **Porta db mantém `5433:5432`** no host (comentário já existente no compose). App publica `3000:3000`.
- **Migrate/seed no startup:** entrypoint roda `prisma migrate deploy` (NÃO `migrate dev`) e `prisma db seed` (idempotente, upsert por email).
- **Prisma pinado em v6** (não mexer). `npm ci` com `--legacy-peer-deps`.
- **Verificação:** builds/compose são lentos (npm ci em alpine, next build) — aguardar. `npm test` no host continua verde. Commits terminam com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (heredoc Git Bash, não here-string PowerShell).
- **Nada de standalone:** prod usa `next start` com `node_modules` completo (o toolchain migrate/seed precisa disso).

---

## File Structure

| Arquivo                   | Responsabilidade                                           | Task  |
| ------------------------- | ---------------------------------------------------------- | ----- |
| `.dockerignore`           | Contexto de build enxuto; exclui segredos/artefatos        | 1     |
| `Dockerfile`              | Multi-stage: `deps` → `dev` / `build` → `runner`           | 2     |
| `docker-entrypoint.sh`    | Espera db, `migrate deploy` + seed, `exec` no CMD          | 2     |
| `docker-compose.yml`      | Dev: `db` (healthcheck) + `app` (dev, bind mount, polling) | 3     |
| `docker-compose.prod.yml` | Override: `app` target runner, sem bind mount              | 4     |
| `package.json`            | Scripts `docker:up` / `docker:prod`                        | 3 e 4 |
| `CLAUDE.md`               | Documenta o workflow dockerizado                           | 5     |

---

## Task 0: Branch

- [ ] **Step 1: Create the branch from main**

```bash
git checkout main && git checkout -b feat/dockerize-app
git branch --show-current   # → feat/dockerize-app
```

---

## Task 1: `.dockerignore`

**Files:**

- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

`.dockerignore`:

```
node_modules
.next
.git
.gitignore
.env*
.superpowers
docs
.claude
.vscode
npm-debug.log*
Dockerfile
docker-compose*.yml
.dockerignore
coverage
```

- [ ] **Step 2: Verify it excludes secrets and heavy dirs**

Run:

```bash
grep -qx ".env*" .dockerignore && grep -qx "node_modules" .dockerignore && grep -qx ".git" .dockerignore && echo OK
```

Expected: `OK` (secrets and heavy dirs excluded from the build context).

- [ ] **Step 3: Commit**

```bash
git add .dockerignore
git commit -m "chore(docker): .dockerignore (contexto enxuto, sem segredos)"
```

---

## Task 2: `Dockerfile` + `docker-entrypoint.sh`

**Files:**

- Create: `Dockerfile`, `docker-entrypoint.sh`

**Interfaces:**

- Produces: build targets `dev` and `runner`; a shared entrypoint that runs migrate+seed then execs the CMD.

- [ ] **Step 1: Create the entrypoint script**

`docker-entrypoint.sh`:

```sh
#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] aguardando o Postgres..."
  # pg_isready rejeita a query string (?schema=public); Prisma aceita.
  DB_URL_NOQ="${DATABASE_URL%%\?*}"
  until pg_isready -d "$DB_URL_NOQ" >/dev/null 2>&1; do
    sleep 1
  done
  echo "[entrypoint] Postgres pronto."
fi

echo "[entrypoint] aplicando migrações (prisma migrate deploy)..."
npx prisma migrate deploy

echo "[entrypoint] seed (idempotente)..."
npx prisma db seed || echo "[entrypoint] aviso: seed falhou, seguindo mesmo assim"

echo "[entrypoint] iniciando: $*"
exec "$@"
```

- [ ] **Step 2: Create the Dockerfile**

`Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

# ---- deps: instala node_modules (+ prisma generate via postinstall) ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps

# ---- dev: hot reload; o código vem por bind mount em runtime ----
FROM node:22-alpine AS dev
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl postgresql-client
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

# ---- build: gera o .next de produção ----
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: produção (next start + toolchain para migrate/seed) ----
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl postgresql-client
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/prisma ./prisma
# lib/ é necessário pelo prisma/seed.ts (importa ../lib/auth/hash) no entrypoint
COPY --from=build /app/lib ./lib
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]
```

- [ ] **Step 3: Build the dev target**

Run: `docker build --target dev -t moldai-app:dev .`
Expected: build succeeds (deps → dev), image `moldai-app:dev` created. (Slow on first run — npm ci in alpine.)

- [ ] **Step 4: Build the runner target**

Run: `docker build --target runner -t moldai-app:prod .`
Expected: build succeeds through `next build`. If `next build` fails complaining about a missing `AUTH_SECRET`/`DATABASE_URL`, re-run with placeholders:
`docker build --target runner --build-arg X=1 -t moldai-app:prod .` — and if that path is needed, add near the top of the `build` stage: `ENV AUTH_SECRET=build-placeholder` and `ENV DATABASE_URL=postgresql://u:p@localhost:5432/db` (build-only dummies; runtime values come from compose). Only add these if the build actually demands them.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-entrypoint.sh
git commit -m "feat(docker): Dockerfile multi-stage (dev/runner) + entrypoint (migrate+seed)"
```

---

## Task 3: `docker-compose.yml` (dev) + `docker:up` script

**Files:**

- Modify: `docker-compose.yml` (add `app` service + db healthcheck)
- Modify: `package.json` (add `docker:up` script)

**Interfaces:**

- Consumes: build target `dev` (Task 2); `.env.local` (secrets).

- [ ] **Step 1: Rewrite docker-compose.yml (dev = default)**

`docker-compose.yml` (full replacement):

```yaml
services:
  db:
    image: postgres:16
    container_name: moldai-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: moldai
      POSTGRES_PASSWORD: moldai
      POSTGRES_DB: moldai
    ports:
      # host 5433 (não 5432) para não colidir com outro Postgres local
      - "5433:5432"
    volumes:
      - moldai-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U moldai -d moldai"]
      interval: 5s
      timeout: 3s
      retries: 10

  app:
    build:
      context: .
      target: dev
    container_name: moldai-app
    depends_on:
      db:
        condition: service_healthy
    env_file:
      - .env.local
    environment:
      DATABASE_URL: postgresql://moldai:moldai@db:5432/moldai?schema=public
      WATCHPACK_POLLING: "true"
      CHOKIDAR_USEPOLLING: "true"
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next

volumes:
  moldai-pgdata:
```

- [ ] **Step 2: Add the docker:up script to package.json**

Add to `"scripts"`:

```json
"docker:up": "docker compose up --build"
```

- [ ] **Step 3: Ensure host port 3000 is free**

The docker app publishes `3000:3000`; a host `next dev` on 3000 would collide. Confirm nothing is listening on 3000 before the smoke:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 && echo " (algo respondendo em 3000 — pare-o antes do smoke)" || echo "3000 livre"
```

If something is responding, stop that host process first (it's a dev server started for testing).

- [ ] **Step 4: Bring the stack up (detached) and wait**

Run: `docker compose up -d --build`
Then wait for readiness (poll the app logs up to ~2 min):

```bash
for i in $(seq 1 40); do
  docker compose logs app 2>&1 | grep -qiE "Ready|started server|Local:" && { echo READY; break; }
  sleep 3
done
docker compose logs app 2>&1 | tail -20
```

Expected: entrypoint logs show "Postgres pronto", "aplicando migrações", "seed (idempotente)", then Next dev "Ready".

- [ ] **Step 5: Smoke — redirect + 401 + seeded login**

```bash
echo "GET / ->"; curl -s -o /dev/null -w "%{http_code} redir=%{redirect_url}\n" http://localhost:3000/
echo "GET /api/pattern ->"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/pattern
echo "GET /login ->"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
docker compose exec -T db psql -U moldai -d moldai -c 'select email from "User" order by email;'
```

Expected: `/` → `307 redir=…/login`; `/api/pattern` → `401`; `/login` → `200`; psql lists `atelier@moldai.local` and `dev@moldai.local` (migrate+seed ran inside the container against the compose db).

- [ ] **Step 6: Tear down**

Run: `docker compose down`
Expected: containers stopped/removed (the `moldai-pgdata` volume persists).

- [ ] **Step 7: Confirm host workflow still intact**

Run: `npm test`
Expected: full suite green (nothing about Docker touches the test path).

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml package.json
git commit -m "feat(docker): compose dev (app+db, hot reload, healthcheck) + script docker:up"
```

---

## Task 4: `docker-compose.prod.yml` (override) + `docker:prod` script

**Files:**

- Create: `docker-compose.prod.yml`
- Modify: `package.json` (add `docker:prod` script)

**Interfaces:**

- Consumes: build target `runner` (Task 2); the base `docker-compose.yml` (Task 3).

- [ ] **Step 1: Create the prod override**

`docker-compose.prod.yml`:

```yaml
# Override de produção: docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
# Builda o target `runner` (next start) e remove os bind mounts de dev.
services:
  app:
    build:
      target: runner
    restart: unless-stopped
    volumes: !reset []
    environment:
      NODE_ENV: production
      WATCHPACK_POLLING: "false"
      CHOKIDAR_USEPOLLING: "false"
      DATABASE_URL: postgresql://moldai:moldai@db:5432/moldai?schema=public
```

(`!reset []` limpa a lista de volumes herdada do base — só assim os bind mounts de dev somem no prod. Requer Compose ≥ 2.24, presente no Docker atual.)

- [ ] **Step 2: Add the docker:prod script**

Add to `"scripts"`:

```json
"docker:prod": "docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build"
```

- [ ] **Step 3: Ensure 3000 is free, then bring prod up (detached)**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
for i in $(seq 1 40); do
  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs app 2>&1 | grep -qiE "Ready|started server|Local:" && { echo READY; break; }
  sleep 3
done
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs app 2>&1 | tail -20
```

Expected: entrypoint runs migrate+seed, then `next start` logs "Ready"/"started server".

- [ ] **Step 4: Smoke the prod stack**

```bash
echo "GET / ->"; curl -s -o /dev/null -w "%{http_code} redir=%{redirect_url}\n" http://localhost:3000/
echo "GET /login ->"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
```

Expected: `/` → `307 …/login`; `/login` → `200`.

- [ ] **Step 5: Tear down**

Run: `docker compose -f docker-compose.yml -f docker-compose.prod.yml down`
Expected: containers removed; `moldai-pgdata` persists.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.prod.yml package.json
git commit -m "feat(docker): override de produção (runner/next start) + script docker:prod"
```

---

## Task 5: Docs (CLAUDE.md + README.md)

**Files:**

- Modify: `CLAUDE.md`
- Modify: `README.md` (substituição completa — hoje é boilerplate do create-next-app, impreciso)

- [ ] **Step 1: Add a docker note to CLAUDE.md's Commands section**

No bloco de comandos do `CLAUDE.md` (junto de `npm run dev`, `db:up`, etc.), acrescentar:

```
npm run docker:up     # sobe app + Postgres juntos no Docker (dev, hot reload) em http://localhost:3000
npm run docker:prod   # sobe a imagem de produção (next start) + Postgres
```

E uma frase curta explicando que o fluxo host (`npm run dev` + `docker compose up -d` só do db) continua válido; no container o app fala com o Postgres em `db:5432`, no host em `localhost:5433`; segredos vêm de `.env.local` em runtime (nunca embutidos na imagem).

- [ ] **Step 2: Verify the CLAUDE.md note is present and accurate**

Run: `grep -nE "docker:up|docker:prod|db:5432|localhost:5433" CLAUDE.md`
Expected: matches confirming the new note (docker:up/docker:prod scripts and the dual DATABASE_URL host explanation).

- [ ] **Step 3: Replace README.md with a MoldAI-accurate version**

`README.md` (full replacement — verbatim):

````markdown
# MoldAI

Editor de moldes 2D com IA (chat → GarmentSpec → peças de costura). Next.js 16 (App Router) + TypeScript, auth real (Auth.js v5 + Postgres/Prisma). O backend de molde/chat/créditos ainda é um mock in-memory (Fase B pendente).

## Pré-requisitos

- Node 22 (fluxo host) e/ou Docker Desktop (fluxo em container).
- `.env.local` na raiz com:
  - `ANTHROPIC_API_KEY` — chave da API Anthropic (o chat usa `claude-sonnet-5`).
  - `AUTH_SECRET` — segredo do Auth.js (`npx auth secret` ou `openssl rand -base64 32`).
  - `DATABASE_URL` — `postgresql://moldai:moldai@localhost:5433/moldai?schema=public` (fluxo host).

## Rodar com Docker (app + Postgres juntos)

```bash
npm run docker:up     # dev, hot reload — http://localhost:3000
npm run docker:prod   # imagem de produção (next start)
```

Um comando sobe o app e o Postgres; o entrypoint aplica as migrações e semeia as contas dev. No container o app fala com o Postgres em `db:5432`; os segredos vêm de `.env.local` em runtime (nunca embutidos na imagem).

## Rodar no host (sem containerizar o app)

```bash
npm run db:up        # sobe só o Postgres (Docker), porta host 5433
npm run db:migrate   # aplica migrações Prisma
npm run db:seed      # semeia contas dev
npm run dev          # app em http://localhost:3000
```

## Login (contas dev semeadas)

`dev@moldai.local` / `moldai-dev`. Self-signup ainda não existe ("em breve").

## Testes e build

```bash
npm test             # vitest (não precisa de Postgres rodando)
npm run build        # build de produção + checagem TypeScript
```

## Arquitetura

Veja `CLAUDE.md` para as decisões de arquitetura. Auth e usuários são reais (Postgres/Prisma); molde/chat/créditos são um mock in-memory até a Fase B.
````

- [ ] **Step 4: Verify README is accurate (no stale boilerplate)**

Run: `grep -niE "create-next-app|geist|vercel" README.md || echo "sem boilerplate"`
Expected: `sem boilerplate` (o texto padrão do create-next-app foi removido).
Run: `grep -nE "docker:up|docker:prod|dev@moldai.local" README.md`
Expected: matches confirmando o novo conteúdo.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: CLAUDE.md + README documentam o workflow dockerizado (docker:up/docker:prod)"
```

---

## Verification (whole branch)

- `npm run docker:up` (ou `docker compose up --build`): app em `http://localhost:3000`, `/` → 307 `/login`, `/api/pattern` → 401, login `dev@moldai.local`/`moldai-dev` funciona (migrate+seed rodaram no container); editar um arquivo faz hot reload.
- `npm run docker:prod`: imagem de produção serve o mesmo em `localhost:3000`.
- Host inalterado: `npm test` verde; `npm run dev` na máquina ainda funciona apontando p/ `localhost:5433`.
- Nenhum `.env*` nas camadas da imagem (excluído no `.dockerignore`; segredos só via `env_file` em runtime).

## Notes / não implementar nesta fase

- Deploy em nuvem/registry, otimização de tamanho da imagem prod (separar migrate/seed do runtime), multi-arch — fora de escopo.
