# Go-Live Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship email verification and auth rate limiting together, removing the two blockers CLAUDE.md names for exposing this instance to the internet.

**Architecture:** Two subsystems land as one effort. Redis-backed fixed-window counters gate every unauthenticated auth endpoint; a hashed single-use token mailed at sign-up gates login until the address is confirmed. Both meet in `lib/auth/authorize.ts`, whose return type changes from a bare `null` to `AuthorizeResult` — written **once** with all three failure reasons (`invalid | unverified | rate_limited`), never introduced then extended.

**Tech Stack:** Next.js 16 (App Router), Auth.js v5 (Credentials + JWT), Prisma 6 / Postgres, `ioredis`, `nodemailer`, Mailpit (dev inbox), next-intl, Vitest.

**Specs:** [email verification](../specs/2026-08-20-email-verification-design.md) (B) · [auth rate limiting](../specs/2026-08-20-auth-rate-limiting-design.md) (C)

## Global Constraints

- **Commits:** English, Conventional Commits — `type(scope): summary`.
- **Language boundary:** code identifiers, wire keys, enum values, Prisma models/columns and routes are **English**; all UI display text is **pt-BR** and comes from `messages/pt-BR.json` via a component namespace. Never hardcode pt-BR in JSX or in `lib/`.
- **`lib/` stays framework-free.** Functions producing display text take an injected `Translate` (`lib/i18n/translate.ts`, `(key, values?) => string`). `next-intl`'s `t` is structurally assignable to it.
- **Repository contract:** everything under `lib/db/` returns `null`/`false`/a reason union for expected failures and never throws or leaks whether a row exists.
- **Pure logic is DB-free and dependency-injected** (`lib/auth/authorize.ts`'s `AuthorizeDeps` is the shape to mirror), so it unit-tests with fakes and no live DB or Redis.
- **Surface limitations on-screen, never silently.** A failure the user caused or can fix gets a specific message; a mail that was never sent must never render as "check your email".
- **One documented exception to the token rule:** `lib/mail/templates.ts` uses literal hex colors. A mail client cannot read `globals.css`, and that file is a lib module, not a component. Nowhere else may hardcode a color.
- **Design tokens only** — Tailwind v4 `@theme` variables from `app/globals.css` (`bg-paper`, `bg-surface`, `border-border`, `text-olive`, `text-alert`, `rounded-card`, `rounded-btn`, `shadow-card`, …). No hex values in components. There is no `tailwind.config.ts`.
- **Next.js 16, not the one you remember.** Read `node_modules/next/dist/docs/` before writing route-handler or App-Router code. `searchParams` in a page is a `Promise` and must be awaited.
- **Verification before completion:** `npm test`, `npm run lint`, and `npm run build` must all pass before a task is considered done. Use `npm run build` for typechecking — bare `tsc` reports a spurious `app/layout.tsx` LayoutProps error in Next 16.
- **Lint scoping:** run `npx eslint app lib components` rather than bare `npm run lint` if a worktree exists under `.claude/worktrees/`.
- **Ship order:** `AuthorizeResult` is written once with all three members. `/api/verify-email` and `/api/verify-email/resend` are born rate-limited. `.env.example` is created once carrying `APP_URL`, the five `SMTP_*`, and `REDIS_URL`.

## File Structure

**New — rate limiting (spec C)**

| File                        | Responsibility                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `lib/rate-limit/limits.ts`  | Pure policy table. The `Bucket` union and one `{limit, windowSec}` per bucket. No logic. |
| `lib/rate-limit/ip.ts`      | Pure `clientIp(headers)`.                                                                |
| `lib/rate-limit/client.ts`  | The only file importing `ioredis`. Lazy singleton.                                       |
| `lib/rate-limit/consume.ts` | `consume(bucket, key)` / `reset(bucket, key)`. Fails open.                               |

**New — email verification (spec B)**

| File                                   | Responsibility                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `lib/auth/verification.ts`             | Pure token mint/hash/expiry + the two wire error unions. `node:crypto` only.                  |
| `lib/db/verification.ts`               | Token repository: issue, consume, last-issued-at.                                             |
| `lib/mail/templates.ts`                | Pure. Injected `Translate` + link → `{subject, text, html}`.                                  |
| `lib/mail/send.ts`                     | The only file importing `nodemailer`. Transport built lazily; explicit missing-SMTP behavior. |
| `app/api/verify-email/route.ts`        | `POST` — consume token, stamp `emailVerified`.                                                |
| `app/api/verify-email/resend/route.ts` | `POST` — credential-gated reissue with a 60s cooldown.                                        |
| `app/verify/page.tsx`                  | Server component (first one with display text — `getTranslations`).                           |
| `components/auth/VerifyCard.tsx`       | Client component owning the confirm button and its result states.                             |

**New — config**

`.env.example`, `docker-compose.override.yml`, `prisma/migrations/20260820120000_add_email_verification/migration.sql`

**Modified**

`prisma/schema.prisma`, `lib/auth/types.ts`, `lib/auth/authorize.ts`, `auth.ts`, `lib/db/users.ts`, `lib/account/signup.ts`, `app/api/signup/route.ts`, `app/signup/page.tsx`, `app/login/page.tsx`, `lib/api-client.ts`, `prisma/seed.ts`, `docker-compose.yml`, `package.json`, `messages/pt-BR.json`, `CLAUDE.md`

---

### Task 1: Rate-limit core module, Redis service, `.env.example`

Self-contained: no auth file changes yet. Delivers a tested limiter nothing calls.

**Files:**

- Create: `lib/rate-limit/limits.ts`, `lib/rate-limit/ip.ts`, `lib/rate-limit/client.ts`, `lib/rate-limit/consume.ts`
- Create: `.env.example`
- Test: `lib/rate-limit/consume.test.ts`, `lib/rate-limit/ip.test.ts`
- Modify: `docker-compose.yml`, `docker-compose.prod.yml`, `package.json`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type Bucket = "signup" | "signup_email" | "login" | "login_email" | "verify" | "resend"`
  - `interface Policy { limit: number; windowSec: number }`
  - `const LIMITS: Record<Bucket, Policy>`
  - `function clientIp(headers: Headers): string`
  - `interface ConsumeResult { allowed: boolean; retryAfterSec: number }`
  - `function consume(bucket: Bucket, id: string): Promise<ConsumeResult>`
  - `function reset(bucket: Bucket, id: string): Promise<void>`

- [ ] **Step 1: Install `ioredis`**

```bash
npm install ioredis
```

- [ ] **Step 2: Write the policy table**

Create `lib/rate-limit/limits.ts`:

```ts
// The whole rate-limit policy, reviewable in one place. No logic lives here on
// purpose: changing a number must never mean reading code.
export type Bucket =
  "signup" | "signup_email" | "login" | "login_email" | "verify" | "resend";

export interface Policy {
  limit: number;
  windowSec: number;
}

// Every sensitive endpoint gets an IP-keyed bucket *and* an email-keyed one:
// x-forwarded-for is spoofable without a trusted proxy, so the email-keyed
// limit is the non-spoofable backstop.
export const LIMITS: Record<Bucket, Policy> = {
  signup: { limit: 5, windowSec: 3600 },
  signup_email: { limit: 3, windowSec: 3600 },
  login: { limit: 20, windowSec: 900 },
  login_email: { limit: 10, windowSec: 900 },
  verify: { limit: 20, windowSec: 3600 },
  resend: { limit: 10, windowSec: 3600 },
};
```

- [ ] **Step 3: Write the failing `clientIp` test**

Create `lib/rate-limit/ip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clientIp } from "./ip";

