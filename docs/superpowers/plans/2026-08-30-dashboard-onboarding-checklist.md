# Dashboard Onboarding Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Comece com o pé direito · N de 5" onboarding checklist card to the dashboard (#232), with every step's completion honestly derived from real account state.

**Architecture:** Two new nullable `User` columns back the two steps (export, import) that have no other server-side trace; a new small size-chart helper backs the "configurar tabela de medidas" step; "gerar primeiro molde" is derived purely client-side from data the dashboard already loads. A new `POST /api/account/checklist-progress` endpoint records the export/import flags, pinged best-effort from the existing export and import code paths. The card itself is a new presentational component wired into `DashboardShell`, with dismissal kept in `localStorage` only.

**Tech Stack:** Next.js 16 (App Router), Prisma/Postgres, Zustand, next-intl, Vitest (two projects: `node`, `dom`), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-30-dashboard-onboarding-checklist-design.md`

## Global Constraints

- UI display text is pt-BR, from `messages/pt-BR.json` catalog lookups only — never hardcoded JSX strings. Code identifiers/wire keys/routes are English.
- Every `app/api/*` route is `requireUser()`-gated (401 without a session).
- A body-reading route uses `readJsonObject`/`parseBody` (never a bare `request.json()`), per `lib/api/body.ts`.
- New Prisma columns are additive and nullable; no backfill unless the spec says so (it doesn't, here).
- Test files: `lib/**/*.test.ts` and `app/**/*.test.ts` run in the `node` vitest project (no DOM); `components/**/*.test.tsx` run in `dom` (jsdom + RTL, use `renderWithIntl`/`ptBR` from `components/test-utils.tsx`).
- A `vi.mock(...)` specifier must exactly match what the subject module itself imports (`./prisma` vs `@/lib/db/prisma` are NOT interchangeable).
- If working in a git worktree, `npm run typecheck` is known to break there — use `npx tsc --noEmit` instead.

---

### Task 1: `User.firstExportedAt` / `User.firstImportedAt` migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260830120000_add_user_checklist_progress/migration.sql`

**Interfaces:**

- Produces: `User.firstExportedAt: Date | null`, `User.firstImportedAt: Date | null` on the generated Prisma Client, consumed by Task 2.

- [ ] **Step 1: Add the two columns to the Prisma schema**

In `prisma/schema.prisma`, inside `model User`, add the two fields right after `exportPreset` (before the closing `@@index`):

```prisma
  exportPreset        Json?
  // #232: dashboard onboarding checklist's "exportar um PDF" / "importar
  // moldes existentes" steps. Both flows are otherwise client-side with no
  // server trace at all, so these are a minimal, additive "this happened
  // once" signal -- not a full audit log, never rewritten once set. Null
  // means "not known to have happened," including for every existing
  // account: their real history before this column existed is genuinely
  // unknowable, so there is no backfill (the onboardedAt precedent's
  // backfill doesn't apply -- there the alternative was re-trapping every
  // established account in a wizard; here it's just one checklist row
  // staying unchecked for something an old account may have already done,
  // low-severity and dismissable anyway).
  firstExportedAt     DateTime?
  firstImportedAt     DateTime?

  @@index([activeSizeChartId])
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260830120000_add_user_checklist_progress/migration.sql`:

```sql
-- #232: dashboard onboarding checklist. Additive, nullable, no backfill --
-- see the schema.prisma comment above these columns for why.
ALTER TABLE "User" ADD COLUMN "firstExportedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "firstImportedAt" TIMESTAMP(3);
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run: `npx prisma migrate dev --name add_user_checklist_progress` if a local Postgres is reachable (`npm run db:up` first); otherwise run `npx prisma generate` alone so the TypeScript types exist for the following tasks, and apply the migration for real later via `npm run db:migrate`.

Expected: `node_modules/@prisma/client` now types `firstExportedAt`/`firstImportedAt` on `User`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260830120000_add_user_checklist_progress
git commit -m "feat(db): add User.firstExportedAt/firstImportedAt for the onboarding checklist"
```

---

### Task 2: Checklist event tracking in `lib/db/account.ts`

**Files:**

- Modify: `lib/db/account.ts`
- Test: `lib/db/account.test.ts`

**Interfaces:**

- Consumes: `prisma` (`./prisma`), `User.firstExportedAt`/`firstImportedAt` (Task 1).
- Produces: `ChecklistEvent` (type), `isChecklistEvent(value: unknown): value is ChecklistEvent`, `recordChecklistEvent(userId: string, event: ChecklistEvent): Promise<void>`, `getChecklistProgress(userId: string): Promise<{hasExported: boolean; hasImported: boolean}>` — all consumed by Task 3 and Task 6.

- [ ] **Step 1: Write the failing tests**

Add to `lib/db/account.test.ts` (new `describe` blocks; keep the existing `Row`/mock setup, extend the mocked `prisma` with a `user` section):

```ts
// Add alongside the existing top-of-file `let rows: Row[] = [];`
interface UserRow {
  id: string;
  firstExportedAt: Date | null;
  firstImportedAt: Date | null;
}
let userRows: Record<string, UserRow> = {};
```

Extend the existing `vi.mock("./prisma", ...)` factory (add a `user` key alongside the existing `transaction` key):

```ts
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          userRows[where.id] ?? null,
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string } & Partial<
            Record<"firstExportedAt" | "firstImportedAt", null>
          >;
          data: Partial<Record<"firstExportedAt" | "firstImportedAt", Date>>;
        }) => {
          const u = userRows[where.id];
          if (!u) return { count: 0 };
          const column = ("firstExportedAt" in where
            ? "firstExportedAt"
            : "firstImportedAt") as "firstExportedAt" | "firstImportedAt";
          if (u[column] !== null) return { count: 0 };
          userRows[where.id] = { ...u, [column]: data[column] };
          return { count: 1 };
        },
      ),
    },
```

Add the import and new test blocks at the bottom of `lib/db/account.test.ts`:

