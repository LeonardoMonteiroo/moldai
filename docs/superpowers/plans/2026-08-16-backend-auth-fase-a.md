# Backend real — Fase A (Auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar o editor MoldAI atrás de autenticação real: login/logout via Auth.js v5, usuários em Postgres (Prisma), contas semeadas — mantendo molde/chat/créditos como mock in-memory (Fase B).

**Architecture:** Postgres local (Docker Compose) + Prisma guardam usuários. Auth.js v5 com provider Credentials e sessão JWT (cookie httpOnly). A lógica pura (verificação de senha, `authorize`, extração de sessão, gate de rota) fica em módulos sem dependência de next-auth/prisma, testável com vitest sem DB vivo. O gate real é `auth()` no server component da página e um helper `requireUser()` no topo de cada rota de API mutante; `proxy.ts` é deliberadamente omitido (YAGNI — a página e todas as rotas já estão cobertas, e evita o split-config edge do Auth.js).

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Auth.js v5 (`next-auth@beta`), Prisma + `@prisma/client`, Postgres 16 (Docker), `bcryptjs`, `tsx` (seed), vitest.

## Global Constraints

- **Branch:** todo o trabalho em `feat/backend-auth-fase-a` (criada a partir de `main`). Não commitar em `main`.
- **Escopo:** apenas Fase A (auth). Molde/chat/créditos permanecem no mock in-memory `lib/mock-data.ts` — logar NÃO dá molde por usuário (Fase B). Billing real é Fase C.
- **Sem auto-cadastro:** só login com contas semeadas. Signup aparece na UI como **"em breve"** (regra CLAUDE.md: _surface feature limitations on-screen_).
- **Segredos:** `DATABASE_URL` e `AUTH_SECRET` só em `.env.local` (git-ignored). Nunca commitar nem imprimir. `ANTHROPIC_API_KEY` já existe lá.
- **Alvo local-real:** sem nuvem, sem deploy. Postgres roda via `docker compose`.
- **Trust boundary intacto:** nada nesta fase toca o fluxo de crédito (debit-then-draft/refund/402) nem a validação de spec da IA.
- **Testes sem DB vivo:** `npm test` nunca pode exigir Postgres rodando — a lógica pura é testada com o repo de usuários mockado/injetado.
- **Modelo IA:** id exatamente `claude-sonnet-5` (inalterado nesta fase).
- **Verificação:** usar `npm run build` (não `tsc` puro — Next 16 dá erro espúrio de LayoutProps). Lint escopado: `npx eslint app lib components` (lint na raiz cruza worktrees aninhadas e dá falso alarme).
- **Instalação de deps:** usar `npm install --legacy-peer-deps` (faixa de peer-deps do Auth.js atrasa vs Next 16).
- **Convenções existentes:** rotas retornam `NextResponse.json(...)`; testes vitest em `lib/**/*.test.ts` e `app/**/*.test.ts`; alias `@/*` → raiz; commits terminam com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| Arquivo                                                  | Responsabilidade                                               | Task |
| -------------------------------------------------------- | -------------------------------------------------------------- | ---- |
| `lib/auth/hash.ts`                                       | `hashPassword` / `verifyPassword` (bcryptjs)                   | 1    |
| `lib/auth/types.ts`                                      | tipos `UserRecord`, `SessionUser` (só interfaces, sem runtime) | 2    |
| `lib/auth/authorize.ts`                                  | `authorizeUser(creds, deps)` puro e injetável                  | 2    |
| `lib/auth/session.ts`                                    | `sessionUser`, `unauthorized`, `requireUserFrom` (puros)       | 2    |
| `lib/db/prisma.ts`                                       | singleton `PrismaClient`                                       | 3    |
| `lib/db/users.ts`                                        | `getUserByEmail(email)`                                        | 3    |
| `prisma/schema.prisma`                                   | datasource postgres + model `User`                             | 3    |
| `prisma/seed.ts`                                         | semeia usuários dev                                            | 3    |
| `docker-compose.yml`                                     | serviço Postgres local                                         | 3    |
| `auth.ts`                                                | config `NextAuth()` (Credentials + JWT)                        | 4    |
| `app/api/auth/[...nextauth]/route.ts`                    | reexporta `handlers`                                           | 4    |
| `types/next-auth.d.ts`                                   | augmenta `Session.user.id` e `JWT.uid`                         | 4    |
| `lib/auth/guard.ts`                                      | `requireUser()` (wrapper de `auth()` + `requireUserFrom`)      | 4    |
| `app/api/pattern/*`, `app/api/billing/purchase/route.ts` | gate `requireUser()`                                           | 5    |
| `app/login/page.tsx`                                     | tela de login                                                  | 6    |
| `app/page.tsx`                                           | gate server-side + passa user                                  | 6    |
| `components/editor/EditorShell.tsx`                      | recebe/encaminha `userEmail`                                   | 6    |
| `components/editor/Topbar.tsx`                           | user + "Sair"                                                  | 6    |
| `lib/format.ts`                                          | `initialsFromEmail`                                            | 6    |
| `CLAUDE.md`                                              | doc do novo estado (auth+DB real)                              | 7    |