describe("clientIp", () => {
  it("reads a single x-forwarded-for value", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });
  it("takes the leftmost entry of a comma list", () => {
    const h = new Headers({
      "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178",
    });
    expect(clientIp(h)).toBe("203.0.113.7");
  });
  it("trims surrounding whitespace", () => {
    const h = new Headers({ "x-forwarded-for": "  203.0.113.7 , 70.41.3.18" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });
  it("falls back to a shared 'unknown' bucket when the header is missing", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
  it("falls back to 'unknown' when the header is present but empty", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "   " }))).toBe("unknown");
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run lib/rate-limit/ip.test.ts`
Expected: FAIL — `Failed to resolve import "./ip"`.

- [ ] **Step 5: Implement `clientIp`**

Create `lib/rate-limit/ip.ts`:

```ts
// Next 16 has no request.ip (removed in 15), so headers are the only source.
// This is best-effort: x-forwarded-for is spoofable when the app is not behind
// a trusted proxy. The email-keyed buckets in limits.ts are the real backstop.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  const first = forwarded.split(",")[0]?.trim();
  return first ? first : "unknown";
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run lib/rate-limit/ip.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 7: Write the Redis client**

Create `lib/rate-limit/client.ts`:

```ts
import Redis from "ioredis";

let client: Redis | null = null;

// Lazy: constructing an ioredis instance opens a socket, so a process that
// never rate-limits (and every unit test) stays Redis-free.
export function getRedis(): Redis {
  if (client) return client;
  client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380", {
    // Fail fast rather than queue commands forever while Redis is down --
    // consume() turns the rejection into fail-open.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  // ioredis crashes the process on an unhandled 'error' event. consume()
  // already reports per-call failures, so this only keeps the process alive.
  client.on("error", (err: Error) => {
    console.error("[rate-limit] redis connection error:", err.message);
  });
  return client;
}
```

- [ ] **Step 8: Write the failing `consume` test**

Create `lib/rate-limit/consume.test.ts`. The fake stands in for ioredis's chainable MULTI — unit tests never touch a real Redis:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

interface Entry {
  count: number;
  ttl: number;
}

const store = new Map<string, Entry>();
let failWith: Error | null = null;
const del = vi.fn(async (key: string) => {
  store.delete(key);
  return 1;
});

class FakeMulti {
  private key = "";
  private windowSec = 0;
  incr(key: string) {
    this.key = key;
    return this;
  }
  expire(_key: string, windowSec: number, _mode: string) {
    this.windowSec = windowSec;
    return this;
  }
  ttl(_key: string) {
    return this;
  }
  async exec() {
    if (failWith) throw failWith;
    const entry = store.get(this.key) ?? { count: 0, ttl: this.windowSec };
    entry.count += 1;
    store.set(this.key, entry);
    return [
      [null, entry.count],
      [null, 1],
      [null, entry.ttl],
    ];
  }
}

vi.mock("./client", () => ({
  getRedis: () => ({ multi: () => new FakeMulti(), del }),
}));

import { consume, reset } from "./consume";

describe("consume", () => {
  beforeEach(() => {
    store.clear();
    failWith = null;
    del.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("allows requests up to the limit", async () => {
    // signup is 5/hour
    for (let i = 0; i < 5; i++) {
      expect((await consume("signup", "1.1.1.1")).allowed).toBe(true);
    }
  });

  it("denies the request past the limit", async () => {
    for (let i = 0; i < 5; i++) await consume("signup", "1.1.1.1");
    expect((await consume("signup", "1.1.1.1")).allowed).toBe(false);
  });

  it("keys buckets and ids independently", async () => {
    for (let i = 0; i < 6; i++) await consume("signup", "1.1.1.1");
    expect((await consume("signup", "2.2.2.2")).allowed).toBe(true);
    expect((await consume("login", "1.1.1.1")).allowed).toBe(true);
  });

  it("reports retryAfterSec from the key's remaining TTL", async () => {
    store.set("rl:signup:1.1.1.1", { count: 5, ttl: 42 });
    const r = await consume("signup", "1.1.1.1");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBe(42);
  });

  it("fails open when the client throws", async () => {
    failWith = new Error("ECONNREFUSED");
    const r = await consume("signup", "1.1.1.1");
    expect(r.allowed).toBe(true);
    expect(console.error).toHaveBeenCalled();
  });

  it("reset deletes the bucket's key", async () => {
    await consume("login_email", "dev@moldai.local");
    await reset("login_email", "dev@moldai.local");
    expect(del).toHaveBeenCalledWith("rl:login_email:dev@moldai.local");
  });
});
```

- [ ] **Step 9: Run it to verify it fails**

Run: `npx vitest run lib/rate-limit/consume.test.ts`
Expected: FAIL — `Failed to resolve import "./consume"`.

- [ ] **Step 10: Implement `consume` and `reset`**

Create `lib/rate-limit/consume.ts`:

```ts
import { LIMITS, type Bucket } from "./limits";
import { getRedis } from "./client";

export interface ConsumeResult {
  allowed: boolean;
  retryAfterSec: number;
}

function redisKey(bucket: Bucket, id: string): string {
  return `rl:${bucket}:${id}`;
}

// One atomic round trip. EXPIRE ... NX (Redis 7+) sets the TTL only when none
// exists, making this a fixed window that starts on the first request and
// expires itself -- no sweep job, unlike a Postgres-table implementation.
export async function consume(
  bucket: Bucket,
  id: string,
): Promise<ConsumeResult> {
  const { limit, windowSec } = LIMITS[bucket];
  const key = redisKey(bucket, id);
  try {
    const res = await getRedis()
      .multi()
      .incr(key)
      .expire(key, windowSec, "NX")
      .ttl(key)
      .exec();
    if (!res) throw new Error("redis MULTI aborted");

    const [incr, , ttl] = res as [Error | null, unknown][];
    if (incr[0]) throw incr[0];

    const count = typeof incr[1] === "number" ? incr[1] : 0;
    const remainingTtl = typeof ttl?.[1] === "number" ? ttl[1] : -1;

    return {
      allowed: count <= limit,
      retryAfterSec: remainingTtl > 0 ? remainingTtl : windowSec,
    };
  } catch (err) {
    // Fail open. An auth system that locks everyone out when its cache dies is
    // worse than one that briefly loses throttling. The trade is explicit:
    // while Redis is down, there is no rate limiting.
    console.error(`[rate-limit] ${bucket} failing open:`, err);
    return { allowed: true, retryAfterSec: 0 };
  }
}

// Called after a correct password so a user who mistypes twice then succeeds is
// not penalised, while a brute-force run against one account still hits the wall.
export async function reset(bucket: Bucket, id: string): Promise<void> {
  try {
    await getRedis().del(redisKey(bucket, id));
  } catch (err) {
    console.error(`[rate-limit] reset ${bucket} failed:`, err);
  }
}
```

- [ ] **Step 11: Run it to verify it passes**

Run: `npx vitest run lib/rate-limit/`
Expected: PASS — 11 tests across the two files.

- [ ] **Step 12: Add the Redis service to `docker-compose.yml`**

Unlike Task 5's Mailpit, Redis is needed in production too, so it goes in the base file rather than the dev-only override. Insert this service between `db` and `app`:

```yaml
redis:
  image: redis:7-alpine
  container_name: moldai-redis
  restart: unless-stopped
  # Counters are meant to be ephemeral: persistence off, no volume mounted.
  command: ["redis-server", "--save", "", "--appendonly", "no"]
  ports:
    # host 6380 (not 6379) so it doesn't collide with another local Redis,
    # mirroring the db's 5433 choice
    - "6380:6379"
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 3s
    retries: 10
```

Then extend the existing `app` service's `depends_on` and `environment`:

```yaml
depends_on:
  db:
    condition: service_healthy
  redis:
    condition: service_healthy
env_file:
  - .env.local
environment:
  DATABASE_URL: postgresql://moldai:moldai@db:5432/moldai?schema=public
  REDIS_URL: redis://redis:6379
  WATCHPACK_POLLING: "true"
  CHOKIDAR_USEPOLLING: "true"
```

Add the same `REDIS_URL` line to the `app` service's `environment` in `docker-compose.prod.yml`. Leave the `cron` service alone — it never rate-limits.

- [ ] **Step 13: Create `.env.example`**

Created once here, carrying every variable both specs introduce (Task 5 adds no further keys). Documentation only — nothing reads this file.

```bash
# Copy to .env.local and fill in. Nothing here is read at build time; the Docker
# stack passes .env.local in at runtime via env_file, never baked into the image.

# --- required ---
# Host: localhost:5433. Inside the Docker network: db:5432.
DATABASE_URL=postgresql://moldai:moldai@localhost:5433/moldai?schema=public
# Any long random string. Generate with: openssl rand -base64 32
AUTH_SECRET=
ANTHROPIC_API_KEY=

# --- email verification ---
# Absolute base for the links mailed to users. No trailing slash.
APP_URL=http://localhost:3000
# Leave SMTP_HOST unset outside production and the verification link is logged
# to the server console instead of mailed. In production, unset makes sign-up
# fail with mail_unavailable rather than silently dropping the mail.
# `npm run docker:up` points these at Mailpit automatically (inbox at :8025).
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=MoldAI <no-reply@moldai.local>

# --- rate limiting ---
# Host: localhost:6380. Inside the Docker network: redis:6379.
# When unreachable the limiter fails open -- auth keeps working, unthrottled.
REDIS_URL=redis://localhost:6380
```

- [ ] **Step 14: Verify the suite, lint and build**

```bash
npm test
npx eslint app lib components
npm run build
```

Expected: all pass, with the 2 new test files among the existing suites.

- [ ] **Step 15: Commit**

```bash
git add lib/rate-limit .env.example docker-compose.yml docker-compose.prod.yml package.json package-lock.json
git commit -m "feat(rate-limit): add the Redis-backed fixed-window limiter"
```

---

### Task 2: Schema migration and the `emailVerified` field

Additive only — no column drops and no persisted-JSON-blob shape change, so no pattern data is touched. This is the **only migration in the whole plan**.

**Files:**

- Create: `prisma/migrations/20260820120000_add_email_verification/migration.sql`
- Modify: `prisma/schema.prisma`, `lib/auth/types.ts`, `lib/db/users.ts`, `prisma/seed.ts`
- Modify (test fixtures that construct a `UserRecord`): `lib/auth/authorize.test.ts`, `lib/account/signup.test.ts`, `app/api/signup/route.test.ts`, `app/api/account/password/route.test.ts`, `app/api/account/route.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces:
  - `UserRecord` gains `emailVerified: Date | null`
  - Prisma model `EmailVerificationToken { tokenHash, userId, user, expiresAt, createdAt }`
  - `User.emailVerified: DateTime?`

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Add `emailVerified` and the relation to `User`, and append the new model. The full `User` model becomes:

```prisma
model User {
  id                 String   @id @default(cuid())
  email              String   @unique
  passwordHash       String
  name               String?
  emailVerified      DateTime?
  createdAt          DateTime @default(now())
  patterns           Pattern[]
  wallet             Wallet?
  sizeCharts         SizeChart[]
  verificationTokens EmailVerificationToken[]
  activeSizeChartId  String?
}

model EmailVerificationToken {
  tokenHash String   @id // sha-256 of the raw token, hex
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([userId])
}
```

- [ ] **Step 2: Write the migration SQL by hand**

Create `prisma/migrations/20260820120000_add_email_verification/migration.sql`:

```sql
-- Adds User.emailVerified and the EmailVerificationToken table. Additive only:
-- no column is dropped and no JSON blob shape changes, so Pattern/SizeChart/
-- Wallet rows are untouched.
ALTER TABLE "User" ADD COLUMN "emailVerified" TIMESTAMP(3);

CREATE TABLE "EmailVerificationToken" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("tokenHash")
);

CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grandfather every account that already exists, including the dev seeds and
-- anything created before the gate. Without this, adding the login gate locks
-- out every existing user. The gate applies to accounts created from here on.
UPDATE "User" SET "emailVerified" = now() WHERE "emailVerified" IS NULL;
```

- [ ] **Step 3: Apply the migration**

```bash
npm run db:up
npm run db:migrate
```

Expected: Prisma reports the migration applied and regenerates the client. If Prisma offers to create the migration itself, decline and keep the hand-written SQL — the generated version omits the backfill `UPDATE`.

- [ ] **Step 4: Add the field to `UserRecord`**

In `lib/auth/types.ts`:

```ts
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  emailVerified: Date | null;
}

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}
```

- [ ] **Step 5: Select it in every `lib/db/users.ts` query**

Add `emailVerified: true` to the `select` in `getUserByEmail`, `getUserById`, and `createUser`. For example `getUserByEmail` becomes:

```ts
export function getUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      name: true,
      emailVerified: true,
    },
  });
}
```

Apply the identical `select` block to `getUserById` and to `createUser`.

- [ ] **Step 6: Stamp the dev seeds as verified**

In `prisma/seed.ts`, the `prisma.user.upsert` `create` block gains `emailVerified`, so a reseed stays loggable-in once the gate lands:

```ts
const user = await prisma.user.upsert({
  where: { email: u.email },
  update: {},
  create: {
    email: u.email,
    name: u.name,
    passwordHash: await hashPassword(u.password),
    // Dev accounts skip the verification gate: there is no inbox for
    // dev@moldai.local. Real sign-ups still go through /verify.
    emailVerified: now,
  },
});
```

- [ ] **Step 7: Run the suite and fix the broken fixtures**

```bash
npm test
```

Expected: FAIL. Every `UserRecord` object literal in a test now misses a required property. Add `emailVerified: new Date()` (verified) or `emailVerified: null` (unverified) to each:

- `lib/auth/authorize.test.ts` — the module-level `const user: UserRecord` → `emailVerified: new Date()`
- `lib/account/signup.test.ts` — `const EXISTING: UserRecord` → `emailVerified: new Date()`
- `app/api/signup/route.test.ts` — the `createUser` mock resolved value and the `getUserByEmail` mock in the "email_taken" case → `emailVerified: null`
- `app/api/account/password/route.test.ts` and `app/api/account/route.test.ts` — any user literal → `emailVerified: new Date()`

Do not change any assertion yet — Task 4 rewrites `authorize.test.ts` properly. This step only restores compilation.

- [ ] **Step 8: Verify**

```bash
npm test
npx eslint app lib components
npm run build
npm run db:seed
```

Expected: tests and lint and build pass; the seed prints `Seed complete: dev@moldai.local, atelier@moldai.local`.

- [ ] **Step 9: Commit**

```bash
git add prisma lib/auth/types.ts lib/db/users.ts lib/auth/authorize.test.ts lib/account/signup.test.ts app/api
git commit -m "feat(auth): add emailVerified and the verification token table"
```

---

### Task 3: Verification tokens — pure minting plus the repository

**Files:**

- Create: `lib/auth/verification.ts`, `lib/db/verification.ts`
- Test: `lib/auth/verification.test.ts`

**Interfaces:**

- Consumes: `EmailVerificationToken` and `User.emailVerified` from Task 2.
- Produces:
  - `const TOKEN_TTL_MS: number` (24 h), `const RESEND_COOLDOWN_MS: number` (60 s)
  - `interface NewToken { raw: string; tokenHash: string; expiresAt: Date }`
  - `function newVerificationToken(now: Date): NewToken`
  - `function hashToken(raw: string): string`
  - `function isExpired(expiresAt: Date, now: Date): boolean`
  - `type VerifyErrorCode = "invalid_token" | "expired_token" | "bad_body" | "rate_limited"`
  - `type ResendErrorCode = "invalid_credentials" | "already_verified" | "cooldown" | "bad_body" | "rate_limited" | "mail_unavailable"`
  - `function issueToken(userId: string, now: Date): Promise<string>` (returns the **raw** token)
  - `type ConsumeTokenResult = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" }`
  - `function consumeToken(tokenHash: string, now: Date): Promise<ConsumeTokenResult>`
  - `function lastIssuedAt(userId: string): Promise<Date | null>`

- [ ] **Step 1: Write the failing test**

Create `lib/auth/verification.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  newVerificationToken,
  hashToken,
  isExpired,
  TOKEN_TTL_MS,
} from "./verification";

const NOW = new Date("2026-08-20T12:00:00.000Z");

describe("newVerificationToken", () => {
  it("returns a raw token whose sha-256 is the stored hash", () => {
    const t = newVerificationToken(NOW);
    expect(hashToken(t.raw)).toBe(t.tokenHash);
  });

  it("never stores the raw token itself", () => {
    const t = newVerificationToken(NOW);
    expect(t.tokenHash).not.toBe(t.raw);
    expect(t.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is URL-safe and high-entropy", () => {
    const t = newVerificationToken(NOW);
    expect(t.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.raw.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
  });

  it("does not repeat", () => {
    const seen = new Set(
      Array.from({ length: 50 }, () => newVerificationToken(NOW).raw),
    );
    expect(seen.size).toBe(50);
  });

  it("expires 24 hours after now", () => {
    const t = newVerificationToken(NOW);
    expect(t.expiresAt.getTime()).toBe(NOW.getTime() + TOKEN_TTL_MS);
    expect(TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("isExpired", () => {
  it("is false strictly before the deadline", () => {
    expect(isExpired(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });
  it("is true exactly at the deadline", () => {
    expect(isExpired(NOW, NOW)).toBe(true);
  });
  it("is true after the deadline", () => {
    expect(isExpired(new Date(NOW.getTime() - 1), NOW)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/auth/verification.test.ts`
Expected: FAIL — `Failed to resolve import "./verification"`.

- [ ] **Step 3: Implement the pure module**

Create `lib/auth/verification.ts`. `node:crypto` only, so `lib/` stays framework-free:

```ts
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours, single use
export const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds between reissues

// The wire contracts for the two verification routes, kept beside the logic
// they describe -- the same placement as SignupErrorCode in lib/account/signup.ts.
export type VerifyErrorCode =
  "invalid_token" | "expired_token" | "bad_body" | "rate_limited";

export type ResendErrorCode =
  | "invalid_credentials"
  | "already_verified"
  | "cooldown"
  | "bad_body"
  | "rate_limited"
  | "mail_unavailable";

export interface NewToken {
  raw: string;
  tokenHash: string;
  expiresAt: Date;
}

// SHA-256 rather than bcrypt: the token is 32 random bytes, so a slow hash buys
// nothing, and a fast digest can serve as the table's primary key. Storing only
// the digest means a database leak does not yield usable links.
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newVerificationToken(now: Date): NewToken {
  const raw = randomBytes(32).toString("base64url");
  return {
    raw,
    tokenHash: hashToken(raw),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
  };
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/auth/verification.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Write the repository**

Create `lib/db/verification.ts`. Same never-throw contract as the other repositories:

```ts
import { prisma } from "./prisma";
import { newVerificationToken, isExpired } from "@/lib/auth/verification";

export type ConsumeTokenResult =
  { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" };

// Issuing deletes the user's existing tokens, so only the newest link works.
// Returns the RAW token -- the caller mails it; only the digest is stored.
export async function issueToken(userId: string, now: Date): Promise<string> {
  const { raw, tokenHash, expiresAt } = newVerificationToken(now);
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId } }),
    prisma.emailVerificationToken.create({
      data: { tokenHash, userId, expiresAt },
    }),
  ]);
  return raw;
}

