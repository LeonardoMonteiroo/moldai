# Backend real — Fase A: Auth / contas (design)

**Data:** 2026-08-16
**Status:** aprovado (brainstorming)
**Roadmap:** "Backend real" = A (auth) → B (persistência) → C (billing). Este spec cobre **apenas a Fase A**. B e C recebem seus próprios ciclos spec → plan → implementação.

## 1. Contexto e mudança de arquitetura

Hoje o CLAUDE.md documenta, como decisão fonte-da-verdade: _"Everything server-side is a mock… there is no database… there is no auth."_ Esta fase **reverte deliberadamente a parte de auth e introduz um banco real**, com a aprovação do usuário. O restante do backend (patterns, chat, créditos) **permanece mock in-memory** até a Fase B.

Alvo de realidade: **local-real (dev)** — banco e auth de verdade, rodando na máquina do desenvolvedor, sem nuvem, sem custo, sem deploy.

## 2. Escopo

### A Fase A entrega

- Um store real de usuários em **Postgres** (via Prisma).
- **Login / logout** via Auth.js v5 (NextAuth), com contas **semeadas** (seed).
- O editor **atrás de autenticação**: usuário não logado é redirecionado para `/login`.
- Rotas de API mutantes protegidas (401 sem sessão).

### Fora de escopo da Fase A (adiado)

- **Auto-cadastro (signup)** — exibido na UI como "em breve".
- **Reset de senha** (exigiria serviço de email; não há no local).
- **Molde por usuário** — os dados de molde/chat/créditos continuam num estado global in-memory (`lib/mock-data.ts`). Logar **não** dá a cada usuário seu próprio molde ainda. → Fase B.
- **Billing/Stripe + ledger de créditos real** → Fase C.
- **OAuth / provedores sociais.**

### Limitação obrigatória na UI

Conforme regra do CLAUDE.md (_surface feature limitations on-screen_): o fato de o molde ainda ser compartilhado/global (não por usuário) e o cadastro ainda não existir devem aparecer explicitamente na tela — cadastro marcado **"em breve"**, e uma nota discreta de que o molde é compartilhado até a Fase B.

## 3. Stack e decisões

| Decisão       | Escolha                                                                                    | Porquê                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Banco         | **Postgres**, local via **Docker Compose**                                                 | Isolado, reproduzível, não polui a máquina. `DATABASE_URL` no `.env.local`.                                                                    |
| ORM           | **Prisma**                                                                                 | Caminho mais batido no ecossistema Next; schema declarativo + migrations; cresce bem na Fase B.                                                |
| Auth          | **Auth.js v5** (`next-auth@beta`), **Credentials provider** + **estratégia de sessão JWT** | Credentials não suporta sessão em DB no Auth.js → JWT em cookie httpOnly assinado. Sem PrismaAdapter (não usamos tabelas de OAuth/DB-session). |
| Hash de senha | **bcryptjs** (JS puro)                                                                     | Sem build nativo → sem atrito com Turbopack/Windows.                                                                                           |

### Compatibilidade Next 16 (verificada)

- Auth.js v5 suporta Next ≥14; 16 está na faixa.
- Instalar com `--legacy-peer-deps` (a faixa de peer-deps do Auth.js atrasa em relação ao Next 16).
- Next 16 renomeou `middleware.ts` → **`proxy.ts`**. A convenção exata será confirmada em `node_modules/next/dist/docs/` no momento do plano.
- **Gate primário = checagens `auth()`** no server component da página e nas rotas de API. `proxy.ts` entra apenas como reforço opcional — é a superfície menos provada de Auth.js + Next 16, então não dependemos dela.

### Dependências novas

- Runtime: `next-auth@beta`, `@prisma/client`, `bcryptjs`.
- Dev: `prisma`, `@types/bcryptjs`.