---

## Task 0: Branch

- [ ] **Step 1: Create the branch from main**

```bash
git checkout main && git checkout -b feat/backend-auth-fase-a
git branch --show-current   # → feat/backend-auth-fase-a
```

---

## Task 1: Password hashing helper

**Files:**

- Create: `lib/auth/hash.ts`
- Test: `lib/auth/hash.test.ts`

**Interfaces:**

- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`

- [ ] **Step 1: Install bcryptjs**

```bash
npm install --legacy-peer-deps bcryptjs
npm install --legacy-peer-deps -D @types/bcryptjs
```

- [ ] **Step 2: Write the failing test**

`lib/auth/hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./hash";

describe("hash", () => {
  it("gera hash diferente do texto e verifica corretamente", async () => {
    const h = await hashPassword("segredo");
    expect(h).not.toBe("segredo");
    expect(h.length).toBeGreaterThan(20);
    expect(await verifyPassword("segredo", h)).toBe(true);
    expect(await verifyPassword("errado", h)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/auth/hash.test.ts`
Expected: FAIL (cannot find module `./hash`)

- [ ] **Step 4: Implement**

`lib/auth/hash.ts`:

```ts
import bcrypt from "bcryptjs";

const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/auth/hash.test.ts`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add lib/auth/hash.ts lib/auth/hash.test.ts package.json package-lock.json
git commit -m "feat(auth): helper de hash de senha (bcryptjs)"
```

---

## Task 2: Pure auth logic (authorize + session)

**Files:**

- Create: `lib/auth/types.ts`, `lib/auth/authorize.ts`, `lib/auth/session.ts`
- Test: `lib/auth/authorize.test.ts`, `lib/auth/session.test.ts`

**Interfaces:**

- Consumes: nada (puro; deps injetadas).
- Produces:
  - `interface UserRecord { id: string; email: string; passwordHash: string; name: string | null }`
  - `interface SessionUser { id: string; email: string; name?: string | null }`
  - `interface AuthorizeDeps { getUserByEmail: (email: string) => Promise<UserRecord | null>; verify: (plain: string, hash: string) => Promise<boolean> }`
  - `authorizeUser(creds, deps): Promise<{ id: string; email: string; name: string | null } | null>`
  - `sessionUser(session: unknown): SessionUser | null`
  - `unauthorized(): NextResponse`
  - `requireUserFrom(session: unknown): SessionUser | NextResponse`

- [ ] **Step 1: Create the shared types**

`lib/auth/types.ts`:

```ts
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}
```

- [ ] **Step 2: Write the failing authorize test**

`lib/auth/authorize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { authorizeUser, type AuthorizeDeps } from "./authorize";
import type { UserRecord } from "./types";

const user: UserRecord = {
  id: "u1",
  email: "dev@moldai.local",
  passwordHash: "HASH",
  name: "Dev",
};

function deps(over: Partial<AuthorizeDeps> = {}): AuthorizeDeps {
  return {
    getUserByEmail: async (email) => (email === user.email ? user : null),
    verify: async (plain) => plain === "certa",
    ...over,
  };
}

describe("authorizeUser", () => {
  it("credencial válida retorna o usuário (sem passwordHash)", async () => {
    const r = await authorizeUser(
      { email: "dev@moldai.local", password: "certa" },
      deps(),
    );
    expect(r).toEqual({ id: "u1", email: "dev@moldai.local", name: "Dev" });
  });
  it("normaliza email (trim + lowercase)", async () => {
    const r = await authorizeUser(
      { email: "  DEV@MoldAI.local ", password: "certa" },
      deps(),
    );
    expect(r?.id).toBe("u1");
  });
  it("senha errada retorna null", async () => {
    expect(
      await authorizeUser(
        { email: "dev@moldai.local", password: "errada" },
        deps(),
      ),
    ).toBeNull();
  });
  it("email desconhecido retorna null", async () => {
    expect(
      await authorizeUser({ email: "x@y.z", password: "certa" }, deps()),
    ).toBeNull();
  });
  it("campos ausentes/não-string retornam null sem chamar o repo", async () => {
    let called = false;
    const d = deps({
      getUserByEmail: async (e) => {
        called = true;
        return e === user.email ? user : null;
      },
    });
    expect(
      await authorizeUser({ email: 123, password: "certa" }, d),
    ).toBeNull();
    expect(await authorizeUser({ password: "certa" }, d)).toBeNull();
    expect(await authorizeUser({ email: "dev@moldai.local" }, d)).toBeNull();
    expect(called).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run lib/auth/authorize.test.ts`
Expected: FAIL (cannot find module `./authorize`)

- [ ] **Step 4: Implement authorize**

`lib/auth/authorize.ts`:

```ts
import type { UserRecord } from "./types";

export interface AuthorizeDeps {
  getUserByEmail: (email: string) => Promise<UserRecord | null>;
  verify: (plain: string, hash: string) => Promise<boolean>;
}

export async function authorizeUser(
  creds: Record<string, unknown> | undefined,
  deps: AuthorizeDeps,
): Promise<{ id: string; email: string; name: string | null } | null> {
  const email =
    typeof creds?.email === "string" ? creds.email.trim().toLowerCase() : "";
  const password = typeof creds?.password === "string" ? creds.password : "";
  if (!email || !password) return null;

  const user = await deps.getUserByEmail(email);
  if (!user) return null;

  const ok = await deps.verify(password, user.passwordHash);
  if (!ok) return null;

  return { id: user.id, email: user.email, name: user.name };
}
```

- [ ] **Step 5: Write the failing session test**

`lib/auth/session.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { sessionUser, requireUserFrom } from "./session";

describe("sessionUser", () => {
  it("extrai user válido", () => {
    expect(
      sessionUser({ user: { id: "u1", email: "a@b.c", name: "A" } }),
    ).toEqual({
      id: "u1",
      email: "a@b.c",
      name: "A",
    });
  });
  it("name ausente vira null", () => {
    expect(sessionUser({ user: { id: "u1", email: "a@b.c" } })).toEqual({
      id: "u1",
      email: "a@b.c",
      name: null,
    });
  });
  it("null quando sessão vazia ou sem id/email", () => {
    expect(sessionUser(null)).toBeNull();
    expect(sessionUser({})).toBeNull();
    expect(sessionUser({ user: { email: "a@b.c" } })).toBeNull();
    expect(sessionUser({ user: { id: "u1" } })).toBeNull();
  });
});

describe("requireUserFrom", () => {
  it("sessão presente devolve o user", () => {
    expect(requireUserFrom({ user: { id: "u1", email: "a@b.c" } })).toEqual({
      id: "u1",
      email: "a@b.c",
      name: null,
    });
  });
  it("sessão ausente devolve 401", () => {
    const r = requireUserFrom(null);
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(401);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: FAIL (cannot find module `./session`)

- [ ] **Step 7: Implement session**

`lib/auth/session.ts`:

```ts
import { NextResponse } from "next/server";
import type { SessionUser } from "./types";

export function sessionUser(session: unknown): SessionUser | null {
  const u = (
    session as {
      user?: { id?: unknown; email?: unknown; name?: unknown };
    } | null
  )?.user;
  if (!u || typeof u.id !== "string" || typeof u.email !== "string")
    return null;
  return {
    id: u.id,
    email: u.email,
    name: typeof u.name === "string" ? u.name : null,
  };
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { status: "unauthorized", error: "Login necessário." },
    { status: 401 },
  );
}

export function requireUserFrom(session: unknown): SessionUser | NextResponse {
  return sessionUser(session) ?? unauthorized();
}
```

- [ ] **Step 8: Run both tests to verify they pass**

Run: `npx vitest run lib/auth/authorize.test.ts lib/auth/session.test.ts`
Expected: PASS (authorize: 5, session: 5)

- [ ] **Step 9: Commit**

```bash
git add lib/auth/types.ts lib/auth/authorize.ts lib/auth/authorize.test.ts lib/auth/session.ts lib/auth/session.test.ts
git commit -m "feat(auth): lógica pura de authorize e sessão (injetável, testável sem DB)"
```

---

## Task 3: Local Postgres + Prisma + users repo + seed

**Files:**

- Create: `docker-compose.yml`, `prisma/schema.prisma`, `prisma/seed.ts`, `lib/db/prisma.ts`, `lib/db/users.ts`
- Modify: `package.json` (deps + scripts + prisma seed config), `.env.local` (append — NÃO commitar)

**Interfaces:**

- Consumes: `UserRecord` de `lib/auth/types.ts`; `hashPassword` de `lib/auth/hash.ts`.
- Produces: `getUserByEmail(email: string): Promise<UserRecord | null>`; DB Postgres com model `User` semeado.

> **Nota:** esta task é infra + camada de acesso — não tem teste unitário automatizado (a correção do DB é smoke test manual, Steps 8–10). O deliverable é o repo tipado + o DB semeado.

- [ ] **Step 1: Install Prisma + client + tsx**

**Pin Prisma to v6** — Prisma 7 removed schema-level `datasource { url = env(...) }` (it now requires a `prisma.config.ts` + driver adapter), which the schema/singleton below rely on. Use the 6.x line:

```bash
npm install --legacy-peer-deps "@prisma/client@^6"
npm install --legacy-peer-deps -D "prisma@^6" tsx
```

Verify after install: `node -e "console.log(require('prisma/package.json').version)"` → must print a `6.x` version (not 7.x). If a prior attempt left 7.x installed, this reinstall downgrades it.

- [ ] **Step 2: Create docker-compose.yml**

`docker-compose.yml`:

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
      - "5433:5432"
    volumes:
      - moldai-pgdata:/var/lib/postgresql/data

volumes:
  moldai-pgdata:
```

- [ ] **Step 3: Create the Prisma schema**

`prisma/schema.prisma`:

```prisma
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

- [ ] **Step 4: Add env vars to .env.local (git-ignored — do NOT commit)**

Append to `.env.local`:

```
DATABASE_URL="postgresql://moldai:moldai@localhost:5433/moldai?schema=public"
```

(Host port 5433 — 5432 is left free to avoid colliding with other local Postgres instances; the container still listens on 5432 internally.)
Then generate the auth secret (writes `AUTH_SECRET` into `.env.local`):

```bash
npx auth secret
```

If `npx auth secret` is unavailable, append manually: `AUTH_SECRET="<saída de: openssl rand -base64 32>"`.

- [ ] **Step 5: Add scripts + prisma seed config to package.json**

Add to `"scripts"`:

```json
"db:up": "docker compose up -d",
"db:migrate": "prisma migrate dev",
"db:seed": "prisma db seed",
"postinstall": "prisma generate"
```

Add a top-level `"prisma"` block:

```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

- [ ] **Step 6: Generate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" (não precisa de DB conectado).

- [ ] **Step 7: Implement the prisma singleton and users repo**

`lib/db/prisma.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

`lib/db/users.ts`:

```ts
import { prisma } from "./prisma";
import type { UserRecord } from "@/lib/auth/types";

export function getUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true, name: true },
  });
}
```

- [ ] **Step 8: Create the seed**

`prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/hash";

