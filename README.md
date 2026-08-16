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

> Após mudar dependências (`package.json`), recrie o volume anônimo de `node_modules`: `docker compose down -v` (ou `docker compose up --build --renew-anon-volumes`).

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
npm run smoke:prod   # sobe o stack de produção e faz login de verdade (smoke de auth)
npm run smoke        # só o checador de login, contra um servidor já no ar (SMOKE_URL=...)
```

O `smoke` faz o fluxo de login completo (CSRF → credentials → sessão) e exige uma sessão válida no fim — pega regressões que um "a home respondeu 200" não pega (ex.: o `trustHost`/`UntrustedHost` que só quebra em produção).

## Arquitetura

Veja `CLAUDE.md` para as decisões de arquitetura. Auth e usuários são reais (Postgres/Prisma); molde/chat/créditos são um mock in-memory até a Fase B.
