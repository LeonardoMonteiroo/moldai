# Fase B — Persistência do molde por usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir o molde (pattern/peças/chat/créditos/conflito) por usuário no Postgres, substituindo o singleton in-memory `lib/mock-data.ts`, de modo que cada conta tenha o seu próprio molde persistente.

**Architecture:** O `EditorState` inteiro é guardado como blob JSON numa tabela `Molde` (uma linha por usuário, PK = `userId`). A lógica de manipulação vira pura e DB-free em `lib/editor/state.ts` (funções que recebem/mutam um `EditorState`), espelhando a separação lógica-pura↔DB da Fase A (auth). Um repositório `lib/db/molde.ts` é a única camada que toca o Prisma: `withMolde` faz load→muta→save numa transação interativa com lock de linha (`SELECT … FOR UPDATE`), garantindo a atomicidade do fluxo de crédito. As 6 rotas de API trocam `getState()`+mutators globais por `withMolde`/`loadMolde`/`resetMolde`.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript, Prisma v6 + Postgres, Vitest.

## Global Constraints

- **Prisma pinado em v6** (`^6`). NÃO subir para v7 (removeu `datasource { url = env(...) }`).
- **Model id da IA deve ser EXATAMENTE `claude-sonnet-5`** — não tocar em `lib/ai.ts` além do necessário (esta fase não muda a IA).
- **Fluxo de crédito inalterado:** debit-then-draft, refund em decline/clarify/erro, 402 (sem débito, sem chamada à IA) em saldo insuficiente. Só muda o *onde* o estado vive.
- **Saída da IA nunca é confiada para geometria** — `validateSpec`/`validateQuestions` seguem clampando (em `lib/ai.ts`/`lib/draft/garment.ts`, não mexer).
- **Contrato JSON das respostas inalterado:** `{ status, state }`, códigos 400/402/401, e o shape do `EditorState`. O cliente (Zustand) não muda.
- **`npm test` NÃO pode exigir Postgres rodando** — testes mockam `@/lib/db/*` e `@/lib/auth/guard`.
- **Verificar com `npm run build`** (não `tsc` puro — Next 16 dá erro espúrio de LayoutProps). Lint com escopo: `npx eslint app lib components` (lint na raiz vasculha worktrees aninhadas).
- Commits terminam com:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  (use heredoc do Git Bash, não here-string do PowerShell).
- **Contas dev semeadas:** `dev@moldai.local` / `atelier@moldai.local`, senha `moldai-dev`. Postgres no host em `localhost:5433`; no container em `db:5432`. Antes de `db:migrate`, subir o Postgres (`npm run db:up`) com Docker Desktop rodando.

## File Structure

- **Create** `lib/editor/state.ts` — operações puras sobre `EditorState` (portadas de `lib/mock-data.ts`). Sem estado de módulo, sem import de Prisma.
- **Create** `lib/editor/state.test.ts` — unit tests das operações (porta de `lib/mock-data.test.ts`, adaptado às novas assinaturas).
- **Create** `lib/db/molde.ts` — repositório: `withMolde`, `loadMolde`, `resetMolde`. Única camada que importa `@/lib/db/prisma`.
- **Create** `lib/db/molde.test.ts` — testa o repositório com o Prisma mockado (sem DB).
- **Modify** `prisma/schema.prisma` — model `Molde` + relação reversa em `User`.
- **Create** `prisma/migrations/**` — migração gerada por `prisma migrate dev`.
- **Modify** as 6 rotas: `app/api/pattern/route.ts`, `app/api/pattern/generate/route.ts`, `app/api/pattern/graduate/route.ts`, `app/api/pattern/conflict/resolve/route.ts`, `app/api/pattern/reset/route.ts`, `app/api/billing/purchase/route.ts`.
- **Modify** `app/api/pattern/generate/route.test.ts` e `app/api/pattern/graduate/route.test.ts` — mockar `@/lib/db/molde` em vez de `@/lib/mock-data`.
- **Delete** `lib/mock-data.ts` e `lib/mock-data.test.ts` (substituídos por `lib/editor/state.ts` + testes).
- **Modify** `app/login/page.tsx` — remover a nota "molde compartilhado entre contas".
- **Modify** `CLAUDE.md` — atualizar a seção de arquitetura (molde agora persistido por usuário).

---

## Task 1: Model Prisma `Molde` + migração

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_molde/migration.sql` (gerado)

**Interfaces:**
- Consumes: model `User` existente (`id String @id @default(cuid())`).
- Produces: tabela `Molde { userId String @id, data Json, updatedAt DateTime }`; tipo Prisma `Molde` e `prisma.molde` no client.

- [ ] **Step 1: Adicionar o model e a relação reversa**

Em `prisma/schema.prisma`, no model `User` existente, adicionar o campo de relação (dentro do bloco `model User { … }`, após `createdAt`):

```prisma
  molde        Molde?