## 4. Modelo de dados (mínimo — a Fase B expande)

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String?
  createdAt    DateTime @default(now())
}
```

Sem `Account` / `Session` / `VerificationToken` — essas são tabelas de adapter para OAuth / sessão em DB, que não usamos com Credentials + JWT.

## 5. Fluxo de auth e proteção de rotas

- **`auth.ts`** (raiz do projeto) — única chamada `NextAuth()`, exportando `handlers`, `auth`, `signIn`, `signOut`. Provider Credentials com `authorize()` → `getUserByEmail()` → `verifyPassword()` → retorna `{ id, email, name }` ou `null`.
- **`app/api/auth/[...nextauth]/route.ts`** — reexporta `handlers` (GET/POST).
- **Gate da página:** `app/page.tsx` (server component) chama `auth()`; sem sessão → `redirect("/login")`. Passa o usuário da sessão para a Topbar.
- **Gate de API:** helper **`requireUser()`** (`lib/auth/guard.ts`) chamado no início de cada rota mutante (`/api/pattern/*`, `/api/billing/*`) e do `GET /api/pattern` → **401** sem sessão.
- **`proxy.ts`** — redirect de reforço (opcional), não o gate real.

## 6. UI

- **`app/login/page.tsx`** — form de login (client), tokens existentes (paper/ink/olive), chama `signIn("credentials", …)`. Estado de erro em credencial inválida. Affordance muted **"Criar conta — em breve"**.
- **Topbar** (`components/editor/Topbar.tsx`) — o avatar estático `LU` vira as iniciais do usuário logado + menu pequeno com o email e **"Sair"** (`signOut`). Alimentado pelo usuário da sessão via `app/page.tsx`.

## 7. Estrutura de arquivos

| Arquivo                               | Responsabilidade                                         |
| ------------------------------------- | -------------------------------------------------------- |
| `docker-compose.yml`                  | serviço Postgres local                                   |
| `prisma/schema.prisma`                | datasource postgres + model `User`                       |
| `prisma/seed.ts`                      | insere 1–2 usuários dev com senha hasheada               |
| `lib/db/prisma.ts`                    | singleton `PrismaClient` (evita vazamento no hot-reload) |
| `lib/db/users.ts`                     | repo tipado: `getUserByEmail(email)`                     |
| `lib/auth/hash.ts`                    | `hashPassword` / `verifyPassword` (bcryptjs)             |
| `auth.ts`                             | setup `NextAuth()` (Credentials + JWT)                   |
| `app/api/auth/[...nextauth]/route.ts` | reexporta `handlers`                                     |
| `lib/auth/guard.ts`                   | `requireUser()` p/ rotas de API (401)                    |
| `app/login/page.tsx`                  | tela de login                                            |
| `app/page.tsx`                        | gate server-side + passa user p/ Topbar                  |
| `components/editor/Topbar.tsx`        | user + "Sair"                                            |
| `proxy.ts`                            | redirect de reforço (opcional)                           |

## 8. Config e segredos

- `.env.local` (git-ignored) ganha `DATABASE_URL` (postgres) e `AUTH_SECRET`. Nunca commitados. Documentar como gerar `AUTH_SECRET` (`npx auth secret` ou `openssl rand -base64 32`).
- `docker-compose.yml` commitado; `prisma/seed.ts` semeia usuários dev — as credenciais dev são documentadas neste spec (local-only, seguro anotar).
- Scripts em `package.json`: `db:up` (compose up), `db:migrate`, `db:seed`.

### Credenciais dev semeadas (local-only)

- `dev@moldai.local` / senha `moldai-dev` (documentado; ambiente local apenas).
- (opcional) `atelier@moldai.local` / senha `moldai-dev`.

## 9. Testes (vitest, sem DB vivo)

Lógica pura/isolada testada com o repo de usuários **mockado** — `npm test` **nunca** precisa de Postgres rodando:

- `hash.ts`: hash ≠ plaintext; `verifyPassword` true/false.
- `authorize()`: credencial válida → user; senha errada → null; email desconhecido → null.
- `requireUser()`: sessão presente → passa; ausente → 401.

Correção de DB/migração é **smoke test manual** (passos documentados), fora do suite unitário.

## 10. Verificação

- `docker compose up` sobe o Postgres; `db:migrate` + `db:seed` populam.
- `npm run dev`: acessar `/` sem login → redireciona para `/login`; login com credencial dev → editor abre; avatar mostra o usuário; "Sair" desloga e volta para `/login`.
- Chamar uma rota mutante sem sessão → 401.
- `npm test` verde sem Postgres rodando (repo mockado).
- `npm run build` e `npm run lint` (escopado a `app lib components`) limpos.

## 11. Doc (CLAUDE.md)

A seção "everything server-side is a mock / no database / no auth" é reescrita para o novo estado: **auth + Postgres/Prisma são reais; patterns/chat/créditos continuam mock in-memory até a Fase B**, com o roadmap A→B→C anotado e a limitação "molde compartilhado até B" registrada.
