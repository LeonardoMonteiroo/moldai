# Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dashboard screen (`docs/design/README.md:78-80`, id `4b`) as the app's new home (`/`), backed by the real multi-molde API from the prerequisite backend plan.

**Architecture:** A new `useDashboardStore` (Zustand, same fetch-through-api-client pattern as `useEditorStore`) owns the molde list, account credits/usage summary, and client-side search/type-filter. Presentational components under `components/dashboard/` compose it into the `4b` layout. Sidebar entries and the import card that depend on still-out-of-scope screens (Medidas e grades, Bases do ateliê, Audaces/.dxf import) are rendered disabled with an "em breve" badge, the same convention `Proof3DTab`/`AttachmentChips`/`CutPlanTab` already use.

**Tech Stack:** Next.js 16 (App Router), Zustand, next-intl (`messages/pt-BR.json`), Tailwind v4 `@theme` tokens (`app/globals.css`), Vitest.

## Global Constraints

- **Prerequisite:** `docs/superpowers/plans/2026-08-18-backend-multi-molde-migration.md` must be fully implemented and merged first — this plan depends on `/api/moldes`, `/api/moldes/[id]`, `MoldeListItem`, `lib/db/molde.ts`, and `lib/store.ts`'s `moldeId` threading all existing exactly as that plan leaves them.
- Commit messages: Conventional Commits, English subject/body (`CLAUDE.md`).
- Code identifiers/wire keys stay English; all UI copy is pt-BR sourced from `messages/pt-BR.json` per-component namespaces, never hardcoded JSX text (`CLAUDE.md`'s i18n section).
- Reuse existing Tailwind/`@theme` tokens only (`bg-surface`, `border-border`, `text-muted`, `text-muted-2`, `text-olive`, `text-olive-dark`, `bg-olive`, `bg-olive-tint`, `border-olive-border`, `bg-amber-bg`/`border-amber-border`/`text-amber-text`, `text-alert`, `bg-track`, `bg-overlay`, `rounded-btn`/`rounded-card`/`rounded-pill`/`rounded-modal`/`rounded-item`, `shadow-modal`, `font-display`) — do not invent new colors or hardcode hex values.
- Out-of-scope screens stay marked **"em breve"**, matching the existing `Proof3DTab`/`AttachmentChips.comingSoonBadge`/`CutPlanTab.layoutNote` convention — never silently hidden, never faked as working.
- `npm run build` and `npm test` must pass before each commit that isn't itself a fixup of the previous step's failure.
- No dashboard component gets a dedicated component-level test file — this repo has none for the editor's components either (verified per `CLAUDE.md`'s UI-testing guidance: run the dev server, exercise the golden path + edge cases). Only `lib/`-level logic (stores, format helpers, db/API layers) gets Vitest coverage.

---

### Task 1: `lib/db/account.ts` — recent usage query

**Files:**

- Create: `lib/db/account.ts`
- Test: `lib/db/account.test.ts`

**Interfaces:**

- Produces: `interface RecentUsageEntry { reason: string | null; amount: number; createdAt: string }`, `getRecentUsage(userId: string, limit?: number): Promise<RecentUsageEntry[]>` — the last `limit` (default 3) debit-type `Transaction` rows for the user, most recent first.

- [ ] **Step 1: Write the failing test**

```ts
// lib/db/account.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  userId: string;
  type: string;
  amount: number;
  reason: string | null;
  createdAt: Date;
}
let rows: Row[] = [];

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    transaction: {
      findMany: vi.fn(
        async ({
          where,
          orderBy,
          take,
        }: {
          where: { userId: string; type: string };
          orderBy: { createdAt: "desc" };
          take: number;
        }) =>
          rows
            .filter((r) => r.userId === where.userId && r.type === where.type)
            .sort((a, b) =>
              orderBy.createdAt === "desc"
                ? b.createdAt.getTime() - a.createdAt.getTime()
                : a.createdAt.getTime() - b.createdAt.getTime(),
            )
            .slice(0, take),
      ),
    },
  },
}));

import { getRecentUsage } from "./account";

describe("getRecentUsage", () => {
  beforeEach(() => {
    rows = [
      {
        userId: "u1",
        type: "debit",
        amount: 1,
        reason: "generate",
        createdAt: new Date("2026-01-01"),
      },
      {
        userId: "u1",
        type: "debit",
        amount: 6,
        reason: "graduate",
        createdAt: new Date("2026-01-03"),
      },
      {
        userId: "u1",
        type: "debit",
        amount: 1,
        reason: "generate",
        createdAt: new Date("2026-01-02"),
      },
      {
        userId: "u1",
        type: "refund",
        amount: 1,
        reason: "generate-declined",
        createdAt: new Date("2026-01-04"),
      },
      {
        userId: "u2",
        type: "debit",
        amount: 4,
        reason: "generate",
        createdAt: new Date("2026-01-05"),
      },
    ];
  });

  it("returns only the user's debit entries, most recent first", async () => {
    const usage = await getRecentUsage("u1", 3);
    expect(usage).toEqual([
      { reason: "graduate", amount: 6, createdAt: "2026-01-03T00:00:00.000Z" },
      { reason: "generate", amount: 1, createdAt: "2026-01-02T00:00:00.000Z" },
      { reason: "generate", amount: 1, createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("excludes non-debit entries (refunds, topups, etc.)", async () => {
    const usage = await getRecentUsage("u1", 10);
    expect(usage.every((u) => u.reason !== "generate-declined")).toBe(true);
  });

  it("respects the limit", async () => {
    const usage = await getRecentUsage("u1", 1);
    expect(usage).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/db/account.test.ts`
Expected: FAIL — `./account` doesn't exist.

- [ ] **Step 3: Implement**

