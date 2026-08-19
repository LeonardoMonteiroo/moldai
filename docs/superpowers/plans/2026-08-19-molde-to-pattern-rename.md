# Molde → Pattern Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the "molde" domain entity to "pattern" across every code-facing surface (Prisma model/table, DB repository layer, types, store, API client, routes, components, message-catalog keys) so the codebase has no remaining Portuguese identifiers, closing the gap flagged during a route audit.

**Architecture:** This is a pure identifier/route rename — no behavior changes. It touches a strongly-typed dependency chain (Prisma → `lib/db` → domain types → `lib/store`/`lib/dashboardStore`/`lib/api-client` → routes → components → i18n keys), so tasks are ordered bottom-up and each task updates a renamed module **and every current importer of it in the same task**, so the repo compiles and the app is functionally correct after every task — never split a module rename from its call sites across two tasks.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 / Postgres, Zustand, next-intl, Vitest.

## Global Constraints

- **UI display text (pt-BR string _values_) is never touched.** `"Novo molde"`, `"Meus moldes"`, `"Excluir este molde?"`, etc. stay exactly as they are — only code-facing identifiers (variables, types, functions, file/route names, Prisma model/columns, JSON message _keys_) become English. This matches CLAUDE.md's existing convention: code/wire keys are English, UI copy stays pt-BR.
- **No backwards-compatibility shims.** Don't leave old names as re-exports/aliases "just in case" — this is a controlled, single-session rename; delete the old name outright when introducing the new one (per CLAUDE.md's stated convention against compat hacks).
- **Local dev Postgres data is disposable for this change** (user's explicit call) — the Prisma migration drops and recreates the table rather than attempting an in-place `ALTER TABLE ... RENAME`, matching the exact precedent already set by `prisma/migrations/20260817002232_reset_moldes_english` and `prisma/migrations/20260818201820_molde_own_id`.
- **Global identifier mapping** (apply verbatim everywhere; this is the single source of truth for every task below):

  | Old                                                       | New                                                                                                   |
  | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
  | `Molde` (Prisma model)                                    | `Pattern`                                                                                             |
  | `User.moldes` (Prisma field)                              | `User.patterns`                                                                                       |
  | `lib/db/molde.ts`                                         | `lib/db/pattern.ts`                                                                                   |
  | `lib/db/molde-wallet.ts`                                  | `lib/db/pattern-wallet.ts`                                                                            |
  | `moldeNotFound`                                           | `patternNotFound`                                                                                     |
  | `lockMolde`                                               | `lockPattern`                                                                                         |
  | `saveMolde`                                               | `savePattern`                                                                                         |
  | `withMolde`                                               | `withPattern`                                                                                         |
  | `loadMolde`                                               | `loadPattern`                                                                                         |
  | `createMolde`                                             | `createPattern`                                                                                       |
  | `listMoldesForUser`                                       | `listPatternsForUser`                                                                                 |
  | `renameMolde`                                             | `renamePattern`                                                                                       |
  | `deleteMolde`                                             | `deletePattern`                                                                                       |
  | `MoldeListItem` (both declarations)                       | `PatternListItem`                                                                                     |
  | `withMoldeAndWallet`                                      | `withPatternAndWallet`                                                                                |
  | `MoldeState`                                              | `PatternState`                                                                                        |
  | `seedMoldeState`                                          | `seedPatternState`                                                                                    |
  | `moldeId` (param/var, everywhere)                         | `patternId`                                                                                           |
  | `moldeState` (var, everywhere)                            | `patternState`                                                                                        |
  | `moldes` (var/field, everywhere)                          | `patterns`                                                                                            |
  | `molde` (single-item var/prop, everywhere)                | `pattern` — **only where it doesn't already collide** (see Task 7 note on `MoldeCard`'s `molde` prop) |
  | `filteredMoldes`                                          | `filteredPatterns`                                                                                    |
  | `listMoldes` (api-client)                                 | `listPatterns`                                                                                        |
  | `fetchMolde`                                              | `fetchPattern`                                                                                        |
  | `openMolde` (DashboardShell)                              | `openPattern`                                                                                         |
  | `MoldePage`                                               | `PatternPage`                                                                                         |
  | `MoldeCard` (component + file)                            | `PatternCard`                                                                                         |
  | `MoldeGrid` (component + file)                            | `PatternGrid`                                                                                         |
  | Route `app/molde/[id]`                                    | `app/pattern/[id]`                                                                                    |
  | Route `app/api/moldes/*`                                  | `app/api/patterns/*`                                                                                  |
  | `"MoldeCard"` (i18n namespace key)                        | `"PatternCard"`                                                                                       |
  | `"MoldeGrid"` (i18n namespace key)                        | `"PatternGrid"`                                                                                       |
  | `"myMoldesLabel"` (i18n key)                              | `"myPatternsLabel"`                                                                                   |
  | `"newMoldeButton"` (i18n key)                             | `"newPatternButton"`                                                                                  |
  | fallback export slug `"molde"` (`lib/export/download.ts`) | `"pattern"`                                                                                           |

  Not renamed: `lib/types.ts`'s existing `Pattern` interface (the drafted garment — pieces/viewBox/spec) is untouched and unrelated; `PatternState.pattern: Pattern` (a pattern-document's drafted pattern) is the intended, idiomatic shape — same pattern as `MoldeState.pattern: Pattern` today.

---

### Task 1: Prisma schema + migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260819120000_rename_molde_to_pattern/migration.sql`

**Interfaces:**

- Produces: Prisma model `Pattern` (table `"Pattern"`, columns `id`, `userId`, `data`, `updatedAt`, `createdAt`), relation `User.patterns: Pattern[]`. Task 2 depends on this compiling (`prisma generate` must run first).

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Change:

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String?
  createdAt    DateTime @default(now())
  moldes       Molde[]
  wallet       Wallet?
}

model Molde {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data      Json
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@index([userId, updatedAt])
}
```

to:

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String?
  createdAt    DateTime @default(now())
  patterns     Pattern[]
  wallet       Wallet?
}

model Pattern {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data      Json
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@index([userId, updatedAt])
}
```

(`Wallet`/`Transaction` models are unchanged — leave them exactly as they are.)

- [ ] **Step 2: Create the migration directory and SQL by hand**

Create `prisma/migrations/20260819120000_rename_molde_to_pattern/migration.sql`:

```sql
-- Molde -> Pattern rename (domain entity, not just the route). Dev data is
-- disposable -- same "reset is acceptable, decision registered in spec"
-- precedent as prisma/migrations/20260817002232_reset_moldes_english and
-- prisma/migrations/20260818201820_molde_own_id.
DROP TABLE "Molde";

CREATE TABLE "Pattern" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pattern_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Pattern_userId_updatedAt_idx" ON "Pattern"("userId", "updatedAt");

ALTER TABLE "Pattern" ADD CONSTRAINT "Pattern_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run: `npm run db:up` (ensure local Postgres is running on host port 5433), then apply the hand-authored migration (don't pass `--name` — that flag is only for having Prisma _generate_ a new migration from a schema diff; since Step 2 already wrote the migration folder/SQL by hand, `migrate dev` just needs to detect and apply it):

```bash
npm run db:migrate
```

Prisma will find the pending `20260819120000_rename_molde_to_pattern` folder, apply its SQL, and — since the schema now matches the migration history exactly — report "No schema change was detected" rather than prompting to create another migration. Then run `npx prisma generate` if it wasn't triggered automatically (this project's `postinstall` also runs it).

Expected: no errors; `node_modules/@prisma/client` now exposes `prisma.pattern.*` instead of `prisma.molde.*` (this will make `lib/db/molde.ts` fail to typecheck until Task 2 — expected, don't run `npm run build` until Task 2 is done).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260819120000_rename_molde_to_pattern
git commit -m "feat(db): rename Molde model to Pattern"
```