// Reports the reason rather than a bare null: an expired link must tell the
// user to request a new one, a bogus one must not. Single use -- the row is
// deleted whether it is accepted or rejected as expired.
export async function consumeToken(
  tokenHash: string,
  now: Date,
): Promise<ConsumeTokenResult> {
  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  });
  if (!row) return { ok: false, reason: "invalid" };

  if (isExpired(row.expiresAt, now)) {
    await prisma.emailVerificationToken.deleteMany({ where: { tokenHash } });
    return { ok: false, reason: "expired" };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { emailVerified: now },
    }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } }),
  ]);
  return { ok: true, userId: row.userId };
}

export async function lastIssuedAt(userId: string): Promise<Date | null> {
  const row = await prisma.emailVerificationToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}
```

There is no unit test for this file: like `lib/db/users.ts` it is a thin Prisma wrapper, and its branches are covered through the route tests in Task 7, which mock it.

- [ ] **Step 6: Verify**

```bash
npm test
npx eslint app lib components
npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/auth/verification.ts lib/auth/verification.test.ts lib/db/verification.ts
git commit -m "feat(auth): add hashed single-use verification tokens"
```

---

### Task 4: `AuthorizeResult` — the union both specs meet in

This is the single point where the two subsystems join. The union is written **once**, with all three failure reasons. Verified against the installed packages: `CredentialsSignin` declares a configurable `code` (`node_modules/@auth/core/errors.d.ts:133`), and the client's `SignInResponse` exposes `code: string | undefined` (`node_modules/next-auth/lib/client.d.ts:53-59`).

**Files:**

- Modify: `lib/auth/authorize.ts`, `auth.ts`
- Test: `lib/auth/authorize.test.ts` (rewritten)

**Interfaces:**

- Consumes: `consume`/`reset`/`Bucket` (Task 1), `UserRecord.emailVerified` (Task 2).
- Produces:
  - `type AuthorizeFailure = "invalid" | "unverified" | "rate_limited"`
  - `type AuthorizeResult = { ok: true; user: { id: string; email: string; name: string | null } } | { ok: false; reason: AuthorizeFailure }`
  - `AuthorizeDeps` gains `consume` and `reset`
  - `authorizeUser` accepts an `ip` field on its credentials argument
  - `auth.ts` throws `UnverifiedEmailError` (`code: "unverified_email"`) and `RateLimitedError` (`code: "rate_limited"`)

- [ ] **Step 1: Rewrite `lib/auth/authorize.test.ts` with the new expectations**

Replace the file entirely:

```ts
import { describe, it, expect, vi } from "vitest";
import { authorizeUser, type AuthorizeDeps } from "./authorize";
import type { UserRecord } from "./types";

const user: UserRecord = {
  id: "u1",
  email: "dev@moldai.local",
  passwordHash: "HASH",
  name: "Dev",
  emailVerified: new Date("2026-08-01T00:00:00.000Z"),
};

const unverified: UserRecord = { ...user, emailVerified: null };

function deps(over: Partial<AuthorizeDeps> = {}): AuthorizeDeps {
  return {
    getUserByEmail: async (email) => (email === user.email ? user : null),
    verify: async (plain) => plain === "correct",
    consume: async () => ({ allowed: true }),
    reset: async () => {},
    ...over,
  };
}

const GOOD = { email: "dev@moldai.local", password: "correct", ip: "1.1.1.1" };

