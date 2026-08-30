# Google OAuth Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Continuar com Google" a real, working sign-in/sign-up path (GitHub issue #235), linked to the same `User` table Credentials already uses.

**Architecture:** Add `Google` as a second Auth.js provider next to the existing `Credentials` one, backed by `@auth/prisma-adapter` for account linking (new `Account`/`Session`/`VerificationToken` Prisma models). Session strategy stays JWT throughout — the only combination Auth.js supports alongside Credentials. `authorizeUser` gains a `no_password` reason for a Credentials attempt against a Google-only account, and `/settings` gets a way to set a password on one.

**Tech Stack:** Next.js 16, Auth.js v5 (`next-auth@^5.0.0-beta.32`), `@auth/prisma-adapter` (new), Prisma 6, vitest (`node` + `dom` projects), next-intl.

**Spec:** [`docs/superpowers/specs/2026-08-30-google-oauth-login-design.md`](../specs/2026-08-30-google-oauth-login-design.md)

**One deliberate deviation from the spec:** the spec names a new file `lib/auth/googleLink.ts` for the retroactive-email-verification helper. This plan instead adds `stampEmailVerifiedIfMissing` directly to `lib/db/users.ts`, matching how every other single-query conditional write in this codebase is done (`stampOnboarded`, `updateUserPasswordHash` — thin repo functions, tested by mocking the Prisma client the same way `lib/db/users.test.ts` already does for its neighbors). There is no real "pure decision" logic to extract — it's one `updateMany` with a `WHERE emailVerified IS NULL` clause — so a separate module would exist only to satisfy the spec's chosen file path, not to serve isolation. Everything else in the spec is followed as written.

## Global Constraints

- **Language boundary:** code identifiers, wire keys, enum values are English; UI display text is pt-BR (`messages/pt-BR.json`), keyed per component namespace via `useTranslations("ComponentName")`.
- **No hardcoded pt-BR JSX, no hex colors, no `text-[Npx]`** — use the named type scale and `@theme` tokens in `app/globals.css`.
- **Raw `<button>` is not allowed** — use `components/ui/button.tsx`'s `Button`.
- **Wire errors are machine-readable codes**, resolved client-side via `t("errors." + code)` — never pt-BR prose over the wire.
- **New catalog copy runs through the humanizer skill** (`.claude/skills/humanizer/`) before being considered final — formal register, no first person, no exclamation marks, no em-dash unless it matches an existing genuine tell.
- **`lib/` stays framework-free** — no `next-intl`/`next-auth` import inside `lib/auth/*.ts` or `lib/account/*.ts` pure/repo modules (the injected-`Translate`/DI pattern already used throughout).
- **Component tests** go through `renderWithIntl` (`components/test-utils.tsx`) and assert against the exported `ptBR` catalog object, never a pasted pt-BR literal.
- **A `vi.mock(...)` specifier must match the subject module's own import exactly** (`./prisma`, not `@/lib/db/prisma`, inside `lib/db/*.test.ts`).
- Run `npm run typecheck` and the relevant vitest project after each task; run the full `npm test` before the final commit of the plan.

---

