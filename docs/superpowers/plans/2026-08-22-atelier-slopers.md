# Bases do ateliê (saved slopers) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a drafted pattern be saved as a named, reusable base (a `Sloper`), listed on a new `/slopers` screen reachable from the dashboard sidebar's no-longer-disabled "Bases do ateliê" entry, and used to create a new already-drafted pattern.

**Architecture:** A `Sloper` row stores only `{name, spec, sizes, baseSize, sizeTable, sizeChartName?}` — the snapshot a pattern needs to be redrafted — never the geometry, which `draftGarment` reproduces deterministically. Two pure functions in `lib/slopers/convert.ts` move between a `Pattern` and a `SloperData`; `lib/db/sloper.ts` is the only Prisma touchpoint and never learns what a `Pattern` is; four top-level routes under `/api/slopers` plus an optional `{sloperId}` on `POST /api/patterns` carry it to a new Zustand store and screen.

**Tech Stack:** TypeScript, Next.js 16 (App Router), Prisma 6 + Postgres, Zustand, next-intl (single pt-BR catalog), Vitest (`node` + `dom` projects), React Testing Library, Tailwind v4 + shadcn/ui primitives.

**Spec:** `docs/superpowers/specs/2026-08-22-atelier-slopers-design.md`

## Global Constraints

- Commits are English, Conventional Commits: `type(scope): summary`.
- Code identifiers, wire keys, Prisma models/columns and routes are **English**; UI display text is **pt-BR and comes from `messages/pt-BR.json`** — never a hardcoded pt-BR literal in a `.tsx` file.
- UI labels come from catalog lookups keyed by the EN enum value (`t("garmentType." + spec.type)` from the `TechSheetTab` namespace), never a hand-written `Record<Enum, string>`.
- Type comes from the named scale (`text-tick`/`text-meta`/`text-ui`/`text-control`/`text-body`/`text-title`/`text-display`). **No `text-[Npx]`, no stock Tailwind `text-sm`/`xs`/`base`/`lg`, no hex colors** — only `@theme` tokens from `app/globals.css`.
- Every server call goes through `lib/api-client.ts`; components never call `fetch` directly.
- Every `app/api/*` route is gated by `requireUser()` and reads its body through `readJsonObject(request)` — no bare `request.json()`.
- Every `app/api/*` error payload is `{status, error: <machine-readable code>}`; the client resolves the code through the catalog. No pt-BR prose on the wire or in the database.
- Repository functions are scoped to `(rowId, userId)` and return `null`/`false` for missing **or** not-owned — never throw, never leak whether the row exists.
- Catalog-sourced display text in tests is asserted against the exported `ptBR` object from `components/test-utils`, never a pasted pt-BR literal. A missing key renders the key path and still passes a substring match, so exact-value comparison is mandatory.
- Component tests render through `renderWithIntl` (`components/test-utils.tsx`) and live in the `dom` project (`components/**`); pure-logic and route tests live in the `node` project (`lib/**`, `app/**`).
- Do not add abstractions beyond what is needed.
- Every task ends with `npm test` green. `npm run lint` (scoped: `npx eslint app lib components`) and `npm run build` clean at the end.
- Verify anything touching routes on the **host** (`npm run dev`), not the Docker dev stack.

---

### Task 1: `SloperData` types and the pure conversion pair

**Files:**

- Modify: `lib/types.ts` (append after `SizeChartListEntry`, before `MAX_PATTERN_NAME_LENGTH`)
- Create: `lib/slopers/convert.ts`
- Test: `lib/slopers/convert.test.ts`

**Interfaces:**

- Consumes: `seedPatternState(t)`, `applyGarmentSpec(state, spec, t)`, `bumpVersion(state)`, `addMessage(state, message)` from `@/lib/editor/state`; `Translate` from `@/lib/i18n/translate`.
- Produces:
  - `interface SloperData { name: string; spec: GarmentSpec; sizes: string[]; baseSize: SizeLabel; sizeTable: Record<string, Measurements>; sizeChartName?: string }`
  - `interface SloperListItem { id: string; name: string; garmentType: GarmentType; baseSize: string; sizeChartName?: string; updatedAt: string; thumbnailSvg: string }`
  - `sloperFromPattern(pattern: Pattern, name: string): SloperData`
  - `patternFromSloper(sloper: SloperData, t: Translate): PatternState`

- [ ] **Step 1: Add the two interfaces to `lib/types.ts`**

Insert directly after the `SizeChartListEntry` interface:

```ts
/**
 * A saved atelier base — "base do ateliê" in the UI. Holds exactly what a
 * Pattern needs to be redrafted (the spec plus the frozen size snapshot it was
 * drafted against) and nothing that draftGarment can reproduce: no pieces, no
 * viewBox, no baseMeasurements. Persisting those would duplicate what `spec` +
 * `sizeTable` already determine — the savedAgo / planLabel mistake.
 *
 * Persisted 1:1 as a Sloper row's `data` JSON (lib/db/sloper.ts), the same
 * shape convention as PatternState and SizeChartData.
 */
export interface SloperData {
  name: string;
  spec: GarmentSpec;
  sizes: string[];
  baseSize: SizeLabel;
  sizeTable: Record<string, Measurements>;
  /** Frozen like Pattern.sizeChartName; absent on none, never guessed. */
  sizeChartName?: string;
}

/**
 * Wire shape for GET /api/slopers — a projection, not the blob (the
 * PatternListItem precedent). `thumbnailSvg` is built server-side by drafting
 * the sloper, since the geometry is not stored.
 */
export interface SloperListItem {
  id: string;
  name: string;
  garmentType: GarmentType;
  baseSize: string;
  sizeChartName?: string;
  updatedAt: string;
  thumbnailSvg: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/slopers/convert.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  seedPatternState,
  applyGarmentSpec,
  applySizes,
} from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec, PatternState } from "@/lib/types";
import { sloperFromPattern, patternFromSloper } from "./convert";

const BLOUSE: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: { neckline: "V", necklineDepthCm: 12, sleeve: "long", darts: true },
};

const TSHIRT: GarmentSpec = {
  type: "tshirt",
  gender: "male",
  measurementOverrides: { bust: 104 },
  style: {},
};

const SKIRT: GarmentSpec = {
  type: "skirt",
  gender: "female",
  measurementOverrides: {},
  style: { skirt: "a-line", skirtLengthCm: 60 },
};

function drafted(spec: GarmentSpec): PatternState {
  const state = seedPatternState(t);
  applyGarmentSpec(state, spec, t);
  return state;
}

describe("sloperFromPattern / patternFromSloper", () => {
  it.each([
    ["blouse", BLOUSE],
    ["tshirt", TSHIRT],
    ["skirt", SKIRT],
  ])("round-trips %s geometry exactly", (_label, spec) => {
    const original = drafted(spec);
    const sloper = sloperFromPattern(original.pattern, "base");
    const next = patternFromSloper(sloper, t);

    expect(next.pattern.pieces).toEqual(original.pattern.pieces);
    expect(next.pattern.viewBox).toEqual(original.pattern.viewBox);
    expect(next.pattern.baseMeasurements).toEqual(
      original.pattern.baseMeasurements,
    );
  });

  it("carries the snapshot and the name, and starts at version 1", () => {
    const original = drafted(BLOUSE);
    const sloper = sloperFromPattern(original.pattern, "base corpo reto");
    const next = patternFromSloper(sloper, t);

    expect(next.pattern.name).toBe("base corpo reto");
    expect(next.pattern.version).toBe(1);
    expect(next.pattern.sizes).toEqual(original.pattern.sizes);
    expect(next.pattern.baseSize).toBe(original.pattern.baseSize);
    expect(next.pattern.sizeTable).toEqual(original.pattern.sizeTable);
  });

  it("keeps a refitted sleeve — an internal style flag worth saving", () => {
    const original = drafted({
      ...BLOUSE,
      style: { ...BLOUSE.style, armholeDeepenCm: 3, sleeveRefit: true },
    });
    const sloper = sloperFromPattern(original.pattern, "base manga refeita");

    expect(sloper.spec.style.sleeveRefit).toBe(true);
    expect(patternFromSloper(sloper, t).pattern.pieces).toEqual(
      original.pattern.pieces,
    );
  });

  it("resets grading — a base is a base size, not a graded set", () => {
    const original = drafted(BLOUSE);
    applySizes(original, [original.pattern.sizes[0]]);
    expect(original.pattern.sizesApplied).not.toHaveLength(0);

    const next = patternFromSloper(
      sloperFromPattern(original.pattern, "base"),
      t,
    );
    expect(next.pattern.sizesApplied).toEqual([]);
    expect(next.pattern.sizesPending).toEqual(next.pattern.sizes);
  });

  it("preserves sizeChartName when present and omits it when absent", () => {
    const withChart = drafted(BLOUSE);
    withChart.pattern = {
      ...withChart.pattern,
      sizeChartName: "Grade da casa",
    };
    expect(sloperFromPattern(withChart.pattern, "b").sizeChartName).toBe(
      "Grade da casa",
    );

    const without = drafted(BLOUSE);
    without.pattern = { ...without.pattern, sizeChartName: undefined };
    const sloper = sloperFromPattern(without.pattern, "b");
    expect("sizeChartName" in sloper).toBe(false);
    expect(patternFromSloper(sloper, t).pattern.sizeChartName).toBeUndefined();
  });

  it("opens the chat with one ai turn naming the base", () => {
    const sloper = sloperFromPattern(drafted(BLOUSE).pattern, "base blusa");
    const next = patternFromSloper(sloper, t);

    expect(next.chat).toHaveLength(1);
    expect(next.chat[0].author).toBe("ai");
    expect(next.chat[0].text).toBe("chat.fromSloper");
  });

  it("throws rather than fabricating a spec for an undrafted pattern", () => {
    const blank = seedPatternState(t);
    blank.pattern = { ...blank.pattern, spec: undefined };
    expect(() => sloperFromPattern(blank.pattern, "base")).toThrow();
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run lib/slopers/convert.test.ts`
Expected: FAIL — `Failed to resolve import "./convert"`.