const prisma = new PrismaClient();

const USERS = [
  { email: "dev@moldai.local", name: "Dev", password: "moldai-dev" },
  { email: "atelier@moldai.local", name: "Ateliê", password: "moldai-dev" },
];

async function main() {
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        passwordHash: await hashPassword(u.password),
      },
    });
  }
  console.log("Seed concluído:", USERS.map((u) => u.email).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 9: Smoke test — bring up Postgres, migrate, seed**

```bash
npm run db:up
npm run db:migrate   # nomeie a migração: "init_user"
npm run db:seed
```

Expected: migration criada em `prisma/migrations/`, "Seed concluído: dev@moldai.local, atelier@moldai.local".

- [ ] **Step 10: Verify the row exists**

```bash
docker exec moldai-db psql -U moldai -d moldai -c "select email, name from \"User\";"
```

Expected: 2 linhas (dev@moldai.local, atelier@moldai.local).

- [ ] **Step 11: Commit (schema, migration, code — NOT .env.local)**

```bash
git add docker-compose.yml prisma/schema.prisma prisma/migrations prisma/seed.ts lib/db/prisma.ts lib/db/users.ts package.json package-lock.json
git status   # confirmar que .env.local NÃO está staged
git commit -m "feat(db): Postgres local (docker) + Prisma, model User, seed de contas dev"
```

---

## Task 4: NextAuth wiring + route guard

**Files:**

- Create: `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `types/next-auth.d.ts`, `lib/auth/guard.ts`
- Modify: nenhum

**Interfaces:**

- Consumes: `authorizeUser`, `AuthorizeDeps` (Task 2); `getUserByEmail` (Task 3); `verifyPassword` (Task 1); `requireUserFrom`, `SessionUser` (Task 2).
- Produces: exports `handlers`, `auth`, `signIn`, `signOut` de `@/auth`; `requireUser(): Promise<SessionUser | NextResponse>` de `@/lib/auth/guard`.

- [ ] **Step 1: Install next-auth v5**

```bash
npm install --legacy-peer-deps next-auth@beta
```

- [ ] **Step 2: Create the NextAuth config**

`auth.ts` (raiz do projeto):

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeUser } from "@/lib/auth/authorize";
import { getUserByEmail } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/hash";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (creds) =>
        authorizeUser(creds ?? {}, { getUserByEmail, verify: verifyPassword }),
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = (user as { id: string }).id;
      return token;
    },
    session({ session, token }) {
      // Narrow explicitly instead of relying on the JWT module augmentation —
      // it doesn't merge reliably across next-auth v5 betas (token.uid can type
      // as `{}`), so a runtime typeof guard is what keeps this both correct and
      // type-safe regardless of the beta.
      const uid = token.uid;
      if (typeof uid === "string" && session.user) session.user.id = uid;
      return session;
    },
  },
});
```

- [ ] **Step 3: Create the type augmentation**

`types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
  }
}
```

- [ ] **Step 4: Create the Auth.js route handler**

`app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 5: Create the route guard wrapper**

`lib/auth/guard.ts`:

```ts
import type { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireUserFrom } from "./session";
import type { SessionUser } from "./types";

export async function requireUser(): Promise<SessionUser | NextResponse> {
  return requireUserFrom(await auth());
}
```

- [ ] **Step 6: Verify build (with Postgres up and .env.local present)**

Run: `npm run build`
Expected: build succeeds. Se falhar com erro de bundling do `@prisma/client`, adicionar em `next.config.ts`: `serverExternalPackages: ["@prisma/client"]` e rebuildar. (Não adicionar preventivamente — só se o build acusar.)

- [ ] **Step 7: Verify existing unit tests still green (no live DB)**

Run: `npm test`
Expected: PASS — a suíte não importa `@/auth`/prisma (os módulos testados são puros).

- [ ] **Step 8: Commit**

```bash
git add auth.ts "app/api/auth/[...nextauth]/route.ts" types/next-auth.d.ts lib/auth/guard.ts package.json package-lock.json next.config.ts 2>/dev/null
git commit -m "feat(auth): wiring do Auth.js v5 (Credentials + JWT) e guard requireUser"
```

---

## Task 5: Gate the API routes

**Files:**

- Modify: `app/api/pattern/route.ts` (GET), `app/api/pattern/generate/route.ts`, `app/api/pattern/graduate/route.ts`, `app/api/pattern/conflict/resolve/route.ts`, `app/api/pattern/reset/route.ts`, `app/api/billing/purchase/route.ts`
- Modify (tests): `app/api/pattern/generate/route.test.ts`, `app/api/pattern/graduate/route.test.ts`

**Interfaces:**

- Consumes: `requireUser` de `@/lib/auth/guard`; `unauthorized` de `@/lib/auth/session`; `NextResponse` de `next/server`.

O padrão do gate (primeira coisa dentro do handler, antes de qualquer parse/débito):

```ts
const gate = await requireUser();
if (gate instanceof NextResponse) return gate;
```

Cada rota já importa `NextResponse`; adicionar `import { requireUser } from "@/lib/auth/guard";`.

- [ ] **Step 1: Update generate test to mock the guard (keep it green) + add a 401 test**

No topo de `app/api/pattern/generate/route.test.ts`, ANTES do `import { POST } from "./route"`, adicionar o mock do guard (junto do mock de `@/lib/ai` já existente):

```ts
vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
```

E adicionar os imports (depois dos imports existentes):

```ts
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
```

Adicionar, dentro do `describe`, o teste de 401:

```ts
it("sem sessão retorna 401 sem debitar nem chamar a IA", async () => {
  vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
  const balanceBefore = getState().credits.balance;
  const res = await POST(req({ message: "quero uma camiseta" }));
  expect(res.status).toBe(401);
  expect(getState().credits.balance).toBe(balanceBefore);
  expect(mockPropose).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run generate test to verify the 401 test fails**

Run: `npx vitest run app/api/pattern/generate/route.test.ts`
Expected: FAIL — o novo teste dá 200 (a rota ainda não chama o guard), enquanto os antigos passam.

- [ ] **Step 3: Add the gate to the generate route**

Em `app/api/pattern/generate/route.ts`, adicionar o import e a checagem no início de `POST` (primeira instrução do corpo, antes do `try { body = await request.json() }`):

```ts
import { requireUser } from "@/lib/auth/guard";
// ...
export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: { message?: unknown; answering?: unknown };
  // ...resto inalterado
```

- [ ] **Step 4: Run generate test to verify all pass**

Run: `npx vitest run app/api/pattern/generate/route.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Update graduate test to mock the guard**

No topo de `app/api/pattern/graduate/route.test.ts`, ANTES do `import { POST } from "./route"`:

```ts
import { vi } from "vitest";
vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
```

(O arquivo já importa `describe, it, expect, beforeEach` de vitest — acrescente `vi` a esse import em vez de duplicar, se preferir; o `vi.mock` precisa vir antes do import da rota.)

- [ ] **Step 6: Add the gate to graduate route**

Em `app/api/pattern/graduate/route.ts`, adicionar `import { requireUser } from "@/lib/auth/guard";` e, como primeira instrução de `POST`:

```ts
const gate = await requireUser();
if (gate instanceof NextResponse) return gate;
```

- [ ] **Step 7: Add the gate to the remaining routes (no tests to update)**

Aplicar o mesmo par de linhas no início do handler de cada uma:

- `app/api/pattern/conflict/resolve/route.ts` (`POST`)
- `app/api/pattern/reset/route.ts` (`POST`)
- `app/api/billing/purchase/route.ts` (`POST`)
- `app/api/pattern/route.ts` (`GET` — sem `request`):

```ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { getState } from "@/lib/mock-data";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json(getState());
}
```

Garantir que cada arquivo importe `NextResponse` de `next/server` (generate/graduate/purchase/resolve/reset já importam; conferir).

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS (todos os testes, incluindo o novo 401).

- [ ] **Step 9: Commit**

```bash
git add app/api
git commit -m "feat(auth): protege as rotas de API com requireUser (401 sem sessão)"
```

---

## Task 6: Login page, page gate, and Topbar user/logout

**Files:**

- Create: `app/login/page.tsx`
- Modify: `app/page.tsx`, `components/editor/EditorShell.tsx`, `components/editor/Topbar.tsx`, `lib/format.ts`
- Test: `lib/format.test.ts` (criar se não existir; senão acrescentar)

**Interfaces:**

- Consumes: `auth`, `signIn`, `signOut` de `@/auth` / `next-auth/react`; `initialsFromEmail` de `@/lib/format`.
- Produces: `initialsFromEmail(email: string): string`; `EditorShell` passa a aceitar `{ userEmail: string }`.

- [ ] **Step 1: Write the failing test for initialsFromEmail**

Em `lib/format.test.ts` (criar se não houver), adicionar:

```ts
import { describe, it, expect } from "vitest";
import { initialsFromEmail } from "./format";

describe("initialsFromEmail", () => {
  it("usa as duas primeiras letras do local-part, maiúsculas", () => {
    expect(initialsFromEmail("dev@moldai.local")).toBe("DE");
    expect(initialsFromEmail("atelier@moldai.local")).toBe("AT");
  });
  it("uma letra quando o local-part tem só uma", () => {
    expect(initialsFromEmail("a@b.c")).toBe("A");
  });
  it("fallback '?' quando não há letras", () => {
    expect(initialsFromEmail("123@x.y")).toBe("?");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/format.test.ts`
Expected: FAIL (`initialsFromEmail` não existe).

- [ ] **Step 3: Implement initialsFromEmail**

Adicionar ao fim de `lib/format.ts`:

```ts
export function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const letters = local.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 2) || "?").toUpperCase();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the login page**

`app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Email ou senha inválidos.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="bg-paper flex min-h-screen items-center justify-center px-4">
      <div className="bg-surface border-border rounded-card shadow-card w-full max-w-[380px] border p-7">
        <span className="font-display text-[22px] font-bold tracking-[-0.4px]">
          Mold<span className="text-olive">AI</span>
        </span>
        <h1 className="mt-4 text-[15px] font-semibold">Entrar</h1>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <label className="text-muted-2 flex flex-col gap-1 text-[12px]">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="border-border rounded-btn bg-surface-alt text-ink focus:border-olive border px-3 py-2 text-[13px] focus:outline-none"
            />
          </label>
          <label className="text-muted-2 flex flex-col gap-1 text-[12px]">
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="border-border rounded-btn bg-surface-alt text-ink focus:border-olive border px-3 py-2 text-[13px] focus:outline-none"
            />
          </label>
          {error && <p className="text-alert text-[12px]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-btn bg-olive hover:bg-olive-dark mt-1 px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="text-muted mt-4 text-[11px]">
          Criar conta — <span className="font-medium">em breve</span>. Nesta
          fase o molde é compartilhado entre contas; molde por usuário vem na
          próxima fase.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Gate the editor page server-side**

`app/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EditorShell } from "@/components/editor/EditorShell";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorShell userEmail={session.user.email} />
    </div>
  );
}
```

- [ ] **Step 7: Thread userEmail through EditorShell**

Em `components/editor/EditorShell.tsx`, mudar a assinatura e o uso do Topbar:

```tsx
export function EditorShell({ userEmail }: { userEmail: string }) {
```

e:

```tsx
<Topbar pattern={pattern} credits={credits} userEmail={userEmail} />
```

- [ ] **Step 8: Add user + logout to the Topbar**

Em `components/editor/Topbar.tsx`:

- Adicionar aos imports: `import { signOut } from "next-auth/react";` e `import { initialsFromEmail } from "@/lib/format";`
- Mudar a assinatura para incluir `userEmail`:

```tsx
export function Topbar({ pattern, credits, userEmail }: { pattern: Pattern; credits: Credits; userEmail: string }) {
```

- Substituir o chip estático do avatar (`<div ...>LU</div>`) por iniciais reais + botão "Sair":

```tsx
<div className="flex items-center gap-2">
  <div
    title={userEmail}
    className="bg-olive-tint border-olive-border text-olive flex h-[30px] w-[30px] items-center justify-center rounded-full border text-[12px] font-semibold"
  >
    {initialsFromEmail(userEmail)}
  </div>
  <button
    onClick={() => signOut({ callbackUrl: "/login" })}
    className="border-border rounded-btn bg-surface text-muted-2 hover:bg-surface-alt border px-[11px] py-[6px] text-[12px] font-medium transition-colors"
  >
    Sair
  </button>
</div>
```

- [ ] **Step 9: Verify build + lint + tests**

```bash
npm run build
npx eslint app lib components
npm test
```

Expected: build limpo, lint limpo, testes verdes.

- [ ] **Step 10: Manual smoke (Postgres up, dev server running)**

```bash
npm run db:up && npm run dev
```

- Abrir `http://localhost:3000/` sem logar → redireciona para `/login`.
- Logar com `dev@moldai.local` / `moldai-dev` → editor abre; avatar mostra "DE"; título do avatar = email.
- Clicar "Sair" → volta para `/login`.
- Com o app deslogado, `curl -i http://localhost:3000/api/pattern` → HTTP 401.

- [ ] **Step 11: Commit**

```bash
git add app/login app/page.tsx components/editor/EditorShell.tsx components/editor/Topbar.tsx lib/format.ts lib/format.test.ts
git commit -m "feat(auth): tela de login, gate do editor e user/logout na Topbar"
```

---

## Task 7: Docs (CLAUDE.md)

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the "What this is" mock/auth sentence**

Localizar em `CLAUDE.md`:

> The rest of the backend (credits, grading, billing, conflict persistence) is still a mock in-memory store, and there is no auth. Requires `ANTHROPIC_API_KEY` in `.env.local`.

Substituir por:

> Authentication is now **real** (Fase A do "backend real", roadmap A→B→C): login/logout via **Auth.js v5** (Credentials + JWT), with users persisted in **Postgres via Prisma** (local Docker Compose). Only login exists — self-signup is deferred (shown as "em breve"). The rest of the backend (patterns, chat, credits, grading, billing, conflict persistence) is **still a mock in-memory store**; logging in does **not** yet give each user their own molde (that per-user persistence is Fase B; the molde is shared across accounts until then, surfaced on the login screen). Requires `ANTHROPIC_API_KEY`, `DATABASE_URL`, and `AUTH_SECRET` in `.env.local`.

- [ ] **Step 2: Update the "Everything server-side is a mock" architecture opener**

Localizar:

> **Everything server-side is a mock.** `lib/mock-data.ts` holds one module-level in-memory `EditorState` (pattern, pieces, chat, credits, active conflict) seeded on server start and mutated in place by the route handlers under `app/api/`. There is no database — state resets on server restart, and each mutator function (`addMessage`, `debitCredits`, `refundCredits`, `bumpVersion`, `setConflict`, `applySizes`, `applyPurchase`) is the single place that changes that slice of state.

Substituir a primeira frase e a menção a "no database" para refletir que **usuários** já têm DB, mas o `EditorState` continua mock:

> **The molde state is still a mock; auth/users are real.** `lib/mock-data.ts` holds one module-level in-memory `EditorState` (pattern, pieces, chat, credits, active conflict) seeded on server start and mutated in place by the route handlers under `app/api/`. This slice has no database — it resets on server restart, and each mutator function (`addMessage`, `debitCredits`, `refundCredits`, `bumpVersion`, `setConflict`, `applySizes`, `applyPurchase`) is the single place that changes it. **Users are the exception**: they live in Postgres via Prisma (`lib/db/`, `prisma/schema.prisma`), and every `app/api/*` route is gated by `requireUser()` (`lib/auth/guard.ts`) — 401 without a session. The editor page (`app/page.tsx`) redirects to `/login` when unauthenticated. Auth logic is split into pure, DB-free modules (`lib/auth/authorize.ts`, `lib/auth/session.ts`) so it's unit-tested without a live DB; the NextAuth config is `auth.ts`.

- [ ] **Step 3: Update the Commands section**

Adicionar ao bloco de comandos em `CLAUDE.md` (junto de `npm run dev` etc.):

```
docker compose up -d   # (npm run db:up) sobe o Postgres local
npm run db:migrate     # aplica migrações Prisma
npm run db:seed        # semeia contas dev (dev@moldai.local / moldai-dev)
```

E, onde o arquivo menciona `ANTHROPIC_API_KEY` como requisito de `.env.local`, acrescentar `DATABASE_URL` e `AUTH_SECRET`.

- [ ] **Step 4: Verify no stale "there is no auth / no database" claims remain**

Run: `grep -niE "no auth|there is no database|no database" CLAUDE.md`
Expected: nenhuma linha afirmando ausência de auth; a única menção a "no database" deve ser a nova, restrita ao `EditorState`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md reflete auth+Postgres reais (Fase A); molde segue mock até Fase B"
```

---

## Verification (whole branch)

- `docker compose up -d && npm run db:migrate && npm run db:seed` — DB sobe e semeia.
- `npm test` — verde **sem** Postgres rodando (lógica pura + rotas com guard mockado).
- `npm run build` — limpo.
- `npx eslint app lib components` — limpo.
- Manual: `/` deslogado → `/login`; login dev → editor + avatar + Sair; `/api/pattern` deslogado → 401.
- `git grep -n "there is no auth"` → vazio.

## Notes / deferred (não implementar nesta fase)

- Auto-cadastro, reset de senha, OAuth.
- Molde/chat/créditos por usuário (Fase B) — hoje globais/compartilhados.
- Billing real / Stripe / ledger de créditos (Fase C).
- `proxy.ts` — omitido de propósito (página + rotas já cobrem; evita split-config edge do Auth.js).