```

E ao fim do arquivo, o novo model:

```prisma
model Molde {
  userId    String   @id
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data      Json
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Subir o Postgres (se ainda não estiver de pé)**

Run: `npm run db:up`
Expected: `Container moldai-db ... Healthy` (Docker Desktop precisa estar rodando; Postgres no host em `localhost:5433`).

- [ ] **Step 3: Gerar e aplicar a migração**

Run: `npm run db:migrate -- --name add_molde`
Expected: cria `prisma/migrations/<ts>_add_molde/migration.sql` com `CREATE TABLE "Molde"`, aplica sem erro, e roda `prisma generate` (o client passa a expor `prisma.molde`). O `db:migrate` usa `dotenv -e .env.local` (o Prisma CLI lê `.env`, não `.env.local`).

- [ ] **Step 4: Conferir que o client compila com o novo model**

Run: `npm run build`
Expected: build passa (o tipo `Molde` existe; nada mais mudou ainda).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "$(cat <<'EOF'
feat(db): model Molde (blob JSON do EditorState) + migração

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `lib/editor/state.ts` — operações puras (portadas do mock)

**Files:**
- Create: `lib/editor/state.ts`
- Create: `lib/editor/state.test.ts`

Nota: `lib/mock-data.ts` permanece intacto nesta task (as rotas ainda o usam; será removido na Task 5). As novas funções têm assinaturas diferentes (recebem `state`), então não colidem.

**Interfaces:**
- Consumes: `draftGarment`, `seamCheck` de `@/lib/draft/garment`; `resolveMeasurements` de `@/lib/measurements`; tipos de `@/lib/types` (`EditorState`, `ChatMessage`, `ConflictInfo`, `Credits`, `GarmentSpec`, `Pattern`, `Piece`, `SizeLabel`).
- Produces (todas exportadas de `lib/editor/state.ts`):
  - `seedState(): EditorState`
  - `addMessage(state: EditorState, message: ChatMessage): void`
  - `debitCredits(state: EditorState, amount: number): void`
  - `refundCredits(state: EditorState, amount: number): void`
  - `bumpVersion(state: EditorState): void`
  - `setConflict(state: EditorState, conflict: ConflictInfo | null): void`
  - `applyGarmentSpec(state: EditorState, spec: GarmentSpec): void`
  - `refitManga(state: EditorState): void`
  - `getSpec(state: EditorState): GarmentSpec`
  - `applySizes(state: EditorState, sizes: string[]): void`
  - `applyPurchase(state: EditorState, type: "topup" | "subscribe"): void`

- [ ] **Step 1: Escrever os testes (falhando) das operações puras**

Create `lib/editor/state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  seedState, addMessage, debitCredits, refundCredits, bumpVersion,
  setConflict, applyGarmentSpec, refitManga, getSpec, applySizes, applyPurchase,
} from "./state";

describe("seedState", () => {
  it("blank molde: sem peças, chat vazio, version 0, créditos Ateliê 320/500", () => {
    const s = seedState();
    expect(s.pattern.pieces).toHaveLength(0);
    expect(s.chat).toHaveLength(0);
    expect(s.pattern.version).toBe(0);
    expect(s.conflict).toBeNull();
    expect(s.credits.balance).toBe(320);
    expect(s.credits.total).toBe(500);
    expect(s.credits.plan).toBe("atelier");
  });
  it("cada chamada devolve um estado independente (sem alias)", () => {
    const a = seedState(); const b = seedState();
    a.credits.balance = 0;
    expect(b.credits.balance).toBe(320);
  });
});

describe("créditos e versão", () => {
  it("debit/refund ajustam o saldo", () => {
    const s = seedState();
    debitCredits(s, 4); expect(s.credits.balance).toBe(316);
    refundCredits(s, 4); expect(s.credits.balance).toBe(320);
  });
  it("bumpVersion incrementa e marca salvo agora", () => {
    const s = seedState();
    bumpVersion(s);
    expect(s.pattern.version).toBe(1);
    expect(s.pattern.savedAgo).toBe("salvo agora");
  });
  it("addMessage anexa ao chat", () => {
    const s = seedState();
    addMessage(s, { id: "m1", author: "user", text: "oi", createdAt: 1 });
    expect(s.chat).toHaveLength(1);
    expect(s.chat[0].id).toBe("m1");
  });
});

describe("applyGarmentSpec / conflito / refit", () => {
  it("drafta uma saia e guarda no pattern", () => {
    const s = seedState();
    applyGarmentSpec(s, { tipo: "saia", measurementOverrides: {}, style: { saia: "circulo" } });
    expect(s.pattern.pieces.length).toBe(1);
    expect(s.pattern.pieces[0].id).toBe("saia");
    expect(s.pattern.viewBox!.w).toBeGreaterThan(0);
  });
  it("cavaAjusteCm anexa conflito; sem ajuste não há conflito", () => {
    const s = seedState();
    applyGarmentSpec(s, { tipo: "blusa", sexo: "fem", measurementOverrides: {}, style: { manga: "curta" } });
    expect(s.conflict).toBeNull();
    applyGarmentSpec(s, { tipo: "blusa", sexo: "fem", measurementOverrides: {}, style: { manga: "curta", cavaAjusteCm: 2 } });
    expect(s.conflict).not.toBeNull();
    expect(s.conflict!.diffCm).toBeGreaterThan(1);
    expect(s.conflict!.pieceBId).toBe("manga");
  });
  it("refitManga refaz a copa e limpa o conflito", () => {
    const s = seedState();
    applyGarmentSpec(s, { tipo: "blusa", sexo: "fem", measurementOverrides: {}, style: { manga: "curta", cavaAjusteCm: 2 } });
    expect(s.conflict).not.toBeNull();
    refitManga(s);
    expect(s.conflict).toBeNull();
    expect(getSpec(s).style.mangaRefit).toBe(true);
  });
});

describe("setConflict / applySizes / applyPurchase", () => {
  it("setConflict(null) limpa o aviso", () => {
    const s = seedState();
    applyGarmentSpec(s, { tipo: "blusa", sexo: "fem", measurementOverrides: {}, style: { manga: "curta", cavaAjusteCm: 2 } });
    setConflict(s, null);
    expect(s.conflict).toBeNull();
  });
  it("applySizes move pendentes para aplicados", () => {
    const s = seedState();
    applySizes(s, ["PP", "P"]);
    expect(s.pattern.sizesApplied).toEqual(expect.arrayContaining(["PP", "P"]));
    expect(s.pattern.sizesPending).not.toContain("PP");
  });
  it("applyPurchase topup soma 100; subscribe reseta plano Ateliê", () => {
    const s = seedState();
    applyPurchase(s, "topup"); expect(s.credits.balance).toBe(420);
    const s2 = seedState(); s2.credits.balance = 10;
    applyPurchase(s2, "subscribe");
    expect(s2.credits.balance).toBe(510);
    expect(s2.credits.total).toBe(500);
    expect(s2.credits.renewsInDays).toBe(30);
  });
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npx vitest run lib/editor/state.test.ts`
Expected: FAIL — `Cannot find module './state'`.

- [ ] **Step 3: Implementar `lib/editor/state.ts`**

Create `lib/editor/state.ts` (portado de `lib/mock-data.ts`, convertido para funções puras que recebem `state`; helpers `detectConflict`/`cavaMarker` privados e intactos):

```ts
import {
  ChatMessage,
  ConflictInfo,
  Credits,
  EditorState,
  GarmentSpec,
  Pattern,
  Piece,
} from "@/lib/types";
import { draftGarment, seamCheck } from "@/lib/draft/garment";
import { resolveMeasurements } from "@/lib/measurements";

// Marca (círculo tracejado) na região da cava de uma peça, a partir da bbox
// dos seus vértices em px. Ilustrativa — aponta a costura em conflito no canvas.
function cavaMarker(piece: Piece | undefined): { cx: number; cy: number; r: number } | null {
  const vs = piece?.vertices;
  if (!vs || vs.length === 0) return null;
  const xs = vs.map((v) => v.x);
  const ys = vs.map((v) => v.y);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { cx: maxX - 6, cy: minY + (maxY - minY) * 0.28, r: 14 };
}

// Detecta divergência de costura entre a cava do corpo e a copa da manga
// (seamCheck determinístico) e monta o ConflictInfo com marcas no canvas.
function detectConflict(
  pieces: Piece[],
  armholeLenCm?: number,
  mangaArmholeCm?: number,
): ConflictInfo | null {
  const seam = seamCheck(armholeLenCm, mangaArmholeCm);
  if (!seam) return null;
  const frente = pieces.find((p) => p.id === "corpo-frente");
  const manga = pieces.find((p) => p.id === "manga");
  const markers = [cavaMarker(frente), cavaMarker(manga)].filter(
    (m): m is { cx: number; cy: number; r: number } => m !== null,
  );
  const maior = (armholeLenCm ?? 0) > (mangaArmholeCm ?? 0);
  return {
    id: `conf-${Date.now()}`,
    title: "Cava e manga não batem",
    description: `A cava do corpo ficou ${seam.diffCm} cm ${maior ? "maior" : "menor"} que a copa da manga — as costuras não vão fechar.`,
    diffCm: seam.diffCm,
    suggestion: "“Corrigir manga” refaz a copa para a cava ajustada, sem custo.",
    pieceAId: "corpo-frente",
    pieceBId: "manga",
    markers,
  };
}

function seedPattern(): Pattern {
  const baseSize = "M" as const;
  const spec: GarmentSpec = { tipo: "blusa", sexo: "fem", measurementOverrides: {}, style: {} };
  return {
    id: "demo",
    name: "Novo molde",
    version: 0,
    savedAgo: "ainda não salvo",
    baseSize,
    unit: "cm",
    sizesApplied: [],
    sizesPending: ["PP", "P", "M", "G", "GG"],
    pieces: [],
    spec,
    baseMeasurements: resolveMeasurements(baseSize, {}, "fem"),
    viewBox: { w: 620, h: 380 },
  };
}

function seedCredits(): Credits {
  return { plan: "atelier", planLabel: "Ateliê", balance: 320, total: 500, renewsInDays: 12 };
}

// O blank molde inicial de cada usuário.
export function seedState(): EditorState {
  return { pattern: seedPattern(), chat: [], credits: seedCredits(), conflict: null };
}

export function addMessage(state: EditorState, message: ChatMessage): void {
  state.chat = [...state.chat, message];
}

export function debitCredits(state: EditorState, amount: number): void {
  state.credits = { ...state.credits, balance: state.credits.balance - amount };
}

export function refundCredits(state: EditorState, amount: number): void {
  state.credits = { ...state.credits, balance: state.credits.balance + amount };
}

export function bumpVersion(state: EditorState): void {
  state.pattern = { ...state.pattern, version: state.pattern.version + 1, savedAgo: "salvo agora" };
}

export function setConflict(state: EditorState, conflict: ConflictInfo | null): void {
  state.conflict = conflict;
}

export function getSpec(state: EditorState): GarmentSpec {
  return state.pattern.spec ?? { tipo: "blusa", sexo: "fem", measurementOverrides: {}, style: {} };
}

// Drafta o garment a partir de um spec validado e guarda pieces/viewBox/spec no
// pattern; anexa (ou limpa) o conflito de costura (apply-with-warning).
export function applyGarmentSpec(state: EditorState, spec: GarmentSpec): void {
  const size = state.pattern.baseSize;
  const { pieces, viewBox, measurements, armholeLenCm, mangaArmholeCm } = draftGarment(spec, size);
  state.pattern = { ...state.pattern, pieces, viewBox, spec, baseMeasurements: measurements };
  state.conflict = detectConflict(pieces, armholeLenCm, mangaArmholeCm);
}

// "Corrigir manga": marca mangaRefit e re-drafta — a copa passa a usar a cava
// ajustada, as costuras batem e detectConflict devolve null.
export function refitManga(state: EditorState): void {
  const spec = getSpec(state);
  applyGarmentSpec(state, { ...spec, style: { ...spec.style, mangaRefit: true } });
}

export function applySizes(state: EditorState, sizes: string[]): void {
  const applied = new Set(state.pattern.sizesApplied);
  const pending = state.pattern.sizesPending.filter((s) => {
    if (sizes.includes(s)) {
      applied.add(s);
      return false;
    }
    return true;
  });
  state.pattern = {
    ...state.pattern,
    sizesApplied: Array.from(applied),
    sizesPending: pending,
  };
}

export function applyPurchase(state: EditorState, type: "topup" | "subscribe"): void {
  if (type === "topup") {
    state.credits = { ...state.credits, balance: state.credits.balance + 100 };
  } else {
    state.credits = {
      plan: "atelier",
      planLabel: "Ateliê",
      balance: state.credits.balance + 500,
      total: 500,
      renewsInDays: 30,
    };
  }
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npx vitest run lib/editor/state.test.ts`
Expected: PASS (todos os testes verdes).

- [ ] **Step 5: Commit**

```bash
git add lib/editor/state.ts lib/editor/state.test.ts
git commit -m "$(cat <<'EOF'
feat(editor): operações puras de EditorState (lib/editor/state.ts)

Portadas de lib/mock-data.ts como funções puras que recebem/mutam um
EditorState — testáveis sem Postgres. mock-data.ts segue até a migração
das rotas (Task 5).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `lib/db/molde.ts` — repositório (transação + lock)

**Files:**
- Create: `lib/db/molde.ts`
- Create: `lib/db/molde.test.ts`

**Interfaces:**
- Consumes: `prisma` de `@/lib/db/prisma`; `seedState` de `@/lib/editor/state`; tipo `EditorState` de `@/lib/types`.
- Produces (exportadas de `lib/db/molde.ts`):
  - `withMolde<T>(userId: string, fn: (state: EditorState) => T | Promise<T>): Promise<T>`
  - `loadMolde(userId: string): Promise<EditorState>`
  - `resetMolde(userId: string): Promise<EditorState>`

- [ ] **Step 1: Escrever os testes (falhando) com o Prisma mockado**

Create `lib/db/molde.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake do client Prisma: uma "tabela" em memória keyed por userId.
const store = new Map<string, unknown>();

const tx = {
  // INSERT ... ON CONFLICT DO NOTHING (materializa seed) — só cria se ausente.
  $executeRaw: vi.fn(async () => 0),
  // SELECT data ... FOR UPDATE — devolve a linha atual (após o insert-if-absent).
  $queryRaw: vi.fn(async () => []),
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    // interactive transaction: chama o callback com o tx fake.
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    molde: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const data = store.get(where.userId);
        return data === undefined ? null : { userId: where.userId, data };
      }),
      upsert: vi.fn(async ({ where, create, update }: {
        where: { userId: string };
        create: { userId: string; data: unknown };
        update: { data: unknown };
      }) => {
        const exists = store.has(where.userId);
        store.set(where.userId, exists ? update.data : create.data);
        return { userId: where.userId, data: store.get(where.userId) };
      }),
    },
  },
}));