- [ ] **Step 4: Write the implementation**

Create `lib/slopers/convert.ts`:

```ts
import {
  addMessage,
  applyGarmentSpec,
  bumpVersion,
  seedPatternState,
} from "@/lib/editor/state";
import type { Pattern, PatternState, SloperData } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";

/**
 * Snapshots a drafted pattern as a reusable base. Throws on a pattern with no
 * spec: the routes check `pieces.length === 0 || !spec` first and answer 400,
 * so reaching here without one is a broken invariant, not user input — and
 * defaulting to a blouse the way validateSpec would is exactly the failure
 * `resolveDecision` learned to throw on.
 */
export function sloperFromPattern(pattern: Pattern, name: string): SloperData {
  if (!pattern.spec) throw new Error("sloperFromPattern: pattern has no spec");
  return {
    name,
    spec: pattern.spec,
    sizes: pattern.sizes,
    baseSize: pattern.baseSize,
    sizeTable: pattern.sizeTable,
    // Spread-if-present, not `sizeChartName: pattern.sizeChartName`: an
    // explicit `undefined` survives JSON.stringify as a *dropped* key here but
    // as a present-and-undefined key in memory, and the tests read `in`.
    ...(pattern.sizeChartName === undefined
      ? {}
      : { sizeChartName: pattern.sizeChartName }),
  };
}

/**
 * Builds a fresh, already-drafted PatternState from a base. Goes through the
 * same seedPatternState → applyGarmentSpec → bumpVersion path a generation
 * uses, so pieces, viewBox, baseMeasurements, the version and seam-conflict
 * detection all come from one place rather than a parallel one.
 *
 * Grading does not carry over: a base is a base size and a chart.
 */
export function patternFromSloper(
  sloper: SloperData,
  t: Translate,
): PatternState {
  const state = seedPatternState(t);
  state.pattern = {
    ...state.pattern,
    name: sloper.name,
    sizes: sloper.sizes,
    baseSize: sloper.baseSize,
    sizeTable: sloper.sizeTable,
    sizesApplied: [],
    sizesPending: sloper.sizes,
    ...(sloper.sizeChartName === undefined
      ? {}
      : { sizeChartName: sloper.sizeChartName }),
  };
  applyGarmentSpec(state, sloper.spec, t);
  bumpVersion(state);
  addMessage(state, {
    id: `msg-${Date.now()}-ai`,
    author: "ai",
    text: t("chat.fromSloper", { name: sloper.name }),
    createdAt: Date.now(),
  });
  return state;
}
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npx vitest run lib/slopers/convert.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/slopers/convert.ts lib/slopers/convert.test.ts
git commit -m "feat(slopers): add SloperData and the pure pattern-base conversion pair"
```

---

### Task 2: Prisma `Sloper` model, migration, and repository

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260822120000_add_sloper/migration.sql`
- Create: `lib/db/sloper.ts`

**Interfaces:**

- Consumes: `patternFromSloper` (Task 1), `buildThumbnailSvg` from `@/lib/editor/thumbnail`, `apiError`/`ERROR_STATUS` from `@/lib/api/errors` (the `sloper_not_found` member lands in Task 3 — **add it in Task 3, not here**; this task's `sloperNotFound()` helper is written in Task 3 alongside it).
- Produces:
  - `listSlopersForUser(userId: string, t: Translate): Promise<SloperListItem[]>`
  - `createSloper(userId: string, data: SloperData, t: Translate): Promise<SloperListItem>`
  - `loadSloper(sloperId: string, userId: string): Promise<SloperData | null>`
  - `renameSloper(sloperId: string, userId: string, name: string): Promise<boolean>`
  - `deleteSloper(sloperId: string, userId: string): Promise<boolean>`

- [ ] **Step 1: Add the model and the back-relation**

In `prisma/schema.prisma`, add `slopers Sloper[]` to `model User` (after `sizeCharts SizeChart[]`), and append the model after `model SizeChart`:

```prisma
model Sloper {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data      Json
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@index([userId, updatedAt])
}
```

- [ ] **Step 2: Write the migration SQL by hand**

Create `prisma/migrations/20260822120000_add_sloper/migration.sql` (mirrors `20260819130000_add_grades`):

```sql
-- Adds the Sloper table (same JSON-blob-per-row shape as Pattern/SizeChart)
-- for the "Bases do ateliê" feature. Purely additive -- no existing table or
-- persisted blob changes shape, so no reset migration is needed.
CREATE TABLE "Sloper" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sloper_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Sloper_userId_updatedAt_idx" ON "Sloper"("userId", "updatedAt");

ALTER TABLE "Sloper" ADD CONSTRAINT "Sloper_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate the schema and apply the migration**

```bash
npx prisma validate
npm run db:up
npm run db:migrate
```

Expected: `The schema at prisma/schema.prisma is valid`, then Prisma reporting `20260822120000_add_sloper` applied and the client regenerated. If `db:migrate` reports drift, **stop and report it** — do not `migrate reset`.

- [ ] **Step 4: Write the repository**

Create `lib/db/sloper.ts`:

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { patternFromSloper } from "@/lib/slopers/convert";
import { buildThumbnailSvg } from "@/lib/editor/thumbnail";
import type { SloperData, SloperListItem } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";

type Row = { id: string; data: Prisma.JsonValue; updatedAt: Date };

function toData(data: Prisma.JsonValue): SloperData {
  return data as unknown as SloperData;
}

// The geometry is not stored, so the card's thumbnail is drafted here -- the
// same per-row work listPatternsForUser does, except the pieces come from
// draftGarment instead of the blob. Pure geometry, no AI call.
function toListItem(row: Row, t: Translate): SloperListItem {
  const data = toData(row.data);
  const { pattern } = patternFromSloper(data, t);
  return {
    id: row.id,
    name: data.name,
    garmentType: data.spec.type,
    baseSize: data.baseSize,
    ...(data.sizeChartName === undefined
      ? {}
      : { sizeChartName: data.sizeChartName }),
    updatedAt: row.updatedAt.toISOString(),
    thumbnailSvg: buildThumbnailSvg(pattern),
  };
}

export async function listSlopersForUser(
  userId: string,
  t: Translate,
): Promise<SloperListItem[]> {
  const rows = await prisma.sloper.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => toListItem(row, t));
}