```ts
// lib/db/account.ts
import { prisma } from "./prisma";

export interface RecentUsageEntry {
  reason: string | null;
  amount: number;
  createdAt: string;
}

// Last `limit` debit-type ledger entries for the "Uso recente" dashboard
// card — refunds/topups/subscribes/renews are excluded, those aren't spend.
export async function getRecentUsage(
  userId: string,
  limit = 3,
): Promise<RecentUsageEntry[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId, type: "debit" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    reason: r.reason,
    amount: r.amount,
    createdAt: r.createdAt.toISOString(),
  }));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/db/account.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/account.ts lib/db/account.test.ts
git commit -m "feat(db): add getRecentUsage for the dashboard's usage card"
```

---

### Task 2: `GET /api/account/summary`

**Files:**

- Create: `app/api/account/summary/route.ts`
- Test: `app/api/account/summary/route.test.ts`

**Interfaces:**

- Consumes: `requireUser()`, `loadWallet` (`lib/db/wallet.ts`), `buildCredits` (`lib/api/compose.ts`, from the backend plan), `getRecentUsage` (Task 1).
- Produces: `GET` → `{ credits: Credits, recentUsage: RecentUsageEntry[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/account/summary/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedWallet } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-18T00:00:00.000Z");

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/wallet", () => ({ loadWallet: vi.fn() }));
vi.mock("@/lib/db/account", () => ({ getRecentUsage: vi.fn() }));

import { GET } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadWallet } from "@/lib/db/wallet";
import { getRecentUsage } from "@/lib/db/account";

describe("GET /api/account/summary", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(loadWallet).mockResolvedValue(seedWallet(NOW));
    vi.mocked(getRecentUsage).mockResolvedValue([
      { reason: "generate", amount: 1, createdAt: NOW.toISOString() },
    ]);
  });

  it("returns credits and recent usage for the session user", async () => {
    const res = await GET();
    const json = await res.json();
    expect(getRecentUsage).toHaveBeenCalledWith("u1", 3);
    expect(json.credits.balance).toBe(320);
    expect(json.recentUsage).toHaveLength(1);
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getRecentUsage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/api/account/summary/route.test.ts`
Expected: FAIL — `./route` doesn't exist.

- [ ] **Step 3: Implement**

```ts
// app/api/account/summary/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { loadWallet } from "@/lib/db/wallet";
import { getRecentUsage } from "@/lib/db/account";
import { buildCredits } from "@/lib/api/compose";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const [wallet, recentUsage] = await Promise.all([
    loadWallet(gate.id),
    getRecentUsage(gate.id, 3),
  ]);
  return NextResponse.json({
    credits: buildCredits(wallet, new Date()),
    recentUsage,
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run app/api/account/summary/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/account/summary/route.ts app/api/account/summary/route.test.ts
git commit -m "feat(api): add GET /api/account/summary for the dashboard"
```

---

### Task 3: `lib/api-client.ts` + `lib/dashboardStore.ts`

**Files:**

- Modify: `lib/api-client.ts` (from the backend plan — add `getAccountSummary`, fix `MoldeListItem.garmentType`'s type)
- Create: `lib/dashboardStore.ts`
- Test: `lib/dashboardStore.test.ts`

**Interfaces:**

- Produces (`lib/api-client.ts`): `getAccountSummary(): Promise<{credits: Credits, recentUsage: RecentUsageEntry[]}>`; `MoldeListItem.garmentType` becomes `GarmentType | null` (was loosely `string | null`).
- Produces (`lib/dashboardStore.ts`): `useDashboardStore` with state `{ready, error, moldes, credits, recentUsage, search, typeFilter}` and actions `init()`, `create(): Promise<string>`, `rename(id, name)`, `remove(id)`, `setSearch(q)`, `setTypeFilter(t)`; plus a standalone selector `filteredMoldes(state): MoldeListItem[]` applying `search`/`typeFilter` client-side.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboardStore.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MoldeListItem } from "./api-client";

vi.mock("./api-client", () => ({
  listMoldes: vi.fn(),
  createMolde: vi.fn(),
  renameMolde: vi.fn(),
  deleteMolde: vi.fn(),
  getAccountSummary: vi.fn(),
}));

import * as api from "./api-client";
import { useDashboardStore, filteredMoldes } from "./dashboardStore";

function molde(overrides: Partial<MoldeListItem> = {}): MoldeListItem {
  return {
    id: "m1",
    name: "Novo molde",
    garmentType: "blouse",
    updatedAt: "2026-08-18T00:00:00.000Z",
    thumbnailSvg: "<svg/>",
    ...overrides,
  };
}

describe("dashboardStore.init", () => {
  beforeEach(() => {
    vi.mocked(api.listMoldes).mockReset();
    vi.mocked(api.getAccountSummary).mockReset();
    useDashboardStore.setState({
      ready: false,
      error: false,
      moldes: [],
      credits: null,
      recentUsage: [],
      search: "",
      typeFilter: "all",
    });
  });

  it("loads moldes and account summary", async () => {
    vi.mocked(api.listMoldes).mockResolvedValue([molde()]);
    vi.mocked(api.getAccountSummary).mockResolvedValue({
      credits: {
        plan: "atelier",
        planLabel: "Ateliê",
        balance: 320,
        total: 500,
        renewsInDays: 12,
      },
      recentUsage: [],
    });
    await useDashboardStore.getState().init();
    const s = useDashboardStore.getState();
    expect(s.ready).toBe(true);
    expect(s.moldes).toHaveLength(1);
    expect(s.credits?.balance).toBe(320);
  });

  it("sets error and ready on failure, without throwing", async () => {
    vi.mocked(api.listMoldes).mockRejectedValue(new Error("boom"));
    vi.mocked(api.getAccountSummary).mockResolvedValue({
      credits: {
        plan: "atelier",
        planLabel: "Ateliê",
        balance: 0,
        total: 0,
        renewsInDays: 0,
      },
      recentUsage: [],
    });
    await useDashboardStore.getState().init();
    const s = useDashboardStore.getState();
    expect(s.error).toBe(true);
    expect(s.ready).toBe(true);
  });
});