```ts
import {
  getRecentUsage,
  getLedgerHistory,
  isChecklistEvent,
  recordChecklistEvent,
  getChecklistProgress,
} from "./account";

describe("isChecklistEvent", () => {
  it("accepts exactly the two known events", () => {
    expect(isChecklistEvent("exported")).toBe(true);
    expect(isChecklistEvent("imported")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isChecklistEvent("invited")).toBe(false);
    expect(isChecklistEvent(undefined)).toBe(false);
    expect(isChecklistEvent(42)).toBe(false);
  });
});

describe("recordChecklistEvent / getChecklistProgress", () => {
  beforeEach(() => {
    userRows = {
      u1: { id: "u1", firstExportedAt: null, firstImportedAt: null },
    };
  });

  it("reports both flags false before anything is recorded", async () => {
    expect(await getChecklistProgress("u1")).toEqual({
      hasExported: false,
      hasImported: false,
    });
  });

  it("sets firstExportedAt on the first 'exported' event", async () => {
    await recordChecklistEvent("u1", "exported");
    expect(await getChecklistProgress("u1")).toEqual({
      hasExported: true,
      hasImported: false,
    });
  });

  it("sets firstImportedAt on the first 'imported' event, independently", async () => {
    await recordChecklistEvent("u1", "imported");
    expect(await getChecklistProgress("u1")).toEqual({
      hasExported: false,
      hasImported: true,
    });
  });

  it("never overwrites an already-set timestamp (first-write-wins)", async () => {
    await recordChecklistEvent("u1", "exported");
    const firstRun = userRows.u1.firstExportedAt;
    await recordChecklistEvent("u1", "exported");
    expect(userRows.u1.firstExportedAt).toBe(firstRun);
  });

  it("reports both flags false for an account with no row (defensive default)", async () => {
    expect(await getChecklistProgress("ghost")).toEqual({
      hasExported: false,
      hasImported: false,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/db/account.test.ts`
Expected: FAIL — `isChecklistEvent`/`recordChecklistEvent`/`getChecklistProgress` are not exported from `./account`.

- [ ] **Step 3: Implement in `lib/db/account.ts`**

Add to `lib/db/account.ts` (after the existing imports and before `getRecentUsage`, or at the end of the file — either is fine, keep it grouped together):

```ts
/** The two events the dashboard onboarding checklist (#232) can record. */
export type ChecklistEvent = "exported" | "imported";

export function isChecklistEvent(value: unknown): value is ChecklistEvent {
  return value === "exported" || value === "imported";
}

const CHECKLIST_EVENT_COLUMN = {
  exported: "firstExportedAt",
  imported: "firstImportedAt",
} as const satisfies Record<ChecklistEvent, string>;

// First-write-wins: `updateMany` is scoped to the column still being NULL,
// so a duplicate ping (the client fires this best-effort, more than once is
// expected) never overwrites the real first-occurrence timestamp.
export async function recordChecklistEvent(
  userId: string,
  event: ChecklistEvent,
): Promise<void> {
  const column = CHECKLIST_EVENT_COLUMN[event];
  await prisma.user.updateMany({
    where: { id: userId, [column]: null },
    data: { [column]: new Date() },
  });
}

export async function getChecklistProgress(
  userId: string,
): Promise<{ hasExported: boolean; hasImported: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstExportedAt: true, firstImportedAt: true },
  });
  return {
    hasExported: user?.firstExportedAt != null,
    hasImported: user?.firstImportedAt != null,
  };
}
```

