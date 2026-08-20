# Sign-up flow (spec A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-service account creation to MoldAI — a public `/signup` page and `POST /api/signup` that validate input, insert one `User` row, and sign the visitor in.

**Architecture:** Pure, dependency-injected validation in `lib/account/signup.ts` (no DB, no framework) sits behind a thin unauthenticated route handler that injects the real repository and hasher. The repository gains one function, `createUser`, which returns `null` on the unique-constraint race instead of throwing — the never-throw contract every other repository in this repo already follows. Separately, `seedWallet` drops from the pre-billing mock's Ateliê 320/500 to the design's Free tier 30/30, because open sign-up must not hand every stranger a paid balance.

**Tech Stack:** Next.js 16 (App Router), Auth.js v5 (Credentials + JWT), Prisma 6 / PostgreSQL, bcryptjs, next-intl (single-locale pt-BR), Vitest, Zustand (untouched here).

**Spec:** [`docs/superpowers/specs/2026-08-20-signup-flow-design.md`](../specs/2026-08-20-signup-flow-design.md)

## Global Constraints

- **Branch:** work continues on `feat/signup-flow` (already checked out; it holds the three spec commits).
- **Commits:** English, Conventional Commits — `type(scope): summary`. Scope for this work is `auth` (or `billing` for Task 1's wallet change).
- **Language boundary:** code identifiers, wire keys, enum values, routes are **English**; UI display text is **pt-BR** and comes only from `messages/pt-BR.json` via `useTranslations`. Never hardcode pt-BR in JSX.
- **Design tokens only.** No hex literals in components — use the Tailwind v4 `@theme` variables from `app/globals.css` (`bg-surface`, `border-border`, `text-olive`, `rounded-btn`, …).
- **Components never call `fetch` directly.** All server calls go through `lib/api-client.ts`.
- **`lib/` stays framework-free.** No `next-intl` import in `lib/`; no Prisma import outside `lib/db/*`.
- **Verification sequence** (all three, from the repo root, before treating a task as done):
  ```bash
  npx vitest run                    # tests
  npx eslint app lib components     # lint — MUST be scoped, never bare
  npm run build                     # this is the typecheck; bare tsc is not a substitute
  ```
  `npm run build` needs `DATABASE_URL`, `AUTH_SECRET`, and `ANTHROPIC_API_KEY` in `.env.local` (it does not connect to the DB).
- **A PostToolUse hook** (`.claude/hooks/check-conventions.mjs`) rejects hardcoded pt-BR, hex colors, direct `fetch(` in `app/`+`components/`, and `t("literal")` keys that don't resolve in the declared namespace. Add catalog keys **before** the component that reads them, or the write is blocked.
- **No Prisma migration in this plan.** `User` already has every column needed. Spec B brings the only migration in the series.
- **Out of scope, do not build:** email verification (spec B), rate limiting (spec C), password reset, onboarding, any payment-gateway change.

---

### Task 1: Free-tier `seedWallet`, and delete the dead `resetWallet`

New accounts must not inherit the pre-billing mock's Ateliê 320/500. This task moves `seedWallet` to the design's Free tier and sweeps every test that asserted the old numbers. It also deletes `resetWallet`, which is called from nothing but its own test and would otherwise need updating for no benefit.

Do this first: it is self-contained, and doing it after the sign-up route would mean shipping a route that briefly grants 500 credits.

**Files:**

- Modify: `lib/billing/wallet.ts` — `seedWallet`
- Modify: `lib/db/wallet.ts:95-103` — delete `resetWallet`
- Modify: `prisma/seed.ts` — materialize an Ateliê wallet for `atelier@moldai.local`
- Modify: `CLAUDE.md` — Billing section
- Test: `lib/billing/wallet.test.ts`, `lib/db/wallet.test.ts`, `lib/db/pattern-wallet.test.ts`, `lib/api/compose.test.ts`, `app/api/account/summary/route.test.ts`, `app/api/patterns/[id]/route.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `seedWallet(now: Date): Wallet` returning `{ plan: "free", planLabel: "Grátis", balance: 30, total: 30, renewsAt: now + 30 days }`. `resetWallet` no longer exists — nothing may import it.

**Do not touch:** `lib/dashboardStore.test.ts` and `lib/store.test.ts`. Both grep-match `320`/`500` but build their `Credits` object as hand-written literals rather than calling `seedWallet`, so they are unaffected. The same is true of the `buildCredits` describe block in `lib/api/compose.test.ts` — only its **first** describe block (`composeEditorState`) derives from `seedWallet`.

- [ ] **Step 1: Update the `seedWallet` test to the Free tier (this is the failing test)**

In `lib/billing/wallet.test.ts`, replace the whole `describe("seedWallet", …)` block:

```ts
describe("seedWallet", () => {
  it("Free plan, 30/30, renews in 30 days", () => {
    const w = seedWallet(NOW);
    expect(w.plan).toBe("free");
    expect(w.planLabel).toBe("Grátis");
    expect(w.balance).toBe(30);
    expect(w.total).toBe(30);
    expect(w.renewsAt).toEqual(new Date("2026-09-16T12:00:00.000Z"));
  });
});
```

(`NOW` is already defined at the top of the file as `2026-08-17T12:00:00.000Z`; 30 days later is `2026-09-16T12:00:00.000Z`.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/billing/wallet.test.ts`
Expected: FAIL — `expected 'atelier' to be 'free'`.

- [ ] **Step 3: Change `seedWallet`**

In `lib/billing/wallet.ts`, replace the `seedWallet` function **and the comment above it**:

```ts
// Every new account starts on the design's Free tier (5c: "Grátis · R$ 0 ·
// 30 créditos/mês"). Open sign-up must not hand a stranger a paid balance;
// applyPurchase("subscribe") is the upgrade path to Ateliê.
export function seedWallet(now: Date): Wallet {
  return {
    plan: "free",
    planLabel: "Grátis",
    balance: 30,
    total: 30,
    renewsAt: new Date(now.getTime() + 30 * DAY_MS),
  };
}
```

- [ ] **Step 4: Fix the rest of `lib/billing/wallet.test.ts`**

Three more assertions in this file derive from the seed. Apply each:

`describe("debitWallet / refundWallet")` — a 4-credit debit off 30 leaves 26, not 316:

```ts
describe("debitWallet / refundWallet", () => {
  it("debit reduces balance and returns a ledger entry with balanceAfter", () => {
    const w = seedWallet(NOW);
    const entry = debitWallet(w, 4, "generate");
    expect(w.balance).toBe(26);
    expect(entry).toEqual({
      type: "debit",
      amount: 4,
      balanceAfter: 26,
      reason: "generate",
    });
  });
  it("refund increases balance and returns a ledger entry", () => {
    const w = seedWallet(NOW);
    debitWallet(w, 4, "generate");
    const entry = refundWallet(w, 4, "generate-error");
    expect(w.balance).toBe(30);
    expect(entry.type).toBe("refund");
    expect(entry.balanceAfter).toBe(30);
  });
});
```

`applyPurchase` topup — 30 + 100 = 130:

```ts
it("topup adds 100 to the balance, plan/renewsAt untouched", () => {
  const w = seedWallet(NOW);
  const renewsBefore = w.renewsAt;
  const entry = applyPurchase(w, "topup", NOW);
  expect(w.balance).toBe(130);
  expect(w.renewsAt).toEqual(renewsBefore);
  expect(entry).toEqual({ type: "topup", amount: 100, balanceAfter: 130 });
});
```

`renewWallet` — `renewWallet` resets `balance` to `total`, and a Free wallet's total is 30:

```ts
it("resets balance to total and rolls renewsAt forward 30 days from the scheduled date", () => {
  const w = seedWallet(NOW);
  w.balance = 12;
  w.renewsAt = new Date("2026-08-17T00:00:00.000Z");
  const entry = renewWallet(w, NOW);
  expect(w.balance).toBe(30);
  expect(w.renewsAt).toEqual(new Date("2026-09-16T00:00:00.000Z"));
  expect(entry).toEqual({ type: "renew", amount: 30, balanceAfter: 30 });
});
```

Leave the `subscribe` test and both `renewsInDays` tests alone — `subscribe` overwrites every field with the Ateliê shape, and `renewsInDays` overwrites `renewsAt` before asserting.

- [ ] **Step 5: Run the billing tests**

Run: `npx vitest run lib/billing/wallet.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 6: Delete `resetWallet`**

In `lib/db/wallet.ts`, delete lines 95-103 in full:

```ts
export async function resetWallet(userId: string): Promise<Wallet> {
  const wallet = seedWallet(new Date());
  await prisma.wallet.upsert({
    where: { userId },
    create: { userId, ...wallet },
    update: { ...wallet },
  });
  return wallet;
}
```

Leave the `seedWallet` import at the top — `lockWallet` and `loadWallet` still use it.

In `lib/db/wallet.test.ts`, delete the entire trailing block:

```ts
describe("resetWallet", () => {
  beforeEach(() => store.clear());
  it("overwrites with the default wallet and persists it", async () => {
    store.set("u1", { ...seedWallet(NOW), balance: 0 });
    const w = await resetWallet("u1");
    expect(w.balance).toBe(320);
    expect((store.get("u1") as { balance: number }).balance).toBe(320);
  });
});
```

…and remove `resetWallet` from that file's `import { … } from "./wallet";` list.

- [ ] **Step 7: Sweep the remaining wallet-literal assertions**

`lib/db/wallet.test.ts` — three edits:

```ts
expect(seen).toBe(30); // was 320, in "seeds the default wallet on first access"
```

```ts
expect(w.balance).toBe(26); // was 316, in "persists fn's mutations…"
// and in the same test's ledger matcher:
expect(ledger[0]).toMatchObject({
  userId: "u1",
  type: "debit",
  amount: 4,
  balanceAfter: 26,
  reason: "generate",
});
```

```ts
expect(w.balance).toBe(30); // was 320, in loadWallet's "returns the seed without writing"
```

`lib/db/pattern-wallet.test.ts` — two edits:

```ts
expect(seenBalance).toBe(30); // was 320
```

```ts
expect((walletStore.get("u1") as { balance: number }).balance).toBe(26); // was 316
```

`lib/api/compose.test.ts` — only the first describe block:

```ts
expect(state.credits).toEqual({
  plan: "free",
  planLabel: "Grátis",
  balance: 30,
  total: 30,
  renewsInDays: 30,
});
```

`app/api/account/summary/route.test.ts`:

```ts
expect(json.credits.balance).toBe(30); // was 320
```

`app/api/patterns/[id]/route.test.ts`:

```ts
expect(json.credits.balance).toBe(30); // was 320
```

- [ ] **Step 8: Run the full suite**

Run: `npx vitest run`
Expected: PASS. If any test now fails because a 30-credit float can't cover repeated debits, that test is asserting on a balance it shouldn't — `COSTS.graduate` is the largest single cost at 6, so 30 is ample; investigate rather than raising the seed.

- [ ] **Step 9: Give `atelier@moldai.local` a real Ateliê wallet**

With Free as the lazy-seeded default, `dev@moldai.local` becomes a Free account automatically. Materialize an Ateliê row for the other seed so both plan states exist for testing. Replace `prisma/seed.ts` in full:

```ts
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/hash";
import { seedWallet, applyPurchase } from "../lib/billing/wallet";

const prisma = new PrismaClient();

// dev@ is left to lazy-seed the Free wallet on first access; atelier@ gets a
// materialized Ateliê row, so the two dev accounts cover both plan states.
const USERS = [
  {
    email: "dev@moldai.local",
    name: "Dev",
    password: "moldai-dev",
    atelier: false,
  },
  {
    email: "atelier@moldai.local",
    name: "Ateliê",
    password: "moldai-dev",
    atelier: true,
  },
];

async function main() {
  const now = new Date();
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        passwordHash: await hashPassword(u.password),
      },
    });
    if (!u.atelier) continue;
    // Built through applyPurchase so the Ateliê shape stays defined in one
    // place (lib/billing/wallet.ts) instead of being duplicated here.
    const wallet = seedWallet(now);
    applyPurchase(wallet, "subscribe", now);
    await prisma.wallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...wallet },
      update: {}, // a reseed must not clobber a balance the dev has spent
    });
  }
  console.log("Seed complete:", USERS.map((u) => u.email).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 10: Update the Billing section of CLAUDE.md**

In the `### Billing (real; only the gateway is mocked)` section, find the first bullet ending "…no backfill migration was written for the pre-Phase-C mock credits." Append to that bullet:

```markdown
New wallets seed at the design's **Free tier** (`free`/"Grátis", 30/30, 30-day
renewal) rather than the pre-billing mock's Ateliê 320/500 — open sign-up must
not grant a paid balance. `applyPurchase("subscribe")` is the upgrade path to
Ateliê, and `PlanSection` already renders "Plano atual" off `credits.plan`, so
nothing downstream needed changing.
```

- [ ] **Step 11: Verify**

```bash
npx vitest run
npx eslint app lib components
npm run build
```

Expected: all three clean. `eslint` in particular catches the now-unused `resetWallet` import if Step 6 missed it.

- [ ] **Step 12: Commit**

```bash
git add lib/billing/wallet.ts lib/billing/wallet.test.ts lib/db/wallet.ts lib/db/wallet.test.ts lib/db/pattern-wallet.test.ts lib/api/compose.test.ts app/api/account/summary/route.test.ts "app/api/patterns/[id]/route.test.ts" prisma/seed.ts CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(billing): seed new wallets at the Free tier and drop dead resetWallet

Open sign-up must not hand every new account the pre-billing mock's Ateliê
320/500. seedWallet now returns the design's Free tier (30/30, 30-day renewal);
prisma/seed.ts materializes an Ateliê wallet for atelier@moldai.local so both
plan states stay testable. resetWallet had no caller but its own test.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AUc7i63wJ1QYzoWLp5kCEU
EOF
)"
```

---

### Task 2: `createAccount` — pure, DI'd sign-up validation

The whole decision — what makes a valid sign-up, and what error it produces — lives in one framework-free, DB-free module, unit-testable with fake deps. This mirrors `lib/auth/authorize.ts`'s `AuthorizeDeps` shape and `lib/account/settings.ts`'s `PasswordDeps`.

**Files:**

- Create: `lib/account/signup.ts`
- Test: `lib/account/signup.test.ts`

**Interfaces:**

- Consumes: `validateName` and `validateNewPassword` from `lib/account/settings.ts` (already exported); `UserRecord` from `lib/auth/types.ts` (`{ id, email, passwordHash, name }`).
- Produces:
  - `type SignupErrorCode = "invalid_name" | "invalid_email" | "weak_password" | "email_taken" | "bad_body"`
  - `interface NewUser { email: string; name: string; passwordHash: string }`
  - `interface SignupDeps { getUserByEmail(email: string): Promise<UserRecord | null>; createUser(input: NewUser): Promise<UserRecord | null>; hash(plain: string): Promise<string> }`
  - `type CreateAccountResult = { ok: true; user: UserRecord } | { ok: false; error: SignupErrorCode }` — named apart from the wire-level `SignupResult` that Task 4 adds to `lib/api-client.ts`, which is a different shape
  - `normalizeEmail(email: unknown): string | null`
  - `createAccount(deps: SignupDeps, input: { name: unknown; email: unknown; password: unknown }): Promise<CreateAccountResult>`

  Task 3 consumes `SignupDeps`, `createAccount`, `SignupErrorCode`, `NewUser`. Task 4 re-exports `SignupErrorCode`.

- [ ] **Step 1: Write the failing test**

Create `lib/account/signup.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createAccount, normalizeEmail } from "./signup";
import type { SignupDeps, NewUser } from "./signup";
import type { UserRecord } from "@/lib/auth/types";

const EXISTING: UserRecord = {
  id: "u1",
  email: "taken@moldai.local",
  passwordHash: "hashed",
  name: "Taken",
};

function deps(over: Partial<SignupDeps> = {}): SignupDeps {
  return {
    getUserByEmail: vi.fn(async () => null),
    createUser: vi.fn(async (input: NewUser) => ({
      id: "new",
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
    })),
    hash: vi.fn(async (plain: string) => `hashed:${plain}`),
    ...over,
  };
}

const VALID = {
  name: "Leonardo",
  email: "novo@moldai.local",
  password: "senha-forte",
};

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@X.COM ")).toBe("foo@x.com");
  });
  it("rejects a non-string, a blank, and a malformed address", () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail("no-at-sign")).toBeNull();
    expect(normalizeEmail("no@domain")).toBeNull();
    expect(normalizeEmail("two spaces@x.com")).toBeNull();
  });
});

describe("createAccount", () => {
  it("hashes the password and creates the user", async () => {
    const d = deps();
    const result = await createAccount(d, VALID);
    expect(result).toEqual({
      ok: true,
      user: {
        id: "new",
        email: "novo@moldai.local",
        passwordHash: "hashed:senha-forte",
        name: "Leonardo",
      },
    });
    expect(vi.mocked(d.hash)).toHaveBeenCalledWith("senha-forte");
  });

  it("stores the email normalized, so authorizeUser's lookup can find it", async () => {
    const d = deps();
    await createAccount(d, { ...VALID, email: "  Foo@X.COM " });
    expect(vi.mocked(d.getUserByEmail)).toHaveBeenCalledWith("foo@x.com");
    expect(vi.mocked(d.createUser)).toHaveBeenCalledWith(
      expect.objectContaining({ email: "foo@x.com" }),
    );
  });

  it("trims the name", async () => {
    const d = deps();
    await createAccount(d, { ...VALID, name: "  Leonardo  " });
    expect(vi.mocked(d.createUser)).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Leonardo" }),
    );
  });

  it("rejects a blank name, a too-long name, and a non-string name", async () => {
    const d = deps();
    for (const name of ["   ", "x".repeat(81), 42]) {
      expect(await createAccount(d, { ...VALID, name })).toEqual({
        ok: false,
        error: "invalid_name",
      });
    }
    expect(vi.mocked(d.createUser)).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const d = deps();
    expect(await createAccount(d, { ...VALID, email: "nope" })).toEqual({
      ok: false,
      error: "invalid_email",
    });
    expect(vi.mocked(d.createUser)).not.toHaveBeenCalled();
  });

  it("rejects a password under 8 characters", async () => {
    const d = deps();
    expect(await createAccount(d, { ...VALID, password: "curta12" })).toEqual({
      ok: false,
      error: "weak_password",
    });
    expect(vi.mocked(d.hash)).not.toHaveBeenCalled();
    expect(vi.mocked(d.createUser)).not.toHaveBeenCalled();
  });

  it("rejects an email that already exists, without hashing", async () => {
    const d = deps({ getUserByEmail: vi.fn(async () => EXISTING) });
    expect(await createAccount(d, VALID)).toEqual({
      ok: false,
      error: "email_taken",
    });
    expect(vi.mocked(d.hash)).not.toHaveBeenCalled();
    expect(vi.mocked(d.createUser)).not.toHaveBeenCalled();
  });

  it("maps a lost insert race (createUser -> null) to email_taken", async () => {
    const d = deps({ createUser: vi.fn(async () => null) });
    expect(await createAccount(d, VALID)).toEqual({
      ok: false,
      error: "email_taken",
    });
  });

  it("checks the name before the email, so the first error wins deterministically", async () => {
    const d = deps();
    expect(
      await createAccount(d, { name: "", email: "nope", password: "x" }),
    ).toEqual({ ok: false, error: "invalid_name" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/account/signup.test.ts`
Expected: FAIL — `Failed to resolve import "./signup"`.

- [ ] **Step 3: Write the implementation**

Create `lib/account/signup.ts`:

```ts
import type { UserRecord } from "@/lib/auth/types";
import { validateName, validateNewPassword } from "./settings";

// Deliberately permissive: one @, no whitespace, a dot in the domain. Enough to
// catch typos without adding a dependency and without rejecting valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// `bad_body` is produced by the route (unparseable JSON), never by
// createAccount — it lives here because the whole wire contract is one union.
export type SignupErrorCode =
  | "invalid_name"
  | "invalid_email"
  | "weak_password"
  | "email_taken"
  | "bad_body";

export interface NewUser {
  email: string; // already normalized
  name: string;
  passwordHash: string;
}

export interface SignupDeps {
  getUserByEmail: (email: string) => Promise<UserRecord | null>;
  // Resolves null when the unique constraint on email fired — see lib/db/users.ts.
  createUser: (input: NewUser) => Promise<UserRecord | null>;
  hash: (plain: string) => Promise<string>;
}

// Distinct from lib/api-client.ts's wire-level SignupResult ({status, error}).
export type CreateAccountResult =
  { ok: true; user: UserRecord } | { ok: false; error: SignupErrorCode };

// Must match the normalization authorizeUser applies before its lookup,
// or an account created as "Foo@X.com" could never be logged into.
export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return EMAIL_RE.test(normalized) ? normalized : null;
}

export async function createAccount(
  deps: SignupDeps,
  input: { name: unknown; email: unknown; password: unknown },
): Promise<CreateAccountResult> {
  const name = validateName(input.name);
  if (!name) return { ok: false, error: "invalid_name" };

  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "invalid_email" };

  if (!validateNewPassword(input.password)) {
    return { ok: false, error: "weak_password" };
  }

  // The friendly path. It does not close the read-then-insert window, which is
  // why createUser reports the constraint violation instead of throwing.
  if (await deps.getUserByEmail(email)) {
    return { ok: false, error: "email_taken" };
  }

  const passwordHash = await deps.hash(input.password);
  const user = await deps.createUser({ email, name, passwordHash });
  if (!user) return { ok: false, error: "email_taken" };

  return { ok: true, user };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/account/signup.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/account/signup.ts lib/account/signup.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add pure createAccount sign-up validation

Framework-free and dependency-injected, mirroring AuthorizeDeps, so every
branch unit-tests without a live DB. Email normalization matches the one
authorizeUser applies before lookup — otherwise a "Foo@X.com" account could
never be logged into.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AUc7i63wJ1QYzoWLp5kCEU
EOF
)"
```

---

### Task 3: `POST /api/signup` and the `createUser` repository function

The route is thin: parse, delegate to `createAccount` with the real deps, map the error code to a status. `createUser` lands here rather than in Task 2 because the route is what needs it wired to Prisma.

**Files:**

- Modify: `lib/db/users.ts` — add `createUser`
- Create: `app/api/signup/route.ts`
- Test: `app/api/signup/route.test.ts`

**Interfaces:**

- Consumes: `createAccount`, `SignupDeps`, `SignupErrorCode`, `NewUser` from Task 2; `hashPassword` from `lib/auth/hash.ts`; `getUserByEmail` from `lib/db/users.ts`.
- Produces:
  - `createUser(input: NewUser): Promise<UserRecord | null>` in `lib/db/users.ts`
  - `POST /api/signup` → `200 {status:"ok"}` · `409 {status:"error",error:"email_taken"}` · `400 {status:"error",error:<other code>}`

**Why here and not elsewhere:** `/api/auth/*` would overlap NextAuth's `[...nextauth]` catch-all; `/api/account/*` is uniformly `requireUser()`-gated and a public sibling there invites a future mistake. This is the only unauthenticated route handler in the app besides NextAuth's own — it deliberately does **not** call `requireUser()`.

- [ ] **Step 1: Write the failing route test**

Create `app/api/signup/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/users", () => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
}));
vi.mock("@/lib/auth/hash", () => ({ hashPassword: vi.fn() }));

import { POST } from "./route";
import { getUserByEmail, createUser } from "@/lib/db/users";
import { hashPassword } from "@/lib/auth/hash";

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID = {
  name: "Leonardo",
  email: "novo@moldai.local",
  password: "senha-forte",
};

describe("POST /api/signup", () => {
  beforeEach(() => {
    vi.mocked(getUserByEmail).mockReset();
    vi.mocked(createUser).mockReset();
    vi.mocked(hashPassword).mockReset();
    vi.mocked(getUserByEmail).mockResolvedValue(null);
    vi.mocked(hashPassword).mockResolvedValue("hashed");
    vi.mocked(createUser).mockResolvedValue({
      id: "new",
      email: "novo@moldai.local",
      passwordHash: "hashed",
      name: "Leonardo",
    });
  });

  it("creates the account and returns ok", async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(createUser).toHaveBeenCalledWith({
      email: "novo@moldai.local",
      name: "Leonardo",
      passwordHash: "hashed",
    });
  });

  it("never returns the password hash to the client", async () => {
    const res = await POST(req(VALID));
    expect(JSON.stringify(await res.json())).not.toContain("hashed");
  });

  it("409s with email_taken when the address exists", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({
      id: "u1",
      email: "novo@moldai.local",
      passwordHash: "x",
      name: null,
    });
    const res = await POST(req(VALID));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: "error",
      error: "email_taken",
    });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("409s with email_taken when the insert loses the race", async () => {
    vi.mocked(createUser).mockResolvedValue(null);
    const res = await POST(req(VALID));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: "error",
      error: "email_taken",
    });
  });

  it("400s with invalid_name on a blank name", async () => {
    const res = await POST(req({ ...VALID, name: "  " }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_name",
    });
  });

  it("400s with invalid_email on a malformed address", async () => {
    const res = await POST(req({ ...VALID, email: "nope" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_email",
    });
  });

  it("400s with weak_password under 8 characters", async () => {
    const res = await POST(req({ ...VALID, password: "curta12" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "weak_password",
    });
  });

  it("400s with bad_body on unparseable JSON", async () => {
    const res = await POST(
      new Request("http://test", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
    expect(createUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/api/signup/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Add `createUser` to the repository**

In `lib/db/users.ts`, add the `Prisma` import to the existing imports and append the function:

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { UserRecord } from "@/lib/auth/types";
import type { NewUser } from "@/lib/account/signup";
```

```ts
// Returns null when the unique constraint on email fires (P2002) — the
// read-then-insert race the pre-read in createAccount cannot close. Never
// throws for that expected failure, matching lib/db/pattern.ts's contract.
export async function createUser(input: NewUser): Promise<UserRecord | null> {
  try {
    return await prisma.user.create({
      data: input,
      select: { id: true, email: true, passwordHash: true, name: true },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return null;
    }
    throw e;
  }
}
```

- [ ] **Step 4: Write the route**

Create `app/api/signup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAccount } from "@/lib/account/signup";
import type { SignupErrorCode } from "@/lib/account/signup";
import { hashPassword } from "@/lib/auth/hash";
import { getUserByEmail, createUser } from "@/lib/db/users";

// The only unauthenticated route handler in the app besides NextAuth's own, so
// it deliberately does not call requireUser(). It sits at the top level rather
// than under /api/auth/* (which the [...nextauth] catch-all owns) or
// /api/account/* (uniformly session-gated).
const STATUS: Record<SignupErrorCode, number> = {
  invalid_name: 400,
  invalid_email: 400,
  weak_password: 400,
  email_taken: 409,
  bad_body: 400,
};

export async function POST(request: Request) {
  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "bad_body" },
      { status: STATUS.bad_body },
    );
  }

  const result = await createAccount(
    { getUserByEmail, createUser, hash: hashPassword },
    { name: body.name, email: body.email, password: body.password },
  );
  if (!result.ok) {
    return NextResponse.json(
      { status: "error", error: result.error },
      { status: STATUS[result.error] },
    );
  }

  // No user fields are echoed back — the client already has the name and email
  // it typed, and the record carries the password hash.
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run app/api/signup/route.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Verify**

```bash
npx vitest run
npx eslint app lib components
npm run build
```

Expected: all three clean.

- [ ] **Step 7: Commit**

```bash
git add lib/db/users.ts app/api/signup/route.ts app/api/signup/route.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add the POST /api/signup route

Thin handler over createAccount, injecting the real repository and hasher and
mapping SignupErrorCode to a status (409 for email_taken, 400 otherwise). The
new createUser returns null on P2002 rather than throwing, so a lost
read-then-insert race produces the same message as the pre-read path.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AUc7i63wJ1QYzoWLp5kCEU
EOF
)"
```

---

### Task 4: The `/signup` page, its catalog entries, and the docs

The user-facing half: a `signUp()` client, the pt-BR catalog namespace, the page itself, a real link from `/login`, and the CLAUDE.md updates that retire the "em breve" scope boundary.

**Files:**

- Modify: `messages/pt-BR.json` — new `Signup` namespace, rewrite `Login.signupNote`
- Modify: `lib/api-client.ts` — add `signUp` and `SignupResult`
- Create: `app/signup/page.tsx`
- Modify: `app/login/page.tsx` — link the note to `/signup`
- Modify: `CLAUDE.md` — Auth bullet, API routes list

**Interfaces:**

- Consumes: `POST /api/signup` from Task 3; `SignupErrorCode` from Task 2.
- Produces:
  - `type SignupResult = { status: "ok" } | { status: "error"; error: SignupErrorCode }` (re-exported from `lib/api-client.ts`)
  - `signUp(name: string, email: string, password: string): Promise<SignupResult>`

**Order matters:** write the catalog keys (Step 1) before any component that reads them. The PostToolUse convention hook resolves every `t("literal")` against the declared namespace and blocks the write if a key is missing.

- [ ] **Step 1: Add the `Signup` namespace and rewrite `Login.signupNote`**

In `messages/pt-BR.json`, add a `"Signup"` object next to `"Login"`:

```json
  "Signup": {
    "heading": "Criar conta",
    "nameLabel": "Nome",
    "emailLabel": "Email",
    "passwordLabel": "Senha",
    "confirmLabel": "Confirmar senha",
    "mismatchError": "As senhas não conferem.",
    "submitButton": "Criar conta",
    "submitButtonLoading": "Criando conta…",
    "signinFailedError": "Conta criada, mas não foi possível entrar. Faça login.",
    "loginNote": "Já tem uma conta? <a>Entrar</a>.",
    "errors": {
      "invalid_name": "Informe o seu nome.",
      "invalid_email": "Email inválido.",
      "weak_password": "A senha deve ter pelo menos 8 caracteres.",
      "email_taken": "Este email já está cadastrado.",
      "bad_body": "Não foi possível criar a conta. Tente novamente."
    }
  },