// Takes finished SloperData rather than a patternId: the route already owns
// the ownership-scoped loadPattern, and only the route can tell 404 (not your
// pattern) from 400 (not drafted). So this module never learns what a Pattern is.
export async function createSloper(
  userId: string,
  data: SloperData,
  t: Translate,
): Promise<SloperListItem> {
  const row = await prisma.sloper.create({
    data: { userId, data: data as unknown as Prisma.InputJsonValue },
  });
  return toListItem(row, t);
}

// Ownership-scoped read. Null when missing or not owned -- indistinguishable
// on purpose, so a 404 never confirms another account's row exists.
export async function loadSloper(
  sloperId: string,
  userId: string,
): Promise<SloperData | null> {
  const row = await prisma.sloper.findUnique({ where: { id: sloperId } });
  if (!row || row.userId !== userId) return null;
  return toData(row.data);
}

// A sloper is immutable apart from its name, so there is no load -> mutate ->
// save race worth a row lock: the scoped updateMany is the whole operation.
export async function renameSloper(
  sloperId: string,
  userId: string,
  name: string,
): Promise<boolean> {
  const row = await prisma.sloper.findUnique({ where: { id: sloperId } });
  if (!row || row.userId !== userId) return false;
  const next: SloperData = { ...toData(row.data), name };
  await prisma.sloper.update({
    where: { id: sloperId },
    data: { data: next as unknown as Prisma.InputJsonValue },
  });
  return true;
}

export async function deleteSloper(
  sloperId: string,
  userId: string,
): Promise<boolean> {
  const res = await prisma.sloper.deleteMany({
    where: { id: sloperId, userId },
  });
  return res.count > 0;
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: compiles clean. (No unit test here — a thin repository needs a live DB, like `lib/db/pattern.ts`; the routes that call it are tested with it mocked, in Tasks 3–5.)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260822120000_add_sloper lib/db/sloper.ts
git commit -m "feat(slopers): add the Sloper model, migration and repository"
```

---

### Task 3: `GET`/`POST /api/slopers`

**Files:**

- Modify: `lib/api/errors.ts` (add `sloper_not_found` to `NotFoundCode`, `ERROR_STATUS`, `STATUS_WORD`)
- Modify: `lib/db/sloper.ts` (add the `sloperNotFound()` helper)
- Create: `app/api/slopers/route.ts`
- Test: `app/api/slopers/route.test.ts`

**Interfaces:**

- Consumes: `listSlopersForUser`, `createSloper` (Task 2); `sloperFromPattern` (Task 1); `loadPattern`, `patternNotFound` from `@/lib/db/pattern`; `MAX_PATTERN_NAME_LENGTH` from `@/lib/types`.
- Produces: `sloperNotFound(): NextResponse` (used by Tasks 4 and 5); `GET`/`POST` handlers.

- [ ] **Step 1: Add the wire code**

In `lib/api/errors.ts`:

```ts
/** One per resource kind. */
export type NotFoundCode =
  | "pattern_not_found"
  | "size_chart_not_found"
  | "account_not_found"
  | "sloper_not_found";

export const ERROR_STATUS: Record<SharedErrorCode, number> = {
  bad_body: 400,
  unauthorized: 401,
  pattern_not_found: 404,
  size_chart_not_found: 404,
  account_not_found: 404,
  sloper_not_found: 404,
};
```

and in the `STATUS_WORD` map, beside its two siblings:

```ts
  sloper_not_found: "not_found",
```

- [ ] **Step 2: Add `sloperNotFound()` to the repository**

Append to `lib/db/sloper.ts` (and add `import type { NextResponse } from "next/server";` plus `import { apiError, ERROR_STATUS } from "@/lib/api/errors";` at the top — the `patternNotFound` precedent, which lives beside its own repository):

```ts
export function sloperNotFound(): NextResponse {
  return apiError("sloper_not_found", ERROR_STATUS.sloper_not_found);
}
```

- [ ] **Step 3: Write the failing test**

Create `app/api/slopers/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";
import type { GarmentSpec } from "@/lib/types";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/pattern", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/pattern")>(
      "@/lib/db/pattern",
    );
  return { ...actual, loadPattern: vi.fn() };
});
vi.mock("@/lib/db/sloper", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/sloper")>("@/lib/db/sloper");
  return { ...actual, listSlopersForUser: vi.fn(), createSloper: vi.fn() };
});

import { GET, POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadPattern } from "@/lib/db/pattern";
import { listSlopersForUser, createSloper } from "@/lib/db/sloper";

const mockLoadPattern = loadPattern as unknown as ReturnType<typeof vi.fn>;
const mockList = listSlopersForUser as unknown as ReturnType<typeof vi.fn>;
const mockCreate = createSloper as unknown as ReturnType<typeof vi.fn>;

const BLOUSE: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: {},
};

/** A pattern that has actually been drafted -- a blank seed is not one. */
function draftedPattern() {
  const state = seedPatternState(t);
  applyGarmentSpec(state, BLOUSE, t);
  return { state, updatedAt: new Date("2026-08-22T00:00:00.000Z") };
}