Also update the mocked `findUnique` in the test to honor a `select` (the real Prisma client does) — the mock above already returns the full `UserRow`, which is a superset of what `select` asks for, so no change needed there; `user?.firstExportedAt` reads correctly either way.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/db/account.test.ts`
Expected: PASS, all tests including the pre-existing `getRecentUsage`/`getLedgerHistory` ones.

- [ ] **Step 5: Commit**

```bash
git add lib/db/account.ts lib/db/account.test.ts
git commit -m "feat(account): add checklist event tracking (exported/imported)"
```

---

### Task 3: `POST /api/account/checklist-progress` route

**Files:**

- Create: `app/api/account/checklist-progress/route.ts`
- Create: `app/api/account/checklist-progress/route.test.ts`

**Interfaces:**

- Consumes: `requireUser` (`@/lib/auth/guard`), `readJsonObject` (`@/lib/api/body`), `apiError` (`@/lib/api/errors`), `isChecklistEvent`/`recordChecklistEvent` (`@/lib/db/account`, Task 2).
- Produces: `POST /api/account/checklist-progress` — `{status: "ok"}` on success, `apiError("invalid_checklist_event", 400)` on an unrecognised `event`. Consumed by Task 5's `recordChecklistEvent` client function.

- [ ] **Step 1: Write the failing test**

Create `app/api/account/checklist-progress/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/account", () => ({
  isChecklistEvent: (value: unknown) =>
    value === "exported" || value === "imported",
  recordChecklistEvent: vi.fn(),
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { recordChecklistEvent } from "@/lib/db/account";

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/checklist-progress", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(recordChecklistEvent).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(recordChecklistEvent).mockResolvedValue(undefined);
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({ event: "exported" }));
    expect(res.status).toBe(401);
    expect(recordChecklistEvent).not.toHaveBeenCalled();
  });

  it("records an 'exported' event", async () => {
    const res = await POST(req({ event: "exported" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(recordChecklistEvent).toHaveBeenCalledWith("u1", "exported");
  });

  it("records an 'imported' event", async () => {
    const res = await POST(req({ event: "imported" }));
    expect(res.status).toBe(200);
    expect(recordChecklistEvent).toHaveBeenCalledWith("u1", "imported");
  });

  it("rejects an unrecognised event", async () => {
    const res = await POST(req({ event: "invited" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_checklist_event",
    });
    expect(recordChecklistEvent).not.toHaveBeenCalled();
  });

  it("answers bad_body for a literal null body instead of throwing", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
    expect(recordChecklistEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/account/checklist-progress/route.test.ts`
Expected: FAIL — `./route` does not exist yet.

- [ ] **Step 3: Implement the route**

Create `app/api/account/checklist-progress/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { readJsonObject } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isChecklistEvent, recordChecklistEvent } from "@/lib/db/account";

// #232: fired best-effort from the export and import flows (lib/export/
// index.ts, lib/importStore.ts) to back the two dashboard onboarding
// checklist steps neither flow otherwise leaves any server-side trace for.
export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;

  if (!isChecklistEvent(body.event)) {
    return apiError("invalid_checklist_event", 400);
  }

  await recordChecklistEvent(gate.id, body.event);
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/account/checklist-progress/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/account/checklist-progress
git commit -m "feat(api): add POST /api/account/checklist-progress"
```

---

### Task 4: `hasCustomActiveSizeChart` helper

**Files:**

- Modify: `lib/db/sizeChart.ts`
- Test: `lib/db/sizeChart.test.ts`

**Interfaces:**

- Consumes: `getActiveSizeChartId(tx, userId)` (already in `lib/db/sizeChart.ts`), `SizeChartDataSchema` (`@/lib/schemas/sizeChart`, already imported in this file).
- Produces: `hasCustomActiveSizeChart(tx: Tx, userId: string): Promise<boolean>`, consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

Add to `lib/db/sizeChart.test.ts`, near the other `getActiveSizeChartId`-adjacent tests (the file already mocks `prisma.sizeChart.findUnique` and `prisma.user.findUnique` — reuse the existing `rows`/`users` fixtures). Build fixtures with the real `buildSystemSizeChartData` (already used by the module under test, so its output is guaranteed to satisfy `SizeChartDataSchema`) rather than a hand-written literal:

```ts
describe("hasCustomActiveSizeChart", () => {
  beforeEach(() => {
    rows = [];
    users = {};
  });

  it("is false when the account has no active chart", async () => {
    users.u1 = { activeSizeChartId: null };
    expect(await hasCustomActiveSizeChart(prisma, "u1")).toBe(false);
  });

  it("is false when the active chart is a system chart", async () => {
    rows = [
      {
        id: "g1",
        userId: "u1",
        data: buildSystemSizeChartData("female", T),
        updatedAt: new Date(),
      },
    ];
    users.u1 = { activeSizeChartId: "g1" };
    expect(await hasCustomActiveSizeChart(prisma, "u1")).toBe(false);
  });

  it("is true when the active chart is a real custom chart", async () => {
    rows = [
      {
        id: "g2",
        userId: "u1",
        data: { ...buildSystemSizeChartData("female", T), isSystem: false },
        updatedAt: new Date(),
      },
    ];
    users.u1 = { activeSizeChartId: "g2" };
    expect(await hasCustomActiveSizeChart(prisma, "u1")).toBe(true);
  });

  it("is false when the active chart id points at a row that no longer exists", async () => {
    rows = [];
    users.u1 = { activeSizeChartId: "gone" };
    expect(await hasCustomActiveSizeChart(prisma, "u1")).toBe(false);
  });
});
```

Add `hasCustomActiveSizeChart` to the existing import line from `./sizeChart`, and `buildSystemSizeChartData` to the existing `import { buildSystemSizeChart } from "@/lib/sizeCharts/seed";` line (making it `import { buildSystemSizeChart, buildSystemSizeChartData } from "@/lib/sizeCharts/seed";`) at the top of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/db/sizeChart.test.ts`
Expected: FAIL — `hasCustomActiveSizeChart` is not exported from `./sizeChart`.

- [ ] **Step 3: Implement in `lib/db/sizeChart.ts`**

Add right after `getActiveSizeChartId`:

```ts
/**
 * #232: backs the dashboard onboarding checklist's "configurar tabela de
 * medidas" step. False for no active chart (falls back to a system chart)
 * or a parse failure (the safe default, same as every other
 * SizeChartDataSchema.safeParse failure in this file) -- only a real,
 * successfully-parsed, non-system chart counts as "configured."
 */
export async function hasCustomActiveSizeChart(
  tx: Tx,
  userId: string,
): Promise<boolean> {
  const activeSizeChartId = await getActiveSizeChartId(tx, userId);
  if (!activeSizeChartId) return false;
  const row = await tx.sizeChart.findUnique({
    where: { id: activeSizeChartId },
  });
  if (!row || row.userId !== userId) return false;
  const parsed = SizeChartDataSchema.safeParse(row.data);
  return parsed.success && !parsed.data.isSystem;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/db/sizeChart.test.ts`
Expected: PASS, all tests including every pre-existing one in this file.

- [ ] **Step 5: Commit**

```bash
git add lib/db/sizeChart.ts lib/db/sizeChart.test.ts
git commit -m "feat(size-charts): add hasCustomActiveSizeChart for the onboarding checklist"
```

---

### Task 5: `lib/api-client.ts` — `AccountSummary.checklist` + `recordChecklistEvent`

**Files:**

- Modify: `lib/api-client.ts`

**Interfaces:**

- Consumes: nothing new (uses the existing `postJson`/`getJson` primitives already in this file).
- Produces: `AccountSummary` now includes `checklist: {hasCustomSizeChart: boolean; hasExported: boolean; hasImported: boolean}`; `recordChecklistEvent(event: "exported" | "imported"): Promise<void>`. Consumed by Task 6 (route), Task 7 (store), Task 8 (export), Task 9 (import).

- [ ] **Step 1: Update the `AccountSummary` interface**

In `lib/api-client.ts`, find:

```ts
export interface AccountSummary {
  credits: Credits;
  recentUsage: RecentUsageEntry[];
}
```

Replace with:

```ts
export interface AccountSummary {
  credits: Credits;
  recentUsage: RecentUsageEntry[];
  checklist: {
    hasCustomSizeChart: boolean;
    hasExported: boolean;
    hasImported: boolean;
  };
}
```

- [ ] **Step 2: Add the `recordChecklistEvent` client function**

Right after `getAccountSummary`:

```ts
export function getAccountSummary(): Promise<AccountSummary> {
  return getJson<AccountSummary>("/api/account/summary");
}

// #232: best-effort ping backing the dashboard onboarding checklist's
// export/import steps -- callers (lib/export/index.ts, lib/importStore.ts)
// swallow a rejection themselves; this function does not do it for them,
// so a call site that forgets to .catch() fails loudly in its own tests.
export function recordChecklistEvent(
  event: "exported" | "imported",
): Promise<void> {
  return postJson<void>("/api/account/checklist-progress", { event });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: new errors at every existing `getAccountSummary`/`AccountSummary` mock/usage site that doesn't yet supply `checklist` — these are expected and fixed in Tasks 6/7/12. Confirm the errors are exactly the ones you expect (route.ts, route.test.ts, dashboardStore.ts, dashboardStore.test.ts, DashboardShell.test.tsx) and nothing else.

- [ ] **Step 4: Commit**

```bash
git add lib/api-client.ts
git commit -m "feat(api-client): add checklist to AccountSummary and recordChecklistEvent"
```

---

### Task 6: Wire checklist into `GET /api/account/summary`

**Files:**

- Modify: `app/api/account/summary/route.ts`
- Modify: `app/api/account/summary/route.test.ts`

**Interfaces:**

- Consumes: `hasCustomActiveSizeChart` (`@/lib/db/sizeChart`, Task 4), `getChecklistProgress` (`@/lib/db/account`, Task 2), `AccountSummary` (Task 5).
- Produces: `GET /api/account/summary` now includes `checklist` in its JSON body, matching `AccountSummary`.

- [ ] **Step 1: Update the failing test**

In `app/api/account/summary/route.test.ts`, add the two new mocks:

```ts
vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/wallet", () => ({ loadWallet: vi.fn() }));
vi.mock("@/lib/db/account", () => ({
  getRecentUsage: vi.fn(),
  getChecklistProgress: vi.fn(),
}));
vi.mock("@/lib/db/sizeChart", () => ({ hasCustomActiveSizeChart: vi.fn() }));
```

Update the imports and `beforeEach`:

```ts
import { GET } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadWallet } from "@/lib/db/wallet";
import { getRecentUsage, getChecklistProgress } from "@/lib/db/account";
import { hasCustomActiveSizeChart } from "@/lib/db/sizeChart";

describe("GET /api/account/summary", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(loadWallet).mockReset();
    vi.mocked(getRecentUsage).mockReset();
    vi.mocked(getChecklistProgress).mockReset();
    vi.mocked(hasCustomActiveSizeChart).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(loadWallet).mockResolvedValue(seedWallet(NOW));
    vi.mocked(getRecentUsage).mockResolvedValue([
      { reason: "generate", amount: 1, createdAt: NOW.toISOString() },
    ]);
    vi.mocked(getChecklistProgress).mockResolvedValue({
      hasExported: false,
      hasImported: false,
    });
    vi.mocked(hasCustomActiveSizeChart).mockResolvedValue(false);
  });
```

Update the first test and add one new one:

```ts
it("returns credits, recent usage and checklist progress for the session user", async () => {
  vi.mocked(getChecklistProgress).mockResolvedValue({
    hasExported: true,
    hasImported: false,
  });
  vi.mocked(hasCustomActiveSizeChart).mockResolvedValue(true);
  const res = await GET();
  const json = await res.json();
  expect(getRecentUsage).toHaveBeenCalledWith("u1", 3);
  expect(json.credits.balance).toBe(30);
  expect(json.recentUsage).toHaveLength(1);
  expect(json.checklist).toEqual({
    hasCustomSizeChart: true,
    hasExported: true,
    hasImported: false,
  });
});
```

(Leave the two existing `401` tests as-is — they already assert `getRecentUsage` is not called, which still holds.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/account/summary/route.test.ts`
Expected: FAIL — `route.ts` doesn't call `getChecklistProgress`/`hasCustomActiveSizeChart` yet, so `json.checklist` is `undefined`.

- [ ] **Step 3: Implement**

Replace `app/api/account/summary/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadWallet } from "@/lib/db/wallet";
import { getRecentUsage, getChecklistProgress } from "@/lib/db/account";
import { hasCustomActiveSizeChart } from "@/lib/db/sizeChart";
import { buildCredits } from "@/lib/api/compose";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const [wallet, recentUsage, checklistProgress, hasCustomSizeChart] =
    await Promise.all([
      loadWallet(gate.id),
      getRecentUsage(gate.id, 3),
      getChecklistProgress(gate.id),
      hasCustomActiveSizeChart(prisma, gate.id),
    ]);
  // #62: requireUser() just confirmed this account exists -- null here means
  // it was deleted in the instant between that check and this one. Treat it
  // the same as never having authenticated at all.
  if (!wallet) return unauthorized();
  return NextResponse.json({
    credits: buildCredits(wallet, new Date()),
    recentUsage,
    checklist: {
      hasCustomSizeChart,
      hasExported: checklistProgress.hasExported,
      hasImported: checklistProgress.hasImported,
    },
  });
}
```

`import { prisma } from "@/lib/db/prisma";` is the correct specifier — `app/api/size-charts/route.ts` already imports the singleton this exact way to call `listSizeChartsForUser(prisma, ...)`/`getActiveSizeChartId(prisma, ...)`, the same pattern this route now follows for `hasCustomActiveSizeChart(prisma, ...)`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/account/summary/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/account/summary/route.ts app/api/account/summary/route.test.ts
git commit -m "feat(api): surface checklist progress on GET /api/account/summary"
```

---

### Task 7: `dashboardStore` — checklist state

**Files:**

- Modify: `lib/dashboardStore.ts`
- Modify: `lib/dashboardStore.test.ts`

**Interfaces:**

- Consumes: `AccountSummary` (Task 5).
- Produces: `useDashboardStore` state gains `checklist: AccountSummary["checklist"] | null`, set in `init()`. Consumed by Task 12 (`DashboardShell`).

- [ ] **Step 1: Update the failing test**

In `lib/dashboardStore.test.ts`, update every `useDashboardStore.setState({...})` reset block and every `getAccountSummary.mockResolvedValue({...})` call to include `checklist`. For the reset blocks, add `checklist: null,`. For the mock resolves, add:

```ts
      checklist: { hasCustomSizeChart: false, hasExported: false, hasImported: false },
```

Add one new test in the `describe("dashboardStore.init", ...)` block:

```ts
it("stores the checklist progress from the account summary", async () => {
  vi.mocked(api.listPatterns).mockResolvedValue([]);
  vi.mocked(api.getAccountSummary).mockResolvedValue({
    credits: { plan: "atelier", balance: 320, total: 500, renewsInDays: 12 },
    recentUsage: [],
    checklist: {
      hasCustomSizeChart: true,
      hasExported: false,
      hasImported: true,
    },
  });
  await useDashboardStore.getState().init();
  expect(useDashboardStore.getState().checklist).toEqual({
    hasCustomSizeChart: true,
    hasExported: false,
    hasImported: true,
  });
});
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npx vitest run lib/dashboardStore.test.ts`
Expected: FAIL on the new test — `checklist` is `undefined` on the store.

- [ ] **Step 3: Implement in `lib/dashboardStore.ts`**

Add `checklist` to the `DashboardStore` interface:

```ts
interface DashboardStore {
  ready: boolean;
  error: boolean;
  actionError: string | null;
  patterns: PatternListItem[];
  credits: Credits | null;
  checklist: AccountSummary["checklist"] | null;
  recentUsage: RecentUsageEntry[];
  search: string;
  typeFilter: TypeFilter;
  ...
```

Import `AccountSummary` alongside the existing `api-client` imports:

```ts
import type {
  PatternListItem,
  RecentUsageEntry,
  AccountSummary,
} from "./api-client";
```

Add the default value and set it in `init()`:

```ts
export const useDashboardStore = create<DashboardStore>((set) => ({
  ready: false,
  error: false,
  actionError: null,
  patterns: [],
  credits: null,
  checklist: null,
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
        checklist: summary.checklist,
        recentUsage: summary.recentUsage,
        ready: true,
      });
    } catch {
      set({ error: true, ready: true });
    }
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/dashboardStore.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add lib/dashboardStore.ts lib/dashboardStore.test.ts
git commit -m "feat(dashboard): store checklist progress from account summary"
```

---

### Task 8: Ping `recordChecklistEvent("exported")` from `lib/export/index.ts`

**Files:**

- Modify: `lib/export/index.ts`
- Modify: `lib/export/index.test.ts`

**Interfaces:**

- Consumes: `recordChecklistEvent` (`@/lib/api-client`, Task 5).
- Produces: every successful `exportPattern()` call fires one best-effort `recordChecklistEvent("exported")`.

- [ ] **Step 1: Write the failing test**

In `lib/export/index.test.ts`, add the api-client mock near the top (alongside the existing `vi.mock` calls):

```ts
vi.mock("@/lib/api-client", () => ({ recordChecklistEvent: vi.fn() }));
```

Add the import:

```ts
import { recordChecklistEvent } from "@/lib/api-client";
```

Add one test inside `describe("exportPattern dispatch (#85)", ...)` (which starts at the top of the file with `beforeEach(() => { vi.clearAllMocks(); });`), right after the existing `it("svg: calls toSvg and downloads it under the .svg filename/mime", ...)` test:

```ts
it("pings the onboarding checklist after a successful export", () => {
  exportPattern(pattern("Vestido floral"), "svg", t);
  expect(recordChecklistEvent).toHaveBeenCalledWith("exported");
});
```

Add a second test inside `describe("exportPattern failure paths (#85)", ...)`, right after the existing `it("calls onError when the svg serializer throws synchronously", ...)` test:

```ts
it("does not ping the checklist when the export fails", () => {
  vi.mocked(toSvg).mockImplementationOnce(() => {
    throw new Error("boom");
  });
  const onError = vi.fn();
  exportPattern(pattern("Vestido floral"), "svg", tCatalog, onError);
  expect(onError).toHaveBeenCalledTimes(1);
  expect(recordChecklistEvent).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/export/index.test.ts`
Expected: FAIL — `recordChecklistEvent` is never called by `exportPattern` yet.

- [ ] **Step 3: Implement in `lib/export/index.ts`**

Add the import:

```ts
import { recordChecklistEvent } from "@/lib/api-client";
```

Add a local wrapper right after the `downloadFile, slug` import, and replace every `downloadFile(...)` call in the file with `finishDownload(...)`:

```ts
// #232: the one new server touchpoint the export flow gets -- a best-effort
// "this happened" ping for the dashboard onboarding checklist. Swallowed on
// failure: a network hiccup here must never surface as an export failure.
function finishDownload(
  filename: string,
  mime: string,
  data: string | Uint8Array,
): void {
  downloadFile(filename, mime, data);
  void recordChecklistEvent("exported").catch(() => {});
}
```

Then, in the body of `exportPattern`, change every occurrence of `downloadFile(` to `finishDownload(` — there are seven: the `pdf-layered` branch's `.then(...)`, and the `svg`/`dxf`/`dxf-aama`/`pdf-a4`/`pdf-single`/`plt` cases (the last two also inside a `.then(...)`). Leave the `import { downloadFile, slug } from "./download";` import as-is (still used by `finishDownload` itself).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/export/index.test.ts`
Expected: PASS, all tests including every pre-existing format/dispatch/failure-path test.

- [ ] **Step 5: Commit**

```bash
git add lib/export/index.ts lib/export/index.test.ts
git commit -m "feat(export): ping the onboarding checklist on a successful export"
```

---

### Task 9: Ping `recordChecklistEvent("imported")` from `lib/importStore.ts`

**Files:**

- Modify: `lib/importStore.ts`
- Modify: `lib/importStore.test.ts`

**Interfaces:**

- Consumes: `recordChecklistEvent` (`@/lib/api-client`, Task 5).
- Produces: `createPatternFromImport` fires one best-effort `recordChecklistEvent("imported")` on its success path only (not on `insufficient_credits`/`image_failed`/`create_failed`).

- [ ] **Step 1: Write the failing test**

In `lib/importStore.test.ts`, extend the existing `vi.mock("@/lib/api-client", ...)` factory to also mock `recordChecklistEvent`:

```ts
vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return {
    ...actual,
    createPattern: vi.fn(),
    generate: vi.fn(),
    recordChecklistEvent: vi.fn(),
  };
});
```

Find the existing `describe("createPatternFromImport", ...)` block (it starts with `const file = new File([], "import-preview.png", { type: "image/png" });` and a `beforeEach` resetting `api.createPattern`/`api.generate`/`prepareImage`) and add two tests inside it, matching its existing "creates a pattern and generates..." test's setup exactly:

```ts
it("pings the onboarding checklist once import succeeds", async () => {
  useImportStore.setState({
    doc: {} as never,
    analysis: { fileName: "oskar.dxf" } as never,
  });
  vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
  vi.mocked(api.generate).mockResolvedValue({
    status: "ok",
    state: {} as never,
  });

  await useImportStore.getState().createPatternFromImport(file, "msg", "auto");

  expect(api.recordChecklistEvent).toHaveBeenCalledWith("imported");
});

it("does not ping the checklist when import fails", async () => {
  useImportStore.setState({
    doc: {} as never,
    analysis: { fileName: "oskar.dxf" } as never,
  });
  vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
  vi.mocked(api.generate).mockResolvedValue({
    status: "error",
    state: {} as never,
  });

  const id = await useImportStore
    .getState()
    .createPatternFromImport(file, "msg", "auto");

  expect(id).toBeNull();
  expect(api.recordChecklistEvent).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/importStore.test.ts`
Expected: FAIL — `recordChecklistEvent` is never called yet.

- [ ] **Step 3: Implement in `lib/importStore.ts`**

`api` is already imported as `import * as api from "./api-client";`. In `createPatternFromImport`, find the success return:

```ts
set({ creating: false, pendingPatternId: null });
return id;
```

Replace with:

```ts
set({ creating: false, pendingPatternId: null });
// #232: best-effort ping for the dashboard onboarding checklist --
// swallowed on failure, must never affect the result of a real import.
void api.recordChecklistEvent("imported").catch(() => {});
return id;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/importStore.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add lib/importStore.ts lib/importStore.test.ts
git commit -m "feat(import): ping the onboarding checklist on a successful import"
```

---

### Task 10: `OnboardingChecklistCard` catalog entries

**Files:**

- Modify: `messages/pt-BR.json`

**Interfaces:**

- Produces: an `OnboardingChecklistCard` namespace, consumed by Task 11.

- [ ] **Step 1: Add the namespace**

In `messages/pt-BR.json`, insert a new top-level key right after `"CreditsCard"` (before `"RecentUsageCard"`):

```json
  "OnboardingChecklistCard": {
    "title": "Comece com o pé direito",
    "progressLabel": "{done} de {total}",
    "dismissLabel": "Fechar checklist",
    "doneLabel": "Concluído",
    "step1Title": "Gerar seu primeiro molde",
    "step1Description": "Você já criou seu primeiro molde com a IA.",
    "step2Title": "Configurar tabela de medidas",
    "step2Description": "Cadastre as medidas do seu público para graduar moldes automaticamente.",
    "step2Cta": "Configurar →",
    "step3Title": "Exportar um PDF",
    "step3Description": "Baixe seu molde pronto para impressão e corte.",
    "step3Cta": "Exportar →",
    "step4Title": "Importar moldes existentes",
    "step4Description": "Já tem moldes em .dxf? Importe para continuar trabalhando neles aqui.",
    "step4Cta": "Importar →",
    "step5Title": "Convidar alguém da equipe",
    "step5Description": "Compartilhe o ateliê com quem também vai criar e ajustar moldes.",
    "step5Badge": "Em breve"
  },
```

- [ ] **Step 2: Verify the JSON is still valid**

Run: `node -e "require('./messages/pt-BR.json')"`
Expected: no output, exit code 0 (a syntax error would throw and print a parse error).

- [ ] **Step 3: Commit**

```bash
git add messages/pt-BR.json
git commit -m "feat(i18n): add OnboardingChecklistCard catalog entries"
```

---

### Task 11: `OnboardingChecklistCard` component

**Files:**

- Create: `components/dashboard/OnboardingChecklistCard.tsx`
- Create: `components/dashboard/OnboardingChecklistCard.test.tsx`

**Interfaces:**

- Consumes: `PatternListItem` (`@/lib/api-client`), the `OnboardingChecklistCard` catalog namespace (Task 10), `Badge`/`Button`/`Progress` (`@/components/ui/*`).
- Produces: `OnboardingChecklistCard({patterns, checklist}: {patterns: PatternListItem[]; checklist: {hasCustomSizeChart: boolean; hasExported: boolean; hasImported: boolean}})`, consumed by Task 12.

- [ ] **Step 1: Write the failing tests**

Create `components/dashboard/OnboardingChecklistCard.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";
import type { PatternListItem } from "@/lib/api-client";

const DISMISSED_KEY = "moldai.onboardingChecklistDismissed";

function pattern(overrides: Partial<PatternListItem> = {}): PatternListItem {
  return {
    id: "p1",
    name: "Novo molde",
    garmentType: "blouse",
    updatedAt: "2026-08-30T00:00:00.000Z",
    thumbnailSvg: "<svg/>",
    ...overrides,
  };
}

const noProgress = {
  hasCustomSizeChart: false,
  hasExported: false,
  hasImported: false,
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("OnboardingChecklistCard", () => {
  it("renders all 5 step titles", () => {
    renderWithIntl(
      <OnboardingChecklistCard patterns={[]} checklist={noProgress} />,
    );
    expect(
      screen.getByText(ptBR.OnboardingChecklistCard.step1Title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.OnboardingChecklistCard.step5Title),
    ).toBeInTheDocument();
  });

  it("marks 'gerar primeiro molde' done only once a pattern has been drafted", () => {
    renderWithIntl(
      <OnboardingChecklistCard
        patterns={[pattern({ garmentType: null })]}
        checklist={noProgress}
      />,
    );
    expect(
      screen.getAllByText(ptBR.OnboardingChecklistCard.doneLabel),
    ).toHaveLength(0);
  });

  it("marks 'gerar primeiro molde' done once a real pattern exists", () => {
    renderWithIntl(
      <OnboardingChecklistCard
        patterns={[pattern({ garmentType: "blouse" })]}
        checklist={noProgress}
      />,
    );
    expect(
      screen.getAllByText(ptBR.OnboardingChecklistCard.doneLabel),
    ).toHaveLength(1);
  });

  it("reflects hasCustomSizeChart/hasExported/hasImported independently", () => {
    renderWithIntl(
      <OnboardingChecklistCard
        patterns={[]}
        checklist={{
          hasCustomSizeChart: true,
          hasExported: true,
          hasImported: false,
        }}
      />,
    );
    expect(
      screen.getAllByText(ptBR.OnboardingChecklistCard.doneLabel),
    ).toHaveLength(2);
  });

  it("step 5 is always disabled and badged, never a checkmark", () => {
    renderWithIntl(
      <OnboardingChecklistCard
        patterns={[pattern({ garmentType: "blouse" })]}
        checklist={{
          hasCustomSizeChart: true,
          hasExported: true,
          hasImported: true,
        }}
      />,
    );
    // All 4 real steps done, step 5 can never be.
    expect(
      screen.getAllByText(ptBR.OnboardingChecklistCard.doneLabel),
    ).toHaveLength(4);
    expect(
      screen.getByText(ptBR.OnboardingChecklistCard.step5Badge),
    ).toBeInTheDocument();
  });

  it("links the 'exportar' step to the most recently updated pattern's export screen", () => {
    renderWithIntl(
      <OnboardingChecklistCard
        patterns={[
          pattern({ id: "recent", garmentType: "blouse" }),
          pattern({ id: "older", garmentType: "dress" }),
        ]}
        checklist={noProgress}
      />,
    );
    expect(
      screen.getByRole("link", { name: ptBR.OnboardingChecklistCard.step3Cta }),
    ).toHaveAttribute("href", "/pattern/recent/export");
  });

  it("has no 'exportar' link when there are no patterns yet", () => {
    renderWithIntl(
      <OnboardingChecklistCard patterns={[]} checklist={noProgress} />,
    );
    expect(
      screen.queryByRole("link", {
        name: ptBR.OnboardingChecklistCard.step3Cta,
      }),
    ).not.toBeInTheDocument();
  });

  it("dismissing hides the card and persists to localStorage", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <OnboardingChecklistCard patterns={[]} checklist={noProgress} />,
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.OnboardingChecklistCard.dismissLabel,
      }),
    );
    expect(
      screen.queryByText(ptBR.OnboardingChecklistCard.title),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("1");
  });

  it("renders nothing when already dismissed", () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    renderWithIntl(
      <OnboardingChecklistCard patterns={[]} checklist={noProgress} />,
    );
    expect(
      screen.queryByText(ptBR.OnboardingChecklistCard.title),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project dom components/dashboard/OnboardingChecklistCard.test.tsx`
Expected: FAIL — the component module doesn't exist yet.

- [ ] **Step 3: Implement the component**

Create `components/dashboard/OnboardingChecklistCard.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { PatternListItem } from "@/lib/api-client";

const DISMISSED_KEY = "moldai.onboardingChecklistDismissed";
const TOTAL_STEPS = 5;

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Private browsing / storage disabled -- the card just reappears next visit.
  }
}

export interface ChecklistProgress {
  hasCustomSizeChart: boolean;
  hasExported: boolean;
  hasImported: boolean;
}

interface Step {
  titleKey: string;
  descriptionKey: string;
  done: boolean;
  ctaKey?: string;
  href?: string;
  soon?: boolean;
}

/**
 * #232: the redesign handoff's "Comece com o pé direito" card. Every step's
 * `done` state is derived from real account data passed in as props (the
 * CreditsCard/RecentUsageCard precedent) rather than read from the store
 * directly, except step 5 ("convidar alguém da equipe"), which is
 * permanently unreachable -- multi-user accounts don't exist -- so it
 * always renders disabled + "em breve" badged, never a checkmark.
 * Dismissal is localStorage-only (browser-local, not synced per account):
 * confirmed in the #232 design spec.
 */
export function OnboardingChecklistCard({
  patterns,
  checklist,
}: {
  patterns: PatternListItem[];
  checklist: ChecklistProgress;
}) {
  const t = useTranslations("OnboardingChecklistCard");
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  if (dismissed) return null;

  // A blank pattern reports garmentType: null (lib/db/pattern.ts's
  // listPatternsForUser) -- only a drafted one counts, regardless of
  // whether it came from chat, an import, or a sloper copy.
  const hasGeneratedPattern = patterns.some((p) => p.garmentType !== null);
  const mostRecentPatternId = patterns[0]?.id ?? null;

  const steps: Step[] = [
    {
      titleKey: "step1Title",
      descriptionKey: "step1Description",
      done: hasGeneratedPattern,
    },
    {
      titleKey: "step2Title",
      descriptionKey: "step2Description",
      done: checklist.hasCustomSizeChart,
      ctaKey: "step2Cta",
      href: "/size-charts",
    },
    {
      titleKey: "step3Title",
      descriptionKey: "step3Description",
      done: checklist.hasExported,
      ctaKey: "step3Cta",
      href: mostRecentPatternId
        ? `/pattern/${mostRecentPatternId}/export`
        : undefined,
    },
    {
      titleKey: "step4Title",
      descriptionKey: "step4Description",
      done: checklist.hasImported,
      ctaKey: "step4Cta",
      href: "/import",
    },
    {
      titleKey: "step5Title",
      descriptionKey: "step5Description",
      done: false,
      soon: true,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / TOTAL_STEPS) * 100);

  return (
    <div className="border-border rounded-card mx-[22px] flex flex-col gap-[14px] border bg-white p-[18px]">
      <div className="flex items-center justify-between gap-[10px]">
        <span className="text-ui font-semibold">
          {t("title")} ·{" "}
          {t("progressLabel", { done: doneCount, total: TOTAL_STEPS })}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("dismissLabel")}
          onClick={() => {
            writeDismissed();
            setDismissed(true);
          }}
        >
          <XIcon />
        </Button>
      </div>
      <Progress value={pct} />
      <ul className="flex flex-col gap-[10px]">
        {steps.map((step, i) => (
          <li key={step.titleKey} className="flex items-center gap-[12px]">
            <span
              className={
                "text-meta flex size-[22px] shrink-0 items-center justify-center rounded-full font-semibold " +
                (step.done
                  ? "bg-surface-alt text-olive-dark"
                  : "bg-surface-alt text-muted")
              }
            >
              {step.done ? <CheckIcon className="size-[13px]" /> : i + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-ui font-semibold">{t(step.titleKey)}</span>
              <span className="text-muted text-meta">
                {t(step.descriptionKey)}
              </span>
            </div>
            {step.done && (
              <span className="text-muted text-meta shrink-0">
                {t("doneLabel")}
              </span>
            )}
            {!step.done && step.soon && (
              <Badge variant="soon">{t("step5Badge")}</Badge>
            )}
            {!step.done && !step.soon && step.href && step.ctaKey && (
              <Link
                href={step.href}
                className="text-olive-dark text-ui shrink-0 font-semibold"
              >
                {t(step.ctaKey)}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project dom components/dashboard/OnboardingChecklistCard.test.tsx`
Expected: PASS, all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/OnboardingChecklistCard.tsx components/dashboard/OnboardingChecklistCard.test.tsx
git commit -m "feat(dashboard): add OnboardingChecklistCard component"
```

---

### Task 12: Wire the card into `DashboardShell`

**Files:**

- Modify: `components/dashboard/DashboardShell.tsx`
- Modify: `components/dashboard/DashboardShell.test.tsx`

**Interfaces:**

- Consumes: `OnboardingChecklistCard` (Task 11), `useDashboardStore`'s `checklist`/`patterns` (Task 7).

- [ ] **Step 1: Update the failing test**

In `components/dashboard/DashboardShell.test.tsx`, add `checklist: null` to the `beforeEach`'s `useDashboardStore.setState({...})` reset, and add `checklist` to every `getAccountSummary.mockResolvedValue({...})` call in the file (there are three: the empty-grid layout block, the missing-pattern-notice block ×2):

```ts
      checklist: { hasCustomSizeChart: false, hasExported: false, hasImported: false },
```

Add a new `describe` block at the end of the file:

```tsx
describe("DashboardShell onboarding checklist (#232)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    listPatterns.mockResolvedValue([]);
    getAccountSummary.mockResolvedValue({
      credits: { plan: "free", balance: 30, total: 30, renewsInDays: 30 },
      recentUsage: [],
      checklist: {
        hasCustomSizeChart: false,
        hasExported: false,
        hasImported: false,
      },
    });
  });

  it("renders the checklist once the summary loads", async () => {
    renderWithIntl(<DashboardShell userEmail="user@example.com" />);
    expect(
      await screen.findByText(ptBR.OnboardingChecklistCard.title, {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("stays hidden when already dismissed", async () => {
    window.localStorage.setItem("moldai.onboardingChecklistDismissed", "1");
    renderWithIntl(<DashboardShell userEmail="user@example.com" />);
    await waitFor(() => expect(useDashboardStore.getState().ready).toBe(true));
    expect(
      screen.queryByText(ptBR.OnboardingChecklistCard.title, { exact: false }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run --project dom components/dashboard/DashboardShell.test.tsx`
Expected: FAIL on the two new tests — `DashboardShell` doesn't render `OnboardingChecklistCard` yet.

- [ ] **Step 3: Implement**

In `components/dashboard/DashboardShell.tsx`, add the import:

```ts
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";
```

Add two selectors alongside the existing ones (`ready`, `error`, `credits`, etc.):

```ts
const checklist = useDashboardStore((s) => s.checklist);
const patterns = useDashboardStore((s) => s.patterns);
```

Insert the card right before `<PatternGrid .../>`, inside the existing `<div className="flex flex-col gap-4">`:

```tsx
          <div className="flex flex-col gap-4">
            {checklist && (
              <OnboardingChecklistCard patterns={patterns} checklist={checklist} />
            )}
            <PatternGrid onOpen={openPattern} onNewPattern={handleNewPattern} />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project dom components/dashboard/DashboardShell.test.tsx`
Expected: PASS, all tests including every pre-existing one in this file.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS across both the `node` and `dom` projects.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/DashboardShell.tsx components/dashboard/DashboardShell.test.tsx
git commit -m "feat(dashboard): render the onboarding checklist card"
```

---

### Task 13: Fix the stale `/import` claims in `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Correct the drifted bullet**

In `CLAUDE.md`, find the `/import` bullet under "Screens" (currently reads, in part): _"Entirely client-side: it makes no server call at all, costs nothing... **Creating a `Pattern` from the parsed geometry is explicitly "em breve"**, disabled+badged — this pass reads and verifies a file, it does not yet import one."_

Replace those two clauses with the accurate, current behavior:

```
**Analysing a file is entirely client-side and free** — no server call, no credit cost — and the screen says so with its own badge rather than reading a balance for a number never spent.
```

and

```
**Creating a `Pattern` from the parsed geometry is real (#238)**, not the placeholder it once shipped as: `VerificationPanel`'s "Importar molde" button renders the layer preview to an image and runs it through the ordinary create+generate pipeline (`lib/importStore.ts`'s `createPatternFromImport`), costing `COSTS.adjust` like any other generation — still tagged "beta" (`Badge variant="soon"`) since the reconstruction quality is unproven at scale. This step now also pings the dashboard onboarding checklist (#232) on success.
```

Keep the rest of the bullet (`lib/import/` description, `dxf.ts`/`analyze.ts`, the `validateSpec` trust-boundary sentence, `FileSummaryCard`'s three failure causes) unchanged — only the two identified clauses are wrong.

- [ ] **Step 2: Read the full bullet back and confirm it reads coherently end to end**

Read the whole `/import` bullet after editing and confirm no leftover reference to "does not yet import one" or "makes no server call at all" remains anywhere in the file:

Run: `grep -n "does not yet import one\|makes no server call at all" CLAUDE.md`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): fix stale /import claims — pattern creation from import is real (#238)"
```

---

## Final verification

- [ ] Run `npm test` — full suite passes.
- [ ] Run `npx tsc --noEmit` (or `npm run typecheck` outside a worktree) — no type errors.
- [ ] Run `npm run lint` — no new lint errors.
- [ ] Start the dev server (`npm run dev`), sign in, and visually confirm: the card renders on `/`, the progress bar/count match real state, each CTA navigates correctly, step 5 is disabled+badged, and dismissing hides it and keeps it hidden on reload.
