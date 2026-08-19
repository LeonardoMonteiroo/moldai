# Credit Management (Créditos e uso / Plano e cobrança) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the dashboard account menu's two dead buttons ("Créditos e uso", "Plano e cobrança") into a unified settings shell with a sidebar, and rename the settings route from `/configuracoes` to `/settings`.

**Architecture:** `/settings` (renamed from `/configuracoes`) becomes one page with 5 sections (Perfil, Alterar senha, Excluir conta, Créditos e uso, Plano e cobrança) switched by a `?section=` query param read server-side via the Next.js `searchParams` page prop (no `useSearchParams`/Suspense needed) and a client `SettingsSidebar` for in-page navigation. Two new sections — `UsageSection` (full transaction ledger + credit top-up) and `PlanSection` (static plan cards, honest about which plan is actually purchasable) — join the three that already exist. One new read endpoint (`GET /api/account/ledger`) backs the ledger; everything else reuses existing backend surface (`POST /api/billing/purchase`, `lib/billing/wallet.ts`).

**Tech Stack:** Next.js 16 App Router, TypeScript, next-intl (pt-BR catalog), Tailwind v4 `@theme` tokens, Prisma/Postgres, Vitest.

## Global Constraints

- Commit messages: English, Conventional Commits (`type(scope): summary`).
- UI display text stays pt-BR; code identifiers/enum values/wire keys are English; new full-page screen **routes** are also English going forward (this plan's own convention change) — see Task 10.
- No new Zustand store — section state lives in the URL; each section keeps local `useState`, matching `SettingsShell`'s existing precedent.
- No component-level tests exist anywhere in this codebase today (`npm test` only covers `lib/**` and `app/api/**` route handlers) — do not introduce a new testing pattern for the new components; verify them manually (Task 9).
- Client components never import from `lib/db/*` (even types) — shared data shapes used by both server DB code and client props/components live in the framework-free `lib/types.ts`, matching the existing `Credits`/`Wallet` split.

---

### Task 1: Ledger types + `getLedgerHistory`

**Files:**

- Modify: `lib/types.ts`
- Modify: `lib/db/account.ts`
- Modify: `lib/db/account.test.ts`

**Interfaces:**

- Produces: `LedgerEntryType` (`"debit" | "refund" | "topup" | "subscribe" | "renew"`) and `LedgerHistoryEntry { type: LedgerEntryType; reason: string | null; amount: number; createdAt: string }`, both exported from `lib/types.ts`. `getLedgerHistory(userId: string, limit = 30): Promise<LedgerHistoryEntry[]>` exported from `lib/db/account.ts`.

- [ ] **Step 1: Add the shared types to `lib/types.ts`**

Open `lib/types.ts` and find the existing `Credits` interface (around line 92-98):

```ts
export interface Credits {
  plan: PlanId;
  planLabel: string;
  balance: number;
  total: number;
  renewsInDays: number;
}
```

Add directly after it:

```ts
// Every ledger entry type lib/billing/wallet.ts's applyPurchase/debitWallet/
// refundWallet/renewWallet can produce, mirrored here (not imported from
// lib/billing) the same way Credits mirrors Wallet — wire/display shape,
// decoupled from the internal billing module.
export type LedgerEntryType =
  "debit" | "refund" | "topup" | "subscribe" | "renew";

export interface LedgerHistoryEntry {
  type: LedgerEntryType;
  reason: string | null;
  amount: number;
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing test for `getLedgerHistory`**

Open `lib/db/account.test.ts`. Replace the whole file with (adds a `type` field to the mock rows/filter and a new `describe` block; the existing `getRecentUsage` tests are unchanged in behavior):

```ts
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
          where: { userId: string; type?: string };
          orderBy: { createdAt: "desc" };
          take: number;
        }) =>
          rows
            .filter(
              (r) =>
                r.userId === where.userId &&
                (where.type === undefined || r.type === where.type),
            )
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

import { getRecentUsage, getLedgerHistory } from "./account";

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