import { withMolde, loadMolde, resetMolde } from "./molde";
import { seedState, debitCredits } from "@/lib/editor/state";

// Faz $executeRaw materializar o seed (INSERT-if-absent) e $queryRaw devolver a
// linha atual, imitando INSERT ON CONFLICT DO NOTHING + SELECT FOR UPDATE.
function wireTx() {
  tx.$executeRaw.mockImplementation(async () => 0); // no-op; o seed é semeado abaixo
  tx.$queryRaw.mockImplementation(async () => {
    const uid = "u1";
    if (!store.has(uid)) store.set(uid, seedState());
    return [{ data: store.get(uid) }];
  });
}

describe("withMolde", () => {
  beforeEach(() => {
    store.clear();
    tx.$executeRaw.mockReset();
    tx.$queryRaw.mockReset();
    wireTx();
  });

  it("semeia o blank molde no primeiro acesso e passa ao fn", async () => {
    let seen: number | null = null;
    await withMolde("u1", (state) => { seen = state.credits.balance; });
    expect(seen).toBe(320);
  });

  it("persiste as mutações do fn (débito sobrevive)", async () => {
    await withMolde("u1", (state) => { debitCredits(state, 4); });
    const s = store.get("u1") as ReturnType<typeof seedState>;
    expect(s.credits.balance).toBe(316);
  });

  it("retorna o valor devolvido pelo fn", async () => {
    const out = await withMolde("u1", () => "resp");
    expect(out).toBe("resp");
  });
});