describe("dashboardStore.rename / remove", () => {
  beforeEach(() => {
    useDashboardStore.setState({
      moldes: [molde(), molde({ id: "m2", name: "Vestido" })],
    });
  });

  it("rename updates the local list optimistically after the call resolves", async () => {
    vi.mocked(api.renameMolde).mockResolvedValue(undefined);
    await useDashboardStore.getState().rename("m1", "Blusa nova");
    expect(api.renameMolde).toHaveBeenCalledWith("m1", "Blusa nova");
    expect(
      useDashboardStore.getState().moldes.find((m) => m.id === "m1")?.name,
    ).toBe("Blusa nova");
  });

  it("remove drops the molde from the local list", async () => {
    vi.mocked(api.deleteMolde).mockResolvedValue(undefined);
    await useDashboardStore.getState().remove("m1");
    expect(api.deleteMolde).toHaveBeenCalledWith("m1");
    expect(useDashboardStore.getState().moldes.map((m) => m.id)).toEqual([
      "m2",
    ]);
  });
});

describe("filteredMoldes", () => {
  const moldes = [
    molde({ id: "m1", name: "Vestido de festa", garmentType: "dress" }),
    molde({ id: "m2", name: "Camiseta básica", garmentType: "tshirt" }),
    molde({ id: "m3", name: "Vestido curto", garmentType: "dress" }),
  ];

  it("filters by case-insensitive name search", () => {
    const out = filteredMoldes({
      moldes,
      search: "vestido",
      typeFilter: "all",
    });
    expect(out.map((m) => m.id)).toEqual(["m1", "m3"]);
  });

  it("filters by garment type", () => {
    const out = filteredMoldes({ moldes, search: "", typeFilter: "tshirt" });
    expect(out.map((m) => m.id)).toEqual(["m2"]);
  });

  it("combines search and type filter", () => {
    const out = filteredMoldes({
      moldes,
      search: "curto",
      typeFilter: "dress",
    });
    expect(out.map((m) => m.id)).toEqual(["m3"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/dashboardStore.test.ts`
Expected: FAIL — `./dashboardStore` doesn't exist.

- [ ] **Step 3: Extend `lib/api-client.ts`**

Add (keep everything else in the file from the backend plan unchanged):

```ts
// lib/api-client.ts — imports: add GarmentType
import { Credits, EditorState, GarmentType } from "./types";
```

```ts
// lib/api-client.ts — fix MoldeListItem's garmentType type
export interface MoldeListItem {
  id: string;
  name: string;
  garmentType: GarmentType | null;
  updatedAt: string;
  thumbnailSvg: string;
}
```

```ts
// lib/api-client.ts — append
export interface RecentUsageEntry {
  reason: string | null;
  amount: number;
  createdAt: string;
}

export interface AccountSummary {
  credits: Credits;
  recentUsage: RecentUsageEntry[];
}

export function getAccountSummary(): Promise<AccountSummary> {
  return getJson<AccountSummary>("/api/account/summary");
}
```

- [ ] **Step 4: Implement `lib/dashboardStore.ts`**

```ts
// lib/dashboardStore.ts
import { create } from "zustand";
import * as api from "./api-client";
import type { MoldeListItem, RecentUsageEntry } from "./api-client";
import type { Credits, GarmentType } from "./types";

export type TypeFilter = GarmentType | "all";

interface DashboardStore {
  ready: boolean;
  error: boolean;
  moldes: MoldeListItem[];
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

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  ready: false,
  error: false,
  moldes: [],
  credits: null,
  recentUsage: [],
  search: "",
  typeFilter: "all",

  init: async () => {
    set({ ready: false, error: false });
    try {
      const [moldes, summary] = await Promise.all([
        api.listMoldes(),
        api.getAccountSummary(),
      ]);
      set({
        moldes,
        credits: summary.credits,
        recentUsage: summary.recentUsage,
        ready: true,
      });
    } catch {
      set({ error: true, ready: true });
    }
  },

  create: async () => {
    const { id } = await api.createMolde();
    return id;
  },

  rename: async (id, name) => {
    await api.renameMolde(id, name);
    set((s) => ({
      moldes: s.moldes.map((m) => (m.id === id ? { ...m, name } : m)),
    }));
  },

  remove: async (id) => {
    await api.deleteMolde(id);
    set((s) => ({ moldes: s.moldes.filter((m) => m.id !== id) }));
  },

  setSearch: (search) => set({ search }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
}));

// Pure — takes a slice matching the store's shape so it's usable both from
// a live store snapshot and directly in tests.
export function filteredMoldes(state: {
  moldes: MoldeListItem[];
  search: string;
  typeFilter: TypeFilter;
}): MoldeListItem[] {
  const q = state.search.trim().toLowerCase();
  return state.moldes.filter((m) => {
    const matchesSearch = !q || m.name.toLowerCase().includes(q);
    const matchesType =
      state.typeFilter === "all" || m.garmentType === state.typeFilter;
    return matchesSearch && matchesType;
  });
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run lib/dashboardStore.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/api-client.ts lib/dashboardStore.ts lib/dashboardStore.test.ts
git commit -m "feat(dashboard): add useDashboardStore and account-summary api-client calls"
```

---

### Task 4: `lib/format.ts` — relative-time helper

**Files:**

- Modify: `lib/format.ts`
- Modify: `lib/format.test.ts`

**Interfaces:**

- Produces: `relativeTime(iso: string, now?: Date): string` — "agora" / "há N min" / "há Nh" / "há Nd" / a `pt-BR` locale date past 7 days.

- [ ] **Step 1: Write the failing test**

```ts
// lib/format.test.ts — append
describe("relativeTime", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");

  it("returns 'agora' under a minute", () => {
    expect(relativeTime("2026-08-18T11:59:30.000Z", now)).toBe("agora");
  });

  it("returns minutes under an hour", () => {
    expect(relativeTime("2026-08-18T11:45:00.000Z", now)).toBe("há 15 min");
  });

  it("returns hours under a day", () => {
    expect(relativeTime("2026-08-18T09:00:00.000Z", now)).toBe("há 3h");
  });

  it("returns days under a week", () => {
    expect(relativeTime("2026-08-16T12:00:00.000Z", now)).toBe("há 2d");
  });

  it("falls back to a pt-BR date past a week", () => {
    expect(relativeTime("2026-08-01T12:00:00.000Z", now)).toBe(
      new Date("2026-08-01T12:00:00.000Z").toLocaleDateString("pt-BR"),
    );
  });
});
```

Add the import at the top of the file: `import { initialsFromEmail, relativeTime } from "./format";` (merge with whatever's already imported).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/format.test.ts`
Expected: FAIL — `relativeTime` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/format.ts`:

```ts
// Dashboard card "updated" label. Hardcoded pt-BR, same precedent as
// formatList above — lib/format.ts isn't wired into the next-intl catalog.
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/format.ts lib/format.test.ts
git commit -m "feat(format): add relativeTime for the dashboard's molde cards"
```

---

### Task 5: `components/shared/ConfirmModal.tsx` (+ retrofit the editor's delete button)

**Files:**

- Create: `components/shared/ConfirmModal.tsx`
- Modify: `components/editor/Topbar.tsx` (swap `window.confirm` for `ConfirmModal`, matching the design spec's intent — the backend plan used `window.confirm` as a bridge since this component didn't exist yet)
- Modify: `messages/pt-BR.json` (`Topbar` namespace only — no new namespace needed, `ConfirmModal` takes its copy as props)

**Interfaces:**

- Produces: `ConfirmModal({title, description, confirmLabel, cancelLabel, onConfirm, onCancel}): JSX.Element` — styled like `PaywallModal` (overlay + centered card), absolutely positioned so it composes inside any `relative` parent.

- [ ] **Step 1: Implement `ConfirmModal`**

```tsx
// components/shared/ConfirmModal.tsx
"use client";

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center pt-[52px]">
      <button
        type="button"
        aria-label={cancelLabel}
        onClick={onCancel}
        className="bg-overlay absolute inset-0 cursor-default border-0"
      />
      <div className="bg-surface border-border rounded-modal shadow-modal relative flex w-[380px] flex-col gap-3 border p-[20px]">
        <span className="font-display text-[17px] font-semibold">{title}</span>
        <p className="text-muted-2 m-0 text-[13px] leading-[1.5]">
          {description}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="border-border rounded-btn text-muted-2 hover:bg-surface-alt border px-[13px] py-[7px] text-[12px] font-medium transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="border-alert text-alert hover:bg-amber-bg rounded-btn border px-[13px] py-[7px] text-[12px] font-medium transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `messages/pt-BR.json`'s `Topbar` namespace**

Add two keys alongside the existing `deleteConfirm`/`deleteTitle`/`deleteButton` (keep `deleteConfirm` — it's no longer used as a `window.confirm` string, but `deleteTitle`/`deleteButton` and the rest stay; replace `deleteConfirm` with two separate strings for the modal's title/body):

```json
"Topbar": {
  "deleteModalTitle": "Excluir este molde?",
  "deleteModalDescription": "Isso apaga o molde e toda a conversa, e não pode ser desfeito.",
  "deleteConfirmButton": "Excluir",
  "deleteCancelButton": "Cancelar",
  "deleteTitle": "Excluir este molde",
  "deleteButton": "✕ Excluir",
  "savedVersion": "{savedAgo} · v{version}",
  "creditsLabel": "{planLabel} · {balance} créditos",
  "outOfTotal": "de {total}",
  "buyCreditsButton": "Comprar créditos",
  "signOutButton": "Sair"
},
```

- [ ] **Step 3: Update `Topbar.tsx` to use it**

```tsx
// components/editor/Topbar.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Credits, Pattern } from "@/lib/types";
import { useEditorStore } from "@/lib/store";
import { signOut } from "next-auth/react";
import { initialsFromEmail } from "@/lib/format";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

export function Topbar({
  pattern,
  credits,
  userEmail,
}: {
  pattern: Pattern;
  credits: Credits;
  userEmail: string;
}) {
  const t = useTranslations("Topbar");
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const pct = Math.round((credits.balance / credits.total) * 100);
  const deleteCurrentMolde = useEditorStore((s) => s.deleteCurrentMolde);

  const handleConfirmDelete = async () => {
    setConfirmingDelete(false);
    await deleteCurrentMolde();
    router.push("/");
  };

  return (
    <div className="bg-surface border-border relative flex items-center gap-4 border-b px-[18px] py-3">
      <span className="font-display text-[19px] font-bold tracking-[-0.4px]">
        Mold<span className="text-olive">AI</span>
      </span>
      <div className="bg-border h-5 w-px" />
      <div className="flex flex-col gap-px">
        <span className="text-[13px] font-semibold">{pattern.name}</span>
        <span className="text-muted text-[11px]">
          {t("savedVersion", {
            savedAgo: pattern.savedAgo,
            version: pattern.version,
          })}
        </span>
      </div>
      <button
        onClick={() => setConfirmingDelete(true)}
        title={t("deleteTitle")}
        className="border-border rounded-btn bg-surface text-muted-2 hover:bg-surface-alt border px-[11px] py-[6px] text-[12px] font-medium transition-colors"
      >
        {t("deleteButton")}
      </button>
      <div className="flex-1" />
      <div className="flex w-[168px] flex-col gap-[5px]">
        <div className="text-muted flex justify-between text-[11px]">
          <span>
            {t("creditsLabel", {
              planLabel: credits.planLabel,
              balance: credits.balance,
            })}
          </span>
          <span>{t("outOfTotal", { total: credits.total })}</span>
        </div>
        <div className="bg-track h-[5px] overflow-hidden rounded-full">
          <div className="bg-olive h-full" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button className="border-border rounded-btn bg-surface hover:bg-surface-alt border px-[13px] py-[7px] text-[12px] font-medium transition-colors">
        {t("buyCreditsButton")}
      </button>
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
          {t("signOutButton")}
        </button>
      </div>
      {confirmingDelete && (
        <ConfirmModal
          title={t("deleteModalTitle")}
          description={t("deleteModalDescription")}
          confirmLabel={t("deleteConfirmButton")}
          cancelLabel={t("deleteCancelButton")}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

Run: `npm run build`
Expected: builds clean.

Run: `npm run dev`, open the editor, click "✕ Excluir" — confirm the styled modal appears (not a native browser `confirm()`), Cancel dismisses it, and confirming deletes the molde and redirects to `/`.

- [ ] **Step 5: Commit**

```bash
git add components/shared/ConfirmModal.tsx components/editor/Topbar.tsx messages/pt-BR.json
git commit -m "feat(shared): add ConfirmModal, use it for the editor's delete-molde flow"
```

---

### Task 6: `MoldeCard`, `CreditsCard`, `RecentUsageCard`

**Files:**

- Create: `components/dashboard/MoldeCard.tsx`
- Create: `components/dashboard/CreditsCard.tsx`
- Create: `components/dashboard/RecentUsageCard.tsx`
- Modify: `messages/pt-BR.json` (new `MoldeCard`, `CreditsCard`, `RecentUsageCard` namespaces)

**Interfaces:**

- Consumes: `MoldeListItem` (`lib/api-client.ts`), `Credits` (`lib/types.ts`), `RecentUsageEntry` (`lib/api-client.ts`), `relativeTime` (Task 4), `useDashboardStore` (Task 3, for `rename`/`remove`), `ConfirmModal` (Task 5).
- Produces: `MoldeCard({molde, onOpen}: {molde: MoldeListItem, onOpen: (id: string) => void})`, `CreditsCard({credits}: {credits: Credits})`, `RecentUsageCard({entries}: {entries: RecentUsageEntry[]})`.

- [ ] **Step 1: Add messages**

Append to `messages/pt-BR.json` (top-level keys, alongside `Topbar` etc.):

```json
"MoldeCard": {
  "menuAriaLabel": "Mais opções",
  "renameOption": "Renomear",
  "renameTitle": "Renomear molde",
  "renamePrompt": "Novo nome do molde",
  "deleteOption": "Excluir",
  "deleteModalTitle": "Excluir este molde?",
  "deleteModalDescription": "Isso apaga o molde e toda a conversa, e não pode ser desfeito.",
  "deleteConfirmButton": "Excluir",
  "deleteCancelButton": "Cancelar",
  "blankLabel": "em branco"
},
"CreditsCard": {
  "title": "Créditos do mês",
  "outOfTotal": "de {total} · renova em {days} dias"
},
"RecentUsageCard": {
  "title": "Uso recente",
  "empty": "Nenhum uso ainda.",
  "reasonGenerate": "Ajuste",
  "reasonGraduate": "Graduação"
}
```

- [ ] **Step 2: Implement `MoldeCard.tsx`**

```tsx
// components/dashboard/MoldeCard.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MoldeListItem } from "@/lib/api-client";
import { useDashboardStore } from "@/lib/dashboardStore";
import { relativeTime } from "@/lib/format";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

export function MoldeCard({
  molde,
  onOpen,
}: {
  molde: MoldeListItem;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("MoldeCard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const rename = useDashboardStore((s) => s.rename);
  const remove = useDashboardStore((s) => s.remove);

  const handleRename = () => {
    setMenuOpen(false);
    const next = window.prompt(t("renamePrompt"), molde.name);
    if (next && next.trim() && next.trim() !== molde.name) {
      rename(molde.id, next.trim());
    }
  };

  return (
    <div className="border-border rounded-card group relative flex flex-col gap-2 border bg-white p-[10px]">
      <button
        type="button"
        onClick={() => onOpen(molde.id)}
        className="bg-surface-alt rounded-item flex h-[112px] w-full items-center justify-center overflow-hidden"
      >
        {molde.garmentType ? (
          <span
            className="h-full w-full [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: molde.thumbnailSvg }}
          />
        ) : (
          <span className="text-muted text-[11px]">{t("blankLabel")}</span>
        )}
      </button>
      <div className="flex items-start justify-between gap-1">
        <div className="flex flex-col gap-px">
          <span className="text-[13px] font-semibold">{molde.name}</span>
          <span className="text-muted text-[11px]">
            {relativeTime(molde.updatedAt)}
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
            remove(molde.id);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement `CreditsCard.tsx`**

```tsx
// components/dashboard/CreditsCard.tsx
"use client";

import { useTranslations } from "next-intl";
import type { Credits } from "@/lib/types";

export function CreditsCard({ credits }: { credits: Credits }) {
  const t = useTranslations("CreditsCard");
  const pct = Math.round((credits.balance / credits.total) * 100);
  return (
    <div className="border-border rounded-card flex flex-col gap-2 border bg-white p-[16px]">
      <span className="text-muted text-[12px] font-medium">{t("title")}</span>
      <span className="font-display text-[26px] font-semibold">
        {credits.balance}
      </span>
      <span className="text-muted text-[11.5px]">
        {t("outOfTotal", { total: credits.total, days: credits.renewsInDays })}
      </span>
      <div className="bg-track h-[5px] overflow-hidden rounded-full">
        <div className="bg-olive h-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `RecentUsageCard.tsx`**

```tsx
// components/dashboard/RecentUsageCard.tsx
"use client";

import { useTranslations } from "next-intl";
import type { RecentUsageEntry } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";

const REASON_KEY: Record<string, "reasonGenerate" | "reasonGraduate"> = {
  generate: "reasonGenerate",
  graduate: "reasonGraduate",
};

export function RecentUsageCard({ entries }: { entries: RecentUsageEntry[] }) {
  const t = useTranslations("RecentUsageCard");
  return (
    <div className="border-border rounded-card flex w-[290px] flex-col gap-2 border bg-white p-[16px]">
      <span className="text-muted text-[12px] font-medium">{t("title")}</span>
      {entries.length === 0 ? (
        <span className="text-muted text-[12px]">{t("empty")}</span>
      ) : (
        <ul className="flex flex-col gap-[6px]">
          {entries.map((e, i) => (
            <li
              key={i}
              className="flex items-center justify-between text-[12px]"
            >
              <span>
                {e.reason && REASON_KEY[e.reason]
                  ? t(REASON_KEY[e.reason])
                  : (e.reason ?? "—")}
              </span>
              <span className="text-muted">{relativeTime(e.createdAt)}</span>
              <span className="text-alert font-medium">−{e.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify manually**

Run: `npm run build`
Expected: builds clean (these components aren't wired into a page yet, but must still typecheck).

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/MoldeCard.tsx components/dashboard/CreditsCard.tsx components/dashboard/RecentUsageCard.tsx messages/pt-BR.json
git commit -m "feat(dashboard): add MoldeCard, CreditsCard, RecentUsageCard"
```

---

### Task 7: `MoldeGrid`

**Files:**

- Create: `components/dashboard/MoldeGrid.tsx`
- Modify: `messages/pt-BR.json` (new `MoldeGrid` namespace)

**Interfaces:**

- Consumes: `useDashboardStore` (`moldes`, `search`, `typeFilter`, `setSearch`, `setTypeFilter`), `filteredMoldes` (Task 3), `MoldeCard` (Task 6), `useTranslations("TechSheetTab")` reused for `garmentType.*` labels (per `CLAUDE.md`'s "catalog-driven lookups keyed off the EN enum value" convention — no new duplicate label map).
- Produces: `MoldeGrid({onOpen}: {onOpen: (id: string) => void})` — title/count, search input, type filter, 4-column card grid, trailing disabled "Importar .dxf" card, and the three grid-area states (true-empty, zero-matches, populated).

- [ ] **Step 1: Add messages**

```json
"MoldeGrid": {
  "countLabel": "{count, plural, one {# molde} other {# moldes}}",
  "searchPlaceholder": "Buscar molde…",
  "typeFilterAll": "Todos os tipos",
  "emptyTitle": "Nenhum molde ainda",
  "emptyDescription": "Crie seu primeiro molde para começar.",
  "noMatchesTitle": "Nenhum molde encontrado",
  "noMatchesDescription": "Tente outro termo de busca ou filtro.",
  "importCardLabel": "Importar .dxf · Audaces",
  "importComingSoonBadge": "em breve"
}
```

- [ ] **Step 2: Implement**

```tsx
// components/dashboard/MoldeGrid.tsx
"use client";

import { useTranslations } from "next-intl";
import { useDashboardStore, filteredMoldes } from "@/lib/dashboardStore";
import { MoldeCard } from "./MoldeCard";
import type { GarmentType } from "@/lib/types";

const GARMENT_TYPES: GarmentType[] = ["blouse", "dress", "skirt", "tshirt"];

export function MoldeGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useTranslations("MoldeGrid");
  const tGarment = useTranslations("TechSheetTab");
  const moldes = useDashboardStore((s) => s.moldes);
  const search = useDashboardStore((s) => s.search);
  const typeFilter = useDashboardStore((s) => s.typeFilter);
  const setSearch = useDashboardStore((s) => s.setSearch);
  const setTypeFilter = useDashboardStore((s) => s.setTypeFilter);

  const filtered = filteredMoldes({ moldes, search, typeFilter });
  const isTrulyEmpty = moldes.length === 0;
  const hasNoMatches = !isTrulyEmpty && filtered.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-[22px]">
      <div className="flex items-center gap-3">
        <span className="font-display text-[24px] font-semibold">
          {t("countLabel", { count: moldes.length })}
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
          {filtered.map((m) => (
            <MoldeCard key={m.id} molde={m} onOpen={onOpen} />
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

- [ ] **Step 3: Verify manually**

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/MoldeGrid.tsx messages/pt-BR.json
git commit -m "feat(dashboard): add MoldeGrid with search, type filter, and empty states"
```

---

### Task 8: `Sidebar`, `DashboardTopbar`

**Files:**

- Create: `components/dashboard/Sidebar.tsx`
- Create: `components/dashboard/DashboardTopbar.tsx`
- Modify: `messages/pt-BR.json` (new `Sidebar`, `DashboardTopbar` namespaces)

**Interfaces:**

- Consumes: `useDashboardStore` (`create`, `credits`), `signOut` (`next-auth/react`), `initialsFromEmail` (`lib/format.ts`).
- Produces: `Sidebar({onCreate}: {onCreate: (id: string) => void})`, `DashboardTopbar({userEmail, credits}: {userEmail: string, credits: Credits | null})`.

- [ ] **Step 1: Add messages**

```json
"Sidebar": {
  "myMoldesLabel": "Meus moldes",
  "measurementsLabel": "Medidas e grades",
  "studioBasesLabel": "Bases do ateliê",
  "comingSoonBadge": "em breve",
  "importLabel": "Importar molde · Audaces · Molde.me · .dxf",
  "newMoldeButton": "＋ Novo molde"
},
"DashboardTopbar": {
  "creditsPill": "◆ {balance} créditos",
  "accountMenuLabel": "◍ Conta ▾",
  "usageMenuItem": "Créditos e uso",
  "planMenuItem": "Plano e cobrança",
  "preferencesMenuItem": "Preferências",
  "signOutMenuItem": "Sair"
}
```

- [ ] **Step 2: Implement `Sidebar.tsx`**

```tsx
// components/dashboard/Sidebar.tsx
"use client";

import { useTranslations } from "next-intl";
import { useDashboardStore } from "@/lib/dashboardStore";

export function Sidebar({ onCreate }: { onCreate: (id: string) => void }) {
  const t = useTranslations("Sidebar");
  const create = useDashboardStore((s) => s.create);

  const handleCreate = async () => {
    const id = await create();
    onCreate(id);
  };

  return (
    <div className="border-border bg-surface flex w-[186px] flex-col border-r p-[14px]">
      <nav className="flex flex-col gap-1">
        <span className="bg-olive-tint text-olive rounded-item px-[10px] py-[7px] text-[12.5px] font-medium">
          {t("myMoldesLabel")}
        </span>
        <span className="text-disabled rounded-item flex items-center justify-between px-[10px] py-[7px] text-[12.5px]">
          {t("measurementsLabel")}
          <span className="bg-amber-bg border-amber-border text-amber-text rounded-pill border px-[6px] py-px text-[10px] font-semibold">
            {t("comingSoonBadge")}
          </span>
        </span>
        <span className="text-disabled rounded-item flex items-center justify-between px-[10px] py-[7px] text-[12.5px]">
          {t("studioBasesLabel")}
          <span className="bg-amber-bg border-amber-border text-amber-text rounded-pill border px-[6px] py-px text-[10px] font-semibold">
            {t("comingSoonBadge")}
          </span>
        </span>
      </nav>
      <div className="flex-1" />
      <div className="border-border rounded-card text-disabled mb-3 border border-dashed p-[10px] text-center text-[11px]">
        {t("importLabel")}
      </div>
      <button
        onClick={handleCreate}
        className="bg-olive rounded-btn px-[13px] py-[9px] text-[12.5px] font-medium text-white transition-[filter] hover:brightness-[0.95]"
      >
        {t("newMoldeButton")}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Implement `DashboardTopbar.tsx`**

```tsx
// components/dashboard/DashboardTopbar.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import type { Credits } from "@/lib/types";
import { initialsFromEmail } from "@/lib/format";

export function DashboardTopbar({
  userEmail,
  credits,
}: {
  userEmail: string;
  credits: Credits | null;
}) {
  const t = useTranslations("DashboardTopbar");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bg-surface border-border flex items-center gap-4 border-b px-[18px] py-3">
      <span className="font-display text-[19px] font-bold tracking-[-0.4px]">
        Mold<span className="text-olive">AI</span>
      </span>
      <div className="flex-1" />
      {credits && (
        <span className="bg-amber-bg border-amber-border text-amber-text rounded-pill border px-[10px] py-[5px] text-[12px] font-semibold">
          {t("creditsPill", { balance: credits.balance })}
        </span>
      )}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="border-border rounded-btn bg-surface hover:bg-surface-alt border px-[11px] py-[6px] text-[12px] font-medium transition-colors"
        >
          {t("accountMenuLabel")}
        </button>
        {menuOpen && (
          <div className="border-border rounded-card shadow-modal bg-surface absolute top-[38px] right-0 z-10 flex w-[180px] flex-col border py-1">
            <span className="text-muted border-border truncate border-b px-3 py-[8px] text-[11.5px]">
              {userEmail}
            </span>
            <button className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]">
              {t("usageMenuItem")}
            </button>
            <button className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]">
              {t("planMenuItem")}
            </button>
            <button className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]">
              {t("preferencesMenuItem")}
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]"
            >
              {t("signOutMenuItem")}
            </button>
          </div>
        )}
      </div>
      <div
        title={userEmail}
        className="bg-olive-tint border-olive-border text-olive flex h-[30px] w-[30px] items-center justify-center rounded-full border text-[12px] font-semibold"
      >
        {initialsFromEmail(userEmail)}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/Sidebar.tsx components/dashboard/DashboardTopbar.tsx messages/pt-BR.json
git commit -m "feat(dashboard): add Sidebar and DashboardTopbar"
```

---

### Task 9: `DashboardShell` and wiring `/`

**Files:**

- Create: `components/dashboard/DashboardShell.tsx`
- Modify: `app/page.tsx` (replaces the interim bridge from the backend plan with the real dashboard)
- Modify: `messages/pt-BR.json` (new `DashboardShell` namespace)

**Interfaces:**

- Consumes: `useDashboardStore` (`init`, `ready`, `error`, `credits`, `recentUsage`), `DashboardTopbar`/`Sidebar`/`MoldeGrid`/`CreditsCard`/`RecentUsageCard` (Tasks 6–8).
- Produces: `DashboardShell({userEmail}: {userEmail: string})` — the full `4b` layout; `app/page.tsx` becomes a thin server component rendering it (session check only, no more list-or-create-then-redirect logic).

- [ ] **Step 1: Add messages**

```json
"DashboardShell": {
  "loading": "Carregando moldes…",
  "loadError": "Não foi possível carregar seus moldes. Tente recarregar a página."
}
```

- [ ] **Step 2: Implement `DashboardShell.tsx`**

```tsx
// components/dashboard/DashboardShell.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDashboardStore } from "@/lib/dashboardStore";
import { DashboardTopbar } from "./DashboardTopbar";
import { Sidebar } from "./Sidebar";
import { MoldeGrid } from "./MoldeGrid";
import { CreditsCard } from "./CreditsCard";
import { RecentUsageCard } from "./RecentUsageCard";

export function DashboardShell({ userEmail }: { userEmail: string }) {
  const t = useTranslations("DashboardShell");
  const router = useRouter();
  const ready = useDashboardStore((s) => s.ready);
  const error = useDashboardStore((s) => s.error);
  const credits = useDashboardStore((s) => s.credits);
  const recentUsage = useDashboardStore((s) => s.recentUsage);
  const init = useDashboardStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  const openMolde = (id: string) => router.push(`/molde/${id}`);

  if (!ready) {
    return (
      <div className="text-muted flex flex-1 items-center justify-center text-[13px]">
        {t("loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-alert flex flex-1 items-center justify-center text-[13px]">
        {t("loadError")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardTopbar userEmail={userEmail} credits={credits} />
      <div className="flex min-h-0 flex-1">
        <Sidebar onCreate={openMolde} />
        <div className="flex min-h-0 flex-1 flex-col">
          <MoldeGrid onOpen={openMolde} />
          {credits && (
            <div className="flex gap-[14px] px-[22px] pb-[22px]">
              <CreditsCard credits={credits} />
              <RecentUsageCard entries={recentUsage} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace `app/page.tsx`**

```tsx
// app/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardShell userEmail={session.user.email} />
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

Run: `npm run build`
Expected: builds clean.

Run: `npm run dev`, log in:

1. Confirm you land on `/` and see the dashboard (not the editor).
2. With zero moldes, confirm the true-empty state renders.
3. Click "＋ Novo molde" — confirm it creates a molde and navigates to `/molde/<id>`.
4. Go back to `/` — confirm the new molde appears in the grid with an "em branco" thumb placeholder (no `garmentType` yet).
5. Generate a pattern in that molde, return to `/` — confirm the card now shows a real thumbnail.
6. Search and type-filter — confirm the grid narrows and the "nenhum molde encontrado" state appears for a query with no matches.
7. Rename and delete a card via its "⋯" menu — confirm both work and the list updates.
8. Confirm the "Créditos do mês" and "Uso recente" cards show real numbers matching the wallet/ledger (cross-check against the editor topbar's credit block for the same account).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/DashboardShell.tsx app/page.tsx messages/pt-BR.json
git commit -m "feat(dashboard): wire DashboardShell into / as the app's new home"
```

---

### Task 10: `CLAUDE.md` updates

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the scope line**

In the "What this is" section, remove "Dashboard" from the out-of-scope list:

Change:

```
Dashboard, landing, onboarding, plans, import, export, version history, and measurement-grid screens are explicitly out of scope for the current state of this codebase.
```

to:

```
Landing, onboarding, plans, import, export (as a dedicated screen — programmatic export itself is in scope), version history, and measurement-grid screens are explicitly out of scope for the current state of this codebase.
```

- [ ] **Step 2: Rewrite the molde-persistence architecture paragraph**

Find the paragraph starting "**The molde state and users are both real (Postgres/Prisma).**" and update it to describe N moldes per user instead of 1: `Molde` is keyed by its own `id` (not `userId`), `lib/db/molde.ts`'s functions all take `(moldeId, userId)` and return `null`/`false` when the row doesn't exist or isn't owned by that user (a route turns that into a 404 via `moldeNotFound()`), and `withMoldeAndWallet` mirrors that shape. Mention `createMolde`/`listMoldesForUser`/`renameMolde`/`deleteMolde` and that `/api/pattern/reset` was removed in favor of `DELETE /api/moldes/[id]`.

- [ ] **Step 3: Replace the `/api/pattern/*` route descriptions**

Update the "API routes simulate real backend behavior" section to describe `/api/moldes` (list/create), `/api/moldes/[id]` (get/rename/delete), `/api/moldes/[id]/generate`, `/api/moldes/[id]/graduate`, `/api/moldes/[id]/conflict/resolve`, and `/api/account/summary` (credits + recent usage, account-level not molde-scoped) in place of the old `/api/pattern/*` list. Keep the existing behavioral description (debit-then-mutate, `applyGarmentSpec`, conflict detection, etc.) — only the route paths and the ownership-check framing change.

- [ ] **Step 4: Add a Dashboard architecture paragraph**

After the molde-persistence paragraph, add a new paragraph describing: `/` is now the dashboard (`useDashboardStore`, `components/dashboard/*`), `/molde/[id]` is the editor; the dashboard card thumbnail is server-built from the molde's already-drafted pieces (`lib/editor/thumbnail.ts`, no redraft, no AI call); which `4b` sub-parts are marked **"em breve"** and why (Medidas e grades / Bases do ateliê / Audaces-.dxf import all depend on screens still out of scope); and that molde cards show no state badge (rascunho/graduado/exportado) because export never touches the server, so "exportado" can't be derived honestly — a known simplification, not a bug.

- [ ] **Step 5: Verify and commit**

Read the full updated file once to confirm no leftover references to the old single-molde model or `/api/pattern/*` routes remain (`grep -n "api/pattern\|Dashboard.*out of scope" CLAUDE.md` should return nothing relevant).

```bash
git add CLAUDE.md
git commit -m "docs(claude): document the dashboard and multi-molde architecture"
```

---

### Task 11: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Full manual walkthrough**

With `npm run dev` running, starting from a freshly seeded account (`npm run db:seed` if needed):

1. Log in → land on the dashboard, true-empty state.
2. Create 2–3 moldes with different garment types via the chat (generate in each).
3. Return to `/` between each — confirm thumbnails, names, and "updated" times are all correct and independent per molde.
4. Exercise search, type filter, rename, delete (including deleting the molde currently open in another tab, then confirming it's gone from the list).
5. Confirm the sidebar's disabled items show "em breve" and don't navigate anywhere.
6. Confirm the dashed "Importar .dxf" card is inert (no click handler) and badged "em breve".
7. Trigger a paywall from inside the editor (spend down to 0 credits, try to generate) — confirm the existing `PaywallModal` still works exactly as before, purchase resolves, and the retried action completes.
8. Confirm `GET /api/account/summary`'s credits match the editor topbar's credits for the same account at every point in the walkthrough.