---

### Task 2: DB repository layer (`lib/db/molde.ts` → `pattern.ts`, `lib/db/molde-wallet.ts` → `pattern-wallet.ts`)

**Files:**

- Create: `lib/db/pattern.ts` (replaces `lib/db/molde.ts`)
- Delete: `lib/db/molde.ts`
- Create: `lib/db/pattern-wallet.ts` (replaces `lib/db/molde-wallet.ts`)
- Delete: `lib/db/molde-wallet.ts`
- Create: `lib/db/pattern.test.ts` (replaces `lib/db/molde.test.ts`)
- Delete: `lib/db/molde.test.ts`
- Create: `lib/db/pattern-wallet.test.ts` (replaces `lib/db/molde-wallet.test.ts`)
- Delete: `lib/db/molde-wallet.test.ts`
- Modify: `lib/db/wallet.ts:29` (comment only)

**Interfaces:**

- Consumes: Prisma `Pattern` model from Task 1.
- Produces: `patternNotFound()`, `lockPattern(tx, patternId, userId): Promise<MoldeState|null>` (still typed against `MoldeState` — that type itself is renamed in Task 3, not here), `savePattern(tx, patternId, state)`, `withPattern(patternId, userId, fn)`, `loadPattern(patternId, userId)`, `createPattern(userId): Promise<string>`, `listPatternsForUser(userId): Promise<PatternListItem[]>`, `renamePattern(patternId, userId, name)`, `deletePattern(patternId, userId)`, interface `PatternListItem`, `withPatternAndWallet(patternId, userId, fn)`. These are consumed by Task 4 (route handlers still importing under old names until then — Task 4 runs immediately after this one).

- [ ] **Step 1: `git mv lib/db/molde.ts lib/db/pattern.ts`, then rewrite it**

```typescript
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { seedMoldeState } from "@/lib/editor/state";
import { buildThumbnailSvg } from "@/lib/editor/thumbnail";
import type { GarmentType, MoldeState } from "@/lib/types";

type Tx = Prisma.TransactionClient;

// The timeout needs to cover the AI call (proposeGarment ~5–12s), which runs
// INSIDE the transaction — Prisma's 5s default would time out. Holding the
// lock during the AI call is intentional: it's what serializes the user's requests.
export const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

function toState(data: Prisma.JsonValue): MoldeState {
  return data as unknown as MoldeState;
}

export function patternNotFound(): NextResponse {
  return NextResponse.json(
    { status: "not_found", error: "Molde não encontrado." },
    { status: 404 },
  );
}

// Locks and reads the row, scoped to (id, userId) — a pattern owned by someone
// else reads as null, identical to a pattern that doesn't exist at all.
// Exported so lib/db/pattern-wallet.ts can lock this row inside its own
// combined transaction without duplicating the SQL.
export async function lockPattern(
  tx: Tx,
  patternId: string,
  userId: string,
): Promise<MoldeState | null> {
  const rows = await tx.$queryRaw<{ data: Prisma.JsonValue }[]>`
    SELECT "data" FROM "Pattern" WHERE "id" = ${patternId} AND "userId" = ${userId} FOR UPDATE`;
  return rows[0] ? toState(rows[0].data) : null;
}

export async function savePattern(
  tx: Tx,
  patternId: string,
  state: MoldeState,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Pattern" SET "data" = ${JSON.stringify(state)}::jsonb, "updatedAt" = now()
    WHERE "id" = ${patternId}`;
}

// load → fn(state) → save, inside an interactive transaction with a row lock.
// Returns null (without calling fn) when the pattern doesn't exist or isn't
// the caller's — routes turn that into patternNotFound().
export async function withPattern<T>(
  patternId: string,
  userId: string,
  fn: (state: MoldeState) => T | Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const state = await lockPattern(tx, patternId, userId);
    if (!state) return null;
    const result = await fn(state);
    await savePattern(tx, patternId, state);
    return result;
  }, TX_OPTS);
}

// Read-only fetch, ownership-scoped. Null when missing or not owned.
export async function loadPattern(
  patternId: string,
  userId: string,
): Promise<MoldeState | null> {
  const row = await prisma.pattern.findUnique({ where: { id: patternId } });
  if (!row || row.userId !== userId) return null;
  return toState(row.data);
}

export async function createPattern(userId: string): Promise<string> {
  const data = seedMoldeState() as unknown as Prisma.InputJsonValue;
  const row = await prisma.pattern.create({ data: { userId, data } });
  return row.id;
}

export interface PatternListItem {
  id: string;
  name: string;
  garmentType: GarmentType | null;
  updatedAt: string;
  thumbnailSvg: string;
}

export async function listPatternsForUser(
  userId: string,
): Promise<PatternListItem[]> {
  const rows = await prisma.pattern.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => {
    const state = toState(row.data);
    return {
      id: row.id,
      name: state.pattern.name,
      // `pattern.spec` always has a default `type` (even pre-generation, for
      // baseMeasurements) — a pattern only really "is" that garment type once
      // it's been drafted into pieces. A blank pattern reports null.
      garmentType:
        state.pattern.pieces.length > 0
          ? (state.pattern.spec?.type ?? null)
          : null,
      updatedAt: row.updatedAt.toISOString(),
      thumbnailSvg: buildThumbnailSvg(state.pattern),
    };
  });
}

export async function renamePattern(
  patternId: string,
  userId: string,
  name: string,
): Promise<boolean> {
  const renamed = await withPattern(patternId, userId, (state) => {
    state.pattern = { ...state.pattern, name };
  });
  return renamed !== null;
}

export async function deletePattern(
  patternId: string,
  userId: string,
): Promise<boolean> {
  const res = await prisma.pattern.deleteMany({
    where: { id: patternId, userId },
  });
  return res.count > 0;
}
```

Note: `import { seedMoldeState } from "@/lib/editor/state"` and `MoldeState` stay under their **old** names here — those are renamed in Task 3, which runs right after this one and will update this file's import line accordingly. Don't rename them yet from this file in isolation, or `lib/editor/state.ts` (not yet touched) will fail to export what this file expects.

- [ ] **Step 2: `git mv lib/db/molde-wallet.ts lib/db/pattern-wallet.ts`, then rewrite it**

```typescript
import { prisma } from "./prisma";
import { lockPattern, savePattern, TX_OPTS } from "./pattern";
import { lockWallet, saveWallet, saveLedger } from "./wallet";
import type { LedgerEntry, Wallet } from "@/lib/billing/wallet";
import type { MoldeState } from "@/lib/types";