function post(body: unknown) {
  return new Request("http://test/api/slopers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/slopers", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    mockLoadPattern.mockReset();
    mockList.mockReset();
    mockCreate.mockReset();
  });

  it("GET returns the user's slopers", async () => {
    mockList.mockResolvedValue([{ id: "s1", name: "base blusa" }]);
    const res = await GET();
    expect(mockList).toHaveBeenCalledWith("u1", expect.any(Function));
    expect(await res.json()).toHaveLength(1);
  });

  it("GET 401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("POST saves the drafted pattern's snapshot as a sloper", async () => {
    mockLoadPattern.mockResolvedValue(draftedPattern());
    mockCreate.mockResolvedValue({ id: "s9", name: "base blusa" });

    const res = await POST(post({ patternId: "p1", name: "  base blusa  " }));

    expect(mockLoadPattern).toHaveBeenCalledWith("p1", "u1");
    const [userId, data] = mockCreate.mock.calls[0];
    expect(userId).toBe("u1");
    expect(data.name).toBe("base blusa"); // trimmed
    expect(data.spec.type).toBe("blouse");
    expect(data).not.toHaveProperty("pieces");
    expect(await res.json()).toEqual({ id: "s9", name: "base blusa" });
  });

  it("POST 404s for a pattern that is missing or not owned", async () => {
    mockLoadPattern.mockResolvedValue(null);
    const res = await POST(post({ patternId: "p1", name: "base" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("pattern_not_found");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("POST 400s for a pattern that has never been drafted", async () => {
    mockLoadPattern.mockResolvedValue({
      state: seedPatternState(t),
      updatedAt: new Date(),
    });
    const res = await POST(post({ patternId: "p1", name: "base" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("pattern_not_drafted");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", "   "],
    ["over the cap", "x".repeat(MAX_PATTERN_NAME_LENGTH + 1)],
  ])(
    "POST 400s on a name that is %s, without touching the DB",
    async (_l, name) => {
      const res = await POST(post({ patternId: "p1", name }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_name");
      expect(mockLoadPattern).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    },
  );

  it("POST 400s on a body with no patternId", async () => {
    const res = await POST(post({ name: "base" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
  });

  it("POST 401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(post({ patternId: "p1", name: "base" }));
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `npx vitest run app/api/slopers/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 5: Write the route**

Create `app/api/slopers/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/guard";
import { readJsonObject } from "@/lib/api/body";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";
import { loadPattern, patternNotFound } from "@/lib/db/pattern";
import { listSlopersForUser, createSloper } from "@/lib/db/sloper";
import { sloperFromPattern } from "@/lib/slopers/convert";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const t = await getTranslations("PatternData");
  return NextResponse.json(await listSlopersForUser(gate.id, t));
}

// Creates a sloper FROM a pattern: the client sends an id and a name, never a
// spec, so the only new validation surface is the name. The route composes
// (validate -> loadPattern -> drafted check -> createSloper) rather than
// delegating, because only it can tell 404 from 400.
export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const patternId = typeof body.patternId === "string" ? body.patternId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > MAX_PATTERN_NAME_LENGTH) {
    return apiError("invalid_name", 400);
  }
  if (!patternId) return apiError("bad_body", ERROR_STATUS.bad_body);

  const loaded = await loadPattern(patternId, gate.id);
  if (!loaded) return patternNotFound();
  const { pattern } = loaded.state;
  if (pattern.pieces.length === 0 || !pattern.spec) {
    return apiError("pattern_not_drafted", 400);
  }

  const t = await getTranslations("PatternData");
  const sloper = await createSloper(
    gate.id,
    sloperFromPattern(pattern, name),
    t,
  );
  return NextResponse.json(sloper);
}
```

- [ ] **Step 6: Run the tests and make sure they pass**

Run: `npx vitest run app/api/slopers/route.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/api/errors.ts lib/db/sloper.ts app/api/slopers
git commit -m "feat(slopers): add GET and POST /api/slopers"
```

---

### Task 4: `PATCH`/`DELETE /api/slopers/[id]`

**Files:**

- Create: `app/api/slopers/[id]/route.ts`
- Test: `app/api/slopers/[id]/route.test.ts`

**Interfaces:**

- Consumes: `renameSloper`, `deleteSloper`, `sloperNotFound` (Tasks 2–3); `MAX_PATTERN_NAME_LENGTH`.
- Produces: `PATCH`/`DELETE` handlers answering `{status: "ok"}` on success.

- [ ] **Step 1: Write the failing test**

Create `app/api/slopers/[id]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/sloper", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/sloper")>("@/lib/db/sloper");
  return { ...actual, renameSloper: vi.fn(), deleteSloper: vi.fn() };
});

import { PATCH, DELETE } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { renameSloper, deleteSloper } from "@/lib/db/sloper";

const mockRename = renameSloper as unknown as ReturnType<typeof vi.fn>;
const mockDelete = deleteSloper as unknown as ReturnType<typeof vi.fn>;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patch(body: unknown) {
  return new Request("http://test/api/slopers/s1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/slopers/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    mockRename.mockReset();
    mockDelete.mockReset();
  });

  it("PATCH renames and answers ok", async () => {
    mockRename.mockResolvedValue(true);
    const res = await PATCH(patch({ name: "  base nova  " }), ctx("s1"));
    expect(mockRename).toHaveBeenCalledWith("s1", "u1", "base nova");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("PATCH 404s when the sloper is missing or not owned", async () => {
    mockRename.mockResolvedValue(false);
    const res = await PATCH(patch({ name: "base" }), ctx("s1"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("sloper_not_found");
  });

  it.each([
    ["empty", "   "],
    ["over the cap", "x".repeat(MAX_PATTERN_NAME_LENGTH + 1)],
  ])("PATCH 400s on a name that is %s", async (_l, name) => {
    const res = await PATCH(patch({ name }), ctx("s1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_name");
    expect(mockRename).not.toHaveBeenCalled();
  });

  it("PATCH 400s on a null body", async () => {
    const res = await PATCH(patch(null), ctx("s1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
  });

  it("DELETE removes it and answers ok", async () => {
    mockDelete.mockResolvedValue(true);
    const res = await DELETE(new Request("http://test"), ctx("s1"));
    expect(mockDelete).toHaveBeenCalledWith("s1", "u1");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("DELETE 404s when the sloper is missing or not owned", async () => {
    mockDelete.mockResolvedValue(false);
    const res = await DELETE(new Request("http://test"), ctx("s1"));
    expect(res.status).toBe(404);
  });

  it.each([
    ["PATCH", () => PATCH(patch({ name: "base" }), ctx("s1"))],
    ["DELETE", () => DELETE(new Request("http://test"), ctx("s1"))],
  ])("%s 401s without a session", async (_l, call) => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await call();
    expect(res.status).toBe(401);
    expect(mockRename).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run "app/api/slopers/[id]/route.test.ts"`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the route**

Create `app/api/slopers/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { readJsonObject } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { renameSloper, deleteSloper, sloperNotFound } from "@/lib/db/sloper";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > MAX_PATTERN_NAME_LENGTH) {
    return apiError("invalid_name", 400);
  }

  const renamed = await renameSloper(id, gate.id, name);
  if (!renamed) return sloperNotFound();
  return NextResponse.json({ status: "ok" });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const deleted = await deleteSloper(id, gate.id);
  if (!deleted) return sloperNotFound();
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run "app/api/slopers/[id]/route.test.ts"`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/api/slopers/[id]"
git commit -m "feat(slopers): add PATCH and DELETE /api/slopers/[id]"
```

---

### Task 5: `POST /api/patterns` accepts `{sloperId}`

**Files:**

- Modify: `lib/db/pattern.ts` (extract `createPatternFromState`)
- Modify: `app/api/patterns/route.ts`
- Test: `app/api/patterns/route.test.ts` (existing — the current `POST()` calls take no argument and must be updated)

**Interfaces:**

- Consumes: `loadSloper`, `sloperNotFound` (Tasks 2–3); `patternFromSloper` (Task 1).
- Produces: `createPatternFromState(userId: string, state: PatternState): Promise<string>` in `lib/db/pattern.ts`.

- [ ] **Step 1: Extract `createPatternFromState`**

In `lib/db/pattern.ts`, replace the existing `createPattern` with:

```ts
export async function createPatternFromState(
  userId: string,
  state: PatternState,
): Promise<string> {
  const row = await prisma.pattern.create({
    data: { userId, data: state as unknown as Prisma.InputJsonValue },
  });
  return row.id;
}

export async function createPattern(
  userId: string,
  t: Translate,
): Promise<string> {
  return createPatternFromState(userId, seedPatternState(t));
}
```

- [ ] **Step 2: Write the failing test**

In `app/api/patterns/route.test.ts`: extend the mock factory, add the new imports, and replace the whole `describe("POST /api/patterns")` block.

Change the `@/lib/db/pattern` mock to:

```ts
vi.mock("@/lib/db/pattern", () => ({
  listPatternsForUser: vi.fn(),
  createPattern: vi.fn(),
  createPatternFromState: vi.fn(),
}));
vi.mock("@/lib/db/sloper", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/sloper")>("@/lib/db/sloper");
  return { ...actual, loadSloper: vi.fn() };
});
```

Add to the imports and mock handles:

```ts
import {
  listPatternsForUser,
  createPattern,
  createPatternFromState,
} from "@/lib/db/pattern";
import { loadSloper } from "@/lib/db/sloper";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { sloperFromPattern } from "@/lib/slopers/convert";
import { t as translate } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";

const mockCreateFromState = createPatternFromState as unknown as ReturnType<
  typeof vi.fn
>;
const mockLoadSloper = loadSloper as unknown as ReturnType<typeof vi.fn>;
```

Replace the POST describe block with:

```ts
const BLOUSE: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: {},
};

function sloperFixture() {
  const state = seedPatternState(translate);
  applyGarmentSpec(state, BLOUSE, translate);
  return sloperFromPattern(state.pattern, "base blusa");
}

function post(body?: unknown) {
  return new Request("http://test/api/patterns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("POST /api/patterns", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    mockCreate.mockReset();
    mockCreateFromState.mockReset();
    mockLoadSloper.mockReset();
  });

  it("creates a blank pattern when the request carries no body at all", async () => {
    mockCreate.mockResolvedValue("m9");
    const res = await POST(post());
    expect(mockCreate).toHaveBeenCalledWith("u1", expect.any(Function));
    expect(mockCreateFromState).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ id: "m9" });
  });

  it("creates a blank pattern for an empty object body", async () => {
    mockCreate.mockResolvedValue("m9");
    const res = await POST(post({}));
    expect(mockCreate).toHaveBeenCalled();
    expect(await res.json()).toEqual({ id: "m9" });
  });

  it("creates an already-drafted pattern from a sloper", async () => {
    mockLoadSloper.mockResolvedValue(sloperFixture());
    mockCreateFromState.mockResolvedValue("m10");

    const res = await POST(post({ sloperId: "s1" }));

    expect(mockLoadSloper).toHaveBeenCalledWith("s1", "u1");
    const [userId, state] = mockCreateFromState.mock.calls[0];
    expect(userId).toBe("u1");
    expect(state.pattern.pieces.length).toBeGreaterThan(0);
    expect(state.pattern.version).toBe(1);
    expect(state.pattern.name).toBe("base blusa");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ id: "m10" });
  });

  it("404s for an unknown sloper and creates nothing", async () => {
    mockLoadSloper.mockResolvedValue(null);
    const res = await POST(post({ sloperId: "nope" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("sloper_not_found");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateFromState).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run app/api/patterns/route.test.ts`
Expected: FAIL — `POST` still takes no `request` argument, so the sloper cases fall through to the blank path.

- [ ] **Step 4: Update the route**

Replace `POST` in `app/api/patterns/route.ts` (and extend the imports):

```ts
import { readJsonObject } from "@/lib/api/body";
import {
  listPatternsForUser,
  createPattern,
  createPatternFromState,
} from "@/lib/db/pattern";
import { loadSloper, sloperNotFound } from "@/lib/db/sloper";
import { patternFromSloper } from "@/lib/slopers/convert";

// ...

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  // Tolerates an unusable body -- that just means "no sloperId", i.e. a blank
  // pattern, which is exactly what api.createPattern() sends today. Same
  // deliberate tolerance as POST /api/size-charts and its sourceId.
  const body = await readJsonObject(request);
  const sloperId =
    !(body instanceof NextResponse) && typeof body.sloperId === "string"
      ? body.sloperId
      : undefined;
  const t = await getTranslations("PatternData");

  if (sloperId) {
    const sloper = await loadSloper(sloperId, gate.id);
    if (!sloper) return sloperNotFound();
    // Free: drafting is local computation, no Anthropic call -- the same
    // reason /conflict/resolve costs nothing.
    const id = await createPatternFromState(
      gate.id,
      patternFromSloper(sloper, t),
    );
    return NextResponse.json({ id });
  }

  const id = await createPattern(gate.id, t);
  return NextResponse.json({ id });
}
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npx vitest run app/api/patterns/route.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/db/pattern.ts app/api/patterns/route.ts app/api/patterns/route.test.ts
git commit -m "feat(slopers): create a drafted pattern from a sloper via POST /api/patterns"
```

---

### Task 6: API client calls and the slopers store

**Files:**

- Modify: `lib/api-client.ts`
- Create: `lib/slopersStore.ts`

**Interfaces:**

- Consumes: the routes from Tasks 3–5.
- Produces:
  - `api.listSlopers()`, `api.createSloper(patternId, name)`, `api.renameSloper(sloperId, name)`, `api.deleteSloper(sloperId)`, `api.createPattern(sloperId?)`
  - `useSlopersStore` with `{ready, error, actionError, slopers, init, createPattern, rename, remove, clearActionError}`

- [ ] **Step 1: Add the client calls**

In `lib/api-client.ts`, add `SloperListItem` to the type import from `./types`, change `createPattern`, and append the four sloper calls beside the size-chart block:

```ts
export function createPattern(sloperId?: string): Promise<{ id: string }> {
  // JSON.stringify drops an undefined value, so the blank case still posts {}.
  return postJson<{ id: string }>("/api/patterns", { sloperId });
}

export function listSlopers(): Promise<SloperListItem[]> {
  return getJson<SloperListItem[]>("/api/slopers");
}

export function createSloper(
  patternId: string,
  name: string,
): Promise<SloperListItem> {
  return postJson<SloperListItem>("/api/slopers", { patternId, name });
}

export async function renameSloper(
  sloperId: string,
  name: string,
): Promise<void> {
  await sendJson(`/api/slopers/${sloperId}`, "PATCH", { name });
}

export async function deleteSloper(sloperId: string): Promise<void> {
  await sendJson(`/api/slopers/${sloperId}`, "DELETE");
}
```

- [ ] **Step 2: Write the store**

Create `lib/slopersStore.ts`:

```ts
import { create } from "zustand";
import * as api from "./api-client";
import { ApiError } from "./api-client";
import type { SloperListItem } from "./types";

interface SlopersStore {
  ready: boolean;
  /** Initial load failed — the content region shows an error instead of a list. */
  error: boolean;
  /**
   * Wire code of the last failed *mutation*, or null. Separate from `error`
   * for the same reason it is on the dashboard store: a failed load has
   * nothing to show, a failed rename leaves a usable screen needing a notice.
   */
  actionError: string | null;
  slopers: SloperListItem[];
  init: () => Promise<void>;
  /** Blank when called with no id, drafted from the base when given one. */
  createPattern: (sloperId?: string) => Promise<string | null>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearActionError: () => void;
}

/** ApiError carries the wire code; anything else (offline, parse) is generic. */
function errorCode(err: unknown): string {
  return err instanceof ApiError ? err.code : "request_failed";
}

export const useSlopersStore = create<SlopersStore>((set) => ({
  ready: false,
  error: false,
  actionError: null,
  slopers: [],

  init: async () => {
    set({ ready: false, error: false });
    try {
      set({ slopers: await api.listSlopers(), ready: true });
    } catch {
      set({ error: true, ready: true });
    }
  },

  // Resolves to the new pattern's id (or null) rather than rejecting, because
  // the caller navigates to it — the dashboardStore.create precedent.
  createPattern: async (sloperId) => {
    try {
      const { id } = await api.createPattern(sloperId);
      return id;
    } catch (err) {
      set({ actionError: errorCode(err) });
      return null;
    }
  },

  // The list is updated only after the server confirms, so a failure leaves
  // the row exactly as it was rather than showing a rename that did not happen.
  rename: async (id, name) => {
    try {
      await api.renameSloper(id, name);
    } catch (err) {
      set({ actionError: errorCode(err) });
      return;
    }
    set((s) => ({
      slopers: s.slopers.map((x) => (x.id === id ? { ...x, name } : x)),
    }));
  },

  remove: async (id) => {
    try {
      await api.deleteSloper(id);
    } catch (err) {
      set({ actionError: errorCode(err) });
      return;
    }
    set((s) => ({ slopers: s.slopers.filter((x) => x.id !== id) }));
  },

  clearActionError: () => set({ actionError: null }),
}));
```

- [ ] **Step 3: Typecheck and run the full suite**

Run: `npm run build && npm test`
Expected: build clean, all tests pass (nothing consumes the store yet).

- [ ] **Step 4: Commit**

```bash
git add lib/api-client.ts lib/slopersStore.ts
git commit -m "feat(slopers): add the sloper API client calls and store"
```

---

### Task 7: "Salvar como base" in the editor footer

**Files:**

- Modify: `lib/store.ts` (add `saveAsSloper`)
- Modify: `components/editor/Footer.tsx`
- Modify: `messages/pt-BR.json` (`Footer` namespace, and `PatternData.chat.fromSloper`)
- Test: `components/editor/Footer.test.tsx` (new)

**Interfaces:**

- Consumes: `api.createSloper` (Task 6).
- Produces: `useEditorStore.saveAsSloper(name: string): Promise<boolean>`.

- [ ] **Step 1: Add the copy**

In `messages/pt-BR.json`, add to the `Footer` namespace:

```json
    "saveAsBaseButton": "Salvar como base",
    "saveAsBaseDisabledTitle": "Gere o molde e resolva o conflito de costura antes de salvar como base.",
    "saveAsBaseTitle": "Salvar como base do ateliê",
    "saveAsBasePrompt": "Nome da base",
    "saveAsBaseSaveButton": "Salvar",
    "saveAsBaseCancelButton": "Cancelar",
    "saveAsBaseSaved": "Base salva em Bases do ateliê.",
    "saveAsBaseError": "Não foi possível salvar a base. Tente de novo."
```

and to `PatternData.chat`:

```json
      "fromSloper": "Molde criado a partir da base “{name}”. Peça os ajustes por aqui."
```

- [ ] **Step 2: Add the store action**

In `lib/store.ts`, declare it in the `EditorStore` interface beside the other actions:

```ts
saveAsSloper: (name: string) => Promise<boolean>;
```

and implement it in the store body:

```ts
  // Saving a base does not change the pattern, so this writes no state. It
  // returns a boolean rather than setting `error`, because a failed save
  // leaves a perfectly usable editor: the Footer shows an inline notice, the
  // same shape it already uses for an export failure.
  saveAsSloper: async (name: string) => {
    const patternId = get().patternId;
    if (!patternId) return false;
    try {
      await api.createSloper(patternId, name);
      return true;
    } catch {
      return false;
    }
  },
```

- [ ] **Step 3: Write the failing test**

Create `components/editor/Footer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
} from "@/components/test-utils";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec, Pattern } from "@/lib/types";
import { Footer } from "./Footer";
import { useEditorStore } from "@/lib/store";

const BLOUSE: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: {},
};

function draftedPattern(): Pattern {
  const state = seedPatternState(t);
  applyGarmentSpec(state, BLOUSE, t);
  return state.pattern;
}

const saveAsSloper = vi.fn();

describe("Footer — salvar como base", () => {
  beforeEach(() => {
    saveAsSloper.mockReset().mockResolvedValue(true);
    useEditorStore.setState({ saveAsSloper });
  });

  it("saves the drafted pattern under the typed name", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <Footer
        pattern={draftedPattern()}
        conflictActive={false}
        generating={false}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: ptBR.Footer.saveAsBaseButton }),
    );
    const field = screen.getByLabelText(ptBR.Footer.saveAsBasePrompt);
    await user.clear(field);
    await user.type(field, "base corpo reto");
    await user.click(
      screen.getByRole("button", { name: ptBR.Footer.saveAsBaseSaveButton }),
    );

    expect(saveAsSloper).toHaveBeenCalledWith("base corpo reto");
    expect(await screen.findByText(ptBR.Footer.saveAsBaseSaved)).toBeVisible();
  });

  it("shows an inline notice when the save fails, keeping the screen usable", async () => {
    saveAsSloper.mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithIntl(
      <Footer
        pattern={draftedPattern()}
        conflictActive={false}
        generating={false}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: ptBR.Footer.saveAsBaseButton }),
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.Footer.saveAsBaseSaveButton }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      ptBR.Footer.saveAsBaseError,
    );
  });

  it.each([
    [
      "a blank pattern",
      { pattern: seedPatternState(t).pattern, conflictActive: false },
    ],
    ["an active conflict", { pattern: draftedPattern(), conflictActive: true }],
  ])("is disabled for %s", (_label, props) => {
    renderWithIntl(<Footer {...props} generating={false} />);
    expect(
      screen.getByRole("button", { name: ptBR.Footer.saveAsBaseButton }),
    ).toBeDisabled();
  });
});
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `npx vitest run --project dom components/editor/Footer.test.tsx`
Expected: FAIL — no button named "Salvar como base".

- [ ] **Step 5: Add the button and dialog to `Footer.tsx`**

Add to the imports:

```tsx
import { useEditorStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";
```

Add state and the handler beside the existing `exportError` state:

```tsx
const saveAsSloper = useEditorStore((s) => s.saveAsSloper);
const [savingBase, setSavingBase] = useState(false);
const [baseName, setBaseName] = useState(pattern.name);
const [baseNotice, setBaseNotice] = useState<{
  tone: "ok" | "error";
  text: string;
} | null>(null);

useEffect(() => {
  if (!baseNotice) return;
  const timeout = setTimeout(() => setBaseNotice(null), 6000);
  return () => clearTimeout(timeout);
}, [baseNotice]);

const submitBase = async (event: React.FormEvent) => {
  event.preventDefault();
  const name = baseName.trim();
  if (!name) return;
  setSavingBase(false);
  setBaseNotice(
    (await saveAsSloper(name))
      ? { tone: "ok", text: t("saveAsBaseSaved") }
      : { tone: "error", text: t("saveAsBaseError") },
  );
};
```

Render the notice next to the export one (inside the same row, before the export menu):

```tsx
{
  baseNotice && (
    <span
      role={baseNotice.tone === "error" ? "alert" : "status"}
      className={
        baseNotice.tone === "error"
          ? "text-alert bg-amber-bg border-amber-border rounded-item text-meta border px-[10px] py-[5px]"
          : "text-olive bg-olive-tint rounded-item text-meta px-[10px] py-[5px]"
      }
    >
      {baseNotice.text}
    </span>
  );
}
```

Add the button between the export `DropdownMenu` and the disabled "Salvar versão" button:

```tsx
<Button
  variant="outline"
  disabled={exportDisabled}
  title={exportDisabled ? t("saveAsBaseDisabledTitle") : undefined}
  onClick={() => {
    setBaseName(pattern.name);
    setSavingBase(true);
  }}
>
  {t("saveAsBaseButton")}
</Button>
```

And the dialog, as the last child of the footer row:

```tsx
<Dialog open={savingBase} onOpenChange={setSavingBase}>
  <DialogContent>
    <form onSubmit={submitBase}>
      <DialogHeader>
        <DialogTitle>{t("saveAsBaseTitle")}</DialogTitle>
      </DialogHeader>
      <Field className="py-4">
        <FieldLabel htmlFor="save-as-base-name">
          {t("saveAsBasePrompt")}
        </FieldLabel>
        <Input
          id="save-as-base-name"
          value={baseName}
          maxLength={MAX_PATTERN_NAME_LENGTH}
          onChange={(event) => setBaseName(event.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSavingBase(false)}
        >
          {t("saveAsBaseCancelButton")}
        </Button>
        <Button type="submit" size="sm" disabled={!baseName.trim()}>
          {t("saveAsBaseSaveButton")}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

Note `exportDisabled` is reused verbatim: a conflict blocks both, because founding future garments on divergent seams is the same mistake as cutting fabric from them.

- [ ] **Step 6: Run the tests and make sure they pass**

Run: `npx vitest run --project dom components/editor/Footer.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/store.ts components/editor/Footer.tsx components/editor/Footer.test.tsx messages/pt-BR.json
git commit -m "feat(editor): save a drafted pattern as an atelier base from the footer"
```

---

### Task 8: The sidebar becomes navigable

**Files:**

- Modify: `components/dashboard/Sidebar.tsx`
- Modify: `components/dashboard/DashboardShell.tsx`
- Test: `components/dashboard/Sidebar.test.tsx` (new)

**Interfaces:**

- Produces: `Sidebar({ active: "patterns" | "slopers", onNewPattern: () => void, disabled?: boolean })` — used by `DashboardShell` here and by `SlopersShell` in Task 9.

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/Sidebar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
} from "@/components/test-utils";
import { Sidebar } from "./Sidebar";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("Sidebar", () => {
  beforeEach(() => push.mockReset());

  it("navigates to the slopers screen — the entry is no longer coming soon", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Sidebar active="patterns" onNewPattern={vi.fn()} />);

    const entry = screen.getByRole("button", {
      name: ptBR.Sidebar.studioBasesLabel,
    });
    expect(entry).toBeEnabled();
    await user.click(entry);
    expect(push).toHaveBeenCalledWith("/slopers");
    expect(
      screen.queryByText(ptBR.Sidebar.comingSoonBadge),
    ).not.toBeInTheDocument();
  });

  it("marks the active section and navigates home from the slopers screen", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Sidebar active="slopers" onNewPattern={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: ptBR.Sidebar.studioBasesLabel }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: ptBR.Sidebar.myPatternsLabel }),
    );
    expect(push).toHaveBeenCalledWith("/");
  });

  it("delegates the new-pattern click to its owner screen", async () => {
    const onNewPattern = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<Sidebar active="patterns" onNewPattern={onNewPattern} />);

    await user.click(
      screen.getByRole("button", { name: ptBR.Sidebar.newPatternButton }),
    );
    expect(onNewPattern).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project dom components/dashboard/Sidebar.test.tsx`
Expected: FAIL — `Sidebar` does not accept `active`/`onNewPattern`, and "Bases do ateliê" is a `<span>`.

- [ ] **Step 3: Rewrite `Sidebar.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** The active section is a plain label; every other entry navigates. */
function NavItem({
  label,
  isActive,
  href,
}: {
  label: string;
  isActive: boolean;
  href: string;
}) {
  const router = useRouter();
  if (isActive)
    return (
      <span className="bg-olive-tint text-olive rounded-item text-ui px-[10px] py-[7px] font-medium">
        {label}
      </span>
    );
  return (
    <Button
      variant="ghost"
      size="chrome"
      onClick={() => router.push(href)}
      className="text-muted-2 justify-start"
    >
      {label}
    </Button>
  );
}

export function Sidebar({
  active,
  onNewPattern,
  disabled,
}: {
  active: "patterns" | "slopers";
  /** Owned by the screen, so its store is the one that records a failure. */
  onNewPattern: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Sidebar");

  return (
    <div className="border-border bg-surface flex w-[186px] flex-col border-r p-[14px]">
      <nav className="flex flex-col gap-1">
        <NavItem
          label={t("myPatternsLabel")}
          isActive={active === "patterns"}
          href="/"
        />
        {/* /size-charts renders no sidebar, so this entry is never the active one. */}
        <NavItem
          label={t("measurementsLabel")}
          isActive={false}
          href="/size-charts"
        />
        <NavItem
          label={t("studioBasesLabel")}
          isActive={active === "slopers"}
          href="/slopers"
        />
      </nav>
      <div className="flex-1" />
      <div className="border-border rounded-card text-disabled text-meta mb-3 border border-dashed p-[10px] text-center">
        {t("importLabel")}
      </div>
      <Button onClick={onNewPattern} disabled={disabled}>
        {t("newPatternButton")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Wire `DashboardShell`**

Replace the `openPattern` block and the `sidebar` prop:

```tsx
const create = useDashboardStore((s) => s.create);
const openPattern = (id: string) => router.push(`/pattern/${id}`);

// create() records its own failure on this screen's store, which the
// ActionErrorNotice below renders.
const handleNewPattern = async () => {
  const id = await create();
  if (id) openPattern(id);
};
```

```tsx
      sidebar={
        <Sidebar
          active="patterns"
          onNewPattern={handleNewPattern}
          disabled={error}
        />
      }
```

- [ ] **Step 5: Run the dom suite**

Run: `npx vitest run --project dom`
Expected: PASS, including the existing `DashboardShell.test.tsx`. If that file asserts on the old sidebar shape, update it to the new props rather than reverting the component.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/Sidebar.tsx components/dashboard/Sidebar.test.tsx components/dashboard/DashboardShell.tsx
git commit -m "feat(dashboard): make the Bases do atelie sidebar entry navigate"
```

---

### Task 9: The `/slopers` screen

**Files:**

- Create: `app/slopers/page.tsx`
- Create: `components/slopers/SlopersShell.tsx`
- Create: `components/slopers/SloperGrid.tsx`
- Create: `components/slopers/SloperCard.tsx`
- Modify: `messages/pt-BR.json` (`Slopers` and `SloperCard` namespaces)
- Test: `components/slopers/SloperCard.test.tsx`

**Interfaces:**

- Consumes: `useSlopersStore` (Task 6), `Sidebar` (Task 8), `AppShell`, `ActionErrorNotice`, `ConfirmModal`, `ScrollArea`, `Empty*`, `Dialog*`, `DropdownMenu*`, `Field`, `Input`, `Button`.

- [ ] **Step 1: Add the copy**

Add two namespaces to `messages/pt-BR.json`:

```json
  "Slopers": {
    "title": "Bases do ateliê",
    "subtitle": "Moldes salvos como ponto de partida para novas peças",
    "countLabel": "{count, plural, one {# base} other {# bases}}",
    "loading": "Carregando bases…",
    "loadError": "Não foi possível carregar suas bases. Tente recarregar a página.",
    "emptyTitle": "Nenhuma base salva",
    "emptyDescription": "Abra um molde já gerado e use “Salvar como base” no rodapé do editor."
  },
  "SloperCard": {
    "useButton": "Usar base",
    "meta": "{garment} · base {baseSize}",
    "menuAriaLabel": "Mais opções",
    "renameOption": "Renomear",
    "renameTitle": "Renomear base",
    "renamePrompt": "Novo nome da base",
    "renameSaveButton": "Salvar",
    "renameCancelButton": "Cancelar",
    "deleteOption": "Excluir",
    "deleteModalTitle": "Excluir esta base?",
    "deleteModalDescription": "Isso apaga a base do ateliê. Os moldes já criados a partir dela não são afetados.",
    "deleteConfirmButton": "Excluir",
    "deleteCancelButton": "Cancelar"
  },
```

- [ ] **Step 2: Write the failing test**

Create `components/slopers/SloperCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
} from "@/components/test-utils";
import type { SloperListItem } from "@/lib/types";
import { SloperCard } from "./SloperCard";
import { useSlopersStore } from "@/lib/slopersStore";

const SLOPER: SloperListItem = {
  id: "s1",
  name: "base corpo reto",
  garmentType: "blouse",
  baseSize: "M",
  sizeChartName: "Feminino adulto · ABNT",
  updatedAt: "2026-08-22T00:00:00.000Z",
  thumbnailSvg: "<svg />",
};

const remove = vi.fn();
const rename = vi.fn();

describe("SloperCard", () => {
  beforeEach(() => {
    remove.mockReset();
    rename.mockReset();
    useSlopersStore.setState({ remove, rename });
  });

  it("shows the garment, base size and source chart", () => {
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={vi.fn()} />);
    expect(screen.getByText(SLOPER.name)).toBeVisible();
    expect(
      screen.getByText(
        `${ptBR.TechSheetTab.garmentType.blouse} · base ${SLOPER.baseSize}`,
      ),
    ).toBeVisible();
    expect(screen.getByText(SLOPER.sizeChartName!)).toBeVisible();
  });

  it("omits the chart line when the base carries no chart name", () => {
    const { sizeChartName: _drop, ...noChart } = SLOPER;
    renderWithIntl(<SloperCard sloper={noChart} onUse={vi.fn()} />);
    expect(screen.queryByText(SLOPER.sizeChartName!)).not.toBeInTheDocument();
  });

  it("uses the base", async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={onUse} />);

    await user.click(
      screen.getByRole("button", { name: ptBR.SloperCard.useButton }),
    );
    expect(onUse).toHaveBeenCalledWith("s1");
  });

  it("deletes only after the confirmation", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SloperCard sloper={SLOPER} onUse={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: ptBR.SloperCard.menuAriaLabel }),
    );
    await user.click(await screen.findByText(ptBR.SloperCard.deleteOption));
    expect(remove).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: ptBR.SloperCard.deleteConfirmButton }),
    );
    expect(remove).toHaveBeenCalledWith("s1");
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run --project dom components/slopers/SloperCard.test.tsx`
Expected: FAIL — `Failed to resolve import "./SloperCard"`.

- [ ] **Step 4: Write `SloperCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SloperListItem } from "@/lib/types";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";
import { useSlopersStore } from "@/lib/slopersStore";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SloperCard({
  sloper,
  onUse,
}: {
  sloper: SloperListItem;
  onUse: (id: string) => void;
}) {
  const t = useTranslations("SloperCard");
  const tGarment = useTranslations("TechSheetTab");
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(sloper.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const rename = useSlopersStore((s) => s.rename);
  const remove = useSlopersStore((s) => s.remove);

  const submitRename = (event: React.FormEvent) => {
    event.preventDefault();
    const next = draftName.trim();
    if (next && next !== sloper.name) rename(sloper.id, next);
    setRenaming(false);
  };

  return (
    <div className="border-border rounded-card group relative flex flex-col gap-2 border bg-white p-[10px]">
      <div className="bg-surface-alt rounded-item flex h-[112px] w-full items-center justify-center overflow-hidden">
        <span
          className="h-full w-full [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: sloper.thumbnailSvg }}
        />
      </div>
      <div className="flex items-start justify-between gap-1">
        {/* min-w-0 so `truncate` has something to shrink against instead of
            pushing the "⋯" menu off the tile. */}
        <div className="flex min-w-0 flex-col gap-px">
          <span className="text-control truncate font-semibold">
            {sloper.name}
          </span>
          <span className="text-muted text-meta">
            {t("meta", {
              garment: tGarment(`garmentType.${sloper.garmentType}`),
              baseSize: sloper.baseSize,
            })}
          </span>
          {/* Absent on a base saved before patterns carried a chart name --
              omitted rather than guessed, like the tech sheet's row. */}
          {sloper.sizeChartName && (
            <span className="text-muted text-meta truncate">
              {sloper.sizeChartName}
            </span>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("menuAriaLabel")}
              className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[150px]">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => {
                  setDraftName(sloper.name);
                  setRenaming(true);
                }}
              >
                {t("renameOption")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmingDelete(true)}
              >
                {t("deleteOption")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button size="sm" onClick={() => onUse(sloper.id)}>
        {t("useButton")}
      </Button>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form onSubmit={submitRename}>
            <DialogHeader>
              <DialogTitle>{t("renameTitle")}</DialogTitle>
            </DialogHeader>
            <Field className="py-4">
              <FieldLabel htmlFor={`rename-sloper-${sloper.id}`}>
                {t("renamePrompt")}
              </FieldLabel>
              <Input
                id={`rename-sloper-${sloper.id}`}
                value={draftName}
                maxLength={MAX_PATTERN_NAME_LENGTH}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRenaming(false)}
              >
                {t("renameCancelButton")}
              </Button>
              <Button type="submit" size="sm" disabled={!draftName.trim()}>
                {t("renameSaveButton")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {confirmingDelete && (
        <ConfirmModal
          title={t("deleteModalTitle")}
          description={t("deleteModalDescription")}
          confirmLabel={t("deleteConfirmButton")}
          cancelLabel={t("deleteCancelButton")}
          onConfirm={() => {
            setConfirmingDelete(false);
            remove(sloper.id);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write `SloperGrid.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useSlopersStore } from "@/lib/slopersStore";
import { SloperCard } from "./SloperCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export function SloperGrid({ onUse }: { onUse: (id: string) => void }) {
  const t = useTranslations("Slopers");
  const slopers = useSlopersStore((s) => s.slopers);

  return (
    // `fill` + `min-h-full` so the Empty state still centres in the region
    // instead of collapsing to its own content height.
    <ScrollArea fill className="min-h-0 flex-1">
      <div className="flex min-h-full flex-col gap-4 p-[22px]">
        <span className="font-display text-display font-semibold">
          {t("countLabel", { count: slopers.length })}
        </span>

        {slopers.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-4 gap-[14px]">
            {slopers.map((s) => (
              <SloperCard key={s.id} sloper={s} onUse={onUse} />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 6: Write `SlopersShell.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shared/AppShell";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { SloperGrid } from "./SloperGrid";
import { useSlopersStore } from "@/lib/slopersStore";
import type { Credits } from "@/lib/types";

export function SlopersShell({
  userEmail,
  credits,
}: {
  userEmail: string;
  credits: Credits;
}) {
  const t = useTranslations("Slopers");
  const router = useRouter();
  const init = useSlopersStore((s) => s.init);
  const ready = useSlopersStore((s) => s.ready);
  const error = useSlopersStore((s) => s.error);
  const actionError = useSlopersStore((s) => s.actionError);
  const clearActionError = useSlopersStore((s) => s.clearActionError);
  const createPattern = useSlopersStore((s) => s.createPattern);

  useEffect(() => {
    init();
  }, [init]);

  // Both the sidebar's "＋ Novo molde" (blank) and a card's "Usar base"
  // (drafted) land here, so a failure is recorded on THIS screen's store.
  const openNewPattern = async (sloperId?: string) => {
    const id = await createPattern(sloperId);
    if (id) router.push(`/pattern/${id}`);
  };

  return (
    <AppShell
      title={t("title")}
      subtitle={t("subtitle")}
      backHref="/"
      credits={credits}
      userEmail={userEmail}
      sidebar={
        <Sidebar
          active="slopers"
          onNewPattern={() => openNewPattern()}
          disabled={error}
        />
      }
    >
      {actionError && <ActionErrorNotice onDismiss={clearActionError} />}
      {!ready && (
        <div
          role="status"
          className="text-muted text-control flex flex-1 items-center justify-center"
        >
          {t("loading")}
        </div>
      )}
      {ready && error && (
        <div
          role="alert"
          className="text-alert text-control flex flex-1 items-center justify-center"
        >
          {t("loadError")}
        </div>
      )}
      {ready && !error && <SloperGrid onUse={(id) => openNewPattern(id)} />}
    </AppShell>
  );
}
```

- [ ] **Step 7: Write `app/slopers/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadWallet } from "@/lib/db/wallet";
import { buildCredits } from "@/lib/api/compose";
import { SlopersShell } from "@/components/slopers/SlopersShell";

export default async function SlopersPage() {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const wallet = await loadWallet(session.user.id);

  return (
    <SlopersShell
      userEmail={session.user.email}
      credits={buildCredits(wallet, new Date())}
    />
  );
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run --project dom components/slopers/SloperCard.test.tsx`
Expected: PASS, 4 tests. Then `npm test` — everything green.

- [ ] **Step 9: Commit**

```bash
git add app/slopers components/slopers messages/pt-BR.json
git commit -m "feat(slopers): add the /slopers atelier base library screen"
```

---

### Task 10: Documentation and end-to-end verification

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Scope section**

In `### Scope`, change the MVP list's lead-in and add the fifth subsystem. Replace the "Medidas e grades" bullet's trailing sentence about the dashboard sidebar entry:

> - **Medidas e grades** (design `5i`, scoped down) — `/size-charts`. … The Audaces spreadsheet-import block on this screen is an inert dashed placeholder.
> - **Bases do ateliê** — `/slopers`. A drafted pattern is saved as a `Sloper` (spec + frozen size snapshot, never geometry) from the editor footer; the library lists them and creates an already-drafted pattern from one, free of credits.

- [ ] **Step 2: Document the model in Architecture**

Add a subsection after `### Size charts`:

> ### Atelier bases (`/slopers`)
>
> A `Sloper` (Prisma, JSON-blob-per-row like `Pattern`/`SizeChart`) holds `SloperData`: `name`, `spec`, and the frozen `sizes`/`baseSize`/`sizeTable`/`sizeChartName?` snapshot — **never the pieces**, because `draftGarment` is deterministic and persisting them would duplicate what the spec already determines (the `savedAgo`/`planLabel` lesson, applied before the fact). `lib/slopers/convert.ts` holds the pure pair `sloperFromPattern`/`patternFromSloper`, and the round-trip test asserting identical pieces is what licenses not storing geometry; the list thumbnail is drafted server-side for the same reason. `POST /api/slopers {patternId, name}` copies the snapshot off a pattern the server itself read under the ownership scope — the client never sends a spec, so there is no second `validateSpec`-shaped trust boundary. Creating a pattern from a base (`POST /api/patterns {sloperId}`) costs **0 credits**: it is local drafting with no Anthropic call, the same reason `conflict/resolve` is free. The UI term is pt-BR "base"; `Sloper` is its translation, not a transliteration — `Block` was unavailable because `lib/draft/body.ts` already means a body/sleeve/skirt block by it.

- [ ] **Step 3: Full verification**

```bash
npm test
npx eslint app lib components
npm run build
```

Expected: all suites pass; no lint errors; build succeeds. (Lint is scoped to `app lib components` — a repo-root `npm run lint` crawls any nested `.claude/worktrees/` checkout and false-alarms.)

- [ ] **Step 4: Live evidence on the host**

Start the host dev server (`npm run db:up` then `npm run dev`), sign in, and walk the flow, capturing a screenshot of the `/slopers` library:

1. Open a pattern, generate a blouse, confirm the footer's "Salvar como base" is enabled.
2. Save it as "base corpo reto"; confirm the inline confirmation appears.
3. Go to the dashboard sidebar → "Bases do ateliê" (no longer badged) → `/slopers` lists the base with a real thumbnail, `blusa · base M`, and its chart name.
4. Click "Usar base" → lands in the editor on a **drafted v1** with the same pieces, and the chat's opening turn names the base.
5. Confirm the credit balance in the header is unchanged across steps 2 and 4.
6. Rename and delete a base; confirm the list updates and a reload agrees.

- [ ] **Step 5: Commit and close the issue**

```bash
git add CLAUDE.md
git commit -m "docs: document the atelier base library"
```

Then close issue #1 with the test output and the `/slopers` screenshot as evidence.

---

## Self-Review

**Spec coverage:** §1 model → Tasks 1–2. §2 convert → Task 1. §3 repository → Task 2 (+ `sloperNotFound` in Task 3, where the error code it needs is added). §4 wire shape → Task 1 (type) + Task 2 (`toListItem`). §5 routes → Tasks 3–5. §6 footer save → Task 7. §7 `/slopers` screen → Task 9. §8 sidebar → Task 8. §9 copy → Tasks 7 and 9. Testing → each task's own steps plus Task 10. Evidence → Task 10 Step 4.

**Deviation from the spec, deliberate:** the spec named the new chat key `PatternData.fromSloperMessage`; the catalog's actual convention nests drafter chat strings under `PatternData.chat.*` (`chat.graduated`, `chat.sleeveRefit`), so the plan uses **`PatternData.chat.fromSloper`**. Same string, correct namespace.