### Task 1: Prisma schema — Google OAuth tables

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_google_oauth/migration.sql` (generated, not hand-written)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: Prisma-generated `Account`, `Session`, `VerificationToken` model types; `User.passwordHash: string | null`, `User.image: string | null` on the generated Prisma Client (the hand-written `UserRecord` interface in `lib/auth/types.ts` is widened separately, in Task 2).

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Add `image`, relax `passwordHash`, and add the two new relation fields to the existing `User` model — find this block:

```prisma
model User {
  id                  String                   @id @default(cuid())
  email               String                   @unique
  passwordHash        String
  name                String?
```

and change it to:

```prisma
model User {
  id                  String                   @id @default(cuid())
  email               String                   @unique
  // #235: nullable -- a Google-only account (no Credentials signup) has no
  // password at all. authorizeUser (lib/auth/authorize.ts) returns a
  // dedicated `no_password` reason for a Credentials attempt against one,
  // rather than comparing against nothing. /settings' PasswordSection lets
  // such an account set a password once (see lib/account/settings.ts).
  passwordHash        String?
  name                String?
  // #235: required by @auth/prisma-adapter's createUser -- Google's OAuth
  // profile includes an avatar URL, and PrismaAdapter passes it straight
  // into `prisma.user.create`. Written, never read by any screen today.
  image               String?
```

Then, still inside `model User`, find the existing relation list:

```prisma
  patterns            Pattern[]
  wallet              Wallet?
```

and add two new relations right above it:

```prisma
  // #235: Auth.js account-linking. A Credentials-only user has zero rows
  // here; a Google sign-in gets exactly one, added by the adapter itself.
  accounts            Account[]
  // #235: standard adapter shape, never actually written -- this app keeps
  // JWT sessions (session.strategy: "jwt" in auth.ts), so no database
  // Session row is ever created. Kept only because @auth/prisma-adapter is
  // typed against the full standard schema.
  sessions            Session[]
  patterns            Pattern[]
  wallet              Wallet?
```

Finally, add three new top-level models. Put them right after the closing `}` of `model User` (before `model EmailVerificationToken`):

```prisma
// #235: real and load-bearing -- this is how a Google identity resolves to
// a User.id. @@unique([provider, providerAccountId]) is what the adapter's
// getUserByAccount looks up on every Google sign-in.
model Account {
  id                String  @id @default(cuid())
  userId            String
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  @@unique([provider, providerAccountId])
  @@index([userId])
}

// #235: standard Auth.js adapter shape, kept for contract compatibility --
// never written to. This app keeps JWT sessions (no database Session row is
// ever created) and already has its own EmailVerificationToken/
// PasswordResetToken (Auth.js's own VerificationToken backs its Email/
// magic-link provider only, which this app doesn't use). Two empty tables
// are the conscious cost of choosing the full adapter over a lightweight
// column -- see docs/decisions.md's Authentication section.
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expires      DateTime
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

```

- [ ] **Step 2: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Generate the migration**

Requires a running local Postgres (`npm run db:up` if it isn't already up).

Run: `npx prisma migrate dev --name add_google_oauth`
Expected: prisma reports the migration applied and regenerates the client. It should be additive only — relaxing `passwordHash`'s `NOT NULL` is a no-op for existing rows (every current row already has a hash), so no data-loss warning should appear. If prisma prompts about a destructive change, stop and inspect — that would mean something in this diff is not what's described above.

- [ ] **Step 4: Confirm nothing else broke**

Run: `npm run typecheck`
Run: `npx vitest run --project node`
Run: `npx vitest run --project dom`
Expected: all PASS — this step only widens types and adds unused tables, so no existing test should change behavior.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(auth): add Google OAuth schema (Account/Session/VerificationToken, nullable passwordHash)"
```

---

### Task 2: `no_password` authorize reason

**Files:**

- Modify: `lib/auth/types.ts:1-6` (`UserRecord.passwordHash`)
- Modify: `lib/auth/authorize.ts`
- Modify: `auth.ts`
- Test: `lib/auth/authorize.test.ts`

**Interfaces:**

- Consumes: `UserRecord` (from Task 1's schema — no import change, just a wider type).
- Produces: `AuthorizeFailure = "invalid" | "unverified" | "rate_limited" | "no_password"`; `auth.ts`'s `NoPasswordError` class with `code: "no_password"`, consumed later by `components/auth/LoginCard.tsx`.

- [ ] **Step 1: Widen `UserRecord.passwordHash`**

In `lib/auth/types.ts`, change:

```ts
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  emailVerified: Date | null;
}
```

to:

```ts
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  emailVerified: Date | null;
}
```

- [ ] **Step 2: Write the failing test**

In `lib/auth/authorize.test.ts`, add this test inside the existing `describe("authorizeUser", ...)` block (anywhere after the `unverified` const is usable — right after the "a wrong password on an unverified account is still 'invalid'" test is a good spot):

```ts
it("a null passwordHash (Google-only account) is 'no_password', without hashing", async () => {
  const verify = vi.fn(async () => true);
  const googleUser: UserRecord = { ...user, passwordHash: null };
  const r = await authorizeUser(
    GOOD,
    deps({ verify, getUserByEmail: async () => googleUser }),
  );
  expect(r).toEqual({ ok: false, reason: "no_password" });
  expect(verify).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npx vitest run lib/auth/authorize.test.ts --project node`
Expected: FAIL — today `deps.verify` is called (since `verify` here always resolves `true` regardless of args) and the function returns `{ ok: true, user: {...} }`, not `{ ok: false, reason: "no_password" }`.

- [ ] **Step 4: Implement the `no_password` branch**

In `lib/auth/authorize.ts`, change:

```ts
export type AuthorizeFailure = "invalid" | "unverified" | "rate_limited";
```

to:

```ts
export type AuthorizeFailure =
  "invalid" | "unverified" | "rate_limited" | "no_password";
```

Then, inside `authorizeUser`, find:

```ts
  if (!user) {
    await deps.verify(password, DUMMY_HASH);
    return { ok: false, reason: "invalid" };
  }

  if (!(await deps.verify(password, user.passwordHash))) {
```

and insert the new check between those two blocks:

```ts
  if (!user) {
    await deps.verify(password, DUMMY_HASH);
    return { ok: false, reason: "invalid" };
  }

  // #235: a Google-only account has no hash to compare against at all --
  // returning here (before any deps.verify call) is what keeps this
  // distinct from a wrong-password "invalid", both in the wire code /login
  // shows and in the fact that no hashing work is spent on it.
  if (user.passwordHash === null) {
    return { ok: false, reason: "no_password" };
  }

  if (!(await deps.verify(password, user.passwordHash))) {
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run lib/auth/authorize.test.ts --project node`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 6: Wire `no_password` into `auth.ts`**

In `auth.ts`, find:

```ts
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}
```

and add a third class right after it:

```ts
class NoPasswordError extends CredentialsSignin {
  code = "no_password";
}
```

Then, inside the `Credentials({ authorize: ... })` block, find:

```ts
if (result.ok) return result.user;
if (result.reason === "unverified") throw new UnverifiedEmailError();
if (result.reason === "rate_limited") throw new RateLimitedError();
return null;
```

and change it to:

```ts
if (result.ok) return result.user;
if (result.reason === "unverified") throw new UnverifiedEmailError();
if (result.reason === "rate_limited") throw new RateLimitedError();
if (result.reason === "no_password") throw new NoPasswordError();
return null;
```

- [ ] **Step 7: Confirm the whole file compiles and tests still pass**

Run: `npm run typecheck`
Run: `npx vitest run lib/auth --project node`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/auth/types.ts lib/auth/authorize.ts lib/auth/authorize.test.ts auth.ts
git commit -m "feat(auth): add no_password authorize reason for Google-only accounts"
```

---

### Task 3: Passwordless account handling in change-password / delete-account

**Files:**

- Modify: `lib/account/settings.ts`
- Test: `lib/account/settings.test.ts`
- Test: `app/api/account/password/route.test.ts`
- Test: `app/api/account/route.test.ts`

No route code changes in this task — `app/api/account/password/route.ts` and `app/api/account/route.ts` already pass `user.passwordHash` straight through, and `lib/schemas/account.ts`'s `AccountPasswordBodySchema.currentPassword` is already `.optional()`. Only the pure functions and their tests change.

**Interfaces:**

- Consumes: nothing new.
- Produces: `changePassword(deps, currentPassword, newPassword, storedHash: string | null)`, `verifyForDeletion(deps, password, storedHash: string | null)` — both consumed later by Task 6 (`PasswordSection`, via the existing route) and Task 7 (`DangerZoneSection`, via the existing route).

- [ ] **Step 1: Write the failing tests**

In `lib/account/settings.test.ts`, change the import line to add `vi`:

```ts
import { describe, it, expect, vi } from "vitest";
```

Then add these two new `describe` blocks at the end of the file:

```ts
describe("changePassword with no existing password (Google-only account)", () => {
  it("sets a new password without checking any current password", async () => {
    const verify = vi.fn(async () => false); // would fail this test if ever called
    const r = await changePassword(
      deps({ verify }),
      undefined,
      "newpassword1",
      null,
    );
    expect(r).toEqual({ ok: true, newHash: "HASHED(newpassword1)" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("still rejects a too-short new password", async () => {
    const r = await changePassword(deps(), undefined, "short", null);
    expect(r).toEqual({ ok: false, error: "weak_password" });
  });
});

describe("verifyForDeletion with no existing password (Google-only account)", () => {
  it("returns true regardless of the supplied password", async () => {
    const verify = vi.fn(async () => false);
    expect(await verifyForDeletion(deps({ verify }), undefined, null)).toBe(
      true,
    );
    expect(verify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run lib/account/settings.test.ts --project node`
Expected: FAIL — today's `storedHash` parameter is typed `string`, and passing `null` currently still runs `typeof currentPassword === "string" && ...` which short-circuits false on `undefined`, so `changePassword` returns `wrong_password`, not `{ ok: true, ... }`; `verifyForDeletion` currently returns `false` for `undefined`, not `true`.

- [ ] **Step 3: Implement the `null`-hash branches**

In `lib/account/settings.ts`, change:

```ts
export async function changePassword(
  deps: PasswordDeps,
  currentPassword: unknown,
  newPassword: unknown,
  storedHash: string,
): Promise<ChangePasswordResult> {
  const currentOk =
    typeof currentPassword === "string" &&
    (await deps.verify(currentPassword, storedHash));
  if (!currentOk) return { ok: false, error: "wrong_password" };

  if (!validateNewPassword(newPassword)) {
    return { ok: false, error: "weak_password" };
  }

  const newHash = await deps.hash(newPassword);
  return { ok: true, newHash };
}
```

to:

```ts
export async function changePassword(
  deps: PasswordDeps,
  currentPassword: unknown,
  newPassword: unknown,
  storedHash: string | null,
): Promise<ChangePasswordResult> {
  // #235: a Google-only account (storedHash null) has nothing to verify a
  // current password against -- this is the "Definir senha" flow, not
  // "Alterar senha", so the check is skipped entirely rather than treated
  // as an always-wrong comparison.
  if (storedHash !== null) {
    const currentOk =
      typeof currentPassword === "string" &&
      (await deps.verify(currentPassword, storedHash));
    if (!currentOk) return { ok: false, error: "wrong_password" };
  }

  if (!validateNewPassword(newPassword)) {
    return { ok: false, error: "weak_password" };
  }

  const newHash = await deps.hash(newPassword);
  return { ok: true, newHash };
}
```

And change:

```ts
export async function verifyForDeletion(
  deps: Pick<PasswordDeps, "verify">,
  password: unknown,
  storedHash: string,
): Promise<boolean> {
  if (typeof password !== "string") return false;
  return deps.verify(password, storedHash);
}
```

to:

```ts
export async function verifyForDeletion(
  deps: Pick<PasswordDeps, "verify">,
  password: unknown,
  storedHash: string | null,
): Promise<boolean> {
  // #235: ownership is already established by the session -- for a
  // Google-only account the password check was always the second factor,
  // never the only one, so there is nothing to verify against here.
  if (storedHash === null) return true;
  if (typeof password !== "string") return false;
  return deps.verify(password, storedHash);
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npx vitest run lib/account/settings.test.ts --project node`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Extend the route tests**

In `app/api/account/password/route.test.ts`, add this test inside `describe("POST /api/account/password", ...)`:

```ts
it("sets a password with no currentPassword when the account has none yet", async () => {
  vi.mocked(getUserById).mockResolvedValue({ ...user, passwordHash: null });
  vi.mocked(hashPassword).mockResolvedValue("NEW_HASH");
  const res = await POST(req({ newPassword: "newpassword1" }));
  expect(verifyPassword).not.toHaveBeenCalled();
  expect(updateUserPasswordHash).toHaveBeenCalledWith("u1", "NEW_HASH");
  expect(await res.json()).toEqual({ status: "ok" });
});
```

In `app/api/account/route.test.ts`, add this test inside `describe("DELETE /api/account", ...)`:

```ts
it("deletes the account with no password when the account has none set", async () => {
  vi.mocked(getUserById).mockResolvedValue({ ...user, passwordHash: null });
  const res = await DELETE(req({}));
  expect(verifyPassword).not.toHaveBeenCalled();
  expect(deleteUser).toHaveBeenCalledWith("u1");
  expect(await res.json()).toEqual({ status: "ok" });
});
```

- [ ] **Step 6: Run the route tests, verify they pass**

Run: `npx vitest run app/api/account --project node`
Expected: PASS (all tests in both files — this step doesn't need a preceding "fails first", since the route code already threads `passwordHash` straight through and Step 3 already made the pure functions handle `null`).

- [ ] **Step 7: Commit**

```bash
git add lib/account/settings.ts lib/account/settings.test.ts app/api/account/password/route.test.ts app/api/account/route.test.ts
git commit -m "feat(account): allow passwordless accounts to set a password / delete without one"
```

---

### Task 4: Retroactive email verification on Google link

**Files:**

- Modify: `lib/db/users.ts`
- Test: `lib/db/users.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `stampEmailVerifiedIfMissing(userId: string, now?: Date): Promise<void>`, consumed by `auth.ts`'s `signIn` callback in Task 5.

- [ ] **Step 1: Extend the hoisted Prisma mock**

In `lib/db/users.test.ts`, change:

```ts
const { update, del, findUnique, create } = vi.hoisted(() => ({
  update: vi.fn(async (_args: unknown) => undefined),
  del: vi.fn(async (_args: unknown) => undefined),
  findUnique: vi.fn(async (_args: unknown): Promise<unknown> => null),
  create: vi.fn(async (_args: unknown): Promise<unknown> => null),
}));
```

to:

```ts
const { update, updateMany, del, findUnique, create } = vi.hoisted(() => ({
  update: vi.fn(async (_args: unknown) => undefined),
  updateMany: vi.fn(async (_args: unknown) => undefined),
  del: vi.fn(async (_args: unknown) => undefined),
  findUnique: vi.fn(async (_args: unknown): Promise<unknown> => null),
  create: vi.fn(async (_args: unknown): Promise<unknown> => null),
}));
```

and change:

```ts
vi.mock("./prisma", () => ({
  prisma: {
    user: {
      update,
      delete: del,
      findUnique,
      create,
    },
  },
}));
```

to:

```ts
vi.mock("./prisma", () => ({
  prisma: {
    user: {
      update,
      updateMany,
      delete: del,
      findUnique,
      create,
    },
  },
}));
```

- [ ] **Step 2: Write the failing test**

Add this new `describe` block at the end of `lib/db/users.test.ts`, and add `stampEmailVerifiedIfMissing` to the import list from `./users`:

```ts
describe("stampEmailVerifiedIfMissing", () => {
  beforeEach(() => updateMany.mockClear());

  // #235: an existing Credentials account that never clicked its own mail
  // link, now proven by Google instead. The WHERE clause (not a
  // read-then-write) is what makes this a single atomic statement rather
  // than a race between a read and a write.
  it("targets only a row whose emailVerified is still null", async () => {
    const before = Date.now();
    await stampEmailVerifiedIfMissing("u1");
    const after = Date.now();

    expect(updateMany).toHaveBeenCalledTimes(1);
    const call = updateMany.mock.calls[0][0] as {
      where: { id: string; emailVerified: null };
      data: { emailVerified: Date };
    };
    expect(call.where).toEqual({ id: "u1", emailVerified: null });
    const stampedAt = call.data.emailVerified.getTime();
    expect(stampedAt).toBeGreaterThanOrEqual(before);
    expect(stampedAt).toBeLessThanOrEqual(after);
  });

  it("accepts an injected `now` for deterministic tests", async () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    await stampEmailVerifiedIfMissing("u1", now);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "u1", emailVerified: null },
      data: { emailVerified: now },
    });
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npx vitest run lib/db/users.test.ts --project node`
Expected: FAIL with "stampEmailVerifiedIfMissing is not a function" (or a TS "no exported member" if the runner type-checks).

- [ ] **Step 4: Implement `stampEmailVerifiedIfMissing`**

In `lib/db/users.ts`, add this function after `updateUserPasswordHash`:

```ts
// #235: retroactive verification on a Google link. An existing Credentials
// account that signed up but never clicked its own verification mail
// (emailVerified: null) gets it stamped here the moment it links a Google
// identity -- Google's own proof of ownership is strictly stronger evidence
// than an unclicked link, and this is what unblocks that account's
// Credentials login going forward too. A single updateMany with the null
// check in the WHERE clause (not a read-then-write) makes this one atomic
// statement -- it is simply a no-op for an already-verified row.
export async function stampEmailVerifiedIfMissing(
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, emailVerified: null },
    data: { emailVerified: now },
  });
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run lib/db/users.test.ts --project node`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Commit**

```bash
git add lib/db/users.ts lib/db/users.test.ts
git commit -m "feat(auth): stamp emailVerified when an unverified account links Google"
```

---

### Task 5: Wire the Google provider into `auth.ts`

**Files:**

- Modify: `package.json` (add `@auth/prisma-adapter`)
- Modify: `.env.example`
- Modify: `auth.ts`

No new automated test in this task — `auth.ts` itself has no `.test.ts` file anywhere in this repo (Auth.js wiring is verified live, the same way `trustHost`/`useSecureCookies` already are). This task's own correctness rests on Tasks 2 and 4's unit tests plus the manual end-to-end check at the very end of this plan, once Task 8 gives the button somewhere to click.

**Interfaces:**

- Consumes: `NoPasswordError` (Task 2), `stampEmailVerifiedIfMissing` (Task 4).
- Produces: nothing new consumed by a later task — this is where the wiring lands.

- [ ] **Step 1: Install the adapter**

Run: `npm install @auth/prisma-adapter`
Expected: added to `package.json` dependencies, resolving against the installed `next-auth@^5.0.0-beta.32` / `@prisma/client@^6.19.3`. If npm reports a peer-dependency conflict, resolve it by pinning to the latest `@auth/prisma-adapter` version compatible with `next-auth@5` beta (check its `peerDependencies` in `node_modules/@auth/prisma-adapter/package.json` after install) — do not force-install past a real incompatibility.

- [ ] **Step 2: Add the env vars**

In `.env.example`, add a new block. Find the `--- payment gateway (#6/#206) ---` section and insert a new section right before it:

```
# --- Google sign-in (#235) ---
# Required only when Google sign-in is exercised -- omit both and the
# provider is still registered (Auth.js does not fail startup on a missing
# client secret), but every attempt to use it will fail at Google's own
# authorization step. Create an OAuth 2.0 Client ID at
# https://console.cloud.google.com/apis/credentials, type "Web application",
# with an authorized redirect URI of {APP_URL}/api/auth/callback/google.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

```

- [ ] **Step 3: Add the provider, adapter, and `signIn` callback**

In `auth.ts`, add these imports at the top, alongside the existing ones:

```ts
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import { stampEmailVerifiedIfMissing } from "@/lib/db/users";
```

Then change:

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Self-hosted (Docker/`next start`): Auth.js v5 only trusts the host
  // automatically in dev. In production, without this every auth request fails with UntrustedHost.
  trustHost: true,
```

to:

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  // #235: only used for Google account-linking (Account rows) -- session
  // storage stays JWT (below), so Session/VerificationToken are never
  // actually written. See docs/decisions.md's Authentication section.
  adapter: PrismaAdapter(prisma),
  // Self-hosted (Docker/`next start`): Auth.js v5 only trusts the host
  // automatically in dev. In production, without this every auth request fails with UntrustedHost.
  trustHost: true,
```

Then find the `providers: [` array and change:

```ts
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
        if (result.reason === "no_password") throw new NoPasswordError();
        return null;
      },
    }),
  ],
```

to:

```ts
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
        if (result.reason === "no_password") throw new NoPasswordError();
        return null;
      },
    }),
    Google({
      // #235: Google verifies email ownership itself -- exactly the trust
      // this repo already places in its own mailed verification link -- so
      // a Google sign-in auto-links to an existing Credentials row sharing
      // that email instead of throwing OAuthAccountNotLinked. The signIn
      // callback below adds one more check on top: it refuses the sign-in
      // outright if Google's own profile claims the email is NOT verified,
      // so this flag is never trusted blindly on its own.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
```

Then find the `callbacks: {` block and change:

```ts
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = (user as { id: string }).id;
      return token;
    },
```

to:

```ts
  callbacks: {
    async signIn({ account, user, profile }) {
      if (account?.provider !== "google") return true;
      // #235: the raw Google profile (not the adapter-mapped `user`) is
      // what carries email_verified -- a defensive second check on top of
      // allowDangerousEmailAccountLinking, never trusting that flag alone.
      const emailVerified =
        (profile as { email_verified?: boolean } | undefined)
          ?.email_verified === true;
      if (!emailVerified) return false;
      // Retroactive verification: an existing Credentials row that never
      // clicked its own mail link gets emailVerified stamped now, from
      // strictly stronger evidence. No-ops for an already-verified row and
      // for a brand-new user (the adapter already stamped it on creation).
      if (user.id) await stampEmailVerifiedIfMissing(user.id);
      return true;
    },
    jwt({ token, user }) {
      if (user) token.uid = (user as { id: string }).id;
      return token;
    },
```

- [ ] **Step 4: Confirm it compiles and nothing broke**

Run: `npm run typecheck`
Run: `npx vitest run --project node`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example auth.ts
git commit -m "feat(auth): wire a real Google OAuth provider into auth.ts"
```

---

### Task 6: Settings — `hasPassword` plumbing + "Definir senha"

**Files:**

- Modify: `lib/api-client.ts` (`changePassword` signature)
- Modify: `app/settings/page.tsx`
- Modify: `components/settings/SettingsShell.tsx`
- Modify: `components/settings/SettingsShell.test.tsx`
- Modify: `components/settings/PasswordSection.tsx`
- Modify: `components/settings/PasswordSection.test.tsx`
- Modify: `messages/pt-BR.json` (`PasswordSection` namespace)

**Interfaces:**

- Consumes: `AccountActionResult` (existing, from `lib/api-client.ts`), Task 3's `changePassword`/route behavior.
- Produces: `PasswordSection({ hasPassword: boolean })`, `SettingsShell`'s new `hasPassword` prop — consumed by Task 7's `DangerZoneSection` (same prop, threaded from the same place).

- [ ] **Step 1: Add the new catalog copy**

In `messages/pt-BR.json`, find the `PasswordSection` object:

```json
  "PasswordSection": {
    "heading": "Alterar senha",
    "currentLabel": "Senha atual",
    "newLabel": "Nova senha",
    "confirmLabel": "Confirmar nova senha",
    "submitButton": "Alterar senha",
    "mismatchError": "As senhas não coincidem.",
    "tooShortError": "A nova senha deve ter pelo menos 8 caracteres.",
    "successMessage": "Senha alterada com sucesso.",
```

and add four keys right after `"successMessage"`:

```json
    "successMessage": "Senha alterada com sucesso.",
    "setHeading": "Definir senha",
    "setNote": "Sua conta usa login com Google. Defina uma senha para também poder entrar com email e senha.",
    "setSubmitButton": "Definir senha",
    "setSuccessMessage": "Senha definida com sucesso.",
```

Run the humanizer skill over these four new values before moving on (values only — keys untouched).

- [ ] **Step 2: Write the failing component tests**

In `components/settings/PasswordSection.test.tsx`, update every existing `renderWithIntl(<PasswordSection />)` call to `renderWithIntl(<PasswordSection hasPassword={true} />)` (there are four such calls in the file — one per `it`).

Then add this new `describe` block at the end of the file:

```ts
describe("PasswordSection when the account has no password yet", () => {
  afterEach(() => vi.mocked(changePassword).mockReset());

  it("renders the 'Definir senha' heading with no current-password field", () => {
    renderWithIntl(<PasswordSection hasPassword={false} />);

    expect(
      screen.getByRole("heading", { name: ptBR.PasswordSection.setHeading }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText(ptBR.PasswordSection.currentLabel),
    ).toBeNull();
  });

  it("submits with no current password and shows the set-specific success message", async () => {
    vi.mocked(changePassword).mockResolvedValue({ status: "ok" });
    renderWithIntl(<PasswordSection hasPassword={false} />);

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.newLabel),
      "new-password-1",
    );
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.confirmLabel),
      "new-password-1",
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.PasswordSection.setSubmitButton,
      }),
    );

    expect(changePassword).toHaveBeenCalledWith(undefined, "new-password-1");
    await waitFor(() => {
      expect(
        screen.getByText(ptBR.PasswordSection.setSuccessMessage),
      ).toBeVisible();
    });
  });
});
```

- [ ] **Step 3: Run the tests, verify they fail**

Run: `npx vitest run components/settings/PasswordSection.test.tsx --project dom`
Expected: FAIL — `PasswordSection` does not yet accept a `hasPassword` prop, so `hasPassword={true}` on the existing calls is currently a no-op (those still pass, but only by accident) and the two new tests fail: there is no `setHeading`, no `setSubmitButton`, and the current-password field is always rendered.

- [ ] **Step 4: Update `PasswordSection.tsx`**

Replace the whole file with:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { changePassword } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@/lib/account/settings";

export function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations("PasswordSection");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const canSubmit =
    (hasPassword ? current.length > 0 : true) &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm;

  async function submit() {
    if (!canSubmit) return;
    setStatus("saving");
    setError(null);
    try {
      const result = await changePassword(
        hasPassword ? current : undefined,
        next,
      );
      if (result.status === "ok") {
        setStatus("ok");
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setStatus("error");
        setError(
          result.error ? t(`errors.${result.error}`) : t("tooShortError"),
        );
      }
    } catch {
      setStatus("error");
      setError(t("errors.bad_body"));
    }
  }

  return (
    <section className="bg-surface border-border rounded-card flex flex-col gap-3 border p-[18px]">
      <h2 className="font-display text-body font-semibold">
        {hasPassword ? t("heading") : t("setHeading")}
      </h2>
      {!hasPassword && (
        <p className="text-muted-2 text-ui leading-[1.5]">{t("setNote")}</p>
      )}
      <FieldGroup className="max-w-[420px]">
        {hasPassword && (
          <Field data-invalid={status === "error" || undefined}>
            <FieldLabel htmlFor="password-current">
              {t("currentLabel")}
            </FieldLabel>
            <Input
              id="password-current"
              type="password"
              value={current}
              aria-invalid={status === "error" || undefined}
              onChange={(event) => setCurrent(event.target.value)}
            />
            {status === "error" && error && <FieldError>{error}</FieldError>}
          </Field>
        )}
        <Field data-invalid={(!hasPassword && status === "error") || undefined}>
          <FieldLabel htmlFor="password-new">{t("newLabel")}</FieldLabel>
          <Input
            id="password-new"
            type="password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
          />
          {!hasPassword && status === "error" && error && (
            <FieldError>{error}</FieldError>
          )}
        </Field>
        <Field data-invalid={mismatch || undefined}>
          <FieldLabel htmlFor="password-confirm">
            {t("confirmLabel")}
          </FieldLabel>
          <Input
            id="password-confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            maxLength={MAX_PASSWORD_LENGTH}
            aria-invalid={mismatch || undefined}
          />
          {mismatch && <FieldError>{t("mismatchError")}</FieldError>}
        </Field>
      </FieldGroup>
      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={!canSubmit || status === "saving"}>
          {hasPassword ? t("submitButton") : t("setSubmitButton")}
        </Button>
        {status === "ok" && (
          <span className="text-olive-dark text-ui">
            {hasPassword ? t("successMessage") : t("setSuccessMessage")}
          </span>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Update `changePassword` in `lib/api-client.ts`**

Change:

```ts
export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AccountActionResult> {
  return postJson<AccountActionResult>(
    "/api/account/password",
    { currentPassword, newPassword },
    DOMAIN_ERRORS,
  );
}
```

to:

```ts
export function changePassword(
  currentPassword: string | undefined,
  newPassword: string,
): Promise<AccountActionResult> {
  return postJson<AccountActionResult>(
    "/api/account/password",
    { currentPassword, newPassword },
    DOMAIN_ERRORS,
  );
}
```

- [ ] **Step 6: Run the component tests, verify they pass**

Run: `npx vitest run components/settings/PasswordSection.test.tsx --project dom`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Thread `hasPassword` through `SettingsShell` and the page**

In `components/settings/SettingsShell.tsx`, change:

```tsx
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
```

to:

```tsx
export function SettingsShell({
  userEmail,
  initialName,
  hasPassword,
  credits,
  ledger,
  activeSection,
}: {
  userEmail: string;
  initialName: string;
  hasPassword: boolean;
  credits: Credits;
  ledger: LedgerHistoryEntry[];
  activeSection: SettingsSection;
}) {
```

and change:

```tsx
{
  activeSection === "password" && <PasswordSection />;
}
```

to:

```tsx
{
  activeSection === "password" && <PasswordSection hasPassword={hasPassword} />;
}
```

(leave the `"danger"` branch as-is for now — Task 7 updates it.)

In `app/settings/page.tsx`, change:

```tsx
return (
  <SettingsShell
    userEmail={session.user.email}
    initialName={user?.name ?? ""}
    credits={buildCredits(wallet, new Date())}
    ledger={ledger}
    activeSection={parseSection(params.section)}
  />
);
```

to:

```tsx
return (
  <SettingsShell
    userEmail={session.user.email}
    initialName={user?.name ?? ""}
    hasPassword={user.passwordHash !== null}
    credits={buildCredits(wallet, new Date())}
    ledger={ledger}
    activeSection={parseSection(params.section)}
  />
);
```

- [ ] **Step 8: Update `SettingsShell.test.tsx`'s render helper**

Change:

```tsx
function renderShell(activeSection: SettingsSection) {
  return renderWithIntl(
    <SettingsShell
      userEmail="ana@example.com"
      initialName="Ana"
      credits={CREDITS}
      ledger={LEDGER}
      activeSection={activeSection}
    />,
  );
}
```

to:

```tsx
function renderShell(
  activeSection: SettingsSection,
  hasPassword: boolean = true,
) {
  return renderWithIntl(
    <SettingsShell
      userEmail="ana@example.com"
      initialName="Ana"
      hasPassword={hasPassword}
      credits={CREDITS}
      ledger={LEDGER}
      activeSection={activeSection}
    />,
  );
}
```

(`hasPassword` defaults to `true` so every existing call site — none of which pass a second argument — keeps rendering the `PasswordSection.currentLabel` marker the `PANEL_MARKER` map already relies on.)

- [ ] **Step 9: Run the full settings test suite, verify it passes**

Run: `npx vitest run components/settings app/settings --project dom`
Run: `npx vitest run app/settings --project node` (if a `page.test.tsx` exists — check with `ls app/settings/*.test.tsx`; skip this line if it does not)
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/api-client.ts app/settings/page.tsx components/settings/SettingsShell.tsx components/settings/SettingsShell.test.tsx components/settings/PasswordSection.tsx components/settings/PasswordSection.test.tsx messages/pt-BR.json
git commit -m "feat(settings): let a Google-only account set a password"
```

---

### Task 7: DangerZoneSection — skip the password check when there isn't one

**Files:**

- Modify: `lib/api-client.ts` (`deleteAccount` signature)
- Modify: `components/settings/SettingsShell.tsx` (thread `hasPassword` into the `"danger"` branch)
- Modify: `components/settings/DangerZoneSection.tsx`
- Modify: `components/settings/DangerZoneSection.test.tsx`

**Interfaces:**

- Consumes: `hasPassword` (Task 6, already threaded onto `SettingsShell`).
- Produces: `DangerZoneSection({ userEmail, hasPassword })`.

- [ ] **Step 1: Write the failing tests**

In `components/settings/DangerZoneSection.test.tsx`, update every existing `renderWithIntl(<DangerZoneSection userEmail={USER_EMAIL} />)` call to `renderWithIntl(<DangerZoneSection userEmail={USER_EMAIL} hasPassword={true} />)` (four calls in the file).

Then add this new `describe` block at the end of the file:

```ts
describe("DangerZoneSection when the account has no password", () => {
  afterEach(() => vi.mocked(deleteAccount).mockReset());

  it("renders with no password field, gated on the typed email alone", async () => {
    renderWithIntl(
      <DangerZoneSection userEmail={USER_EMAIL} hasPassword={false} />,
    );
    expect(screen.queryByLabelText(ptBR.DangerZoneSection.passwordLabel)).toBeNull();

    const user = userEvent.setup();
    const button = screen.getByRole("button", {
      name: ptBR.DangerZoneSection.submitButton,
    });
    expect(button).toBeDisabled();

    await user.type(
      screen.getByLabelText(
        ptBR.DangerZoneSection.emailConfirmLabel.replace("{email}", USER_EMAIL),
      ),
      USER_EMAIL,
    );
    expect(button).not.toBeDisabled();
  });

  it("calls deleteAccount with no password", async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ status: "ok" });
    renderWithIntl(
      <DangerZoneSection userEmail={USER_EMAIL} hasPassword={false} />,
    );

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(
        ptBR.DangerZoneSection.emailConfirmLabel.replace("{email}", USER_EMAIL),
      ),
      USER_EMAIL,
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.DangerZoneSection.submitButton,
      }),
    );

    expect(deleteAccount).toHaveBeenCalledWith(undefined);
  });

  it("still shows an error from a failed delete with no password field to attach it to", async () => {
    vi.mocked(deleteAccount).mockResolvedValue({
      status: "error",
      error: "account_not_found",
    });
    renderWithIntl(
      <DangerZoneSection userEmail={USER_EMAIL} hasPassword={false} />,
    );

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(
        ptBR.DangerZoneSection.emailConfirmLabel.replace("{email}", USER_EMAIL),
      ),
      USER_EMAIL,
    );
    await user.click(
      screen.getByRole("button", {
        name: ptBR.DangerZoneSection.submitButton,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.DangerZoneSection.errors.account_not_found),
      ).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run components/settings/DangerZoneSection.test.tsx --project dom`
Expected: FAIL — `DangerZoneSection` does not yet accept `hasPassword`, always renders the password field, and always requires `password.length > 0` to enable the button.

- [ ] **Step 3: Update `DangerZoneSection.tsx`**

Replace the whole file with:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { deleteAccount } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function DangerZoneSection({
  userEmail,
  hasPassword,
}: {
  userEmail: string;
  hasPassword: boolean;
}) {
  const t = useTranslations("DangerZoneSection");
  const [typedEmail, setTypedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "deleting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    typedEmail === userEmail && (hasPassword ? password.length > 0 : true);

  async function submit() {
    if (!canSubmit) return;
    setStatus("deleting");
    setError(null);
    try {
      const result = await deleteAccount(hasPassword ? password : undefined);
      if (result.status === "ok") {
        await signOut({ callbackUrl: "/login" });
      } else {
        setStatus("error");
        setError(
          result.error ? t(`errors.${result.error}`) : t("genericError"),
        );
      }
    } catch {
      setStatus("error");
      setError(t("genericError"));
    }
  }

  return (
    <section className="bg-amber-bg border-alert rounded-card flex flex-col gap-3 border p-[18px]">
      <h2 className="text-alert font-display text-body font-semibold">
        {t("heading")}
      </h2>
      <p className="text-muted-2 text-ui leading-[1.5]">{t("warning")}</p>
      <FieldGroup className="max-w-[420px]">
        <Field>
          <FieldLabel htmlFor="danger-email">
            {t("emailConfirmLabel", { email: userEmail })}
          </FieldLabel>
          <Input
            id="danger-email"
            className="bg-surface"
            value={typedEmail}
            onChange={(event) => setTypedEmail(event.target.value)}
          />
        </Field>
        {hasPassword && (
          <Field data-invalid={status === "error" || undefined}>
            <FieldLabel htmlFor="danger-password">
              {t("passwordLabel")}
            </FieldLabel>
            <Input
              id="danger-password"
              className="bg-surface"
              type="password"
              value={password}
              aria-invalid={status === "error" || undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
            {status === "error" && error && <FieldError>{error}</FieldError>}
          </Field>
        )}
      </FieldGroup>
      {!hasPassword && status === "error" && error && (
        <p className="text-alert text-ui">{error}</p>
      )}
      <div>
        <Button
          variant="destructiveOutline"
          onClick={submit}
          disabled={!canSubmit || status === "deleting"}
        >
          {t("submitButton")}
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Update `deleteAccount` in `lib/api-client.ts`**

Change:

```ts
export function deleteAccount(password: string): Promise<AccountActionResult> {
  return sendJson<AccountActionResult>(
    "/api/account",
    "DELETE",
    { password },
    DOMAIN_ERRORS,
  );
}
```

to:

```ts
export function deleteAccount(
  password: string | undefined,
): Promise<AccountActionResult> {
  return sendJson<AccountActionResult>(
    "/api/account",
    "DELETE",
    { password },
    DOMAIN_ERRORS,
  );
}
```

- [ ] **Step 5: Thread `hasPassword` into `SettingsShell`'s `"danger"` branch**

In `components/settings/SettingsShell.tsx`, change:

```tsx
{
  activeSection === "danger" && <DangerZoneSection userEmail={userEmail} />;
}
```

to:

```tsx
{
  activeSection === "danger" && (
    <DangerZoneSection userEmail={userEmail} hasPassword={hasPassword} />
  );
}
```

- [ ] **Step 6: Run the tests, verify they pass**

Run: `npx vitest run components/settings --project dom`
Expected: PASS (all tests, including `SettingsShell.test.tsx`'s pre-existing `danger` case, since its `renderShell` helper already defaults `hasPassword` to `true`).

- [ ] **Step 7: Commit**

```bash
git add lib/api-client.ts components/settings/SettingsShell.tsx components/settings/DangerZoneSection.tsx components/settings/DangerZoneSection.test.tsx
git commit -m "feat(settings): skip the account-deletion password check for passwordless accounts"
```

---

### Task 8: Login/Signup — the Google button

**Files:**

- Create: `components/auth/GoogleIcon.tsx`
- Modify: `components/auth/LoginCard.tsx`
- Modify: `components/auth/LoginCard.test.tsx`
- Modify: `components/auth/SignupCard.tsx`
- Modify: `components/auth/SignupCard.test.tsx`
- Modify: `messages/pt-BR.json` (`Login`/`Signup` namespaces)

**Interfaces:**

- Consumes: `signIn` from `next-auth/react` (already imported in `LoginCard.tsx`; new import in `SignupCard.tsx`).
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Add the catalog copy**

In `messages/pt-BR.json`, find the `Login` object's `"forgotPasswordLink"` key:

```json
    "forgotPasswordLink": "Esqueci minha senha",
```

and add two keys right after it:

```json
    "forgotPasswordLink": "Esqueci minha senha",
    "orDivider": "ou",
    "continueWithGoogle": "Continuar com Google",
```

In the `Signup` object, find `"mismatchError"`:

```json
    "mismatchError": "As senhas não conferem.",
```

and add the same two keys right after it:

```json
    "mismatchError": "As senhas não conferem.",
    "orDivider": "ou",
    "continueWithGoogle": "Continuar com Google",
```

Run the humanizer skill over these values before moving on (both namespaces carry identical short chrome strings — still a real pass, not a skip).

- [ ] **Step 2: Create the Google icon**

Create `components/auth/GoogleIcon.tsx`:

```tsx
// The standard four-color Google "G" mark, used for a "Continuar com
// Google" button per Google's own sign-in button guidelines. Purely
// visual -- no text, so no i18n namespace, unlike every other component in
// this directory.
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29A11.96 11.96 0 000 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}
```

- [ ] **Step 3: Write the failing test for `LoginCard`**

In `components/auth/LoginCard.test.tsx`, add this test at the end of the `describe("LoginCard", ...)` block:

```ts
  it("starts the Google OAuth flow with a real redirect", async () => {
    renderWithIntl(<LoginCard />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: ptBR.Login.continueWithGoogle }),
    );
    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/" });
  });
```

- [ ] **Step 4: Run it, verify it fails**

Run: `npx vitest run components/auth/LoginCard.test.tsx --project dom`
Expected: FAIL — no button with that name exists yet.

- [ ] **Step 5: Add the button to `LoginCard.tsx`**

In `components/auth/LoginCard.tsx`, add the icon import:

```ts
import { GoogleIcon } from "@/components/auth/GoogleIcon";
```

Then, between the closing `</form>` and the `signupNote` paragraph, change:

```tsx
        <Button type="submit" disabled={loading} className="mt-1">
          {loading ? t("submitButtonLoading") : t("submitButton")}
        </Button>
      </form>
      <p className="text-muted text-meta mt-4">
```

to:

```tsx
        <Button type="submit" disabled={loading} className="mt-1">
          {loading ? t("submitButtonLoading") : t("submitButton")}
        </Button>
      </form>
      <div className="my-1 flex items-center gap-3">
        <div className="bg-border h-px flex-1" />
        <span className="text-muted text-meta">{t("orDivider")}</span>
        <div className="bg-border h-px flex-1" />
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="gap-2"
      >
        <GoogleIcon className="size-4" />
        {t("continueWithGoogle")}
      </Button>
      <p className="text-muted text-meta mt-4">
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `npx vitest run components/auth/LoginCard.test.tsx --project dom`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Write the failing test for `SignupCard`**

In `components/auth/SignupCard.test.tsx`, add a `signIn` mock (`SignupCard` doesn't call it today) — change:

```ts
vi.mock("@/lib/api-client", () => ({
  signUp: vi.fn(),
  resendVerification: vi.fn(),
}));

import SignupCard from "./SignupCard";
import { signUp, resendVerification } from "@/lib/api-client";
```

to:

```ts
vi.mock("@/lib/api-client", () => ({
  signUp: vi.fn(),
  resendVerification: vi.fn(),
}));

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

import SignupCard from "./SignupCard";
import { signUp, resendVerification } from "@/lib/api-client";
```

Then add this test at the end of the `describe("SignupCard", ...)` block (check the exact `describe` name in the file — it should already exist further down):

```ts
  it("starts the Google OAuth flow with a real redirect", async () => {
    renderWithIntl(<SignupCard />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: ptBR.Signup.continueWithGoogle }),
    );
    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/" });
  });
```

- [ ] **Step 8: Run it, verify it fails**

Run: `npx vitest run components/auth/SignupCard.test.tsx --project dom`
Expected: FAIL — no button with that name exists yet.

- [ ] **Step 9: Add the button to `SignupCard.tsx`**

Add these imports:

```ts
import { signIn } from "next-auth/react";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
```

Then, still inside the `) : (` (not-yet-`sent`) branch, change:

```tsx
          <Button
            type="submit"
            disabled={!canSubmit || loading}
            className="mt-1"
          >
            {loading ? t("submitButtonLoading") : t("submitButton")}
          </Button>
        </form>
      )}
```

to:

```tsx
          <Button
            type="submit"
            disabled={!canSubmit || loading}
            className="mt-1"
          >
            {loading ? t("submitButtonLoading") : t("submitButton")}
          </Button>
        </form>
      )}
      {!sent && (
        <>
          <div className="my-1 flex items-center gap-3">
            <div className="bg-border h-px flex-1" />
            <span className="text-muted text-meta">{t("orDivider")}</span>
            <div className="bg-border h-px flex-1" />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="gap-2"
          >
            <GoogleIcon className="size-4" />
            {t("continueWithGoogle")}
          </Button>
        </>
      )}
```

(placed as its own sibling `{!sent && ...}` block right after the ternary, rather than inside the `form`, so it survives untouched if the form's own JSX is edited later — and stays hidden once the card has swapped to its post-signup "confirme seu email" state.)

- [ ] **Step 10: Run the test, verify it passes**

Run: `npx vitest run components/auth/SignupCard.test.tsx --project dom`
Expected: PASS (all tests in the file).

- [ ] **Step 11: Commit**

```bash
git add components/auth/GoogleIcon.tsx components/auth/LoginCard.tsx components/auth/LoginCard.test.tsx components/auth/SignupCard.tsx components/auth/SignupCard.test.tsx messages/pt-BR.json
git commit -m "feat(auth): add the Continuar com Google button to Login and Signup"
```

---

### Task 9: LoginCard — surface a failed Google OAuth redirect

**Files:**

- Modify: `components/auth/LoginCard.tsx`
- Modify: `components/auth/LoginCard.test.tsx`
- Modify: `messages/pt-BR.json` (`Login.errors`)

**Interfaces:**

- Consumes: nothing new.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Add the catalog copy**

In `messages/pt-BR.json`, find `Login.errors`:

```json
    "errors": {
      "invalid_credentials": "Email ou senha inválidos.",
```

and add two keys right after the opening brace:

```json
    "errors": {
      "AccessDenied": "Você cancelou o login com Google.",
      "oauth_generic": "Não foi possível entrar com o Google. Tente novamente.",
      "invalid_credentials": "Email ou senha inválidos.",
```

Run the humanizer skill over these two new values before moving on.

- [ ] **Step 2: Write the failing tests**

In `components/auth/LoginCard.test.tsx`, change the top-of-file vitest import to add `afterEach`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
```

Then change the `next/navigation` mock:

```ts
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
```

to:

```ts
const push = vi.fn();
const refresh = vi.fn();
const useSearchParamsMock = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => useSearchParamsMock(),
}));
```

Then add this new `describe` block at the end of the file (still inside or after the existing `describe("LoginCard", ...)` — as a sibling top-level `describe`):

```ts
describe("LoginCard OAuth error banner", () => {
  afterEach(() => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it("shows a cancelled-login message when Google returns AccessDenied", () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("error=AccessDenied"),
    );
    renderWithIntl(<LoginCard />);
    expect(screen.getByText(ptBR.Login.errors.AccessDenied)).toBeVisible();
  });

  it("shows a generic OAuth error for an unrecognised code", () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("error=Configuration"),
    );
    renderWithIntl(<LoginCard />);
    expect(screen.getByText(ptBR.Login.errors.oauth_generic)).toBeVisible();
  });

  it("shows no OAuth error banner when there is no error param", () => {
    renderWithIntl(<LoginCard />);
    expect(screen.queryByText(ptBR.Login.errors.AccessDenied)).toBeNull();
    expect(screen.queryByText(ptBR.Login.errors.oauth_generic)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests, verify they fail**

Run: `npx vitest run components/auth/LoginCard.test.tsx --project dom`
Expected: FAIL — `LoginCard` doesn't call `useSearchParams` yet, so no banner ever renders.

- [ ] **Step 4: Implement the banner in `LoginCard.tsx`**

Add the import:

```ts
import { useRouter, useSearchParams } from "next/navigation";
```

(replacing the existing `import { useRouter } from "next/navigation";` line.)

Add this pure helper above the component (or inline — keep it a plain function so it needs no React import of its own):

```ts
const KNOWN_OAUTH_ERROR_CODES = ["AccessDenied"] as const;

function resolveOAuthErrorKey(code: string | null): string | null {
  if (!code) return null;
  return (KNOWN_OAUTH_ERROR_CODES as readonly string[]).includes(code)
    ? code
    : "oauth_generic";
}
```

Inside the component, add:

```ts
const searchParams = useSearchParams();
const oauthErrorKey = resolveOAuthErrorKey(searchParams.get("error"));
```

right after the existing `const router = useRouter();` line.

Then render the banner right before the `<form>`, changing:

```tsx
  return (
    <>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
```

to:

```tsx
  return (
    <>
      {oauthErrorKey && (
        <p className="text-alert text-ui mt-3">
          {t(`errors.${oauthErrorKey}`)}
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
```

- [ ] **Step 5: Run the tests, verify they pass**

Run: `npx vitest run components/auth/LoginCard.test.tsx --project dom`
Expected: PASS (all tests in the file, including Task 8's).

- [ ] **Step 6: Commit**

```bash
git add components/auth/LoginCard.tsx components/auth/LoginCard.test.tsx messages/pt-BR.json
git commit -m "feat(auth): surface a failed Google OAuth redirect on /login"
```

---

### Task 10: Documentation — CLAUDE.md + docs/decisions.md

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/decisions.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update CLAUDE.md's Auth bullet**

Find the end of the existing `- **Auth:** ...` bullet in the `## What this is` section (the sentence ending "...`[rate-limit] … failing open` — the documented trade-off, observed.") and append a new paragraph right after it, still inside the same bullet:

```markdown
**Google OAuth (#235) is a second, fully working provider, not decorative.** `auth.ts` adds a `Google` provider alongside Credentials, backed by `@auth/prisma-adapter` (new `Account`/`Session`/`VerificationToken` Prisma models) — session strategy stays JWT throughout, the one combination Auth.js supports alongside Credentials. `allowDangerousEmailAccountLinking: true` lets a Google sign-in auto-link to an existing Credentials `User` sharing that email — deliberate, because Google verifies email ownership itself; a `signIn` callback re-checks `profile.email_verified === true` before allowing it, never trusting the flag alone. Linking to an existing _unverified_ Credentials row also stamps `emailVerified` now (`lib/db/users.ts`'s `stampEmailVerifiedIfMissing`) — Google's proof is strictly stronger evidence than an unclicked mail link, and it unblocks that account's Credentials login too. A brand-new Google signup skips MoldAI's own verification mail entirely. `Session`/`VerificationToken` exist only to satisfy the adapter's contract and are never written to — this app keeps JWT sessions and its own `EmailVerificationToken`/`PasswordResetToken`. `User.passwordHash` is nullable: a Google-only account has none, and `authorizeUser` returns a fourth `AuthorizeResult` reason, `no_password`, for a Credentials attempt against one. `/settings`'s `PasswordSection` lets that account set a password once (no current-password field); until it does, `DangerZoneSection`'s account-deletion password check is skipped (email-match only). _No live Google Cloud OAuth client has been exercised from this repo_ — same caveat as Stripe: built and unit-tested, verified live only by whoever supplies real `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. Full rationale: [`docs/decisions.md`](docs/decisions.md).
```

- [ ] **Step 2: Add the `docs/decisions.md` section**

Add a new `### Authentication (Google OAuth, #235)` section. Insert it right after the `### Billing (real; only the gateway is mocked)` section and before `## Conventions` (matching the file's existing top-to-bottom ordering of `###` sections under no particular `##` grouping other than being architecture topics):

```markdown
### Authentication (Google OAuth, #235)

- **`allowDangerousEmailAccountLinking: true` is the intended behavior here, not a misconfiguration left on by accident.** Auth.js's default — refuse a Google sign-in with `OAuthAccountNotLinked` whenever the email already names a `User` row with no linked `Account` — exists to protect providers that do NOT verify email ownership. Google does: its OAuth profile carries `email_verified`, and the `signIn` callback in `auth.ts` checks it explicitly (`profile.email_verified === true`) before ever reaching the adapter's auto-link path. The flag's own "dangerous" name describes the failure mode of trusting an unverified provider blindly; this repo never does that, because the callback runs first.
- **Linking also retroactively verifies an existing unverified Credentials account.** Before Google OAuth, an account that signed up but never clicked MoldAI's own mail link stayed locked out of Credentials login forever (or until it found that mail). Google's own proof of the same address is strictly stronger evidence than an unclicked link this repo sent itself, so `stampEmailVerifiedIfMissing` (`lib/db/users.ts`) fires on every Google sign-in and is a no-op for an already-verified row. This is a deliberate asymmetry: MoldAI's own verification flow (spec B, `2026-08-20-email-verification-design.md`) never retroactively grants access from a _different_ signal — Google is trusted here specifically because it is a second, independent verifier, not because the bar for "verified" was quietly lowered.
- **`Session` and `VerificationToken` exist and are permanently empty — a real, considered tradeoff, not an oversight.** `@auth/prisma-adapter` is typed against the full standard Auth.js schema; this app keeps JWT sessions (required anyway, since the Credentials provider cannot use database sessions) and already has its own `EmailVerificationToken`/`PasswordResetToken` for the flows Auth.js's own `VerificationToken` would otherwise back (its Email/magic-link provider, unused here). The alternative — a lightweight `googleId` column on `User` with no adapter at all — was considered and rejected: it would mean re-implementing account-linking logic (matching by email, creating the linking record, handling the at-least-once nature of an OAuth callback) that the adapter already gets right. Two empty tables were judged cheaper than that reimplementation.
- **No new rate-limit bucket for the Google/NextAuth routes.** Unlike Credentials, there is no password to brute-force behind `POST /api/auth/callback/google`, and neither `OAuthAccountNotLinked` nor `AccessDenied` reveals whether a given email has a MoldAI account — the enumeration concern the Credentials/password-reset buckets exist for doesn't apply here.
- **`User.passwordHash` became nullable rather than backfilled with a placeholder hash.** A Google-only account genuinely has no password; a fabricated unusable hash would be a value nothing could ever legitimately produce, indistinguishable at the type level from a real one, and every future `passwordHash` read site would need to know to treat it as fake. `null` makes "this account has no password" a fact the type system carries, which is what let `authorizeUser` (`no_password`), `changePassword`, and `verifyForDeletion` each get one explicit branch instead of a magic-string check.
```

- [ ] **Step 3: Run the convention hook manually and the full suite**

Run: `node .claude/hooks/check-conventions.mjs` (if invocable standalone — otherwise stage the changes and let the pre-commit hook run it)
Run: `npm test`
Run: `npm run typecheck`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/decisions.md
git commit -m "docs(auth): document the Google OAuth trust boundary and adapter tradeoff"
```

---

## Manual verification (after all tasks, done by the user)

Automated tests stop at the boundary of a real Google Cloud OAuth client — this list is what the user does once `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are in their own `.env.local`:

1. Register an OAuth 2.0 Client ID (Web application) at https://console.cloud.google.com/apis/credentials with authorized redirect URI `http://localhost:3000/api/auth/callback/google` (or the deployed `APP_URL` equivalent).
2. `npm run db:up` (fresh dev stack) then `npm run dev`.
3. Visit `/login`, click "Continuar com Google", complete the Google consent screen — lands back on `/` signed in, with a new `User` row (`emailVerified` already stamped) and one `Account` row.
4. Sign out, sign back in with the same Google account — no duplicate `User`/`Account` row created.
5. Create a Credentials account at `/signup` with the same email as a Google account (or vice versa: sign up via Credentials first, then click "Continuar com Google" on `/login` with that email) — confirm it signs into the _same_ `User` row rather than erroring or creating a second one.
6. In `/settings`, for a Google-only account, confirm `PasswordSection` shows "Definir senha" with no current-password field, and that setting one lets that account subsequently log in via Credentials too.
7. Deny consent on Google's screen deliberately — confirm `/login?error=AccessDenied` renders the cancelled-login message rather than a blank or broken page.