describe("loadMolde", () => {
  beforeEach(() => { store.clear(); });
  it("devolve seed sem gravar quando não há linha", async () => {
    const s = await loadMolde("novo");
    expect(s.credits.balance).toBe(320);
    expect(store.has("novo")).toBe(false); // read-only: nada foi persistido
  });
  it("devolve o estado persistido quando existe", async () => {
    const seeded = seedState(); seeded.credits.balance = 7;
    store.set("u1", seeded);
    const s = await loadMolde("u1");
    expect(s.credits.balance).toBe(7);
  });
});

describe("resetMolde", () => {
  beforeEach(() => { store.clear(); });
  it("sobrescreve com o blank molde e persiste", async () => {
    const dirty = seedState(); dirty.credits.balance = 0; dirty.pattern.version = 9;
    store.set("u1", dirty);
    const s = await resetMolde("u1");
    expect(s.credits.balance).toBe(320);
    expect(s.pattern.version).toBe(0);
    expect((store.get("u1") as ReturnType<typeof seedState>).pattern.version).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/db/molde.test.ts`
Expected: FAIL — `Cannot find module './molde'`.

- [ ] **Step 3: Implementar `lib/db/molde.ts`**

Create `lib/db/molde.ts`:

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { seedState } from "@/lib/editor/state";
import type { EditorState } from "@/lib/types";

// O timeout precisa cobrir a chamada à IA (proposeGarment ~5–12s) que roda
// DENTRO da transação — o default de 5s do Prisma estouraria. Segurar o lock
// durante a IA é intencional: é o que serializa os requests do usuário.
const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

function toState(data: Prisma.JsonValue): EditorState {
  return data as unknown as EditorState;
}

// load → fn(state) → save, numa transação interativa com lock de linha.
// Garante a atomicidade do fluxo de crédito.
export async function withMolde<T>(
  userId: string,
  fn: (state: EditorState) => T | Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Materializa o seed se ausente, para haver linha a travar mesmo no
    // primeiríssimo acesso concorrente (INSERT ... ON CONFLICT DO NOTHING).
    const seed = JSON.stringify(seedState());
    await tx.$executeRaw`
      INSERT INTO "Molde" ("userId", "data", "updatedAt")
      VALUES (${userId}, ${seed}::jsonb, now())
      ON CONFLICT ("userId") DO NOTHING`;
    // Trava a linha e lê o estado atual.
    const rows = await tx.$queryRaw<{ data: Prisma.JsonValue }[]>`
      SELECT "data" FROM "Molde" WHERE "userId" = ${userId} FOR UPDATE`;
    const state = toState(rows[0].data);
    const result = await fn(state);
    await tx.$executeRaw`
      UPDATE "Molde" SET "data" = ${JSON.stringify(state)}::jsonb, "updatedAt" = now()
      WHERE "userId" = ${userId}`;
    return result;
  }, TX_OPTS);
}

// Leitura read-only p/ o GET: devolve seedState() sem gravar se não houver linha.
export async function loadMolde(userId: string): Promise<EditorState> {
  const row = await prisma.molde.findUnique({ where: { userId } });
  return row ? toState(row.data) : seedState();
}

// Reseta o molde do usuário para o blank molde e persiste.
export async function resetMolde(userId: string): Promise<EditorState> {
  const state = seedState();
  await prisma.molde.upsert({
    where: { userId },
    create: { userId, data: state as unknown as Prisma.InputJsonValue },
    update: { data: state as unknown as Prisma.InputJsonValue },
  });
  return state;
}
```

Nota p/ o implementador: o teste mocka `prisma.$transaction` chamando o callback com um `tx` fake cujo `$queryRaw` devolve `[{ data: <estado> }]` e cujo `$executeRaw` é no-op; o estado persistido é observado via o `upsert`/`store` do mock. No teste, o `UPDATE` final (via `$executeRaw`) não grava no `store` — por isso o teste "persiste as mutações" verifica o `store` que o `$queryRaw` populou por referência (o `fn` muta o mesmo objeto). Se preferir, ajuste o mock de `$executeRaw` do UPDATE para escrever em `store`; o comportamento a garantir é: fn recebe o estado, muta, e o repositório persiste esse estado mutado.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/db/molde.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar tipos com o build**

Run: `npm run build`
Expected: build passa (o `withMolde`/`loadMolde`/`resetMolde` tipam certo contra o client Prisma).

- [ ] **Step 6: Commit**

```bash
git add lib/db/molde.ts lib/db/molde.test.ts
git commit -m "$(cat <<'EOF'
feat(db): repositório do molde (withMolde tx+lock, loadMolde, resetMolde)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Refatorar as 6 rotas para usar o repositório

**Files:**
- Modify: `app/api/pattern/route.ts`
- Modify: `app/api/pattern/generate/route.ts`
- Modify: `app/api/pattern/graduate/route.ts`
- Modify: `app/api/pattern/conflict/resolve/route.ts`
- Modify: `app/api/pattern/reset/route.ts`
- Modify: `app/api/billing/purchase/route.ts`
- Modify: `app/api/pattern/generate/route.test.ts`
- Modify: `app/api/pattern/graduate/route.test.ts`

**Interfaces:**
- Consumes: `withMolde`, `loadMolde`, `resetMolde` de `@/lib/db/molde`; ops de `@/lib/editor/state`; `requireUser` de `@/lib/auth/guard` (devolve `SessionUser` com `.id` ou `NextResponse`).
- Produces: as rotas passam a persistir por `userId`; contrato JSON inalterado.

- [ ] **Step 1: Atualizar o teste de `generate` (mockar `@/lib/db/molde`)**

Reescrever `app/api/pattern/generate/route.test.ts` para mockar o repositório com um `EditorState` em memória por teste (via `seedState`), no lugar de `@/lib/mock-data`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedState } from "@/lib/editor/state";
import type { EditorState } from "@/lib/types";

let state: EditorState = seedState();

vi.mock("@/lib/ai", () => ({ proposeGarment: vi.fn() }));
vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", email: "dev@moldai.local", name: null })),
}));
vi.mock("@/lib/db/molde", () => ({
  // Executa o fn sobre o state em memória (imita withMolde sem DB).
  withMolde: vi.fn(async (_userId: string, fn: (s: EditorState) => unknown) => fn(state)),
  loadMolde: vi.fn(async () => state),
  resetMolde: vi.fn(async () => (state = seedState())),
}));

import { POST } from "./route";
import { proposeGarment } from "@/lib/ai";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";

const mockPropose = proposeGarment as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://test/api/pattern/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/pattern/generate", () => {
  beforeEach(() => {
    state = seedState();
    mockPropose.mockReset();
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", email: "dev@moldai.local", name: null });
  });

  it("ask estorna o crédito, não desenha nem versiona, e devolve clarify", async () => {
    const balanceBefore = state.credits.balance;
    const versionBefore = state.pattern.version;
    mockPropose.mockResolvedValue({
      decision: "ask",
      spec: { tipo: "camiseta", sexo: "masc", style: {}, measurementOverrides: {} },
      questions: [{ id: "q0", label: "Gola", options: ["redonda", "V"], allowOther: true }],
      assistantMessage: "Me conta mais:",
    });
    const res = await POST(req({ message: "quero uma camiseta" }));
    const json = await res.json();
    expect(json.status).toBe("clarify");
    expect(state.credits.balance).toBe(balanceBefore);
    expect(state.pattern.version).toBe(versionBefore);
    expect(state.pattern.pieces).toHaveLength(0);
    const last = state.chat[state.chat.length - 1];
    expect(last.author).toBe("ai");
    expect(last.questions).toHaveLength(1);
  });

  it("apply debita, desenha e versiona", async () => {
    const balanceBefore = state.credits.balance;
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: { tipo: "camiseta", sexo: "masc", style: {}, measurementOverrides: {} },
      assistantMessage: "Pronto",
    });
    const res = await POST(req({ message: "camiseta masc" }));
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(state.credits.balance).toBe(balanceBefore - 1);
    expect(state.pattern.version).toBe(1);
    expect(state.pattern.pieces.length).toBeGreaterThan(0);
  });

  it("mensagem vazia retorna 400 sem debitar nem chamar a IA", async () => {
    const balanceBefore = state.credits.balance;
    const res = await POST(req({ message: "   " }));
    expect(res.status).toBe(400);
    expect(state.credits.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("repassa answering ao proposeGarment", async () => {
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: { tipo: "camiseta", sexo: "masc", style: {}, measurementOverrides: {} },
      assistantMessage: "Pronto",
    });
    await POST(req({ message: "gola redonda", answering: true }));
    expect(mockPropose).toHaveBeenCalledWith(expect.anything(), true);
  });

  it("sem sessão retorna 401 sem debitar nem chamar a IA", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const balanceBefore = state.credits.balance;
    const res = await POST(req({ message: "quero uma camiseta" }));
    expect(res.status).toBe(401);
    expect(state.credits.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("saldo insuficiente retorna 402 sem debitar nem chamar a IA", async () => {
    state.credits.balance = 0;
    const res = await POST(req({ message: "camiseta" }));
    expect(res.status).toBe(402);
    expect(state.credits.balance).toBe(0);
    expect(mockPropose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste de generate e ver falhar**

Run: `npx vitest run app/api/pattern/generate/route.test.ts`
Expected: FAIL (a rota ainda importa `@/lib/mock-data`; o mock de `@/lib/db/molde` não é usado ainda).

- [ ] **Step 3: Refatorar `app/api/pattern/generate/route.ts`**

Substituir o conteúdo por (guard fora da transação; validação de corpo fora; tudo o mais dentro de `withMolde`):

```ts
import { NextResponse } from "next/server";
import { withMolde } from "@/lib/db/molde";
import { addMessage, applyGarmentSpec, bumpVersion, debitCredits, refundCredits } from "@/lib/editor/state";
import { COSTS } from "@/lib/types";
import { proposeGarment } from "@/lib/ai";
import { requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: { message?: unknown; answering?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", error: "Corpo inválido." }, { status: 400 });
  }
  const trimmed = typeof body.message === "string" ? body.message.trim() : "";
  if (!trimmed) {
    return NextResponse.json({ status: "error", error: "Mensagem obrigatória." }, { status: 400 });
  }
  const answering = body.answering === true;
  const cost = COSTS.adjust;

  return withMolde(gate.id, async (state) => {
    if (state.credits.balance < cost) {
      return NextResponse.json(
        { status: "insufficient_credits", required: cost, balance: state.credits.balance },
        { status: 402 },
      );
    }

    addMessage(state, { id: `msg-${Date.now()}-u`, author: "user", text: trimmed, createdAt: Date.now() });
    debitCredits(state, cost);

    try {
      const decision = await proposeGarment(state, answering);

      if (decision.decision === "ask") {
        addMessage(state, {
          id: `msg-${Date.now()}-ai`,
          author: "ai",
          text: decision.assistantMessage || "Pra acertar a modelagem, me responde:",
          questions: decision.questions,
          createdAt: Date.now(),
        });
        refundCredits(state, cost);
        return NextResponse.json({ status: "clarify", state });
      }

      if (decision.decision === "decline") {
        addMessage(state, {
          id: `msg-${Date.now()}-ai`,
          author: "ai",
          text: decision.assistantMessage || decision.declineReason || "Não consegui aplicar esse pedido.",
          createdAt: Date.now(),
        });
        refundCredits(state, cost);
        return NextResponse.json({ status: "declined", state });
      }

      applyGarmentSpec(state, decision.spec);
      bumpVersion(state);
      const conflict = state.conflict;
      addMessage(state, {
        id: `msg-${Date.now()}-ai`,
        author: "ai",
        text: conflict ? `${decision.assistantMessage} ⚠️ ${conflict.description}` : decision.assistantMessage,
        chips: [{ label: `−${cost} crédito`, tone: "credit" }],
        tone: conflict ? "conflict" : undefined,
        createdAt: Date.now(),
      });
      return NextResponse.json({ status: conflict ? "conflict" : "ok", state });
    } catch {
      refundCredits(state, cost);
      return NextResponse.json({ status: "error", state });
    }
  });
}
```

- [ ] **Step 4: Rodar o teste de generate e ver passar**

Run: `npx vitest run app/api/pattern/generate/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Refatorar `app/api/pattern/route.ts` (GET → loadMolde)**

```ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { loadMolde } from "@/lib/db/molde";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json(await loadMolde(gate.id));
}
```

- [ ] **Step 6: Atualizar o teste de `graduate` (mockar `@/lib/db/molde`)**

Reescrever `app/api/pattern/graduate/route.test.ts` seguindo o mesmo padrão do de generate (mock de `@/lib/db/molde` com `state = seedState()`), preservando os casos existentes e adicionando os que faltam. Conteúdo:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedState } from "@/lib/editor/state";
import type { EditorState } from "@/lib/types";

let state: EditorState = seedState();

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", email: "dev@moldai.local", name: null })),
}));
vi.mock("@/lib/db/molde", () => ({
  withMolde: vi.fn(async (_userId: string, fn: (s: EditorState) => unknown) => fn(state)),
  loadMolde: vi.fn(async () => state),
  resetMolde: vi.fn(async () => (state = seedState())),
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";

function req(body: unknown) {
  return new Request("http://test/api/pattern/graduate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/pattern/graduate", () => {
  beforeEach(() => {
    state = seedState();
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", email: "dev@moldai.local", name: null });
  });

  it("gradua tamanhos válidos, debita 6 e versiona", async () => {
    const balanceBefore = state.credits.balance;
    const res = await POST(req({ sizes: ["PP", "P"] }));
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(state.credits.balance).toBe(balanceBefore - 6);
    expect(state.pattern.sizesApplied).toEqual(expect.arrayContaining(["PP", "P"]));
  });

  it("nenhum tamanho válido retorna 400", async () => {
    const res = await POST(req({ sizes: ["XL"] }));
    expect(res.status).toBe(400);
  });

  it("saldo insuficiente retorna 402 sem debitar", async () => {
    state.credits.balance = 3;
    const res = await POST(req({ sizes: ["PP"] }));
    expect(res.status).toBe(402);
    expect(state.credits.balance).toBe(3);
  });

  it("sem sessão retorna 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({ sizes: ["PP"] }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 7: Refatorar `app/api/pattern/graduate/route.ts`**

```ts
import { NextResponse } from "next/server";
import { withMolde } from "@/lib/db/molde";
import { addMessage, applySizes, bumpVersion, debitCredits } from "@/lib/editor/state";
import { ALL_SIZES, COSTS, SizeLabel } from "@/lib/types";
import { formatList } from "@/lib/format";
import { requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: { sizes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", error: "Corpo inválido." }, { status: 400 });
  }
  const sizes = Array.isArray(body.sizes)
    ? body.sizes.filter((s): s is SizeLabel => (ALL_SIZES as string[]).includes(s as string))
    : [];
  if (sizes.length === 0) {
    return NextResponse.json(
      { status: "error", error: "Nenhum tamanho válido para graduar." },
      { status: 400 },
    );
  }
  const cost = COSTS.graduate;

  return withMolde(gate.id, (state) => {
    if (state.credits.balance < cost) {
      return NextResponse.json(
        { status: "insufficient_credits", required: cost, balance: state.credits.balance },
        { status: 402 },
      );
    }
    debitCredits(state, cost);
    applySizes(state, sizes);
    bumpVersion(state);
    addMessage(state, {
      id: `msg-${Date.now()}-ai`,
      author: "ai",
      text: `Graduação aplicada para ${formatList(sizes)}.`,
      chips: [{ label: `−${cost} créditos`, tone: "credit" }],
      createdAt: Date.now(),
    });
    return NextResponse.json({ status: "ok", state });
  });
}
```

- [ ] **Step 8: Refatorar `app/api/pattern/conflict/resolve/route.ts`**

```ts
import { NextResponse } from "next/server";
import { withMolde } from "@/lib/db/molde";
import { addMessage, bumpVersion, refitManga, setConflict } from "@/lib/editor/state";
import { requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let action: "fix" | "ignore" = "ignore";
  try {
    const body = (await request.json()) as { action?: unknown };
    if (body.action === "fix") action = "fix";
  } catch {
    return NextResponse.json({ status: "error", error: "Corpo inválido." }, { status: 400 });
  }

  return withMolde(gate.id, (state) => {
    if (action === "fix") {
      refitManga(state);
      bumpVersion(state);
      addMessage(state, {
        id: `msg-${Date.now()}-ai`,
        author: "ai",
        text: "Copa da manga refeita para a cava ajustada — as costuras voltaram a bater.",
        chips: [{ label: "correção gratuita", tone: "neutral" }],
        createdAt: Date.now(),
      });
    } else {
      setConflict(state, null);
    }
    return NextResponse.json({ status: "ok", state });
  });
}
```

- [ ] **Step 9: Refatorar `app/api/pattern/reset/route.ts`**

```ts
import { NextResponse } from "next/server";
import { resetMolde } from "@/lib/db/molde";
import { requireUser } from "@/lib/auth/guard";

// Reseta o molde do usuário para o blank molde (sem peças, chat vazio, v0).
export async function POST() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const state = await resetMolde(gate.id);
  return NextResponse.json({ status: "ok", state });
}
```

- [ ] **Step 10: Refatorar `app/api/billing/purchase/route.ts`**

```ts
import { NextResponse } from "next/server";
import { withMolde } from "@/lib/db/molde";
import { applyPurchase } from "@/lib/editor/state";
import { requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const { type } = (await request.json()) as { type: "topup" | "subscribe" };
  return withMolde(gate.id, (state) => {
    applyPurchase(state, type);
    return NextResponse.json({ status: "ok", state });
  });
}
```

- [ ] **Step 11: Rodar toda a suíte de testes**

Run: `npm test`
Expected: PASS — inclusive os testes de rota reescritos e os de `lib/editor`/`lib/db`. (`lib/mock-data.test.ts` ainda existe e deve passar, pois `lib/mock-data.ts` segue presente até a Task 5.)

- [ ] **Step 12: Commit**

```bash
git add app/api lib
git commit -m "$(cat <<'EOF'
refactor(api): rotas persistem o molde por usuário via withMolde/loadMolde

As 6 rotas trocam o singleton in-memory pelo repositório (lib/db/molde) +
ops puras (lib/editor/state). Fluxo de crédito e contrato JSON inalterados.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Remover o mock, ajustar UI e docs, verificação final

**Files:**
- Delete: `lib/mock-data.ts`, `lib/mock-data.test.ts`
- Modify: `app/login/page.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nada novo. Confirma que nenhum módulo ainda importa `@/lib/mock-data`.
- Produces: árvore sem o mock; nota de login atualizada; CLAUDE.md refletindo a persistência.

- [ ] **Step 1: Confirmar que nada mais importa o mock**

Run: `git grep -n "mock-data" -- 'app' 'lib' 'components'`
Expected: **apenas** `lib/mock-data.ts` e `lib/mock-data.test.ts` (nenhuma rota/componente). Se aparecer outra referência, corrija-a para `@/lib/editor/state` (ops) ou `@/lib/db/molde` (persistência) antes de prosseguir.

- [ ] **Step 2: Remover o mock e seu teste**

```bash
git rm lib/mock-data.ts lib/mock-data.test.ts
```

- [ ] **Step 3: Atualizar a nota da tela de login**

Em `app/login/page.tsx`, substituir o parágrafo final:

```tsx
        <p className="mt-4 text-[11px] text-muted">
          Criar conta — <span className="font-medium">em breve</span>. Nesta fase o molde é
          compartilhado entre contas; molde por usuário vem na próxima fase.
        </p>
```

por:

```tsx
        <p className="mt-4 text-[11px] text-muted">
          Criar conta — <span className="font-medium">em breve</span>. Cada conta tem o seu próprio
          molde, salvo automaticamente.
        </p>
```

- [ ] **Step 4: Atualizar a arquitetura no CLAUDE.md**

Em `CLAUDE.md`, na seção **Architecture**, substituir o parágrafo que começa com **"The molde state is still a mock; auth/users are real."** por:

```markdown
**The molde state and users are both real (Postgres/Prisma).** Each user has their own `EditorState` (pattern, pieces, chat, credits, active conflict) persisted as a JSON blob in the `Molde` table (one row per user, keyed by `userId`; `prisma/schema.prisma`). The editor-state logic lives in pure, DB-free functions in `lib/editor/state.ts` (each takes and mutates an `EditorState` — `seedState`, `addMessage`, `debitCredits`, `refundCredits`, `bumpVersion`, `setConflict`, `applyGarmentSpec`, `refitManga`, `applySizes`, `applyPurchase`), unit-tested without a live DB. The repository `lib/db/molde.ts` is the only layer that touches Prisma: `withMolde(userId, fn)` runs load→mutate→save inside an interactive transaction with a row lock (`SELECT … FOR UPDATE`, materializing the seed via `INSERT … ON CONFLICT DO NOTHING` first) so the credit flow is atomic; its transaction timeout is raised (30s) because the AI call runs inside it. `loadMolde(userId)` is a read-only get-or-seed for the `GET`, and `resetMolde(userId)` reseeds. Every `app/api/*` route is gated by `requireUser()` (`lib/auth/guard.ts`) — 401 without a session — and keys all state off the session user's id. Auth logic is likewise split into pure, DB-free modules (`lib/auth/authorize.ts`, `lib/auth/session.ts`); the NextAuth config is `auth.ts` (`trustHost: true` for self-hosted/prod). The molde now survives server restarts and is independent per account (Fase B do "backend real"; billing/credits remain a mock top-up until Fase C).
```

Também atualizar a frase em **"What this is"** que diz que patterns/chat/credits são mock e que "logging in does not yet give each user their own molde" — trocar por algo como: "Cada conta tem o seu próprio molde persistido (Postgres/Prisma); billing/créditos seguem mock (top-up local) até a Fase C." (Ajustar o texto existente mantendo o tom; não duplicar.)

- [ ] **Step 5: Verificação final — testes, lint, build**

Run: `npm test`
Expected: PASS (sem os testes do mock removido).

Run: `npx eslint app lib components`
Expected: sem erros.

Run: `npm run build`
Expected: build passa.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: remove mock-data in-memory; molde persistido por usuário (Fase B)

Remove lib/mock-data.ts (substituído por lib/editor/state + lib/db/molde),
atualiza a nota de login (molde por conta) e a arquitetura no CLAUDE.md.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Smoke de persistência real (end-to-end no Docker)

**Files:** nenhum (verificação manual/observacional).

**Interfaces:**
- Consumes: stack Docker de prod (`npm run docker:prod` ou o dev `npm run docker:up`), contas seed.

- [ ] **Step 1: Aplicar migração no ambiente Docker**

Run: `npm run docker:prod` (o `docker-entrypoint.sh` roda `prisma migrate deploy`, aplicando a migração `add_molde`).
Expected: app de pé em `http://localhost:3000`; logs sem erro de migração.

- [ ] **Step 2: Smoke automatizado de login/geração persistida**

Run: `npm run smoke` (contra o stack já no ar)
Expected: PASS (login + fluxo básico).

- [ ] **Step 3: Verificar persistência através de restart (manual)**

1. Login `dev@moldai.local` / `moldai-dev`; gerar uma blusa; anotar peças/versão/saldo.
2. `docker compose restart app`.
3. Recarregar `http://localhost:3000` — o molde, o chat e o saldo **persistem** (não voltam ao blank).
4. Login `atelier@moldai.local` — molde **em branco e independente** (não vê o do `dev`).
5. Aprofundar cava → conflito; "Ignorar" → recarregar: conflito **não** volta; ou "Corrigir manga" → conflito some, sem custo.

Expected: todos os itens conferem. (Sem step de commit — verificação apenas.)

---

## Self-Review (do autor do plano)

- **Cobertura do spec:** model Molde+migração (T1) ✓; ops puras (T2) ✓; repositório withMolde/loadMolde/resetMolde tx+lock+timeout+insert-on-conflict (T3) ✓; refactor das 6 rotas + testes sem DB (T4) ✓; remoção do mock + nota de login + CLAUDE.md (T5) ✓; aceite/persistência via restart e independência entre contas (T6) ✓. Fluxo de crédito/402/401/contrato JSON preservados (T4). Limitações do spec (lock durante IA, timeout, geometria envelhecida) endereçadas em T3/comentários.
- **Placeholders:** nenhum — todo passo com código/comando/expected concretos.
- **Consistência de tipos:** `withMolde(userId, fn)`, `loadMolde(userId)`, `resetMolde(userId)` idênticos entre T3 (definição), T4 (uso nas rotas e mocks) e T5 (CLAUDE.md). Ops de `lib/editor/state` com assinatura `(state, …)` idênticas entre T2 (definição) e T4 (uso). `gate.id` usado como `userId` (o guard devolve `SessionUser` com `.id`).