describe("authorizeUser", () => {
  it("valid verified credentials return the user without the passwordHash", async () => {
    const r = await authorizeUser(GOOD, deps());
    expect(r).toEqual({
      ok: true,
      user: { id: "u1", email: "dev@moldai.local", name: "Dev" },
    });
  });

  it("normalizes the email (trim + lowercase)", async () => {
    const r = await authorizeUser(
      { ...GOOD, email: "  DEV@MoldAI.local " },
      deps(),
    );
    expect(r).toEqual({
      ok: true,
      user: { id: "u1", email: "dev@moldai.local", name: "Dev" },
    });
  });

  it("wrong password is invalid", async () => {
    const r = await authorizeUser({ ...GOOD, password: "wrong" }, deps());
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("unknown email is invalid, never 'unverified'", async () => {
    const r = await authorizeUser({ ...GOOD, email: "x@y.z" }, deps());
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("missing or non-string fields are invalid without touching the repo", async () => {
    const getUserByEmail = vi.fn(async () => user);
    const d = deps({ getUserByEmail });
    expect(await authorizeUser({ email: 123, password: "correct" }, d)).toEqual(
      {
        ok: false,
        reason: "invalid",
      },
    );
    expect(await authorizeUser({ password: "correct" }, d)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await authorizeUser({ email: "dev@moldai.local" }, d)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("a correct password on an unverified account is 'unverified'", async () => {
    const r = await authorizeUser(
      GOOD,
      deps({ getUserByEmail: async () => unverified }),
    );
    expect(r).toEqual({ ok: false, reason: "unverified" });
  });

  it("a wrong password on an unverified account is still 'invalid'", async () => {
    const r = await authorizeUser(
      { ...GOOD, password: "wrong" },
      deps({ getUserByEmail: async () => unverified }),
    );
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("denies over the IP limit without ever hashing", async () => {
    const verify = vi.fn(async () => true);
    const r = await authorizeUser(
      GOOD,
      deps({
        verify,
        consume: async (bucket) => ({ allowed: bucket !== "login" }),
      }),
    );
    expect(r).toEqual({ ok: false, reason: "rate_limited" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("denies over the email limit without ever hashing", async () => {
    const verify = vi.fn(async () => true);
    const r = await authorizeUser(
      GOOD,
      deps({
        verify,
        consume: async (bucket) => ({ allowed: bucket !== "login_email" }),
      }),
    );
    expect(r).toEqual({ ok: false, reason: "rate_limited" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("consumes both buckets, keyed by ip and by normalized email", async () => {
    const consume = vi.fn(async () => ({ allowed: true }));
    await authorizeUser(
      { ...GOOD, email: "  DEV@MoldAI.local " },
      deps({ consume }),
    );
    expect(consume).toHaveBeenCalledWith("login", "1.1.1.1");
    expect(consume).toHaveBeenCalledWith("login_email", "dev@moldai.local");
  });

  it("resets the email counter once the password is correct", async () => {
    const reset = vi.fn(async () => {});
    await authorizeUser(GOOD, deps({ reset }));
    expect(reset).toHaveBeenCalledWith("login_email", "dev@moldai.local");
  });

  it("does not reset the counter on a wrong password", async () => {
    const reset = vi.fn(async () => {});
    await authorizeUser({ ...GOOD, password: "wrong" }, deps({ reset }));
    expect(reset).not.toHaveBeenCalled();
  });

  it("falls back to the shared 'unknown' ip bucket when no ip is supplied", async () => {
    const consume = vi.fn(async () => ({ allowed: true }));
    await authorizeUser(
      { email: GOOD.email, password: GOOD.password },
      deps({ consume }),
    );
    expect(consume).toHaveBeenCalledWith("login", "unknown");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/auth/authorize.test.ts`
Expected: FAIL — `authorizeUser` still resolves a bare user object or `null`, so every `{ ok: … }` assertion mismatches, and `AuthorizeDeps` has no `consume`/`reset`.

- [ ] **Step 3: Rewrite `lib/auth/authorize.ts`**

```ts
import type { UserRecord } from "./types";

export type AuthorizeFailure = "invalid" | "unverified" | "rate_limited";

// Written once with all three reasons. auth.ts maps `invalid` to Auth.js's
// generic null and the other two to coded CredentialsSignin subclasses, so
// /login can distinguish them.
export type AuthorizeResult =
  | { ok: true; user: { id: string; email: string; name: string | null } }
  | { ok: false; reason: AuthorizeFailure };

export interface AuthorizeDeps {
  getUserByEmail: (email: string) => Promise<UserRecord | null>;
  verify: (plain: string, hash: string) => Promise<boolean>;
  // The limiter reaches this module through DI rather than an import, so the
  // module stays DB-free, Redis-free and testable with fakes.
  consume: (
    bucket: "login" | "login_email",
    key: string,
  ) => Promise<{ allowed: boolean }>;
  reset: (bucket: "login_email", key: string) => Promise<void>;
}

export async function authorizeUser(
  creds: Record<string, unknown> | undefined,
  deps: AuthorizeDeps,
): Promise<AuthorizeResult> {
  const email =
    typeof creds?.email === "string" ? creds.email.trim().toLowerCase() : "";
  const password = typeof creds?.password === "string" ? creds.password : "";
  const ip = typeof creds?.ip === "string" && creds.ip ? creds.ip : "unknown";
  if (!email || !password) return { ok: false, reason: "invalid" };

  // Both buckets are consumed before any bcrypt work, so a throttled attacker
  // never costs us a hash.
  if (!(await deps.consume("login", ip)).allowed) {
    return { ok: false, reason: "rate_limited" };
  }
  if (!(await deps.consume("login_email", email)).allowed) {
    return { ok: false, reason: "rate_limited" };
  }

  const user = await deps.getUserByEmail(email);
  // An unknown email reports `invalid`, never `unverified` -- the gate must not
  // become an account-existence oracle beyond what /signup already reveals.
  if (!user) return { ok: false, reason: "invalid" };

  if (!(await deps.verify(password, user.passwordHash))) {
    return { ok: false, reason: "invalid" };
  }

  // The password was right, so this is not a brute-force run: clear the counter
  // before the verification gate, or a legitimate unverified user retrying would
  // lock themselves out and see "muitas tentativas" instead of "confirme seu email".
  await deps.reset("login_email", email);

  if (!user.emailVerified) return { ok: false, reason: "unverified" };

  return {
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/auth/authorize.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Wire the real implementations in `auth.ts`**

```ts
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeUser } from "@/lib/auth/authorize";
import { getUserByEmail } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/hash";
import { consume, reset } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";

// Auth.js surfaces a CredentialsSignin subclass's `code` to the caller, so
// /login can tell these apart instead of showing "senha inválida" for both.
class UnverifiedEmailError extends CredentialsSignin {
  code = "unverified_email";
}

class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Self-hosted (Docker/`next start`): Auth.js v5 only trusts the host
  // automatically in dev. In production, without this every auth request fails with UntrustedHost.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds, request) => {
        // Auth.js hands `authorize` the original Request; Next 16 has no
        // request.ip, so the header is the only source.
        const ip = clientIp(request.headers);
        const result = await authorizeUser(
          { ...(creds ?? {}), ip },
          { getUserByEmail, verify: verifyPassword, consume, reset },
        );
        if (result.ok) return result.user;
        if (result.reason === "unverified") throw new UnverifiedEmailError();
        if (result.reason === "rate_limited") throw new RateLimitedError();
        return null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = (user as { id: string }).id;
      return token;
    },
    session({ session, token }) {
      const uid = token.uid;
      if (typeof uid === "string" && session.user) session.user.id = uid;
      return session;
    },
  },
});
```

- [ ] **Step 6: Confirm the `code` actually reaches the client**

The two type declarations were checked when this plan was written; confirm they still hold in the installed versions:

```bash
grep -n -A3 "class CredentialsSignin" node_modules/@auth/core/errors.d.ts
grep -n -A7 "interface SignInResponse" node_modules/next-auth/lib/client.d.ts
```

Expected: `CredentialsSignin extends SignInError` with a documented `code` property, and `SignInResponse` containing `code: string | undefined`. If either has changed, adapt the mapping in `auth.ts` and note it in the Task 8 login-page step — do not guess.

- [ ] **Step 7: Verify**

```bash
npm test
npx eslint app lib components
npm run build
```

Expected: all pass. Note that login is now genuinely gated — a `npm run db:seed` account works because Task 2 stamped it verified.

- [ ] **Step 8: Commit**

```bash
git add lib/auth/authorize.ts lib/auth/authorize.test.ts auth.ts
git commit -m "feat(auth): gate login on verified email and rate limits"
```

---

### Task 5: Mail module and the Mailpit dev inbox

**Files:**

- Create: `lib/mail/templates.ts`, `lib/mail/send.ts`, `docker-compose.override.yml`
- Test: `lib/mail/templates.test.ts`
- Modify: `messages/pt-BR.json` (`VerificationEmail` namespace), `package.json`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `interface MailContent { subject: string; text: string; html: string }`
  - `function verificationEmail(t: Translate, link: string, name: string): MailContent`
  - `class MailUnavailableError extends Error`
  - `function sendMail(to: string, content: MailContent): Promise<void>`
  - `function verificationLink(rawToken: string): string`

- [ ] **Step 1: Install `nodemailer`**

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

- [ ] **Step 2: Add the `VerificationEmail` catalog namespace**

In `messages/pt-BR.json`, add a top-level namespace (keep the file's existing key ordering style — insert it near the other auth namespaces):

```json
  "VerificationEmail": {
    "subject": "Confirme seu email · MoldAI",
    "greeting": "Olá, {name}!",
    "body": "Falta um passo para começar a criar seus moldes: confirme que este email é seu.",
    "button": "Confirmar meu email",
    "linkFallback": "Se o botão não funcionar, copie e cole este endereço no navegador:",
    "expiry": "Este link vale por {hours} horas e só pode ser usado uma vez.",
    "ignore": "Se você não criou uma conta no MoldAI, pode ignorar esta mensagem."
  },
```

- [ ] **Step 3: Write the failing template test**

Create `lib/mail/templates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { verificationEmail } from "./templates";
import type { Translate } from "@/lib/i18n/translate";

// A fake resolver: pure templates take the Translate seam, so no next-intl here.
const t: Translate = (key, values) =>
  values
    ? `${key}(${Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join(",")})`
    : key;

const LINK = "https://moldai.example/verify?token=abc123";

describe("verificationEmail", () => {
  it("resolves every string through the injected translator", () => {
    const m = verificationEmail(t, LINK, "Leonardo");
    expect(m.subject).toBe("subject");
    expect(m.text).toContain("greeting(name=Leonardo)");
    expect(m.text).toContain("expiry(hours=24)");
  });

  it("puts the link in both the text and the html part", () => {
    const m = verificationEmail(t, LINK, "Leonardo");
    expect(m.text).toContain(LINK);
    expect(m.html).toContain(LINK);
  });

  it("makes the html link clickable", () => {
    const m = verificationEmail(t, LINK, "Leonardo");
    expect(m.html).toContain(`href="${LINK}"`);
  });

  it("escapes html-significant characters in the name", () => {
    const m = verificationEmail(t, LINK, "x");
    const withTag = verificationEmail(
      (key, values) =>
        values ? `${key}:${Object.values(values).join("")}` : key,
      LINK,
      "<script>",
    );
    expect(withTag.html).not.toContain("<script>");
    expect(withTag.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("<html");
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run lib/mail/templates.test.ts`
Expected: FAIL — `Failed to resolve import "./templates"`.

- [ ] **Step 5: Implement the pure template**

Create `lib/mail/templates.ts`. All copy comes from the catalog; `lib/` never hardcodes pt-BR:

```ts
import type { Translate } from "@/lib/i18n/translate";
import { TOKEN_TTL_MS } from "@/lib/auth/verification";

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// `t` arrives already scoped to the VerificationEmail namespace, matching how
// the drafters receive a PatternData-scoped resolver.
export function verificationEmail(
  t: Translate,
  link: string,
  name: string,
): MailContent {
  const hours = Math.round(TOKEN_TTL_MS / 3_600_000);
  const subject = t("subject");
  const greeting = t("greeting", { name });
  const body = t("body");
  const button = t("button");
  const linkFallback = t("linkFallback");
  const expiry = t("expiry", { hours });
  const ignore = t("ignore");

  const text = [greeting, "", body, "", link, "", expiry, ignore].join("\n");

  // Inline styles and a table-free layout: mail clients strip <style> blocks.
  // Colors are literal here on purpose -- an email cannot read globals.css.
  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f7f7f2;font-family:Helvetica,Arial,sans-serif;color:#26261f;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4da;border-radius:12px;padding:28px;">
      <p style="margin:0 0 20px;font-size:22px;font-weight:700;">Mold<span style="color:#6b7a4a;">AI</span></p>
      <p style="margin:0 0 12px;font-size:15px;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.5;">${escapeHtml(body)}</p>
      <p style="margin:0 0 20px;">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#6b7a4a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">${escapeHtml(button)}</a>
      </p>
      <p style="margin:0 0 6px;font-size:12px;color:#6f6f63;">${escapeHtml(linkFallback)}</p>
      <p style="margin:0 0 20px;font-size:12px;word-break:break-all;"><a href="${escapeHtml(link)}" style="color:#55603a;">${escapeHtml(link)}</a></p>
      <p style="margin:0 0 4px;font-size:12px;color:#6f6f63;">${escapeHtml(expiry)}</p>
      <p style="margin:0;font-size:12px;color:#6f6f63;">${escapeHtml(ignore)}</p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run lib/mail/templates.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 7: Implement the sender**

Create `lib/mail/send.ts`. The only file importing `nodemailer`:

```ts
import type { MailContent } from "./templates";

export class MailUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailUnavailableError";
  }
}

export function verificationLink(rawToken: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  return `${base}/verify?token=${encodeURIComponent(rawToken)}`;
}

// Missing SMTP is explicit, never silent. Outside production the link is logged
// so a bare `npm run dev` and the test suite keep working; in production it
// throws, surfacing as mail_unavailable rather than a "check your email" screen
// for a mail that was never sent.
export async function sendMail(
  to: string,
  content: MailContent,
): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (process.env.NODE_ENV === "production") {
      throw new MailUnavailableError("SMTP_HOST is not set");
    }
    console.info(
      `[mail] SMTP_HOST unset - not sending. Would deliver to ${to}:\n${content.text}`,
    );
    return;
  }

  // Dynamic import keeps nodemailer out of every bundle that never mails.
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    // Mailpit accepts unauthenticated SMTP; a real provider will not.
    auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
  });

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "MoldAI <no-reply@moldai.local>",
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}
```

- [ ] **Step 8: Add the Mailpit dev override**

Create `docker-compose.override.yml`:

```yaml
# Dev-only. Compose auto-merges an override file for a bare `docker compose up`
# -- exactly `npm run docker:up` -- and ignores it for the explicit two-file
# prod stack (`npm run docker:prod`), so production never gets Mailpit and no
# npm script needed changing. `npm run db:up` merges this too but starts only
# `db`, so it is unaffected.
services:
  mailpit:
    image: axllent/mailpit:latest
    container_name: moldai-mailpit
    restart: unless-stopped
    ports:
      - "8025:8025" # web inbox
      - "1025:1025" # SMTP
    environment:
      MP_SMTP_AUTH_ACCEPT_ANY: "1"
      MP_SMTP_AUTH_ALLOW_INSECURE: "1"

  app:
    environment:
      SMTP_HOST: mailpit
      SMTP_PORT: "1025"
      SMTP_FROM: MoldAI <no-reply@moldai.local>
      APP_URL: http://localhost:3000
```

- [ ] **Step 9: Verify**

```bash
npm test
npx eslint app lib components
npm run build
docker compose config --services
```

Expected: tests, lint and build pass; `docker compose config --services` lists `db`, `redis`, `app`, `cron`, `mailpit`. Then confirm the prod stack excludes Mailpit:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --services
```

Expected: `db`, `redis`, `app`, `cron` — no `mailpit`.

- [ ] **Step 10: Commit**

```bash
git add lib/mail docker-compose.override.yml messages/pt-BR.json package.json package-lock.json
git commit -m "feat(mail): add the verification email template and sender"
```

---

### Task 6: Sign-up issues the token, sends the mail, and is rate limited

**Files:**

- Modify: `lib/account/signup.ts` (extend `SignupErrorCode`), `app/api/signup/route.ts`
- Test: `app/api/signup/route.test.ts` (extended)

**Interfaces:**

- Consumes: `consume`/`clientIp` (Task 1), `issueToken` (Task 3), `sendMail`/`verificationLink`/`verificationEmail` (Task 5).
- Produces: `SignupErrorCode` gains `"rate_limited"` and `"mail_unavailable"`.

- [ ] **Step 1: Extend the error union**

In `lib/account/signup.ts`, only the type changes — `createAccount` still never produces either new member:

```ts
// `bad_body`, `rate_limited` and `mail_unavailable` are produced by the route,
// never by createAccount -- they live here because the whole wire contract is
// one union.
export type SignupErrorCode =
  | "invalid_name"
  | "invalid_email"
  | "weak_password"
  | "email_taken"
  | "bad_body"
  | "rate_limited"
  | "mail_unavailable";
```

- [ ] **Step 2: Add the failing route tests**

Append these to the existing `describe("POST /api/signup", …)` in `app/api/signup/route.test.ts`, and add the new mocks at the top of the file alongside the existing ones:

```ts
vi.mock("@/lib/rate-limit/consume", () => ({ consume: vi.fn() }));
vi.mock("@/lib/db/verification", () => ({ issueToken: vi.fn() }));
vi.mock("@/lib/mail/send", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/mail/send")>("@/lib/mail/send");
  return {
    sendMail: vi.fn(),
    verificationLink: vi.fn(() => "http://test/verify?token=raw"),
    MailUnavailableError: actual.MailUnavailableError,
  };
});
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
```

and the matching imports:

```ts
import { consume } from "@/lib/rate-limit/consume";
import { issueToken } from "@/lib/db/verification";
import { sendMail, MailUnavailableError } from "@/lib/mail/send";
```

Extend `beforeEach` with the new defaults:

```ts
vi.mocked(consume).mockReset();
vi.mocked(issueToken).mockReset();
vi.mocked(sendMail).mockReset();
vi.mocked(consume).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
vi.mocked(issueToken).mockResolvedValue("raw-token");
vi.mocked(sendMail).mockResolvedValue(undefined);
```

The new cases:

```ts
it("issues a token and mails it after creating the account", async () => {
  const res = await POST(req(VALID));
  expect(res.status).toBe(200);
  expect(issueToken).toHaveBeenCalledWith("new", expect.any(Date));
  expect(sendMail).toHaveBeenCalledWith(
    "novo@moldai.local",
    expect.objectContaining({ subject: expect.any(String) }),
  );
});

it("creates the account before sending, so a mail failure is recoverable", async () => {
  vi.mocked(sendMail).mockRejectedValue(
    new MailUnavailableError("SMTP_HOST is not set"),
  );
  const res = await POST(req(VALID));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({
    status: "error",
    error: "mail_unavailable",
  });
  expect(createUser).toHaveBeenCalled();
});

it("429s when the IP bucket is exhausted, without creating anything", async () => {
  vi.mocked(consume).mockResolvedValue({ allowed: false, retryAfterSec: 900 });
  const res = await POST(req(VALID));
  expect(res.status).toBe(429);
  expect(res.headers.get("Retry-After")).toBe("900");
  expect(await res.json()).toEqual({
    status: "error",
    error: "rate_limited",
  });
  expect(createUser).not.toHaveBeenCalled();
});

it("429s when only the email bucket is exhausted", async () => {
  vi.mocked(consume).mockImplementation(async (bucket) => ({
    allowed: bucket !== "signup_email",
    retryAfterSec: 60,
  }));
  const res = await POST(req(VALID));
  expect(res.status).toBe(429);
  expect(createUser).not.toHaveBeenCalled();
});

it("consumes the ip bucket and the normalized-email bucket", async () => {
  await POST(req({ ...VALID, email: "  NOVO@MoldAI.local " }));
  expect(consume).toHaveBeenCalledWith("signup", "unknown");
  expect(consume).toHaveBeenCalledWith("signup_email", "novo@moldai.local");
});

it("never sends a mail when validation fails", async () => {
  await POST(req({ ...VALID, password: "curta12" }));
  expect(sendMail).not.toHaveBeenCalled();
  expect(issueToken).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run app/api/signup/route.test.ts`
Expected: FAIL — the route neither rate-limits nor mails; `Retry-After` is absent and `issueToken` is never called.

- [ ] **Step 4: Rewrite the route**

Replace `app/api/signup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createAccount, normalizeEmail } from "@/lib/account/signup";
import type { SignupErrorCode } from "@/lib/account/signup";
import { hashPassword } from "@/lib/auth/hash";
import { getUserByEmail, createUser } from "@/lib/db/users";
import { issueToken } from "@/lib/db/verification";
import { sendMail, verificationLink } from "@/lib/mail/send";
import { verificationEmail } from "@/lib/mail/templates";
import { consume } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";

// The only unauthenticated route handler in the app besides NextAuth's own and
// the two /api/verify-email routes, so it deliberately does not call
// requireUser(). It sits at the top level rather than under /api/auth/* (which
// the [...nextauth] catch-all owns) or /api/account/* (uniformly session-gated).
const STATUS: Record<SignupErrorCode, number> = {
  invalid_name: 400,
  invalid_email: 400,
  weak_password: 400,
  email_taken: 409,
  bad_body: 400,
  rate_limited: 429,
  mail_unavailable: 503,
};

function fail(error: SignupErrorCode, headers?: HeadersInit) {
  return NextResponse.json(
    { status: "error", error },
    { status: STATUS[error], headers },
  );
}

export async function POST(request: Request) {
  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("bad_body");
  }

  // Consume before any real work: no row creation, no bcrypt, no mail.
  const byIp = await consume("signup", clientIp(request.headers));
  if (!byIp.allowed) {
    return fail("rate_limited", { "Retry-After": String(byIp.retryAfterSec) });
  }

  // A malformed address gets no email bucket -- createAccount rejects it below.
  const email = normalizeEmail(body.email);
  if (email) {
    const byEmail = await consume("signup_email", email);
    if (!byEmail.allowed) {
      return fail("rate_limited", {
        "Retry-After": String(byEmail.retryAfterSec),
      });
    }
  }

  const result = await createAccount(
    { getUserByEmail, createUser, hash: hashPassword },
    { name: body.name, email: body.email, password: body.password },
  );
  if (!result.ok) return fail(result.error);

  // Ordering matters: the user row and token are created first, then the mail
  // is sent. A send failure leaves an unverified account the user can recover
  // with "Reenviar" -- never a silent success.
  try {
    const raw = await issueToken(result.user.id, new Date());
    const t = await getTranslations("VerificationEmail");
    await sendMail(
      result.user.email,
      verificationEmail(
        t,
        verificationLink(raw),
        result.user.name ?? result.user.email,
      ),
    );
  } catch (err) {
    console.error("[signup] verification mail failed:", err);
    return fail("mail_unavailable");
  }

  // No user fields are echoed back -- the client already has the name and email
  // it typed, and the record carries the password hash.
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/api/signup/route.test.ts`
Expected: PASS — the 8 original cases plus the 6 new ones.

- [ ] **Step 6: Verify**

```bash
npm test
npx eslint app lib components
npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/account/signup.ts app/api/signup
git commit -m "feat(signup): mail a verification link and rate limit the route"
```

---

### Task 7: The `/api/verify-email` routes

Both are born rate-limited — there is no retrofit step, because Task 1 shipped the limiter first.

**Files:**

- Create: `app/api/verify-email/route.ts`, `app/api/verify-email/resend/route.ts`
- Test: `app/api/verify-email/route.test.ts`, `app/api/verify-email/resend/route.test.ts`

**Interfaces:**

- Consumes: `consume`/`clientIp` (Task 1), `hashToken`/`RESEND_COOLDOWN_MS`/`VerifyErrorCode`/`ResendErrorCode` (Task 3), `consumeToken`/`issueToken`/`lastIssuedAt` (Task 3), `sendMail`/`verificationLink`/`verificationEmail` (Task 5), `getUserByEmail` + `verifyPassword`.
- Produces: two unauthenticated `POST` handlers returning `{status:"ok"}` or `{status:"error", error}`.

- [ ] **Step 1: Write the failing verify-email test**

Create `app/api/verify-email/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/verification", () => ({ consumeToken: vi.fn() }));
vi.mock("@/lib/rate-limit/consume", () => ({ consume: vi.fn() }));

import { POST } from "./route";
import { consumeToken } from "@/lib/db/verification";
import { consume } from "@/lib/rate-limit/consume";
import { hashToken } from "@/lib/auth/verification";

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/verify-email", () => {
  beforeEach(() => {
    vi.mocked(consumeToken).mockReset();
    vi.mocked(consume).mockReset();
    vi.mocked(consume).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(consumeToken).mockResolvedValue({ ok: true, userId: "u1" });
  });

  it("confirms the address and returns ok", async () => {
    const res = await POST(req({ token: "raw-token" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("looks the token up by its digest, never by the raw value", async () => {
    await POST(req({ token: "raw-token" }));
    expect(consumeToken).toHaveBeenCalledWith(
      hashToken("raw-token"),
      expect.any(Date),
    );
  });

  it("400s with expired_token so the user knows to request a new link", async () => {
    vi.mocked(consumeToken).mockResolvedValue({
      ok: false,
      reason: "expired",
    });
    const res = await POST(req({ token: "raw-token" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "expired_token",
    });
  });

  it("400s with invalid_token on an unknown token", async () => {
    vi.mocked(consumeToken).mockResolvedValue({
      ok: false,
      reason: "invalid",
    });
    const res = await POST(req({ token: "nope" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_token",
    });
  });

  it("400s with invalid_token on a missing or non-string token", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_token",
    });
    expect(consumeToken).not.toHaveBeenCalled();
  });

  it("400s with bad_body on unparseable JSON", async () => {
    const res = await POST(
      new Request("http://test", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
  });

  it("429s when the verify bucket is exhausted", async () => {
    vi.mocked(consume).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const res = await POST(req({ token: "raw-token" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(consumeToken).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/api/verify-email/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Implement the verify route**

Create `app/api/verify-email/route.ts`:

```ts
import { NextResponse } from "next/server";
import { hashToken, type VerifyErrorCode } from "@/lib/auth/verification";
import { consumeToken } from "@/lib/db/verification";
import { consume } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";

// Unauthenticated by necessity: the visitor has a link, not a session.
const STATUS: Record<VerifyErrorCode, number> = {
  invalid_token: 400,
  expired_token: 400,
  bad_body: 400,
  rate_limited: 429,
};

function fail(error: VerifyErrorCode, headers?: HeadersInit) {
  return NextResponse.json(
    { status: "error", error },
    { status: STATUS[error], headers },
  );
}

export async function POST(request: Request) {
  const gate = await consume("verify", clientIp(request.headers));
  if (!gate.allowed) {
    return fail("rate_limited", { "Retry-After": String(gate.retryAfterSec) });
  }

  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("bad_body");
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return fail("invalid_token");

  const result = await consumeToken(hashToken(token), new Date());
  if (!result.ok) {
    return fail(
      result.reason === "expired" ? "expired_token" : "invalid_token",
    );
  }

  // Deliberately no session is minted: at this point the server has proof of
  // email ownership but not of the password, and signing in straight from a
  // link would turn the email into a bearer credential.
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run app/api/verify-email/route.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Write the failing resend test**

Create `app/api/verify-email/resend/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/users", () => ({ getUserByEmail: vi.fn() }));
vi.mock("@/lib/db/verification", () => ({
  issueToken: vi.fn(),
  lastIssuedAt: vi.fn(),
}));
vi.mock("@/lib/auth/hash", () => ({ verifyPassword: vi.fn() }));
vi.mock("@/lib/rate-limit/consume", () => ({ consume: vi.fn() }));
vi.mock("@/lib/mail/send", () => ({
  sendMail: vi.fn(),
  verificationLink: vi.fn(() => "http://test/verify?token=raw"),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import { POST } from "./route";
import { getUserByEmail } from "@/lib/db/users";
import { issueToken, lastIssuedAt } from "@/lib/db/verification";
import { verifyPassword } from "@/lib/auth/hash";
import { consume } from "@/lib/rate-limit/consume";
import { sendMail } from "@/lib/mail/send";

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const CREDS = { email: "novo@moldai.local", password: "senha-forte" };

const UNVERIFIED = {
  id: "u1",
  email: "novo@moldai.local",
  passwordHash: "HASH",
  name: "Novo",
  emailVerified: null,
};

describe("POST /api/verify-email/resend", () => {
  beforeEach(() => {
    vi.mocked(getUserByEmail).mockReset();
    vi.mocked(issueToken).mockReset();
    vi.mocked(lastIssuedAt).mockReset();
    vi.mocked(verifyPassword).mockReset();
    vi.mocked(consume).mockReset();
    vi.mocked(sendMail).mockReset();
    vi.mocked(consume).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(getUserByEmail).mockResolvedValue(UNVERIFIED);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(lastIssuedAt).mockResolvedValue(null);
    vi.mocked(issueToken).mockResolvedValue("raw-token");
    vi.mocked(sendMail).mockResolvedValue(undefined);
  });

  it("reissues and mails a fresh link", async () => {
    const res = await POST(req(CREDS));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(issueToken).toHaveBeenCalledWith("u1", expect.any(Date));
    expect(sendMail).toHaveBeenCalled();
  });

  it("401s on a wrong password, so it cannot be a spam relay", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const res = await POST(req(CREDS));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_credentials",
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("401s on an unknown address with the same code, revealing nothing", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(null);
    const res = await POST(req(CREDS));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_credentials",
    });
  });

  it("409s with already_verified once the address is confirmed", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({
      ...UNVERIFIED,
      emailVerified: new Date(),
    });
    const res = await POST(req(CREDS));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: "error",
      error: "already_verified",
    });
    expect(issueToken).not.toHaveBeenCalled();
  });

  it("429s with cooldown inside 60 seconds of the last issue", async () => {
    vi.mocked(lastIssuedAt).mockResolvedValue(new Date(Date.now() - 5_000));
    const res = await POST(req(CREDS));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ status: "error", error: "cooldown" });
    expect(res.headers.get("Retry-After")).toBe("55");
    expect(issueToken).not.toHaveBeenCalled();
  });

  it("allows a reissue once the cooldown has passed", async () => {
    vi.mocked(lastIssuedAt).mockResolvedValue(new Date(Date.now() - 61_000));
    const res = await POST(req(CREDS));
    expect(res.status).toBe(200);
    expect(issueToken).toHaveBeenCalled();
  });

  it("503s with mail_unavailable when sending throws", async () => {
    vi.mocked(sendMail).mockRejectedValue(new Error("SMTP down"));
    const res = await POST(req(CREDS));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: "error",
      error: "mail_unavailable",
    });
  });

  it("429s when the resend bucket is exhausted, before touching the repo", async () => {
    vi.mocked(consume).mockResolvedValue({
      allowed: false,
      retryAfterSec: 300,
    });
    const res = await POST(req(CREDS));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("400s with bad_body on unparseable JSON", async () => {
    const res = await POST(
      new Request("http://test", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run app/api/verify-email/resend/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 7: Implement the resend route**

Create `app/api/verify-email/resend/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { normalizeEmail } from "@/lib/account/signup";
import { verifyPassword } from "@/lib/auth/hash";
import {
  RESEND_COOLDOWN_MS,
  type ResendErrorCode,
} from "@/lib/auth/verification";
import { getUserByEmail } from "@/lib/db/users";
import { issueToken, lastIssuedAt } from "@/lib/db/verification";
import { sendMail, verificationLink } from "@/lib/mail/send";
import { verificationEmail } from "@/lib/mail/templates";
import { consume } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";

const STATUS: Record<ResendErrorCode, number> = {
  invalid_credentials: 401,
  already_verified: 409,
  cooldown: 429,
  bad_body: 400,
  rate_limited: 429,
  mail_unavailable: 503,
};

function fail(error: ResendErrorCode, headers?: HeadersInit) {
  return NextResponse.json(
    { status: "error", error },
    { status: STATUS[error], headers },
  );
}

// Credentials are verified before resending. That single decision removes the
// account-enumeration oracle, stops the endpoint being a spam relay against
// arbitrary addresses, and costs nothing: both callers (the sign-up success
// card and the login error) already hold the values.
export async function POST(request: Request) {
  const gate = await consume("resend", clientIp(request.headers));
  if (!gate.allowed) {
    return fail("rate_limited", { "Retry-After": String(gate.retryAfterSec) });
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("bad_body");
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return fail("invalid_credentials");

  const user = await getUserByEmail(email);
  if (!user) return fail("invalid_credentials");
  if (!(await verifyPassword(password, user.passwordHash))) {
    return fail("invalid_credentials");
  }

  if (user.emailVerified) return fail("already_verified");

  const now = new Date();
  const last = await lastIssuedAt(user.id);
  if (last) {
    const elapsed = now.getTime() - last.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      return fail("cooldown", {
        "Retry-After": String(Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)),
      });
    }
  }

  try {
    // Reissuing invalidates the previous token, so only the newest link works.
    const raw = await issueToken(user.id, now);
    const t = await getTranslations("VerificationEmail");
    await sendMail(
      user.email,
      verificationEmail(t, verificationLink(raw), user.name ?? user.email),
    );
  } catch (err) {
    console.error("[resend] verification mail failed:", err);
    return fail("mail_unavailable");
  }

  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run app/api/verify-email/`
Expected: PASS — 16 tests across the two files.

- [ ] **Step 9: Verify**

```bash
npm test
npx eslint app lib components
npm run build
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add app/api/verify-email
git commit -m "feat(auth): add the verify-email and resend routes"
```

---

### Task 8: The screens — `/verify`, the sign-up success state, the login gate

**Files:**

- Create: `app/verify/page.tsx`, `components/auth/VerifyCard.tsx`
- Modify: `lib/api-client.ts`, `app/signup/page.tsx`, `app/login/page.tsx`, `messages/pt-BR.json`

**Interfaces:**

- Consumes: `VerifyErrorCode`/`ResendErrorCode` (Task 3), the two routes (Task 7), the `code` values `unverified_email` / `rate_limited` thrown in `auth.ts` (Task 4).
- Produces:
  - `type VerifyEmailResult = { status: "ok" } | { status: "error"; error: VerifyErrorCode }`
  - `type ResendResult = { status: "ok" } | { status: "error"; error: ResendErrorCode }`
  - `function verifyEmail(token: string): Promise<VerifyEmailResult>`
  - `function resendVerification(email: string, password: string): Promise<ResendResult>`

- [ ] **Step 1: Add the client calls**

In `lib/api-client.ts`, add the imports beside the existing `SignupErrorCode` one:

```ts
import type { VerifyErrorCode, ResendErrorCode } from "./auth/verification";
```

re-export them next to `export type { SignupErrorCode };`:

```ts
export type { VerifyErrorCode, ResendErrorCode };

export type VerifyEmailResult =
  { status: "ok" } | { status: "error"; error: VerifyErrorCode };

export type ResendResult =
  { status: "ok" } | { status: "error"; error: ResendErrorCode };
```

and add the two functions beside `signUp`:

```ts
export function verifyEmail(token: string): Promise<VerifyEmailResult> {
  return postJson<VerifyEmailResult>("/api/verify-email", { token });
}

export function resendVerification(
  email: string,
  password: string,
): Promise<ResendResult> {
  return postJson<ResendResult>("/api/verify-email/resend", {
    email,
    password,
  });
}
```

Components never call `fetch` directly — every server call goes through this module.

- [ ] **Step 2: Add the `Verify` namespace and extend `Signup`/`Login`**

In `messages/pt-BR.json`, add:

```json
  "Verify": {
    "heading": "Confirmar email",
    "intro": "Clique no botão para confirmar que este email é seu e liberar o acesso à sua conta.",
    "confirmButton": "Confirmar meu email",
    "confirmButtonLoading": "Confirmando…",
    "successHeading": "Email confirmado!",
    "successBody": "Tudo certo. Agora é só entrar com sua senha.",
    "loginLink": "Ir para o login",
    "errors": {
      "invalid_token": "Este link não é válido. Peça um novo na tela de login.",
      "expired_token": "Este link expirou. Peça um novo na tela de login.",
      "bad_body": "Não foi possível confirmar. Tente novamente.",
      "rate_limited": "Muitas tentativas. Aguarde alguns minutos e tente de novo."
    },
    "missingToken": "Link incompleto. Abra o endereço exatamente como ele chegou no seu email."
  },
```

Extend the existing `Signup` namespace — **remove** `signinFailedError` (nothing signs in at sign-up any more) and add:

```json
    "sentHeading": "Confirme seu email",
    "sentBody": "Enviamos um link de confirmação para <b>{email}</b>. Abra o link para liberar o acesso à sua conta.",
    "sentHint": "Não chegou? Verifique o spam ou reenvie.",
    "resendButton": "Reenviar",
    "resendButtonLoading": "Reenviando…",
    "resendDone": "Link reenviado.",
```

and inside `Signup.errors`:

```json
    "rate_limited": "Muitas tentativas de cadastro. Aguarde alguns minutos.",
    "mail_unavailable": "Sua conta foi criada, mas não conseguimos enviar o email de confirmação. Tente reenviar em instantes.",
    "invalid_credentials": "Email ou senha inválidos.",
    "already_verified": "Este email já está confirmado. Faça login.",
    "cooldown": "Aguarde um minuto antes de pedir outro link."
```

Extend `Login` with:

```json
    "unverifiedEmail": "Confirme seu email antes de entrar. Enviamos um link quando você criou a conta.",
    "rateLimited": "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
    "resendButton": "Reenviar link de confirmação",
    "resendButtonLoading": "Reenviando…",
    "resendDone": "Link reenviado. Confira seu email.",
    "resendFailed": "Não foi possível reenviar agora. Tente de novo em instantes."
```

- [ ] **Step 3: Check the Next 16 `searchParams` convention before writing the page**

```bash
grep -n -A10 "searchParams: Promise" node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md
```

Expected: `searchParams: Promise<{ [key: string]: string | string[] | undefined }>` — it is a Promise in Next 16 and **must be awaited**.

- [ ] **Step 4: Write the verify page**

Create `app/verify/page.tsx`. This is the project's **first server component with display text**, so it uses `await getTranslations(...)` rather than the `useTranslations` hook every client screen uses:

```tsx
import { getTranslations } from "next-intl/server";
import VerifyCard from "@/components/auth/VerifyCard";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("Verify");
  const token = (await searchParams).token ?? "";

  return (
    <div className="bg-paper flex min-h-screen items-center justify-center px-4">
      <div className="bg-surface border-border rounded-card shadow-card w-full max-w-[380px] border p-7">
        <span className="font-display text-[22px] font-bold tracking-[-0.4px]">
          Mold<span className="text-olive">AI</span>
        </span>
        <h1 className="mt-4 text-[15px] font-semibold">{t("heading")}</h1>
        {token ? (
          <VerifyCard token={token} />
        ) : (
          <p className="text-alert mt-3 text-[12px]">{t("missingToken")}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the interactive card**

Create `components/auth/VerifyCard.tsx`. The confirmation is a **button, not the GET** — corporate mail scanners and link previewers fetch URLs in flight and would burn the single-use token before the user ever clicked. One extra click buys immunity to that:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { verifyEmail } from "@/lib/api-client";

export default function VerifyCard({ token }: { token: string }) {
  const t = useTranslations("Verify");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");

  async function onConfirm() {
    setStatus("loading");
    setError("");
    const result = await verifyEmail(token);
    if (result.status === "error") {
      setStatus("idle");
      setError(t(`errors.${result.error}`));
      return;
    }
    setStatus("done");
  }

  if (status === "done") {
    return (
      <div className="mt-3">
        <p className="text-[13px] font-semibold">{t("successHeading")}</p>
        <p className="text-muted-2 mt-1 text-[12px]">{t("successBody")}</p>
        <Link
          href="/login"
          className="rounded-btn bg-olive hover:bg-olive-dark mt-4 inline-block px-4 py-2 text-[13px] font-semibold text-white transition-colors"
        >
          {t("loginLink")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-muted-2 text-[12px]">{t("intro")}</p>
      {error && <p className="text-alert mt-3 text-[12px]">{error}</p>}
      <button
        type="button"
        onClick={onConfirm}
        disabled={status === "loading"}
        className="rounded-btn bg-olive hover:bg-olive-dark mt-4 px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:opacity-50"
      >
        {status === "loading" ? t("confirmButtonLoading") : t("confirmButton")}
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Replace the sign-up auto-sign-in with the "verifique seu email" state**

In `app/signup/page.tsx`: drop the `signIn` and `useRouter` imports and their usage, import `resendVerification` alongside `signUp`, and add the new state. The submit handler becomes:

```tsx
async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!canSubmit) return;
  setLoading(true);
  setError("");

  const result = await signUp(name, email, password);
  setLoading(false);
  if (result.status === "error") {
    setError(t(`errors.${result.error}`));
    return;
  }
  // No auto-sign-in: the account starts unverified and cannot be signed in.
  // The card swaps in place -- no navigation, no new route. The component
  // keeps email and password in state so resend can satisfy the credential gate.
  setSent(true);
}

async function onResend() {
  setResending(true);
  setError("");
  setResent(false);
  const result = await resendVerification(email, password);
  setResending(false);
  if (result.status === "error") {
    setError(t(`errors.${result.error}`));
    return;
  }
  setResent(true);
}
```

with these added alongside the existing `useState` calls:

```tsx
const [sent, setSent] = useState(false);
const [resending, setResending] = useState(false);
const [resent, setResent] = useState(false);
```

Then, inside the card and **before** the `<form>`, return the sent state instead of the form:

```tsx
{
  sent ? (
    <div className="mt-3">
      <h1 className="text-[15px] font-semibold">{t("sentHeading")}</h1>
      <p className="text-muted-2 mt-2 text-[12px]">
        {t.rich("sentBody", {
          email,
          b: (chunks) => <span className="text-ink font-medium">{chunks}</span>,
        })}
      </p>
      <p className="text-muted mt-3 text-[11px]">{t("sentHint")}</p>
      {error && <p className="text-alert mt-3 text-[12px]">{error}</p>}
      {resent && (
        <p className="text-olive-dark mt-3 text-[12px]">{t("resendDone")}</p>
      )}
      <button
        type="button"
        onClick={onResend}
        disabled={resending}
        className="border-border rounded-btn hover:bg-surface-alt mt-4 border px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50"
      >
        {resending ? t("resendButtonLoading") : t("resendButton")}
      </button>
    </div>
  ) : (
    <>{/* the existing <h1> and <form> move in here unchanged */}</>
  );
}
```

Keep the existing `loginNote` paragraph outside the conditional so it shows in both states. Delete the now-unused `signinFailedError` lookup.

- [ ] **Step 7: Handle the two new login errors**

In `app/login/page.tsx`, import `resendVerification` from `@/lib/api-client`, add state, and read the `code` Auth.js surfaces on `SignInResponse`:

```tsx
const [unverified, setUnverified] = useState(false);
const [resending, setResending] = useState(false);
const [resent, setResent] = useState(false);

async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setLoading(true);
  setError("");
  setUnverified(false);
  setResent(false);
  const res = await signIn("credentials", {
    email,
    password,
    redirect: false,
  });
  setLoading(false);
  if (res?.error) {
    // Auth.js surfaces a CredentialsSignin subclass's `code` here, so an
    // unverified account never reads as "senha inválida".
    if (res.code === "unverified_email") {
      setUnverified(true);
      setError(t("unverifiedEmail"));
    } else if (res.code === "rate_limited") {
      setError(t("rateLimited"));
    } else {
      setError(t("invalidCredentials"));
    }
    return;
  }
  router.push("/");
  router.refresh();
}

async function onResend() {
  setResending(true);
  setResent(false);
  const result = await resendVerification(email, password);
  setResending(false);
  if (result.status === "error") {
    setError(t("resendFailed"));
    return;
  }
  setResent(true);
}
```

Then, directly after the existing `{error && <p …>}` line inside the form, add the inline resend action:

```tsx
{
  unverified && (
    <button
      type="button"
      onClick={onResend}
      disabled={resending}
      className="border-border rounded-btn hover:bg-surface-alt border px-4 py-2 text-[12px] font-semibold transition-colors disabled:opacity-50"
    >
      {resending ? t("resendButtonLoading") : t("resendButton")}
    </button>
  );
}
{
  resent && <p className="text-olive-dark text-[12px]">{t("resendDone")}</p>;
}
```

The resend is credential-gated server-side, and the form already holds both values — the user does not retype anything.

- [ ] **Step 8: Verify**

```bash
npm test
npx eslint app lib components
npm run build
npx prettier --check .
```

Expected: all pass. If `prettier --check` complains, run `npm run format`.

- [ ] **Step 9: Commit**

```bash
git add app/verify components/auth app/signup app/login lib/api-client.ts messages/pt-BR.json
git commit -m "feat(auth): add the verify screen and the unverified login state"
```

---

### Task 9: Documentation and the end-to-end manual check

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Run the real flow through Mailpit**

```bash
npm run docker:up
```

Then, in a browser:

1. Open `http://localhost:3000/signup` and create an account with any address.
2. Confirm the card swaps to "Confirme seu email" and does **not** sign you in.
3. Open the inbox at `http://localhost:8025` and find the message.
4. Try logging in first at `http://localhost:3000/login` — expect "Confirme seu email antes de entrar" with a resend button, **not** "Email ou senha inválidos".
5. Click the link in the mail, press "Confirmar meu email", then log in. Expect success.
6. Reload the verify link. Expect "Este link não é válido" — it is single use.

- [ ] **Step 2: Check the rate limiter end to end**

Hammer the login form past 20 failed attempts and confirm the message becomes "Muitas tentativas". Then confirm fail-open:

```bash
docker compose stop redis
```

Log in again with correct credentials. Expect success, with a `[rate-limit] … failing open` line in `docker compose logs app`. Restart it:

```bash
docker compose start redis
```

- [ ] **Step 3: Update `CLAUDE.md`**

Four edits, all in existing sections:

1. **Auth** (in "What this is") — replace the sentence beginning "Email verification and auth rate limiting are specced but not yet built…" and its "do not expose this instance to the internet" warning. Both blockers are gone. Write instead:

   > **Auth:** Auth.js v5 (Credentials + JWT), users in Postgres via Prisma. Self-service sign-up at `/signup` creates the account and mails a verification link; it does **not** sign the visitor in. `authorizeUser` returns `AuthorizeResult` — `{ok:true,user}` or `{ok:false,reason:"invalid"|"unverified"|"rate_limited"}` — and `auth.ts` maps `invalid` to Auth.js's generic `null` and the other two to `CredentialsSignin` subclasses carrying `code: "unverified_email"` / `"rate_limited"`, so `/login` distinguishes them. Verification tokens are sha-256 digests of 32 random bytes, 24 h, single use, newest-only (`lib/auth/verification.ts` pure + `lib/db/verification.ts` repo). Mail goes through `lib/mail/` (`nodemailer`); with `SMTP_HOST` unset it logs the link outside production and throws (`mail_unavailable`) in production — never a silent drop.

2. **A new "Rate limiting" subsection** under Architecture:

   > **Rate limiting** — Redis-backed fixed window (`INCR` + `EXPIRE … NX` in one `MULTI`, so no sweep job). The whole policy is the table in `lib/rate-limit/limits.ts`: `signup` 5/h and `signup_email` 3/h, `login` 20/15min and `login_email` 10/15min, `verify` 20/h, `resend` 10/h. Every sensitive endpoint has an IP-keyed bucket **and** an email-keyed one because `x-forwarded-for` is spoofable without a trusted proxy — the email-keyed limit is the non-spoofable backstop. The limiter reaches the pure `authorizeUser` through `AuthorizeDeps` (`consume`/`reset`), never an import. **It fails open:** if Redis is unreachable, `consume` logs and allows, so auth keeps working unthrottled rather than locking everyone out.

3. **API routes** — add to the unauthenticated set beside `POST /api/signup`:

   > `POST /api/verify-email` (consumes the token, stamps `emailVerified`) and `POST /api/verify-email/resend` (credential-gated reissue, 60 s cooldown). With `POST /api/signup` and NextAuth's own handlers these are the only unauthenticated route handlers.

4. **Commands / Docker** — add the two new services and the override rule:

   > A `redis` service (host **6380**, `redis:6379` inside the network — same split as Postgres' 5433/5432) backs rate limiting in both the dev and prod stacks. `docker-compose.override.yml` adds **Mailpit** (SMTP 1025, web inbox at **:8025**) and points the app's `SMTP_*` at it; Compose auto-merges an override for a bare `docker compose up` (`npm run docker:up`) and ignores it for the explicit two-file prod stack (`npm run docker:prod`), so production never gets Mailpit. `.env.example` documents every variable.

5. **i18n** — append to the section: `/verify` is the first server component using `await getTranslations(...)`; the verification email's copy lives in the `VerificationEmail` namespace and reaches `lib/mail/templates.ts` through the injected `Translate` seam.

- [ ] **Step 4: Final verification**

```bash
npm test
npx eslint app lib components
npm run build
npm run smoke:prod
```

Expected: all pass. `smoke:prod` does a real login against the production image and catches regressions like `UntrustedHost` — it uses a seeded account, which Task 2 stamped verified.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(auth): document email verification and rate limiting"
```

---

## Notes for the implementer

- **Do not split the `AuthorizeResult` union across tasks.** Task 4 writes all three members at once. If you find yourself adding a member later, you have drifted from the plan.
- **The two specs are the authority on _why_.** When a comment in this plan seems over-explained, it is preserving a decision that was argued: read the matching section in [spec B](../specs/2026-08-20-email-verification-design.md) or [spec C](../specs/2026-08-20-auth-rate-limiting-design.md).
- **Known gap this plan deliberately leaves open:** password reset is a non-goal. Someone who signs up, loses the mail, _and_ forgets their password has no path forward. It would reuse this plan's token infrastructure, which is a reason to build that infrastructure cleanly, not a reason to widen scope now.
- **Distinguishing `unverified` from `invalid` reveals that an account exists.** `@auth/core`'s docs recommend generic credential errors. This is an accepted, recorded trade — the same one `/signup` already makes with `email_taken` — not an oversight.