// Locks BOTH rows in the SAME transaction, atomically — Pattern ALWAYS first,
// then Wallet, in that fixed order. This is the only function in the codebase
// allowed to hold both locks at once; withWallet/withPattern alone are never
// combined with this in the same request, so the lock order can never invert
// and deadlock. Don't add a second combined-lock helper without preserving
// this order.
//
// If the pattern doesn't exist or isn't the caller's, returns null WITHOUT
// locking the wallet — routes turn that into patternNotFound().
export async function withPatternAndWallet<T>(
  patternId: string,
  userId: string,
  fn: (
    state: MoldeState,
    wallet: Wallet,
  ) =>
    | { result: T; entries: LedgerEntry[] }
    | Promise<{ result: T; entries: LedgerEntry[] }>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const state = await lockPattern(tx, patternId, userId);
    if (!state) return null;
    const wallet = await lockWallet(tx, userId);
    const { result, entries } = await fn(state, wallet);
    await savePattern(tx, patternId, state);
    await saveWallet(tx, userId, wallet);
    await saveLedger(tx, userId, entries);
    return result;
  }, TX_OPTS);
}
```

- [ ] **Step 3: Update the comment in `lib/db/wallet.ts:29`**

Find the comment referencing the old filename `lib/db/molde-wallet.ts` and change it to `lib/db/pattern-wallet.ts` (read the surrounding lines first with the Read tool to get exact wording — it's a one-line filename reference, no other change needed there).

- [ ] **Step 4: `git mv lib/db/molde.test.ts lib/db/pattern.test.ts` and `git mv lib/db/molde-wallet.test.ts lib/db/pattern-wallet.test.ts`, then update their contents**

Open each moved test file and apply the Global Constraints mapping table to every occurrence: import paths (`@/lib/db/molde` → `@/lib/db/pattern`, `@/lib/db/molde-wallet` → `@/lib/db/pattern-wallet`), every renamed function/type call (`loadMolde`→`loadPattern`, `createMolde`→`createPattern`, `listMoldesForUser`→`listPatternsForUser`, `renameMolde`→`renamePattern`, `deleteMolde`→`deletePattern`, `moldeNotFound`→`patternNotFound`, `withMolde`→`withPattern`, `lockMolde`→`lockPattern`, `saveMolde`→`savePattern`, `withMoldeAndWallet`→`withPatternAndWallet`, `MoldeListItem`→`PatternListItem`), and every `moldeId`/`moldeState` local variable → `patternId`/`patternState`. Test _descriptions_ (`it("...")` strings) that say "molde" in English prose (not pt-BR UI copy) should also read "pattern" for consistency — check each string; test description text is code-adjacent developer-facing English, not product UI copy, so rename it too.

- [ ] **Step 5: Run the affected tests**

```bash
npm test -- lib/db/pattern.test.ts lib/db/pattern-wallet.test.ts
```

Expected: PASS (these tests hit a real Postgres via the running `db:up` container — same as before the rename, only names changed).

- [ ] **Step 6: Commit**

```bash
git add lib/db/pattern.ts lib/db/pattern-wallet.ts lib/db/pattern.test.ts lib/db/pattern-wallet.test.ts lib/db/wallet.ts
git rm lib/db/molde.ts lib/db/molde-wallet.ts lib/db/molde.test.ts lib/db/molde-wallet.test.ts
git commit -m "refactor(db): rename molde repository layer to pattern"
```

---

### Task 3: Domain types + editor state + `lib/ai.ts` + `lib/api/compose.ts`

**Files:**

- Modify: `lib/types.ts` (the `MoldeState`/`EditorState` block only)
- Modify: `lib/editor/state.ts`
- Modify: `lib/editor/state.test.ts`
- Modify: `lib/editor/thumbnail.ts` (comment only)
- Modify: `lib/ai.ts`
- Modify: `lib/api/compose.ts`
- Modify: `lib/api/compose.test.ts`
- Modify: `lib/db/pattern.ts` (just its `MoldeState`/`seedMoldeState` import line, now that Task 2 already renamed everything else in this file)
- Modify: `lib/db/pattern-wallet.ts` (same — just its `MoldeState` import line)

**Interfaces:**

- Produces: type `PatternState { pattern: Pattern; chat: ChatMessage[]; conflict: ConflictInfo | null }`, `EditorState extends PatternState`, function `seedPatternState(): PatternState`. Every function in `lib/editor/state.ts` now takes `state: PatternState`. Consumed by Task 4 (route handlers) which already call these functions by their existing names (`addMessage`, `bumpVersion`, `setConflict`, `getSpec`, `applyGarmentSpec`, `refitSleeve`, `applySizes` — none of those names change, only the `MoldeState` param type they accept).

- [ ] **Step 1: Edit `lib/types.ts`**

Find (around line 147-158):

```typescript
// The molde's own state — pattern/chat/conflict. Credits/billing live in a
// separate Wallet (lib/billing/wallet.ts), composed in only for the API/store
// wire shape below.
export interface MoldeState {
  pattern: Pattern;
  chat: ChatMessage[];
  conflict: ConflictInfo | null;
}

export interface EditorState extends MoldeState {
  credits: Credits;
}
```

Replace with:

```typescript
// The pattern's own state — the drafted garment/chat/conflict. Credits/billing
// live in a separate Wallet (lib/billing/wallet.ts), composed in only for the
// API/store wire shape below.
export interface PatternState {
  pattern: Pattern;
  chat: ChatMessage[];
  conflict: ConflictInfo | null;
}

export interface EditorState extends PatternState {
  credits: Credits;
}
```

- [ ] **Step 2: Rewrite `lib/editor/state.ts`**

```typescript
import {
  ChatMessage,
  ConflictInfo,
  GarmentSpec,
  PatternState,
  Pattern,
  Piece,
} from "@/lib/types";
import { draftGarment, seamCheck } from "@/lib/draft/garment";
import { resolveMeasurements } from "@/lib/measurements";
import type { Translate } from "@/lib/i18n/translate";

// Marker (dashed circle) over a piece's armhole region, from the bbox
// of its vertices in px. Illustrative — points at the conflicting seam on the canvas.
function armholeMarker(
  piece: Piece | undefined,
): { cx: number; cy: number; r: number } | null {
  const vs = piece?.vertices;
  if (!vs || vs.length === 0) return null;
  const xs = vs.map((v) => v.x);
  const ys = vs.map((v) => v.y);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return { cx: maxX - 6, cy: minY + (maxY - minY) * 0.28, r: 14 };
}

// Detects a seam mismatch between the body's armhole and the sleeve cap
// (deterministic seamCheck) and builds the ConflictInfo with canvas markers.
function detectConflict(
  pieces: Piece[],
  armholeLenCm: number | undefined,
  sleeveArmholeCm: number | undefined,
  t: Translate,
): ConflictInfo | null {
  const seam = seamCheck(armholeLenCm, sleeveArmholeCm);
  if (!seam) return null;
  const front = pieces.find((p) => p.id === "body-front");
  const sleeve = pieces.find((p) => p.id === "sleeve");
  const markers = [armholeMarker(front), armholeMarker(sleeve)].filter(
    (m): m is { cx: number; cy: number; r: number } => m !== null,
  );
  const maior = (armholeLenCm ?? 0) > (sleeveArmholeCm ?? 0);
  return {
    id: `conf-${Date.now()}`,
    title: t("conflict.title"),
    description: t("conflict.description", {
      diffCm: seam.diffCm,
      direction: maior ? "larger" : "smaller",
    }),
    diffCm: seam.diffCm,
    suggestion: t("conflict.suggestion"),
    pieceAId: "body-front",
    pieceBId: "sleeve",
    markers,
  };
}

function seedPattern(): Pattern {
  const baseSize = "M" as const;
  const spec: GarmentSpec = {
    type: "blouse",
    gender: "female",
    measurementOverrides: {},
    style: {},
  };
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
    baseMeasurements: resolveMeasurements(baseSize, {}, "female"),
    viewBox: { w: 620, h: 380 },
  };
}

// Every user's initial blank pattern (pattern/chat/conflict — wallet is seeded
// separately, lib/billing/wallet.ts's seedWallet).
export function seedPatternState(): PatternState {
  return {
    pattern: seedPattern(),
    chat: [],
    conflict: null,
  };
}

export function addMessage(state: PatternState, message: ChatMessage): void {
  state.chat = [...state.chat, message];
}

export function bumpVersion(state: PatternState): void {
  state.pattern = {
    ...state.pattern,
    version: state.pattern.version + 1,
    savedAgo: "salvo agora",
  };
}

export function setConflict(
  state: PatternState,
  conflict: ConflictInfo | null,
): void {
  state.conflict = conflict;
}