describe("getLedgerHistory", () => {
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

  it("returns every transaction type for the user, most recent first", async () => {
    const ledger = await getLedgerHistory("u1", 10);
    expect(ledger).toEqual([
      {
        type: "refund",
        reason: "generate-declined",
        amount: 1,
        createdAt: "2026-01-04T00:00:00.000Z",
      },
      {
        type: "debit",
        reason: "graduate",
        amount: 6,
        createdAt: "2026-01-03T00:00:00.000Z",
      },
      {
        type: "debit",
        reason: "generate",
        amount: 1,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        type: "debit",
        reason: "generate",
        amount: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("respects the limit", async () => {
    const ledger = await getLedgerHistory("u1", 2);
    expect(ledger).toHaveLength(2);
  });

  it("does not include another user's transactions", async () => {
    const ledger = await getLedgerHistory("u1", 10);
    expect(ledger.some((e) => e.amount === 4 && e.reason === "generate")).toBe(
      false,
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/db/account.test.ts`
Expected: FAIL — `getLedgerHistory` is not exported from `./account`.

- [ ] **Step 4: Implement `getLedgerHistory`**

Open `lib/db/account.ts`. Replace the whole file with:

```ts
import { prisma } from "./prisma";
import type { LedgerEntryType, LedgerHistoryEntry } from "@/lib/types";

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

// Full ledger (every transaction type) for the settings "Créditos e uso"
// section — unlike getRecentUsage, not filtered to debits only.
export async function getLedgerHistory(
  userId: string,
  limit = 30,
): Promise<LedgerHistoryEntry[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    type: r.type as LedgerEntryType,
    reason: r.reason,
    amount: r.amount,
    createdAt: r.createdAt.toISOString(),
  }));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/db/account.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/db/account.ts lib/db/account.test.ts
git commit -m "feat(billing): add getLedgerHistory for the full transaction ledger"
```

---

### Task 2: `GET /api/account/ledger`

**Files:**

- Create: `app/api/account/ledger/route.ts`
- Create: `app/api/account/ledger/route.test.ts`

**Interfaces:**

- Consumes: `requireUser()` from `@/lib/auth/guard` (returns `SessionUser | NextResponse`), `getLedgerHistory(userId, limit)` from Task 1.
- Produces: `GET` handler returning `NextResponse.json({ ledger: LedgerHistoryEntry[] })`, 401 via `requireUser()` gate like every other account route.

- [ ] **Step 1: Write the failing test**

Create `app/api/account/ledger/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/account", () => ({ getLedgerHistory: vi.fn() }));

import { GET } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { getLedgerHistory } from "@/lib/db/account";

describe("GET /api/account/ledger", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(getLedgerHistory).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(getLedgerHistory).mockResolvedValue([
      {
        type: "topup",
        reason: null,
        amount: 100,
        createdAt: "2026-08-18T00:00:00.000Z",
      },
    ]);
  });

  it("returns the ledger history for the session user", async () => {
    const res = await GET();
    const json = await res.json();
    expect(getLedgerHistory).toHaveBeenCalledWith("u1", 30);
    expect(json.ledger).toHaveLength(1);
    expect(json.ledger[0].type).toBe("topup");
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getLedgerHistory).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/account/ledger/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Implement the route**

Create `app/api/account/ledger/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { getLedgerHistory } from "@/lib/db/account";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const ledger = await getLedgerHistory(gate.id, 30);
  return NextResponse.json({ ledger });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/account/ledger/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/account/ledger/route.ts app/api/account/ledger/route.test.ts
git commit -m "feat(api): add GET /api/account/ledger"
```

---

### Task 3: `lib/api-client.ts` client helper

**Files:**

- Modify: `lib/api-client.ts`

**Interfaces:**

- Consumes: `LedgerHistoryEntry` from `@/lib/types` (Task 1).
- Produces: `getLedgerHistory(): Promise<{ ledger: LedgerHistoryEntry[] }>`.

- [ ] **Step 1: Add the import and the client function**

Open `lib/api-client.ts`. Change the top import line:

```ts
import { Credits, EditorState, GarmentType } from "./types";
```

to:

```ts
import { Credits, EditorState, GarmentType, LedgerHistoryEntry } from "./types";
```

Then add this function right after `getAccountSummary`:

```ts
export function getAccountSummary(): Promise<AccountSummary> {
  return getJson<AccountSummary>("/api/account/summary");
}

export function getLedgerHistory(): Promise<{ ledger: LedgerHistoryEntry[] }> {
  return getJson<{ ledger: LedgerHistoryEntry[] }>("/api/account/ledger");
}
```

(Only the new `getLedgerHistory` function is new — `getAccountSummary` above is shown for placement context, don't duplicate it.)

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: build succeeds (this is a pure addition, no existing call sites change).

- [ ] **Step 3: Commit**

```bash
git add lib/api-client.ts
git commit -m "feat(api-client): add getLedgerHistory client helper"
```

---

### Task 4: i18n catalog additions

**Files:**

- Modify: `messages/pt-BR.json`

**Interfaces:**

- Produces: `SettingsSidebar`, `UsageSection`, `PlanSection` namespaces, consumed by Tasks 5-8.

- [ ] **Step 1: Append the new namespaces**

Open `messages/pt-BR.json`. Find the end of the file:

```json
  "SettingsShell": {
    "title": "Configurações"
  }
}
```

Replace with:

```json
  "SettingsShell": {
    "title": "Configurações"
  },
  "SettingsSidebar": {
    "profileLabel": "Perfil",
    "passwordLabel": "Alterar senha",
    "dangerZoneLabel": "Excluir conta",
    "usageLabel": "Créditos e uso",
    "planLabel": "Plano e cobrança"
  },
  "UsageSection": {
    "heading": "Créditos e uso",
    "outOfTotal": "de {total} · renova em {days} dias",
    "topupButton": "Comprar créditos avulsos · R$ 19",
    "historyHeading": "Histórico",
    "empty": "Nenhuma movimentação ainda.",
    "typeDebit": "Uso",
    "typeRefund": "Estorno",
    "typeTopup": "Créditos avulsos",
    "typeSubscribe": "Assinatura",
    "typeRenew": "Renovação",
    "reasonGenerate": "Ajuste",
    "reasonGraduate": "Graduação",
    "reasonGenerateAsk": "Pergunta",
    "reasonGenerateDeclined": "Recusado",
    "reasonGenerateError": "Erro"
  },
  "PlanSection": {
    "currentBadge": "Plano atual",
    "comingSoonBadge": "em breve",
    "costsHeading": "Custo por ação",
    "costGenerate": "Geração · {cost} créditos",
    "costAdjust": "Ajuste · {cost} créditos",
    "costGraduate": "Graduação · {cost} créditos",
    "costCuttingPlan": "Plano de corte · {cost} créditos",
    "costCorrection": "Correção · {cost} créditos",
    "plans": {
      "free": {
        "name": "Grátis",
        "price": "R$ 0",
        "creditsLabel": "30 créditos/mês"
      },
      "atelier": {
        "name": "Ateliê",
        "price": "R$ 59",
        "creditsLabel": "500 créditos/mês"
      },
      "studio": {
        "name": "Estúdio",
        "price": "R$ 149",
        "creditsLabel": "2.000 créditos/mês"
      },
      "factory": {
        "name": "Confecção",
        "price": "R$ 399",
        "creditsLabel": "10.000 créditos/mês"
      }
    }
  }
}
```

- [ ] **Step 2: Validate JSON syntax**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/pt-BR.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add messages/pt-BR.json
git commit -m "feat(i18n): add SettingsSidebar/UsageSection/PlanSection catalog"
```

---

### Task 5: `SettingsSidebar` component

**Files:**

- Create: `components/settings/SettingsSidebar.tsx`

**Interfaces:**

- Produces: `type SettingsSection = "profile" | "password" | "danger" | "usage" | "plan"`, `const SETTINGS_SECTIONS: SettingsSection[]`, `SettingsSidebar({ active: SettingsSection })` component. Consumed by Tasks 8 (`SettingsShell`) and 9 (`app/settings/page.tsx`).

- [ ] **Step 1: Create the component**

Create `components/settings/SettingsSidebar.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export type SettingsSection =
  "profile" | "password" | "danger" | "usage" | "plan";

export const SETTINGS_SECTIONS: SettingsSection[] = [
  "profile",
  "password",
  "danger",
  "usage",
  "plan",
];

const LABEL_KEY: Record<SettingsSection, string> = {
  profile: "profileLabel",
  password: "passwordLabel",
  danger: "dangerZoneLabel",
  usage: "usageLabel",
  plan: "planLabel",
};

export function SettingsSidebar({ active }: { active: SettingsSection }) {
  const t = useTranslations("SettingsSidebar");
  const router = useRouter();

  return (
    <div className="border-border bg-surface flex w-[186px] flex-col gap-1 border-r p-[14px]">
      {SETTINGS_SECTIONS.map((section) => (
        <button
          key={section}
          onClick={() => router.replace(`/settings?section=${section}`)}
          className={
            section === active
              ? "bg-olive-tint text-olive rounded-item px-[10px] py-[7px] text-left text-[12.5px] font-medium"
              : "hover:bg-surface-alt rounded-item px-[10px] py-[7px] text-left text-[12.5px]"
          }
        >
          {t(LABEL_KEY[section])}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds (component isn't imported anywhere yet, but must still typecheck standalone — Next's build typechecks all files under `app`/`components`).

- [ ] **Step 3: Commit**

```bash
git add components/settings/SettingsSidebar.tsx
git commit -m "feat(settings): add SettingsSidebar"
```

---

### Task 6: `UsageSection` component

**Files:**

- Create: `components/settings/UsageSection.tsx`

**Interfaces:**

- Consumes: `Credits`, `LedgerEntryType`, `LedgerHistoryEntry` from `@/lib/types`; `purchase` from `@/lib/api-client` (existing, signature `purchase(type: "topup" | "subscribe", moldeId?: string): Promise<PurchaseResult>`); `relativeTime` from `@/lib/format`.
- Produces: `UsageSection({ credits: Credits; initialLedger: LedgerHistoryEntry[] })`, consumed by Task 8.

- [ ] **Step 1: Create the component**

Create `components/settings/UsageSection.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Credits, LedgerEntryType, LedgerHistoryEntry } from "@/lib/types";
import { purchase } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";

const TYPE_KEY: Record<LedgerEntryType, string> = {
  debit: "typeDebit",
  refund: "typeRefund",
  topup: "typeTopup",
  subscribe: "typeSubscribe",
  renew: "typeRenew",
};

const REASON_KEY: Record<string, string> = {
  generate: "reasonGenerate",
  graduate: "reasonGraduate",
  "generate-ask": "reasonGenerateAsk",
  "generate-declined": "reasonGenerateDeclined",
  "generate-error": "reasonGenerateError",
};

export function UsageSection({
  credits,
  initialLedger,
}: {
  credits: Credits;
  initialLedger: LedgerHistoryEntry[];
}) {
  const t = useTranslations("UsageSection");
  const [balance, setBalance] = useState(credits.balance);
  const [ledger, setLedger] = useState(initialLedger);
  const [buying, setBuying] = useState(false);

  async function buyTopup() {
    setBuying(true);
    const result = await purchase("topup");
    if ("credits" in result) {
      setBalance(result.credits.balance);
      setLedger((prev) => [
        {
          type: "topup",
          reason: null,
          amount: 100,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
    setBuying(false);
  }

  const pct = Math.round((balance / credits.total) * 100);

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-surface border-border rounded-card flex flex-col gap-3 border p-[18px]">
        <h2 className="font-display text-[16px] font-semibold">
          {t("heading")}
        </h2>
        <div className="flex items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-display text-[26px] font-semibold">
              {balance}
            </span>
            <span className="text-muted text-[11.5px]">
              {t("outOfTotal", {
                total: credits.total,
                days: credits.renewsInDays,
              })}
            </span>
          </div>
          <div className="flex-1" />
          <button
            onClick={buyTopup}
            disabled={buying}
            className="bg-ink rounded-item px-[15px] py-[9px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("topupButton")}
          </button>
        </div>
        <div className="bg-track h-[5px] overflow-hidden rounded-full">
          <div className="bg-olive h-full" style={{ width: `${pct}%` }} />
        </div>
      </section>
      <section className="bg-surface border-border rounded-card flex flex-col gap-2 border p-[18px]">
        <h2 className="font-display text-[16px] font-semibold">
          {t("historyHeading")}
        </h2>
        {ledger.length === 0 ? (
          <span className="text-muted text-[12px]">{t("empty")}</span>
        ) : (
          <ul className="flex flex-col gap-[6px]">
            {ledger.map((entry, i) => {
              const reasonKey = entry.reason
                ? REASON_KEY[entry.reason]
                : undefined;
              const sign = entry.type === "debit" ? "−" : "+";
              const amountClass =
                entry.type === "debit" ? "text-alert" : "text-olive-dark";
              return (
                <li
                  key={i}
                  className="border-line flex items-center justify-between border-b py-[6px] text-[12px] last:border-b-0"
                >
                  <span>
                    {t(TYPE_KEY[entry.type])}
                    {reasonKey ? ` · ${t(reasonKey)}` : ""}
                  </span>
                  <span className="text-muted">
                    {relativeTime(entry.createdAt)}
                  </span>
                  <span className={`font-medium ${amountClass}`}>
                    {sign}
                    {entry.amount}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/settings/UsageSection.tsx
git commit -m "feat(settings): add UsageSection"
```

---

### Task 7: `PlanSection` component

**Files:**

- Create: `components/settings/PlanSection.tsx`

**Interfaces:**

- Consumes: `Credits`, `PlanId`, `COSTS` from `@/lib/types`.
- Produces: `PlanSection({ credits: Credits })`, consumed by Task 8.

- [ ] **Step 1: Create the component**

Create `components/settings/PlanSection.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { Credits, PlanId } from "@/lib/types";
import { COSTS } from "@/lib/types";

const PLAN_IDS: PlanId[] = ["free", "atelier", "studio", "factory"];

export function PlanSection({ credits }: { credits: Credits }) {
  const t = useTranslations("PlanSection");

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3">
        {PLAN_IDS.map((id) => {
          const isCurrent = credits.plan === id;
          return (
            <div
              key={id}
              className={
                isCurrent
                  ? "border-olive bg-olive-tint shadow-plan rounded-card flex flex-col gap-2 border-2 p-[16px]"
                  : "border-border bg-surface rounded-card flex flex-col gap-2 border p-[16px] opacity-70"
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold">
                  {t(`plans.${id}.name`)}
                </span>
                {isCurrent ? (
                  <span className="bg-olive rounded-pill px-[9px] py-[3px] text-[10.5px] font-semibold text-white">
                    {t("currentBadge")}
                  </span>
                ) : (
                  <span className="bg-amber-bg border-amber-border text-amber-text rounded-pill border px-[7px] py-[2px] text-[10.5px] font-semibold">
                    {t("comingSoonBadge")}
                  </span>
                )}
              </div>
              <span className="font-display text-[21px] font-semibold">
                {t(`plans.${id}.price`)}
              </span>
              <span className="text-muted text-[11.5px]">
                {t(`plans.${id}.creditsLabel`)}
              </span>
            </div>
          );
        })}
      </section>
      <section className="bg-surface border-border rounded-card flex flex-col gap-2 border p-[18px]">
        <h2 className="font-display text-[16px] font-semibold">
          {t("costsHeading")}
        </h2>
        <ul className="text-muted-2 flex flex-col gap-1 text-[12px]">
          <li>{t("costGenerate", { cost: COSTS.generate })}</li>
          <li>{t("costAdjust", { cost: COSTS.adjust })}</li>
          <li>{t("costGraduate", { cost: COSTS.graduate })}</li>
          <li>{t("costCuttingPlan", { cost: COSTS.cuttingPlan })}</li>
          <li>{t("costCorrection", { cost: COSTS.correction })}</li>
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/settings/PlanSection.tsx
git commit -m "feat(settings): add PlanSection"
```

---

### Task 8: Rewrite `SettingsShell`, add the `/settings` route, wire the dashboard menu

**Files:**

- Modify: `components/settings/SettingsShell.tsx`
- Create: `app/settings/page.tsx`
- Delete: `app/configuracoes/page.tsx`
- Modify: `components/dashboard/DashboardTopbar.tsx`

**Interfaces:**

- Consumes: `SettingsSidebar`, `SettingsSection`, `SETTINGS_SECTIONS` (Task 5); `UsageSection` (Task 6); `PlanSection` (Task 7); existing `ProfileSection`/`PasswordSection`/`DangerZoneSection`; `LedgerHistoryEntry` from `@/lib/types`; `getUserById` (`@/lib/db/users`), `loadWallet` (`@/lib/db/wallet`), `getLedgerHistory` (`@/lib/db/account`, Task 1), `buildCredits` (`@/lib/api/compose`).
- Produces: `SettingsShell({ userEmail, initialName, credits, ledger, activeSection })` and the `/settings` route that renders it.

This task is deliberately kept as one unit rather than split further: `SettingsShell`'s new required props (`ledger`, `activeSection`) and their one call site (the page) change together — splitting them would leave the build red in between for no benefit.

- [ ] **Step 1: Rewrite the file**

Open `components/settings/SettingsShell.tsx`. Replace the whole file with:

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { Credits, LedgerHistoryEntry } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { SettingsSidebar } from "./SettingsSidebar";
import type { SettingsSection } from "./SettingsSidebar";
import { ProfileSection } from "./ProfileSection";
import { PasswordSection } from "./PasswordSection";
import { DangerZoneSection } from "./DangerZoneSection";
import { UsageSection } from "./UsageSection";
import { PlanSection } from "./PlanSection";

export function SettingsShell({
  userEmail,
  initialName,
  credits,
  ledger,
  activeSection,
}: {
  userEmail: string;
  initialName: string;
  credits: Credits;
  ledger: LedgerHistoryEntry[];
  activeSection: SettingsSection;
}) {
  const t = useTranslations("SettingsShell");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} credits={credits} userEmail={userEmail} />
      <div className="flex min-h-0 flex-1">
        <SettingsSidebar active={activeSection} />
        <div className="bg-paper flex flex-1 flex-col gap-4 overflow-y-auto px-[24px] py-[22px]">
          {activeSection === "profile" && (
            <ProfileSection initialName={initialName} email={userEmail} />
          )}
          {activeSection === "password" && <PasswordSection />}
          {activeSection === "danger" && (
            <DangerZoneSection userEmail={userEmail} />
          )}
          {activeSection === "usage" && (
            <UsageSection credits={credits} initialLedger={ledger} />
          )}
          {activeSection === "plan" && <PlanSection credits={credits} />}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the new page**

Create `app/settings/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db/users";
import { loadWallet } from "@/lib/db/wallet";
import { getLedgerHistory } from "@/lib/db/account";
import { buildCredits } from "@/lib/api/compose";
import { SettingsShell } from "@/components/settings/SettingsShell";
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/components/settings/SettingsSidebar";

function parseSection(value: string | undefined): SettingsSection {
  return SETTINGS_SECTIONS.includes(value as SettingsSection)
    ? (value as SettingsSection)
    : "profile";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const [user, wallet, ledger, params] = await Promise.all([
    getUserById(session.user.id),
    loadWallet(session.user.id),
    getLedgerHistory(session.user.id, 30),
    searchParams,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsShell
        userEmail={session.user.email}
        initialName={user?.name ?? ""}
        credits={buildCredits(wallet, new Date())}
        ledger={ledger}
        activeSection={parseSection(params.section)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Delete the old page**

Delete `app/configuracoes/page.tsx` (the directory should now be empty — Next.js's App Router ignores empty directories, no further cleanup needed).

- [ ] **Step 3: Wire the dashboard account menu**

Open `components/dashboard/DashboardTopbar.tsx`. Find this block:

```tsx
            <button className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]">
              {t("usageMenuItem")}
            </button>
            <button className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]">
              {t("planMenuItem")}
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                router.push("/configuracoes");
              }}
              className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]"
            >
              {t("preferencesMenuItem")}
            </button>
```

Replace with:

```tsx
            <button
              onClick={() => {
                setMenuOpen(false);
                router.push("/settings?section=usage");
              }}
              className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]"
            >
              {t("usageMenuItem")}
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                router.push("/settings?section=plan");
              }}
              className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]"
            >
              {t("planMenuItem")}
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                router.push("/settings?section=profile");
              }}
              className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]"
            >
              {t("preferencesMenuItem")}
            </button>
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including `lib/db/account.test.ts` and `app/api/account/ledger/route.test.ts` from Tasks 1-2.

- [ ] **Step 6: Commit**

```bash
git add components/settings/SettingsShell.tsx app/settings/page.tsx components/dashboard/DashboardTopbar.tsx
git rm app/configuracoes/page.tsx
git commit -m "feat(settings): SettingsShell renders one section via sidebar, rename /configuracoes to /settings, wire account menu"
```

---

### Task 9: Manual verification

**Files:** none (no code changes)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Walk through the account menu**

Open `http://localhost:3000`, log in (`dev@moldai.local` / `moldai-dev`), click "◍ Conta ▾":

- Click "Créditos e uso" → lands on `/settings?section=usage`, sidebar highlights "Créditos e uso", balance/renewal numbers match the dashboard's own `CreditsCard`, ledger list shows entries (or "Nenhuma movimentação ainda." if the seeded account has none yet — if so, first do a chat generation or graduation in a molde to produce debit entries, then revisit).
- Click "Comprar créditos avulsos" → balance increases by 100 immediately, a new "Créditos avulsos" row appears at the top of the ledger with no page reload.
- Click "Plano e cobrança" → lands on `/settings?section=plan`, "Ateliê" card shows the "Plano atual" badge with the olive highlight/shadow, the other 3 cards show "em breve" and are visually inert, cost table at the bottom matches `COSTS` (Geração 4, Ajuste 1, Graduação 6, Plano de corte 2, Correção 0).
- Click "Preferências" → lands on `/settings?section=profile`, same Perfil form as before.
- Click each `SettingsSidebar` item directly (Perfil / Alterar senha / Excluir conta / Créditos e uso / Plano e cobrança) → each swaps the right-hand content and updates the URL, without a full page reload or losing the topbar/sidebar.

- [ ] **Step 3: Confirm the old route is gone**

Navigate to `http://localhost:3000/configuracoes` directly.
Expected: Next.js 404 (the route no longer exists).

- [ ] **Step 4: Confirm "← Voltar" still works**

From `/settings` (any section), click "← Voltar" in the header.
Expected: navigates back to `/` (the dashboard).

No commit for this task (verification only).

---

### Task 10: Update CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the MVP scope paragraph**

Find this paragraph (under "## What this is"):

```
**MVP scope (small-scale/personal-use production) is five subsystems.** Shipped: the pattern editor (`4a`), the dashboard (`4b`), and **Configurações do usuário**. Roadmap, not yet built: **Gerenciamento de crédito** (the `Wallet`/`Transaction` backend is already real from Phase C, but dedicated screens — "Créditos e uso", "Plano e cobrança" — don't exist yet, only `4b`'s `CreditsCard` and the purchase paywall `5d`); **Medidas e grades** (`5i`, has a high-fidelity design already); and **Moldes bases** (not its own screen — a sub-section of `5i`'s design, "Bases do ateliê"). This reverses the earlier call to keep measurement-grid screens and "Bases do ateliê" out of scope — they're now roadmap items, just not yet implemented.
```

Replace with:

```
**MVP scope (small-scale/personal-use production) is five subsystems.** Shipped: the pattern editor (`4a`), the dashboard (`4b`), and **Configurações do usuário / Gerenciamento de crédito** (one unified `/settings` shell — see below; `4b`'s `CreditsCard`/`RecentUsageCard` still back the dashboard's own summary cards, unchanged). Roadmap, not yet built: **Medidas e grades** (`5i`, has a high-fidelity design already); and **Moldes bases** (not its own screen — a sub-section of `5i`'s design, "Bases do ateliê"). This reverses the earlier call to keep measurement-grid screens and "Bases do ateliê" out of scope — they're now roadmap items, just not yet implemented.
```

- [ ] **Step 2: Update the Configurações paragraph**

Find this paragraph:

```
**Configurações do usuário (`/configuracoes`) is a dedicated page, not a modal**, reached only from the dashboard's account-menu "Preferências" item (`components/dashboard/DashboardTopbar.tsx`) — there was and is no sidebar entry for it. `app/configuracoes/page.tsx` is the same thin-server-component-does-the-session-check shape as `app/page.tsx`/`app/molde/[id]/page.tsx`: it loads `{id, name, email}` via a new `getUserById` (`lib/db/users.ts`) and the account's `Wallet` directly (no API round-trip for the initial render, same as the editor/dashboard pattern) and renders `components/settings/SettingsShell.tsx`, which stacks three sections — `ProfileSection` (name editable, email deliberately **read-only** since it's the Auth.js Credentials login identifier — editing it is out of scope), `PasswordSection` (current/new/confirm, client-side confirm-mismatch gating plus a server-verified current-password check), and `DangerZoneSection` (account deletion gated by both a client-side "type your email to confirm" match **and** a server-verified password — stronger than the single-molde `ConfirmModal` pattern, since this cascades away every molde and the wallet/transaction history in one irreversible `prisma.user.delete`, which Prisma's existing `onDelete: Cascade` on `Molde`/`Wallet`/`Transaction` handles with no manual cleanup). None of the three introduces a new Zustand store — this screen has no cross-component shared state, so local `useState` per section is enough, per the "don't add abstractions beyond what's needed" convention. Three new account-level routes back it, alongside the existing `GET /api/account/summary`: `PATCH /api/account/profile`, `POST /api/account/password`, `DELETE /api/account` — all `requireUser()`-gated like every other route, with the actual validation/verification logic in a DB-free, dependency-injected `lib/account/settings.ts` (mirroring `lib/auth/authorize.ts`'s `AuthorizeDeps` shape) so it's unit-testable without a live DB. Password changes do **not** invalidate the current JWT session — a deliberate choice for this single-device personal-use MVP, not an oversight.
```

Replace with:

```
**Configurações do usuário / Gerenciamento de crédito (`/settings`) is one unified, dedicated page, not a modal**, reached only from the dashboard's account-menu — its three items ("Créditos e uso", "Plano e cobrança", "Preferências", `components/dashboard/DashboardTopbar.tsx`) all deep-link into this same page via a `?section=` query param (`profile` default, plus `password`/`danger`/`usage`/`plan`) — there is still no _dashboard sidebar_ entry for it, but the page now has its own internal `SettingsSidebar` (5 items, same 186px-column idiom as the dashboard's `Sidebar.tsx`) for switching sections without a full navigation. **The route is English (`/settings`, renamed from the original `/configuracoes`) — a deliberate convention for new full-page screen routes going forward, even though the UI text inside stays pt-BR like everywhere else; previously-shipped routes (`/molde/[id]`) are unaffected, this is not a retroactive rename.** `app/settings/page.tsx` is the same thin-server-component-does-the-session-check shape as `app/page.tsx`/`app/molde/[id]/page.tsx`: it loads `{id, name, email}` via `getUserById` (`lib/db/users.ts`), the account's `Wallet` via `loadWallet`, and now also the last 30 ledger entries via a new `getLedgerHistory` (`lib/db/account.ts`, same shape as `getRecentUsage` but without the debit-only filter) — no API round-trip for the initial render, same as the editor/dashboard pattern — and renders `components/settings/SettingsShell.tsx`, which picks exactly one of five sections to render based on the active section: `ProfileSection` (name editable, email deliberately **read-only** since it's the Auth.js Credentials login identifier — editing it is out of scope), `PasswordSection` (current/new/confirm, client-side confirm-mismatch gating plus a server-verified current-password check), `DangerZoneSection` (account deletion gated by both a client-side "type your email to confirm" match **and** a server-verified password — stronger than the single-molde `ConfirmModal` pattern, since this cascades away every molde and the wallet/transaction history in one irreversible `prisma.user.delete`, which Prisma's existing `onDelete: Cascade` on `Molde`/`Wallet`/`Transaction` handles with no manual cleanup), `UsageSection` (balance/renewal, a "Comprar créditos avulsos" top-up reusing the existing `purchase("topup")` call with an optimistic client-side ledger update, and the full transaction history across every ledger type, not just spend), and `PlanSection` (the 4 plans from design doc `5c` as static display cards — only Ateliê is marked "Plano atual" and actionable, since `lib/billing/wallet.ts`'s `applyPurchase` still only ever issues that one plan; the other 3 are shown but badged **"em breve"**, honest about the limitation rather than faking a plan switch — plus a cost-per-action footer sourced from the existing `COSTS` constant). None of the five sections introduces a new Zustand store — this screen has no cross-component shared state, section choice lives in the URL, so local `useState` per section is enough, per the "don't add abstractions beyond what's needed" convention. Four account-level routes back it, alongside the existing `GET /api/account/summary` and the new `GET /api/account/ledger`: `PATCH /api/account/profile`, `POST /api/account/password`, `DELETE /api/account` — all `requireUser()`-gated like every other route, with the profile/password/deletion validation/verification logic in a DB-free, dependency-injected `lib/account/settings.ts` (mirroring `lib/auth/authorize.ts`'s `AuthorizeDeps` shape) so it's unit-testable without a live DB. Password changes do **not** invalidate the current JWT session — a deliberate choice for this single-device personal-use MVP, not an oversight.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document /settings, its 5 sections, and the English-route convention"
```

---

## Self-Review Notes

- **Spec coverage:** unified shell + sidebar + `/settings` rename + dashboard wiring (Task 8), CLAUDE.md update (Task 10), full-ledger `UsageSection` with optimistic top-up (Task 6), honest single-plan `PlanSection` (Task 7), `GET /api/account/ledger` (Task 2), query-param section routing via the `searchParams` page prop rather than `useSearchParams` (Task 8) — all five spec decisions and the architecture/data-flow/API/i18n/testing sections are covered.
- **Type consistency checked:** `LedgerHistoryEntry`/`LedgerEntryType` defined once in `lib/types.ts` (Task 1) and imported — never redeclared — by `lib/db/account.ts`, `lib/api-client.ts`, `UsageSection`, and `SettingsShell`. `SettingsSection`/`SETTINGS_SECTIONS` defined once in `SettingsSidebar.tsx` (Task 5) and imported by both `SettingsShell` and `app/settings/page.tsx` (both within Task 8) — no duplicate section lists.
- **No red-build window:** Task 8 was originally drafted as two tasks (rewrite `SettingsShell`, then add the route) which would have left `npm run build` failing in between since they share one call site. Merged into a single task instead — every task now leaves the build green.