```

`errors.*` is keyed **exactly** by `SignupErrorCode`, so `t(\`errors.${result.error}\`)`is total.`signinFailedError` is deliberately outside it — it is not a server error code.

And replace `Login.signupNote`:

```json
    "signupNote": "Ainda não tem conta? <a>Criar conta</a>. Cada conta tem os seus próprios moldes, salvos automaticamente."
```

- [ ] **Step 2: Add `signUp` to the API client**

In `lib/api-client.ts`, add the type import at the top of the import block:

```ts
import type { SignupErrorCode } from "./account/signup";
```

(Type-only, so it erases at build time and pulls no server code into the client bundle. `lib/account/signup.ts` imports nothing but pure modules.)

Then, next to the other exported result types near the top of the file:

```ts
export type { SignupErrorCode };

export type SignupResult =
  { status: "ok" } | { status: "error"; error: SignupErrorCode };
```

And add the function alongside the other account calls (after `deleteAccount`):

```ts
export function signUp(
  name: string,
  email: string,
  password: string,
): Promise<SignupResult> {
  return postJson<SignupResult>("/api/signup", { name, email, password });
}
```

`postJson` parses the body regardless of status, so a 409 still arrives as `{status:"error",error:"email_taken"}`.

- [ ] **Step 3: Create the sign-up page**

Create `app/signup/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { signUp } from "@/lib/api-client";

const MIN_PASSWORD_LENGTH = 8;

export default function SignupPage() {
  const t = useTranslations("Signup");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Confirm-password is gated client-side only, mirroring PasswordSection —
  // the server never receives the confirm field.
  const mismatch =
    password.length > 0 && confirm.length > 0 && password !== confirm;
  const canSubmit =
    name.trim().length > 0 &&
    email.length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");

    const result = await signUp(name, email, password);
    if (result.status === "error") {
      setLoading(false);
      setError(t(`errors.${result.error}`));
      return;
    }

    // Spec B replaces this: once verification ships an account starts
    // unverified and cannot be signed in, so this becomes a "verifique seu
    // email" state. Auto-sign-in is the right behavior while A stands alone.
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(t("signinFailedError"));
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
        <h1 className="mt-4 text-[15px] font-semibold">{t("heading")}</h1>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <label className="text-muted-2 flex flex-col gap-1 text-[12px]">
            {t("nameLabel")}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="border-border rounded-btn bg-surface-alt text-ink focus:border-olive border px-3 py-2 text-[13px] focus:outline-none"
            />
          </label>
          <label className="text-muted-2 flex flex-col gap-1 text-[12px]">
            {t("emailLabel")}
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
            {t("passwordLabel")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="border-border rounded-btn bg-surface-alt text-ink focus:border-olive border px-3 py-2 text-[13px] focus:outline-none"
            />
          </label>
          <label className="text-muted-2 flex flex-col gap-1 text-[12px]">
            {t("confirmLabel")}
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className="border-border rounded-btn bg-surface-alt text-ink focus:border-olive border px-3 py-2 text-[13px] focus:outline-none"
            />
          </label>
          {mismatch && (
            <p className="text-alert text-[12px]">{t("mismatchError")}</p>
          )}
          {error && <p className="text-alert text-[12px]">{error}</p>}
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="rounded-btn bg-olive hover:bg-olive-dark mt-1 px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:opacity-50"
          >
            {loading ? t("submitButtonLoading") : t("submitButton")}
          </button>
        </form>
        <p className="text-muted mt-4 text-[11px]">
          {t.rich("loginNote", {
            a: (chunks) => (
              <Link href="/login" className="text-olive-dark font-medium">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </div>
  );
}
```

Like `/login`, this page does **not** redirect an already-signed-in visitor — the two auth pages stay symmetric.

- [ ] **Step 4: Link `/login` to `/signup`**

In `app/login/page.tsx`, add to the imports:

```tsx
import Link from "next/link";
```

and replace the `t.rich("signupNote", …)` call at the bottom of the card:

```tsx
<p className="text-muted mt-4 text-[11px]">
  {t.rich("signupNote", {
    a: (chunks) => (
      <Link href="/signup" className="text-olive-dark font-medium">
        {chunks}
      </Link>
    ),
  })}
</p>
```

The old `b` chunk renderer is gone — the catalog string no longer has a `<b>` tag.

- [ ] **Step 5: Verify**

```bash
npx vitest run
npx eslint app lib components
npm run build
```

Expected: all three clean. The build is what catches a `t.rich` tag name that doesn't match the catalog string.

- [ ] **Step 6: Manual check in the browser**

```bash
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

At `http://localhost:3000/login`, confirm the note now links to **Criar conta**. Then at `/signup`:

1. Submit with mismatched passwords → the submit button stays disabled and "As senhas não conferem." shows.
2. Submit with a 7-character password → button stays disabled.
3. Sign up with `dev@moldai.local` → "Este email já está cadastrado."
4. Sign up with a fresh address → lands on the dashboard, signed in, credits pill reading **30 / 30**.
5. Sign out, log back in with the new credentials → succeeds (proves the email normalization matches `authorizeUser`).
6. Log in as `atelier@moldai.local` → credits pill reads **500 / 500**, and `/settings?section=plan` marks Ateliê as "Plano atual".

- [ ] **Step 7: Update CLAUDE.md**

Two edits.

In the `## What this is` list, replace the Auth bullet:

```markdown
- **Auth:** Auth.js v5 (Credentials + JWT), users in Postgres via Prisma (local Docker Compose). Self-service sign-up at `/signup` creates the account and signs the visitor straight in. Email verification and auth rate limiting are specced but not yet built (`docs/superpowers/specs/2026-08-20-email-verification-design.md`, `…-auth-rate-limiting-design.md`) — until they ship, an address is unproven and account creation is unthrottled, so do not expose this instance to the internet.
```

In `### API routes`, add above the `/api/patterns` bullets:

```markdown
- `POST /api/signup` — creates an account (name/email/password) and returns `{status:"ok"}` or a machine-readable `SignupErrorCode` the client resolves through the catalog. It is the **only unauthenticated route handler** besides NextAuth's own — deliberately at the top level, outside both the `[...nextauth]` catch-all and the uniformly `requireUser()`-gated `/api/account/*`. Validation lives in the pure, DI'd `lib/account/signup.ts`; `lib/db/users.ts`'s `createUser` returns `null` on the P2002 insert race so a lost race reads as `email_taken`.
```

- [ ] **Step 8: Commit**

```bash
git add messages/pt-BR.json lib/api-client.ts app/signup/page.tsx app/login/page.tsx CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(auth): add the /signup page and retire the "em breve" note

Four-field card mirroring /login, posting through a new signUp() in
api-client and auto-signing-in on success. Login.signupNote becomes a real
link. Error codes resolve through a Signup.errors.* catalog sub-object keyed
exactly by SignupErrorCode.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AUc7i63wJ1QYzoWLp5kCEU
EOF
)"
```

---

## Done when

- `/signup` creates an account and lands the visitor on the dashboard with a 30/30 Free wallet.
- Signing out and back in with those credentials works.
- `npx vitest run`, `npx eslint app lib components`, and `npm run build` are all clean.
- CLAUDE.md no longer describes self-signup as deferred, and names the two specs that still gate an internet-facing deployment.