export function getSpec(state: PatternState): GarmentSpec {
  return (
    state.pattern.spec ?? {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {},
    }
  );
}

// Drafts the garment from a validated spec and stores pieces/viewBox/spec on
// the pattern; attaches (or clears) the seam conflict (apply-with-warning).
export function applyGarmentSpec(
  state: PatternState,
  spec: GarmentSpec,
  t: Translate,
): void {
  const size = state.pattern.baseSize;
  const { pieces, viewBox, measurements, armholeLenCm, sleeveArmholeCm } =
    draftGarment(spec, size, t);
  state.pattern = {
    ...state.pattern,
    pieces,
    viewBox,
    spec,
    baseMeasurements: measurements,
  };
  state.conflict = detectConflict(pieces, armholeLenCm, sleeveArmholeCm, t);
}

// "Corrigir manga" (sleeve fix): sets sleeveRefit and re-drafts — the cap now
// uses the adjusted armhole, the seams match, and detectConflict returns null.
export function refitSleeve(state: PatternState, t: Translate): void {
  const spec = getSpec(state);
  applyGarmentSpec(
    state,
    { ...spec, style: { ...spec.style, sleeveRefit: true } },
    t,
  );
}

export function applySizes(state: PatternState, sizes: string[]): void {
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
```

(`name: "Novo molde"`, `savedAgo: "ainda não salvo"`/`"salvo agora"` are pt-BR UI copy — left untouched, per Global Constraints.)

- [ ] **Step 3: Update `lib/editor/state.test.ts`**

Apply the mapping table: every `MoldeState` → `PatternState`, `seedMoldeState` → `seedPatternState`, `moldeState`/`moldeId` locals → `patternState`/`patternId`. English test-description prose mentioning "molde" → "pattern". pt-BR assertions on UI strings (e.g. asserting `name === "Novo molde"`) stay unchanged.

- [ ] **Step 4: Update the comment in `lib/editor/thumbnail.ts`**

Change the comment mentioning "molde's" to "pattern's" — no code changes in this file (its function signature `buildThumbnailSvg(pattern: Pattern)` already uses the unrelated `Pattern` type and needs no edit).

- [ ] **Step 5: Update `lib/ai.ts`**

Change:

```typescript
import { MoldeState, GarmentSpec, ClarifyQuestion } from "./types";
```

to:

```typescript
import { PatternState, GarmentSpec, ClarifyQuestion } from "./types";
```

and update every `state: MoldeState` parameter (lines ~130 and ~161 per the earlier read — search the file for `MoldeState` to catch all) to `state: PatternState`.

- [ ] **Step 6: Rewrite `lib/api/compose.ts`**

```typescript
import { renewsInDays } from "@/lib/billing/wallet";
import type { Wallet } from "@/lib/billing/wallet";
import type { Credits, EditorState, PatternState } from "@/lib/types";

export function buildCredits(wallet: Wallet, now: Date): Credits {
  return {
    plan: wallet.plan,
    planLabel: wallet.planLabel,
    balance: wallet.balance,
    total: wallet.total,
    renewsInDays: renewsInDays(wallet, now),
  };
}

// Builds the full wire/store EditorState from the pattern's own state and the
// wallet — the client/store never know credits moved out of the pattern blob.
export function composeEditorState(
  patternState: PatternState,
  wallet: Wallet,
  now: Date,
): EditorState {
  return { ...patternState, credits: buildCredits(wallet, now) };
}
```

- [ ] **Step 7: Update `lib/api/compose.test.ts`**

Apply the mapping table: `MoldeState` → `PatternState`, `moldeState` locals → `patternState`.

- [ ] **Step 8: Update the two now-stale import lines from Task 2**

In `lib/db/pattern.ts`, change:

```typescript
import { seedMoldeState } from "@/lib/editor/state";
...
import type { GarmentType, MoldeState } from "@/lib/types";
```

to:

```typescript
import { seedPatternState } from "@/lib/editor/state";
...
import type { GarmentType, PatternState } from "@/lib/types";
```

and rename every `MoldeState` type usage in that file to `PatternState`, and the one `seedMoldeState()` call in `createPattern` to `seedPatternState()`.

In `lib/db/pattern-wallet.ts`, change:

```typescript
import type { MoldeState } from "@/lib/types";
```

to:

```typescript
import type { PatternState } from "@/lib/types";
```

and rename its `state: MoldeState` parameter type to `PatternState`.

- [ ] **Step 9: Run the affected tests**

```bash
npm test -- lib/editor/state.test.ts lib/api/compose.test.ts lib/db/pattern.test.ts lib/db/pattern-wallet.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/types.ts lib/editor/state.ts lib/editor/state.test.ts lib/editor/thumbnail.ts lib/ai.ts lib/api/compose.ts lib/api/compose.test.ts lib/db/pattern.ts lib/db/pattern-wallet.ts
git commit -m "refactor(types): rename MoldeState to PatternState"
```

---

### Task 4: Route handler content (imports + locals only — URLs/directories unchanged in this task)

**Files:**

- Modify: `app/api/moldes/route.ts`
- Modify: `app/api/moldes/[id]/route.ts`
- Modify: `app/api/moldes/[id]/generate/route.ts`
- Modify: `app/api/moldes/[id]/graduate/route.ts`
- Modify: `app/api/moldes/[id]/conflict/resolve/route.ts`
- Modify their matching `route.test.ts` files (same directories)
- Modify: `app/molde/[id]/page.tsx`

**Interfaces:**

- Consumes: `lib/db/pattern.ts`/`lib/db/pattern-wallet.ts` exports from Task 2, `PatternState` from Task 3.
- Note: `app/api/billing/purchase/route.ts` is deliberately **excluded** from this task — its `moldeId` request-body key is a wire contract shared with `lib/api-client.ts`'s `purchase()`, and both sides must change together in Task 5. Don't touch it here.
- These routes still live at their **old** URL paths (`/api/moldes/*`, `/molde/[id]`) after this task — only their internal imports/variable names change. Task 6 moves the directories.

- [ ] **Step 1: Rewrite `app/api/moldes/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { listPatternsForUser, createPattern } from "@/lib/db/pattern";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const patterns = await listPatternsForUser(gate.id);
  return NextResponse.json(patterns);
}

export async function POST() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const id = await createPattern(gate.id);
  return NextResponse.json({ id });
}
```

- [ ] **Step 2: Rewrite `app/api/moldes/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import {
  loadPattern,
  renamePattern,
  deletePattern,
  patternNotFound,
} from "@/lib/db/pattern";
import { loadWallet } from "@/lib/db/wallet";
import { composeEditorState } from "@/lib/api/compose";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const [patternState, wallet] = await Promise.all([
    loadPattern(id, gate.id),
    loadWallet(gate.id),
  ]);
  if (!patternState) return patternNotFound();
  return NextResponse.json(
    composeEditorState(patternState, wallet, new Date()),
  );
}

export async function PATCH(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { status: "error", error: "Nome obrigatório." },
      { status: 400 },
    );
  }
  const ok = await renamePattern(id, gate.id, name);
  if (!ok) return patternNotFound();
  return NextResponse.json({ status: "ok" });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const ok = await deletePattern(id, gate.id);
  if (!ok) return patternNotFound();
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 3: Rewrite `app/api/moldes/[id]/generate/route.ts`**

Same as the current file, with only these line changes:

```typescript
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";
import { patternNotFound } from "@/lib/db/pattern";
```

(replacing the `withMoldeAndWallet`/`@/lib/db/molde-wallet` and `moldeNotFound`/`@/lib/db/molde` import lines), and at the bottom:

```typescript
const result = await withPatternAndWallet(
  id,
  gate.id,
  async (
    state,
    wallet,
  ): Promise<{ result: NextResponse; entries: LedgerEntry[] }> => {
    // ... body unchanged ...
  },
);
return result ?? patternNotFound();
```

Every other line (the AI call, credit debit/refund logic, chat message building) is untouched — read the current file first and change only the import lines and the two call-site names (`withMoldeAndWallet`→`withPatternAndWallet`, `moldeNotFound()`→`patternNotFound()`).

- [ ] **Step 4: Rewrite `app/api/moldes/[id]/graduate/route.ts`**

Same treatment: change

```typescript
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";
import { patternNotFound } from "@/lib/db/pattern";
```

and the two call sites (`withMoldeAndWallet`→`withPatternAndWallet`, `moldeNotFound()`→`patternNotFound()`). Nothing else in the file changes.

- [ ] **Step 5: Rewrite `app/api/moldes/[id]/conflict/resolve/route.ts`**

Change:

```typescript
import { withPattern, patternNotFound } from "@/lib/db/pattern";
```

(replacing `withMolde, moldeNotFound` from `@/lib/db/molde`), rename the local `moldeState` variable to `patternState`, and change the two call sites (`withMolde(...)`→`withPattern(...)`, `moldeNotFound()`→`patternNotFound()`). Everything else (the `t`/`refitSleeve`/`setConflict` logic) is unchanged.

- [ ] **Step 6: Rewrite `app/molde/[id]/page.tsx`** (still at the old path — Task 6 moves the directory)

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadPattern } from "@/lib/db/pattern";
import { EditorShell } from "@/components/editor/EditorShell";

export default async function PatternPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");
  const { id } = await params;

  const patternState = await loadPattern(id, session.user.id);
  if (!patternState) redirect("/");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorShell userEmail={session.user.email} moldeId={id} />
    </div>
  );
}
```

(`moldeId={id}` prop stays as-is for now — `EditorShell` still expects that prop name until Task 7.)

- [ ] **Step 7: Update the five `route.test.ts` files alongside the routes touched above**

For each of `app/api/moldes/route.test.ts`, `app/api/moldes/[id]/route.test.ts`, `app/api/moldes/[id]/generate/route.test.ts`, `app/api/moldes/[id]/graduate/route.test.ts`, `app/api/moldes/[id]/conflict/resolve/route.test.ts`: apply the Global Constraints mapping table to every mock/import/call (`@/lib/db/molde`→`@/lib/db/pattern`, `@/lib/db/molde-wallet`→`@/lib/db/pattern-wallet`, every renamed function, `moldeId`/`moldeState` locals). These files still live at their current paths (Task 6 moves them).

- [ ] **Step 8: Run the affected tests**

```bash
npm test -- app/api/moldes lib/db/pattern.test.ts lib/db/pattern-wallet.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/api/moldes app/molde
git commit -m "refactor(api): update molde route handlers to use pattern repository layer"
```

---

### Task 5: `lib/api-client.ts`, `lib/store.ts`, `lib/dashboardStore.ts`, and the purchase wire key

**Files:**

- Modify: `lib/api-client.ts`
- Modify: `lib/store.ts`
- Modify: `lib/store.test.ts`
- Modify: `lib/dashboardStore.ts`
- Modify: `lib/dashboardStore.test.ts`
- Modify: `app/api/billing/purchase/route.ts`
- Modify: `app/api/billing/purchase/route.test.ts`

**Interfaces:**

- Produces: `api.listPatterns()`, `api.createPattern()`, `api.fetchPattern(patternId)`, `api.renamePattern(patternId, name)`, `api.deletePattern(patternId)`, `api.generate(patternId, ...)`, `api.graduate(patternId, ...)`, `api.resolveConflict(patternId, ...)`, `api.purchase(type, patternId?)` (body key now `patternId`), interface `PatternListItem`. URLs still point at `/api/moldes/*` in this task's client code — **wait, no**: see Step 1 note below, URLs change here because the server routes' _content_ already supports being hit either way, but the _directory_ (hence URL) hasn't moved yet (Task 6). To keep the app functionally correct at the end of this task, this task's client-side URL strings must still say `/api/moldes/*` — only Task 6 flips both the directory and these URL strings together. **Do not change the URL path strings in this task — only function/variable/type names and the `moldeId`→`patternId` body key.**

- [ ] **Step 1: Rewrite `lib/api-client.ts`**

```typescript
import { Credits, EditorState, GarmentType, LedgerHistoryEntry } from "./types";

export type GenerateResult =
  | {
      status: "ok" | "conflict" | "error" | "declined" | "clarify";
      state: EditorState;
    }
  | { status: "insufficient_credits"; required: number; balance: number };

export type PurchaseResult =
  { status: "ok"; state: EditorState } | { status: "ok"; credits: Credits };

export interface PatternListItem {
  id: string;
  name: string;
  garmentType: GarmentType | null;
  updatedAt: string;
  thumbnailSvg: string;
}

export interface RecentUsageEntry {
  reason: string | null;
  amount: number;
  createdAt: string;
}

export interface AccountSummary {
  credits: Credits;
  recentUsage: RecentUsageEntry[];
}

export interface AccountActionResult {
  status: "ok" | "error";
  error?: string;
}

export interface UpdateProfileResult extends AccountActionResult {
  name?: string;
  email?: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export function listPatterns(): Promise<PatternListItem[]> {
  return getJson<PatternListItem[]>("/api/moldes");
}

export async function createPattern(): Promise<{ id: string }> {
  const res = await fetch("/api/moldes", { method: "POST" });
  return (await res.json()) as { id: string };
}

export function fetchPattern(patternId: string): Promise<EditorState> {
  return getJson<EditorState>(`/api/moldes/${patternId}`);
}

export async function renamePattern(
  patternId: string,
  name: string,
): Promise<void> {
  await fetch(`/api/moldes/${patternId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deletePattern(patternId: string): Promise<void> {
  await fetch(`/api/moldes/${patternId}`, { method: "DELETE" });
}

export function generate(
  patternId: string,
  message: string,
  answering?: boolean,
): Promise<GenerateResult> {
  return postJson<GenerateResult>(`/api/moldes/${patternId}/generate`, {
    message,
    answering,
  });
}

export function graduate(
  patternId: string,
  sizes: string[],
): Promise<GenerateResult> {
  return postJson<GenerateResult>(`/api/moldes/${patternId}/graduate`, {
    sizes,
  });
}

export function resolveConflict(
  patternId: string,
  action: "fix" | "ignore",
): Promise<GenerateResult> {
  return postJson<GenerateResult>(`/api/moldes/${patternId}/conflict/resolve`, {
    action,
  });
}

export function purchase(
  type: "topup" | "subscribe",
  patternId?: string,
): Promise<PurchaseResult> {
  return postJson<PurchaseResult>("/api/billing/purchase", { type, patternId });
}

export function getAccountSummary(): Promise<AccountSummary> {
  return getJson<AccountSummary>("/api/account/summary");
}

export function getLedgerHistory(): Promise<{ ledger: LedgerHistoryEntry[] }> {
  return getJson<{ ledger: LedgerHistoryEntry[] }>("/api/account/ledger");
}

export async function updateProfile(
  name: string,
): Promise<UpdateProfileResult> {
  const res = await fetch("/api/account/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as UpdateProfileResult;
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AccountActionResult> {
  return postJson<AccountActionResult>("/api/account/password", {
    currentPassword,
    newPassword,
  });
}

export async function deleteAccount(
  password: string,
): Promise<AccountActionResult> {
  const res = await fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return (await res.json()) as AccountActionResult;
}
```

Note the URL strings (`"/api/moldes"`, `` `/api/moldes/${patternId}` ``, etc.) are **intentionally unchanged** — see the Task interface note above. Only `"/api/billing/purchase"`'s body key changes (`moldeId`→`patternId`), because that route's content (not its directory) is what encodes the key, and we're updating both sides of that wire contract in this same task (Step 3 below).

- [ ] **Step 2: Update `lib/store.ts`**

Change the `EditorStore` interface field and the `init` signature:

```typescript
interface EditorStore {
  ready: boolean;
  patternId: string | null;
  // ... unchanged fields ...
  init: (patternId: string) => Promise<void>;
  // ... unchanged ...
}
```

In the `create<EditorStore>` body, rename every occurrence:

- `moldeId: null,` → `patternId: null,`
- `init: async (moldeId: string) => { set({ moldeId }); const state = await api.fetchMolde(moldeId); ... }` → `init: async (patternId: string) => { set({ patternId }); const state = await api.fetchPattern(patternId); ... }`
- In `sendMessage`: `const moldeId = get().moldeId; if (!moldeId) return; ... await api.generate(moldeId, message, opts?.answering);` → `const patternId = get().patternId; if (!patternId) return; ... await api.generate(patternId, message, opts?.answering);`
- In `graduateSizes`: `const moldeId = get().moldeId; ... await api.graduate(moldeId, sizes);` → `const patternId = get().patternId; ... await api.graduate(patternId, sizes);`
- In `resolveConflict`: `const moldeId = get().moldeId; ... await api.resolveConflict(moldeId, action);` → `const patternId = get().patternId; ... await api.resolveConflict(patternId, action);`
- In `purchase`: `const moldeId = get().moldeId ?? undefined; const result = await api.purchase(type, moldeId);` → `const patternId = get().patternId ?? undefined; const result = await api.purchase(type, patternId);`

Every other line (paywall, generation-step timing, measurements, tab/tool state) is untouched.

- [ ] **Step 3: Update `app/api/billing/purchase/route.ts`** (paired with Step 1's client-side wire key change)

```typescript
import { NextResponse } from "next/server";
import { withWallet } from "@/lib/db/wallet";
import { loadPattern, patternNotFound } from "@/lib/db/pattern";
import { applyPurchase } from "@/lib/billing/wallet";
import { buildCredits, composeEditorState } from "@/lib/api/compose";
import { requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const { type, patternId } = (await request.json()) as {
    type: "topup" | "subscribe";
    patternId?: string;
  };
  const now = new Date();

  const wallet = await withWallet(gate.id, (wallet) => {
    const entry = applyPurchase(wallet, type, now);
    return { result: wallet, entries: [entry] };
  });

  if (typeof patternId === "string") {
    const patternState = await loadPattern(patternId, gate.id);
    if (!patternState) return patternNotFound();
    return NextResponse.json({
      status: "ok",
      state: composeEditorState(patternState, wallet, now),
    });
  }

  return NextResponse.json({
    status: "ok",
    credits: buildCredits(wallet, now),
  });
}
```

- [ ] **Step 4: Update `lib/dashboardStore.ts`**

```typescript
import { create } from "zustand";
import * as api from "./api-client";
import type { PatternListItem, RecentUsageEntry } from "./api-client";
import type { Credits, GarmentType } from "./types";

export type TypeFilter = GarmentType | "all";

interface DashboardStore {
  ready: boolean;
  error: boolean;
  patterns: PatternListItem[];
  credits: Credits | null;
  recentUsage: RecentUsageEntry[];
  search: string;
  typeFilter: TypeFilter;

  init: () => Promise<void>;
  create: () => Promise<string>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setSearch: (q: string) => void;
  setTypeFilter: (t: TypeFilter) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  ready: false,
  error: false,
  patterns: [],
  credits: null,
  recentUsage: [],
  search: "",
  typeFilter: "all",

  init: async () => {
    set({ ready: false, error: false });
    try {
      const [patterns, summary] = await Promise.all([
        api.listPatterns(),
        api.getAccountSummary(),
      ]);
      set({
        patterns,
        credits: summary.credits,
        recentUsage: summary.recentUsage,
        ready: true,
      });
    } catch {
      set({ error: true, ready: true });
    }
  },

  create: async () => {
    const { id } = await api.createPattern();
    return id;
  },

  rename: async (id, name) => {
    await api.renamePattern(id, name);
    set((s) => ({
      patterns: s.patterns.map((p) => (p.id === id ? { ...p, name } : p)),
    }));
  },

  remove: async (id) => {
    await api.deletePattern(id);
    set((s) => ({ patterns: s.patterns.filter((p) => p.id !== id) }));
  },

  setSearch: (search) => set({ search }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
}));

// Pure — takes a slice matching the store's shape so it's usable both from
// a live store snapshot and directly in tests.
export function filteredPatterns(state: {
  patterns: PatternListItem[];
  search: string;
  typeFilter: TypeFilter;
}): PatternListItem[] {
  const q = state.search.trim().toLowerCase();
  return state.patterns.filter((p) => {
    const matchesSearch = !q || p.name.toLowerCase().includes(q);
    const matchesType =
      state.typeFilter === "all" || p.garmentType === state.typeFilter;
    return matchesSearch && matchesType;
  });
}
```

- [ ] **Step 5: Update `lib/store.test.ts` and `lib/dashboardStore.test.ts`**

Apply the mapping table to both: `moldeId`→`patternId`, `fetchMolde`→`fetchPattern`, `listMoldes`→`listPatterns`, `createMolde`→`createPattern`, `renameMolde`→`renamePattern`, `deleteMolde`→`deletePattern`, `MoldeListItem`→`PatternListItem`, `moldes`→`patterns`, `filteredMoldes`→`filteredPatterns`, mock/spy names, and English test-description prose.

- [ ] **Step 6: Update `app/api/billing/purchase/route.test.ts`**

Apply the mapping table: `moldeId`→`patternId` (including any request-body fixtures that literally construct `{ type, moldeId: "..." }` — these must now say `patternId`), `@/lib/db/molde`→`@/lib/db/pattern`, `loadMolde`→`loadPattern`, `moldeNotFound`→`patternNotFound`.

- [ ] **Step 7: Run the affected tests**

```bash
npm test -- lib/store.test.ts lib/dashboardStore.test.ts app/api/billing/purchase
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/api-client.ts lib/store.ts lib/store.test.ts lib/dashboardStore.ts lib/dashboardStore.test.ts app/api/billing/purchase
git commit -m "refactor(client): rename molde client/store surface to pattern"
```

---

### Task 6: Move route directories (`app/api/moldes` → `app/api/patterns`, `app/molde` → `app/pattern`)

**Files:**

- Move: `app/api/moldes/**` → `app/api/patterns/**` (6 route files + their 5 test files, per Task 4)
- Move: `app/molde/[id]/page.tsx` → `app/pattern/[id]/page.tsx`
- Modify: `lib/api-client.ts` (URL strings only)
- Modify: `components/dashboard/DashboardShell.tsx` (the one `router.push` string — component/prop renames come in Task 7)

**Interfaces:**

- Produces: live routes `GET/POST /api/patterns`, `GET/PATCH/DELETE /api/patterns/[id]`, `POST /api/patterns/[id]/generate`, `POST /api/patterns/[id]/graduate`, `POST /api/patterns/[id]/conflict/resolve`, page `/pattern/[id]`.

- [ ] **Step 1: Move the directories**

```bash
git mv app/api/moldes app/api/patterns
git mv app/molde app/pattern
```

(`git mv` on a directory moves every file inside it in one shot — Next.js's App Router resolves routes purely from folder names, so no file content needs to change for the move itself.)

- [ ] **Step 2: Update the URL path strings in `lib/api-client.ts`**

Change every `"/api/moldes"` / `` `/api/moldes/${patternId}` `` (and its `/generate`, `/graduate`, `/conflict/resolve` suffixes) to `"/api/patterns"` / `` `/api/patterns/${patternId}` ``. This is the 6 `getJson`/`postJson`/`fetch` calls in `listPatterns`, `createPattern`, `fetchPattern`, `renamePattern`, `deletePattern`, `generate`, `graduate`, `resolveConflict`. (`"/api/billing/purchase"` is unrelated and stays as-is.)

- [ ] **Step 3: Update `components/dashboard/DashboardShell.tsx`'s navigation string**

Change:

```typescript
const openMolde = (id: string) => router.push(`/molde/${id}`);
```

to:

```typescript
const openMolde = (id: string) => router.push(`/pattern/${id}`);
```

(Only the path string changes here — `openMolde`'s own name and every call site is renamed in Task 7, which touches this file again.)

- [ ] **Step 4: Run the full test suite and build**

```bash
npm test
npm run build
```

Expected: both PASS — this is the first point where every route/URL/type is internally consistent end-to-end (only cosmetic component/file names and i18n keys remain pt-flavored, handled in Task 7).

- [ ] **Step 5: Commit**

```bash
git add app/api/patterns app/pattern lib/api-client.ts components/dashboard/DashboardShell.tsx
git commit -m "feat(routes): move /molde and /api/moldes to /pattern and /api/patterns"
```

---

### Task 7: Components + i18n keys + export fallback slug

**Files:**

- Create: `components/dashboard/PatternCard.tsx` (replaces `MoldeCard.tsx`)
- Delete: `components/dashboard/MoldeCard.tsx`
- Create: `components/dashboard/PatternGrid.tsx` (replaces `MoldeGrid.tsx`)
- Delete: `components/dashboard/MoldeGrid.tsx`
- Modify: `components/dashboard/DashboardShell.tsx`
- Modify: `components/dashboard/Sidebar.tsx`
- Modify: `components/editor/EditorShell.tsx`
- Modify: `app/pattern/[id]/page.tsx`
- Modify: `messages/pt-BR.json`
- Modify: `lib/export/download.ts`

**Interfaces:**

- Consumes: `PatternListItem` from `lib/api-client.ts`, `filteredPatterns`/`patterns` from `lib/dashboardStore.ts` (Task 5), `/pattern/[id]` route (Task 6).
- This task changes i18n namespace _keys_ — must ship in the same commit as the JSX `useTranslations()` call-site changes, or the app throws `next-intl` missing-message errors at runtime.

- [ ] **Step 1: `git mv components/dashboard/MoldeCard.tsx components/dashboard/PatternCard.tsx`, then rewrite it**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PatternListItem } from "@/lib/api-client";
import { useDashboardStore } from "@/lib/dashboardStore";
import { relativeTime } from "@/lib/format";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

export function PatternCard({
  pattern,
  onOpen,
}: {
  pattern: PatternListItem;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("PatternCard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const rename = useDashboardStore((s) => s.rename);
  const remove = useDashboardStore((s) => s.remove);

  const handleRename = () => {
    setMenuOpen(false);
    const next = window.prompt(t("renamePrompt"), pattern.name);
    if (next && next.trim() && next.trim() !== pattern.name) {
      rename(pattern.id, next.trim());
    }
  };

  return (
    <div className="border-border rounded-card group relative flex flex-col gap-2 border bg-white p-[10px]">
      <button
        type="button"
        onClick={() => onOpen(pattern.id)}
        className="bg-surface-alt rounded-item flex h-[112px] w-full items-center justify-center overflow-hidden"
      >
        {pattern.garmentType ? (
          <span
            className="h-full w-full [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: pattern.thumbnailSvg }}
          />
        ) : (
          <span className="text-muted text-[11px]">{t("blankLabel")}</span>
        )}
      </button>
      <div className="flex items-start justify-between gap-1">
        <div className="flex flex-col gap-px">
          <span className="text-[13px] font-semibold">{pattern.name}</span>
          <span className="text-muted text-[11px]">
            {relativeTime(pattern.updatedAt)}
          </span>
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label={t("menuAriaLabel")}
            onClick={() => setMenuOpen((v) => !v)}
            className="text-muted-2 hover:bg-surface-alt rounded-btn px-[6px] py-[2px] text-[13px] opacity-0 transition-opacity group-hover:opacity-100"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="border-border rounded-card shadow-modal bg-surface absolute top-[26px] right-0 z-10 flex w-[140px] flex-col border py-1">
              <button
                type="button"
                onClick={handleRename}
                className="hover:bg-surface-alt px-3 py-[6px] text-left text-[12px]"
              >
                {t("renameOption")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmingDelete(true);
                }}
                className="text-alert hover:bg-amber-bg px-3 py-[6px] text-left text-[12px]"
              >
                {t("deleteOption")}
              </button>
            </div>
          )}
        </div>
      </div>
      {confirmingDelete && (
        <ConfirmModal
          title={t("deleteModalTitle")}
          description={t("deleteModalDescription")}
          confirmLabel={t("deleteConfirmButton")}
          cancelLabel={t("deleteCancelButton")}
          onConfirm={() => {
            setConfirmingDelete(false);
            remove(pattern.id);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: `git mv components/dashboard/MoldeGrid.tsx components/dashboard/PatternGrid.tsx`, then rewrite it**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useDashboardStore, filteredPatterns } from "@/lib/dashboardStore";
import { PatternCard } from "./PatternCard";
import type { GarmentType } from "@/lib/types";

const GARMENT_TYPES: GarmentType[] = ["blouse", "dress", "skirt", "tshirt"];

export function PatternGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useTranslations("PatternGrid");
  const tGarment = useTranslations("TechSheetTab");
  const patterns = useDashboardStore((s) => s.patterns);
  const search = useDashboardStore((s) => s.search);
  const typeFilter = useDashboardStore((s) => s.typeFilter);
  const setSearch = useDashboardStore((s) => s.setSearch);
  const setTypeFilter = useDashboardStore((s) => s.setTypeFilter);

  const filtered = filteredPatterns({ patterns, search, typeFilter });
  const isTrulyEmpty = patterns.length === 0;
  const hasNoMatches = !isTrulyEmpty && filtered.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-[22px]">
      <div className="flex items-center gap-3">
        <span className="font-display text-[24px] font-semibold">
          {t("countLabel", { count: patterns.length })}
        </span>
        <div className="flex-1" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="border-border rounded-btn h-[34px] w-[180px] border px-3 text-[12.5px]"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="border-border rounded-btn h-[34px] border px-2 text-[12.5px]"
        >
          <option value="all">{t("typeFilterAll")}</option>
          {GARMENT_TYPES.map((gt) => (
            <option key={gt} value={gt}>
              {tGarment(`garmentType.${gt}`)}
            </option>
          ))}
        </select>
      </div>

      {isTrulyEmpty && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <span className="text-[13.5px] font-semibold">{t("emptyTitle")}</span>
          <span className="text-muted text-[12px]">
            {t("emptyDescription")}
          </span>
        </div>
      )}

      {hasNoMatches && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <span className="text-[13.5px] font-semibold">
            {t("noMatchesTitle")}
          </span>
          <span className="text-muted text-[12px]">
            {t("noMatchesDescription")}
          </span>
        </div>
      )}

      {!isTrulyEmpty && !hasNoMatches && (
        <div className="grid grid-cols-4 gap-[14px]">
          {filtered.map((p) => (
            <PatternCard key={p.id} pattern={p} onOpen={onOpen} />
          ))}
          <div className="border-border rounded-card text-muted flex h-[168px] flex-col items-center justify-center gap-1 border border-dashed text-center text-[12px]">
            <span>{t("importCardLabel")}</span>
            <span className="bg-amber-bg border-amber-border text-amber-text rounded-pill border px-[7px] py-[2px] text-[10.5px] font-semibold">
              {t("importComingSoonBadge")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update `components/dashboard/DashboardShell.tsx`**

Change the import and the two remaining `molde`-named identifiers:

```typescript
import { PatternGrid } from "./PatternGrid";
```

(replacing the `MoldeGrid` import), and:

```typescript
const openPattern = (id: string) => router.push(`/pattern/${id}`);
```

(renaming `openMolde` → `openPattern` — the path string was already fixed in Task 6), and update its two JSX usages:

```tsx
        <Sidebar onCreate={openPattern} />
        <div className="flex min-h-0 flex-1 flex-col">
          <PatternGrid onOpen={openPattern} />
```

- [ ] **Step 4: Update `components/dashboard/Sidebar.tsx`**

Change:

```tsx
<span className="bg-olive-tint text-olive rounded-item px-[10px] py-[7px] text-[12.5px] font-medium">
  {t("myPatternsLabel")}
</span>
```

and:

```tsx
<button
  onClick={handleCreate}
  className="bg-olive rounded-btn px-[13px] py-[9px] text-[12.5px] font-medium text-white transition-[filter] hover:brightness-[0.95]"
>
  {t("newPatternButton")}
</button>
```

(only the two `t(...)` key arguments change — `myMoldesLabel`→`myPatternsLabel`, `newMoldeButton`→`newPatternButton`. Everything else in this file, including `measurementsLabel`/`studioBasesLabel`/`importLabel` keys, is untouched.)

- [ ] **Step 5: Update `components/editor/EditorShell.tsx`**

Change the prop type and destructuring:

```tsx
export function EditorShell({
  userEmail,
  patternId,
}: {
  userEmail: string;
  patternId: string;
}) {
  // ...
  useEffect(() => {
    init(patternId);
  }, [init, patternId]);
```

(only the `moldeId` prop name → `patternId`, everywhere it appears in this file — the destructured param, the type annotation, and the `useEffect` dependency array/call.)

- [ ] **Step 6: Update `app/pattern/[id]/page.tsx`'s JSX prop**

Change:

```tsx
<EditorShell userEmail={session.user.email} moldeId={id} />
```

to:

```tsx
<EditorShell userEmail={session.user.email} patternId={id} />
```

- [ ] **Step 7: Update `messages/pt-BR.json`**

Rename these four **keys** only (values stay byte-for-byte identical):

```json
  "PatternCard": {
```

(was `"MoldeCard"`, at the object starting around line 220 — keep every nested key/value inside it exactly as-is: `menuAriaLabel`, `renameOption`, `renameTitle`, `renamePrompt`, `deleteOption`, `deleteModalTitle`, `deleteModalDescription`, `deleteConfirmButton`, `deleteCancelButton`, `blankLabel`, all still pointing at their current pt-BR strings mentioning "molde").

```json
  "PatternGrid": {
```

(was `"MoldeGrid"`, around line 242 — same treatment, keep `countLabel`/`searchPlaceholder`/etc. values untouched).

Inside the existing `"Sidebar"` object (around line 253), rename just these two keys:

```json
    "myPatternsLabel": "Meus moldes",
    ...
    "newPatternButton": "＋ Novo molde"
```

(was `"myMoldesLabel"` and `"newMoldeButton"` — the string values `"Meus moldes"` and `"＋ Novo molde"` are unchanged pt-BR copy).

- [ ] **Step 8: Update `lib/export/download.ts`**

Change:

```typescript
return s || "molde";
```

to:

```typescript
return s || "pattern";
```

(the fallback slug used for the downloaded export filename when the pattern has no name — this is a code-facing default value, not UI copy).

- [ ] **Step 9: Run the full test suite, build, and lint**

```bash
npm test
npm run build
npm run lint
```

Expected: all PASS. This is the point where every code-facing "molde" occurrence in the app should be gone except pt-BR string values.

- [ ] **Step 10: Verify no code-facing occurrences remain**

```bash
grep -rniE 'molde' --include='*.ts' --include='*.tsx' app lib components | grep -viE '"[^"]*molde[^"]*"|Molde não encontrado|Corpo inválido'
```

Expected: no output (or only lines that are clearly pt-BR string _values_, which is fine — spot-check any hit manually). Note `patternNotFound()`'s error message body (`"Molde não encontrado."`) is UI-facing pt-BR copy and correctly stays as-is.

- [ ] **Step 11: Commit**

```bash
git add components/dashboard components/editor/EditorShell.tsx app/pattern/[id]/page.tsx messages/pt-BR.json lib/export/download.ts
git commit -m "refactor(ui): rename molde components and i18n keys to pattern"
```

---

### Task 8: Update CLAUDE.md

**Files:**

- Modify: `C:\Users\leona\Projects\moldai\CLAUDE.md`

**Interfaces:**

- None — documentation only. This project's CLAUDE.md is the source-of-truth for documented architecture decisions (per its own "Project stage" section), and it currently states the opposite of what this plan just did — that has to be corrected in the same change, not left stale.

- [ ] **Step 1: Update the sentence about `/molde/[id]` being unaffected by the English-route convention**

Find (in the `/settings` paragraph):

> "The route is English (`/settings`, renamed from the original `/configuracoes`) — a deliberate convention for new full-page screen routes going forward, even though the UI text inside stays pt-BR like everywhere else; previously-shipped routes (`/molde/[id]`) are unaffected, this is not a retroactive rename."

Replace with:

> "The route is English (`/settings`, renamed from the original `/configuracoes`) — the same English-route convention now applied retroactively to the editor as well: `/molde/[id]` was renamed to `/pattern/[id]`, and the `Molde` Prisma model/`/api/moldes/*` routes became `Pattern`/`/api/patterns/*`, closing the one remaining Portuguese code surface in the app. UI text inside stays pt-BR like everywhere else — only the route/identifiers changed."

- [ ] **Step 2: Update every other CLAUDE.md reference to `molde`-named routes/identifiers**

Search CLAUDE.md for `/molde`, `/api/moldes`, `Molde` (Prisma model), `lib/db/molde`, `moldeId`, `MoldeState`, `MoldeCard`, `MoldeGrid` and update each to the renamed form (`/pattern`, `/api/patterns`, `Pattern`, `lib/db/pattern`, `patternId`, `PatternState`, `PatternCard`, `PatternGrid`) — there are multiple paragraphs (the "Architecture" section's molde/route description, the API routes list, the dashboard section) that reference these by name and would otherwise describe a codebase that no longer exists. Do **not** touch any sentence describing UI copy (e.g. references to the pt-BR string "molde" shown to users) — only code/route identifiers.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document the molde-to-pattern rename"
```

---

### Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full clean verification**

```bash
npm run build
npm test
npm run lint
```

Expected: all PASS with zero errors/warnings introduced by this rename.

- [ ] **Step 2: Manual smoke check**

```bash
npm run db:up
npm run dev
```

In a browser: log in (`dev@moldai.local` / `moldai-dev`), confirm the dashboard loads at `/`, click "＋ Novo molde" and confirm it navigates to `/pattern/<id>` (not `/molde/<id>`), send a chat message to generate a pattern, go back to `/`, rename and delete the pattern from its card menu, and confirm the "Comprar créditos" purchase flow still completes without error (exercises the `patternId` wire key in the purchase body).

- [ ] **Step 3: Confirm no stray molde references outside expected UI copy**

```bash
grep -rli 'molde' --include='*.ts' --include='*.tsx' app lib components prisma/schema.prisma
```

Expected: zero files, or only files where every hit is a pt-BR string literal (spot-check with `grep -n` on any surviving file).
