# User Settings (Configurações do usuário) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/configuracoes` page (profile edit, password change, account deletion) wired up from the dashboard's currently-inert "Preferências" button, and extract a shared `PageHeader` component so this new page's header is literally the same component as the editor's `Topbar`.

**Architecture:** Follows this codebase's established pure-logic + thin-repository split (`lib/account/settings.ts` DB-free and dependency-injected, `lib/db/users.ts` thin Prisma wrappers), the same route-handler shape as every other `app/api/*` route (`requireUser()` gate, `NextResponse.json`), and the same client shape (`lib/api-client.ts` functions, no direct `fetch` in components, no new Zustand store since this screen has no cross-component shared state).

**Tech Stack:** Next.js 16 App Router, Prisma/Postgres, `bcryptjs` (existing `lib/auth/hash.ts`), `next-intl`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-user-settings-design.md`

## Global Constraints

- Email is **read-only** in this screen — never accept an email field in the profile-update request.
- New-password minimum length is **8 characters** — the first password policy in this codebase (self-signup has always been deferred, so none existed before).
- Account deletion requires the client-typed email to match the session email **case-sensitively**, AND a server-side password re-verification. The typed-email check is a client-side gate only — it is never sent to or checked by the server.
- Password change does **not** invalidate the current session/JWT. This is intentional, not a bug to fix.
- No new Zustand store. Use local component `useState`.
- No toast/notification system exists anywhere in this app — use inline success/error text under each form's submit button, matching the pattern already used nowhere else but consistent with the app's general "no modal-popup notifications" style.
- Every new/changed component that renders static UI text reads its own `next-intl` namespace via `useTranslations("ComponentName")` — one namespace per component, matching every existing component in `messages/pt-BR.json`.
- Commit messages: English, Conventional Commits (`type(scope): summary`).
- `components/shared/PageHeader.tsx` must be usable, unmodified, by both `components/editor/Topbar.tsx` and the new settings screen — do not fork it.

---

## File Structure

**New:**

- `lib/account/settings.ts` — pure validation/verification logic
- `lib/account/settings.test.ts`
- `app/api/account/profile/route.ts` — `PATCH`
- `app/api/account/profile/route.test.ts`
- `app/api/account/password/route.ts` — `POST`
- `app/api/account/password/route.test.ts`
- `app/api/account/route.ts` — `DELETE`
- `app/api/account/route.test.ts`
- `components/shared/PageHeader.tsx`
- `components/settings/ProfileSection.tsx`
- `components/settings/PasswordSection.tsx`
- `components/settings/DangerZoneSection.tsx`
- `components/settings/SettingsShell.tsx`
- `app/configuracoes/page.tsx`

**Modified:**

- `lib/db/users.ts` — add `getUserById`, `updateUserName`, `updateUserPasswordHash`, `deleteUser`
- `lib/api-client.ts` — add `updateProfile`, `changePassword`, `deleteAccount`
- `components/editor/Topbar.tsx` — becomes a thin wrapper around `PageHeader`
- `components/dashboard/DashboardTopbar.tsx` — wire "Preferências" to navigate
- `messages/pt-BR.json` — split `Topbar` → `PageHeader` + trimmed `Topbar`; add `SettingsShell`, `ProfileSection`, `PasswordSection`, `DangerZoneSection`

---

### Task 1: `lib/account/settings.ts` — pure validation/verification logic

**Files:**

- Create: `lib/account/settings.ts`
- Test: `lib/account/settings.test.ts`

**Interfaces:**

- Produces:
  - `validateName(name: unknown): string | null`
  - `validateNewPassword(password: unknown): password is string`
  - `interface PasswordDeps { verify: (plain: string, hash: string) => Promise<boolean>; hash: (plain: string) => Promise<string>; }`
  - `type ChangePasswordResult = { ok: true; newHash: string } | { ok: false; error: "wrong_password" | "weak_password" }`
  - `changePassword(deps: PasswordDeps, currentPassword: unknown, newPassword: unknown, storedHash: string): Promise<ChangePasswordResult>`
  - `verifyForDeletion(deps: Pick<PasswordDeps, "verify">, password: unknown, storedHash: string): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/account/settings.test.ts
import { describe, it, expect } from "vitest";
import {
  validateName,
  validateNewPassword,
  changePassword,
  verifyForDeletion,
  type PasswordDeps,
} from "./settings";

function deps(over: Partial<PasswordDeps> = {}): PasswordDeps {
  return {
    verify: async (plain, hash) => plain === "correct" && hash === "HASH",
    hash: async (plain) => `HASHED(${plain})`,
    ...over,
  };
}

describe("validateName", () => {
  it("trims and returns a valid name", () => {
    expect(validateName("  Ateliê Dev  ")).toBe("Ateliê Dev");
  });
  it("rejects empty/whitespace-only names", () => {
    expect(validateName("   ")).toBeNull();
    expect(validateName("")).toBeNull();
  });
  it("rejects non-string input", () => {
    expect(validateName(123)).toBeNull();
    expect(validateName(undefined)).toBeNull();
  });
  it("rejects names longer than 80 characters", () => {
    expect(validateName("a".repeat(81))).toBeNull();
    expect(validateName("a".repeat(80))).toBe("a".repeat(80));
  });
});

describe("validateNewPassword", () => {
  it("accepts passwords with 8+ characters", () => {
    expect(validateNewPassword("12345678")).toBe(true);
  });
  it("rejects passwords under 8 characters", () => {
    expect(validateNewPassword("1234567")).toBe(false);
  });
  it("rejects non-string input", () => {
    expect(validateNewPassword(12345678)).toBe(false);
    expect(validateNewPassword(undefined)).toBe(false);
  });
});

describe("changePassword", () => {
  it("returns the new hash on correct current password + valid new password", async () => {
    const r = await changePassword(deps(), "correct", "newpassword1", "HASH");
    expect(r).toEqual({ ok: true, newHash: "HASHED(newpassword1)" });
  });
  it("rejects a wrong current password", async () => {
    const r = await changePassword(deps(), "wrong", "newpassword1", "HASH");
    expect(r).toEqual({ ok: false, error: "wrong_password" });
  });
  it("rejects a non-string current password without calling verify", async () => {
    let called = false;
    const d = deps({
      verify: async (...args) => {
        called = true;
        return true;
      },
    });
    const r = await changePassword(d, undefined, "newpassword1", "HASH");
    expect(r).toEqual({ ok: false, error: "wrong_password" });
    expect(called).toBe(false);
  });
  it("rejects a too-short new password even if current password is correct", async () => {
    const r = await changePassword(deps(), "correct", "short", "HASH");
    expect(r).toEqual({ ok: false, error: "weak_password" });
  });
});

describe("verifyForDeletion", () => {
  it("returns true for the correct password", async () => {
    expect(await verifyForDeletion(deps(), "correct", "HASH")).toBe(true);
  });
  it("returns false for the wrong password", async () => {
    expect(await verifyForDeletion(deps(), "wrong", "HASH")).toBe(false);
  });
  it("returns false for non-string input without calling verify", async () => {
    let called = false;
    const d = deps({ verify: async () => ((called = true), true) });
    expect(await verifyForDeletion(d, undefined, "HASH")).toBe(false);
    expect(called).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/account/settings.test.ts`
Expected: FAIL — `lib/account/settings.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/account/settings.ts
const MAX_NAME_LENGTH = 80;
const MIN_PASSWORD_LENGTH = 8;

export function validateName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return null;
  return trimmed;
}

export function validateNewPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}

export interface PasswordDeps {
  verify: (plain: string, hash: string) => Promise<boolean>;
  hash: (plain: string) => Promise<string>;
}

export type ChangePasswordResult =
  | { ok: true; newHash: string }
  | { ok: false; error: "wrong_password" | "weak_password" };

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

export async function verifyForDeletion(
  deps: Pick<PasswordDeps, "verify">,
  password: unknown,
  storedHash: string,
): Promise<boolean> {
  if (typeof password !== "string") return false;
  return deps.verify(password, storedHash);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/account/settings.test.ts`
Expected: PASS (all cases above)

- [ ] **Step 5: Commit**

```bash
git add lib/account/settings.ts lib/account/settings.test.ts
git commit -m "feat(account): add pure profile/password validation logic"
```

---

### Task 2: `lib/db/users.ts` — repository additions

**Files:**

- Modify: `lib/db/users.ts`

**Interfaces:**

- Consumes: `prisma` from `./prisma` (already imported in this file)
- Produces:
  - `getUserById(id: string): Promise<UserRecord | null>`
  - `updateUserName(id: string, name: string): Promise<void>`
  - `updateUserPasswordHash(id: string, passwordHash: string): Promise<void>`
  - `deleteUser(id: string): Promise<void>`

No dedicated test file — matches this file's existing convention (`getUserByEmail` has no direct test either; it's exercised indirectly through `lib/auth/authorize.test.ts`'s injected-dependency tests, and these new functions are exercised indirectly through the route tests in Tasks 3–5).

- [ ] **Step 1: Add the four functions**

```typescript
// lib/db/users.ts (full file after this change)
import { prisma } from "./prisma";
import type { UserRecord } from "@/lib/auth/types";

export function getUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true, name: true },
  });
}

export function getUserById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, passwordHash: true, name: true },
  });
}

export async function updateUserName(id: string, name: string): Promise<void> {
  await prisma.user.update({ where: { id }, data: { name } });
}

export async function updateUserPasswordHash(
  id: string,
  passwordHash: string,
): Promise<void> {
  await prisma.user.update({ where: { id }, data: { passwordHash } });
}

export async function deleteUser(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds (this also runs the TypeScript check, per this repo's `npm run build` convention — no dev server needed for this step).

- [ ] **Step 3: Commit**

```bash
git add lib/db/users.ts
git commit -m "feat(db): add getUserById/updateUserName/updateUserPasswordHash/deleteUser"
```

---

### Task 3: `PATCH /api/account/profile`

**Files:**

- Create: `app/api/account/profile/route.ts`
- Test: `app/api/account/profile/route.test.ts`

**Interfaces:**

- Consumes: `requireUser` (`@/lib/auth/guard`), `validateName` (`@/lib/account/settings`, Task 1), `updateUserName` (`@/lib/db/users`, Task 2)
- Produces: `PATCH(request: Request): Promise<NextResponse>` — success body `{status: "ok", name: string, email: string}`, error body `{status: "error", error: string}`

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/account/profile/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/users", () => ({ updateUserName: vi.fn() }));

import { PATCH } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { updateUserName } from "@/lib/db/users";

function req(body: unknown) {
  return new Request("http://test", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/account/profile", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(updateUserName).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: "Dev",
    });
    vi.mocked(updateUserName).mockResolvedValue(undefined);
  });

  it("updates the name and returns it", async () => {
    const res = await PATCH(req({ name: "Ateliê Dev" }));
    expect(updateUserName).toHaveBeenCalledWith("u1", "Ateliê Dev");
    expect(await res.json()).toEqual({
      status: "ok",
      name: "Ateliê Dev",
      email: "dev@moldai.local",
    });
  });

  it("trims the name before saving", async () => {
    await PATCH(req({ name: "  Ateliê Dev  " }));
    expect(updateUserName).toHaveBeenCalledWith("u1", "Ateliê Dev");
  });

  it("400s on a blank name", async () => {
    const res = await PATCH(req({ name: "   " }));
    expect(res.status).toBe(400);
    expect(updateUserName).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await PATCH(req({ name: "Ateliê Dev" }));
    expect(res.status).toBe(401);
    expect(updateUserName).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/api/account/profile/route.test.ts`
Expected: FAIL — `app/api/account/profile/route.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/account/profile/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { validateName } from "@/lib/account/settings";
import { updateUserName } from "@/lib/db/users";

export async function PATCH(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }

  const name = validateName(body.name);
  if (!name) {
    return NextResponse.json(
      { status: "error", error: "Nome obrigatório." },
      { status: 400 },
    );
  }

  await updateUserName(gate.id, name);
  return NextResponse.json({ status: "ok", name, email: gate.email });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/api/account/profile/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/account/profile/route.ts app/api/account/profile/route.test.ts
git commit -m "feat(api): add PATCH /api/account/profile"
```

---

### Task 4: `POST /api/account/password`

**Files:**

- Create: `app/api/account/password/route.ts`
- Test: `app/api/account/password/route.test.ts`

**Interfaces:**

- Consumes: `requireUser` (`@/lib/auth/guard`), `changePassword` (`@/lib/account/settings`, Task 1), `verifyPassword`/`hashPassword` (`@/lib/auth/hash`, existing), `getUserById`/`updateUserPasswordHash` (`@/lib/db/users`, Task 2)
- Produces: `POST(request: Request): Promise<NextResponse>` — success `{status: "ok"}`, error `{status: "error", error: string}`

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/account/password/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/users", () => ({
  getUserById: vi.fn(),
  updateUserPasswordHash: vi.fn(),
}));
vi.mock("@/lib/auth/hash", () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { getUserById, updateUserPasswordHash } from "@/lib/db/users";
import { verifyPassword, hashPassword } from "@/lib/auth/hash";

const user = {
  id: "u1",
  email: "dev@moldai.local",
  passwordHash: "HASH",
  name: "Dev",
};

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/password", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(getUserById).mockReset();
    vi.mocked(updateUserPasswordHash).mockReset();
    vi.mocked(verifyPassword).mockReset();
    vi.mocked(hashPassword).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: user.email,
      name: "Dev",
    });
    vi.mocked(getUserById).mockResolvedValue(user);
  });

  it("changes the password on correct current + valid new password", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(hashPassword).mockResolvedValue("NEW_HASH");
    const res = await POST(
      req({ currentPassword: "correct", newPassword: "newpassword1" }),
    );
    expect(verifyPassword).toHaveBeenCalledWith("correct", "HASH");
    expect(updateUserPasswordHash).toHaveBeenCalledWith("u1", "NEW_HASH");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("400s on wrong current password", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const res = await POST(
      req({ currentPassword: "wrong", newPassword: "newpassword1" }),
    );
    expect(res.status).toBe(400);
    expect(updateUserPasswordHash).not.toHaveBeenCalled();
  });

  it("400s on a too-short new password", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const res = await POST(
      req({ currentPassword: "correct", newPassword: "short" }),
    );
    expect(res.status).toBe(400);
    expect(updateUserPasswordHash).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(
      req({ currentPassword: "correct", newPassword: "newpassword1" }),
    );
    expect(res.status).toBe(401);
    expect(getUserById).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/api/account/password/route.test.ts`
Expected: FAIL — `app/api/account/password/route.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/account/password/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { changePassword } from "@/lib/account/settings";
import { verifyPassword, hashPassword } from "@/lib/auth/hash";
import { getUserById, updateUserPasswordHash } from "@/lib/db/users";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }

  const user = await getUserById(gate.id);
  if (!user) {
    return NextResponse.json(
      { status: "error", error: "Conta não encontrada." },
      { status: 404 },
    );
  }

  const result = await changePassword(
    { verify: verifyPassword, hash: hashPassword },
    body.currentPassword,
    body.newPassword,
    user.passwordHash,
  );
  if (!result.ok) {
    const error =
      result.error === "wrong_password"
        ? "Senha atual incorreta."
        : "A nova senha deve ter pelo menos 8 caracteres.";
    return NextResponse.json({ status: "error", error }, { status: 400 });
  }

  await updateUserPasswordHash(gate.id, result.newHash);
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/api/account/password/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/account/password/route.ts app/api/account/password/route.test.ts
git commit -m "feat(api): add POST /api/account/password"
```

---

### Task 5: `DELETE /api/account`

**Files:**

- Create: `app/api/account/route.ts`
- Test: `app/api/account/route.test.ts`

**Interfaces:**

- Consumes: `requireUser` (`@/lib/auth/guard`), `verifyForDeletion` (`@/lib/account/settings`, Task 1), `verifyPassword` (`@/lib/auth/hash`), `getUserById`/`deleteUser` (`@/lib/db/users`, Task 2)
- Produces: `DELETE(request: Request): Promise<NextResponse>` — success `{status: "ok"}`, error `{status: "error", error: string}`

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/account/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/users", () => ({
  getUserById: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock("@/lib/auth/hash", () => ({ verifyPassword: vi.fn() }));

import { DELETE } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { getUserById, deleteUser } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/hash";

const user = {
  id: "u1",
  email: "dev@moldai.local",
  passwordHash: "HASH",
  name: "Dev",
};

function req(body: unknown) {
  return new Request("http://test", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/account", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(getUserById).mockReset();
    vi.mocked(deleteUser).mockReset();
    vi.mocked(verifyPassword).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: user.email,
      name: "Dev",
    });
    vi.mocked(getUserById).mockResolvedValue(user);
  });

  it("deletes the account on correct password", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const res = await DELETE(req({ password: "correct" }));
    expect(verifyPassword).toHaveBeenCalledWith("correct", "HASH");
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("400s on wrong password", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const res = await DELETE(req({ password: "wrong" }));
    expect(res.status).toBe(400);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await DELETE(req({ password: "correct" }));
    expect(res.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/api/account/route.test.ts`
Expected: FAIL — `app/api/account/route.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/account/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { verifyForDeletion } from "@/lib/account/settings";
import { verifyPassword } from "@/lib/auth/hash";
import { getUserById, deleteUser } from "@/lib/db/users";

export async function DELETE(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }

  const user = await getUserById(gate.id);
  if (!user) {
    return NextResponse.json(
      { status: "error", error: "Conta não encontrada." },
      { status: 404 },
    );
  }

  const ok = await verifyForDeletion(
    { verify: verifyPassword },
    body.password,
    user.passwordHash,
  );
  if (!ok) {
    return NextResponse.json(
      { status: "error", error: "Senha incorreta." },
      { status: 400 },
    );
  }

  await deleteUser(gate.id);
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/api/account/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/account/route.ts app/api/account/route.test.ts
git commit -m "feat(api): add DELETE /api/account"
```

---

### Task 6: `lib/api-client.ts` additions

**Files:**

- Modify: `lib/api-client.ts`

**Interfaces:**

- Consumes: nothing new (uses the file's existing `postJson` helper and inline `fetch` pattern already used by `renameMolde`/`deleteMolde`)
- Produces:
  - `interface AccountActionResult { status: "ok" | "error"; error?: string }`
  - `interface UpdateProfileResult extends AccountActionResult { name?: string; email?: string }`
  - `updateProfile(name: string): Promise<UpdateProfileResult>`
  - `changePassword(currentPassword: string, newPassword: string): Promise<AccountActionResult>`
  - `deleteAccount(password: string): Promise<AccountActionResult>`

No dedicated test — matches this file's existing convention (`lib/api-client.ts` has no test file today; it's a thin fetch-wrapper layer, same as `renameMolde`/`deleteMolde`).

- [ ] **Step 1: Add the types and functions**

Add near the other interfaces at the top of `lib/api-client.ts` (after `AccountSummary`):

```typescript
export interface AccountActionResult {
  status: "ok" | "error";
  error?: string;
}

export interface UpdateProfileResult extends AccountActionResult {
  name?: string;
  email?: string;
}
```

Add at the end of the file, after `getAccountSummary`:

```typescript
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

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds

- [ ] **Step 3: Commit**

```bash
git add lib/api-client.ts
git commit -m "feat(api-client): add updateProfile/changePassword/deleteAccount"
```

---

### Task 7: `components/shared/PageHeader.tsx`

**Files:**

- Create: `components/shared/PageHeader.tsx`
- Modify: `messages/pt-BR.json` (add `PageHeader` namespace)

**Interfaces:**

- Consumes: `Credits` (`@/lib/types`), `initialsFromEmail` (`@/lib/format`), `signOut` (`next-auth/react`), `useRouter` (`next/navigation`)
- Produces: `PageHeader({title, subtitle?, credits, userEmail}): JSX.Element` — a full-width header bar: logo, divider, back button (→ `/`), title/subtitle block, credits bar, "Comprar créditos" button, avatar, sign-out button.

This is a direct extraction of the markup currently inline in `components/editor/Topbar.tsx:22-77` (see that file for the exact JSX being moved) — no visual change, just relocated + generalized (`pattern.name`/`pattern.savedAgo`/`pattern.version` become the generic `title`/`subtitle` props).

- [ ] **Step 1: Add the `PageHeader` namespace to `messages/pt-BR.json`**

Insert a new top-level key right after the opening `{` (before the existing `"Footer"` key), so it reads:

```json
{
  "PageHeader": {
    "backTitle": "Voltar para meus moldes",
    "backButton": "← Voltar",
    "creditsLabel": "{planLabel} · {balance} créditos",
    "outOfTotal": "de {total}",
    "buyCreditsButton": "Comprar créditos",
    "signOutButton": "Sair"
  },
  "Footer": {
```

(Leave the rest of the file, including the existing `"Topbar"` block, untouched for now — Task 8 trims it.)

- [ ] **Step 2: Create the component**

```typescript
// components/shared/PageHeader.tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import type { Credits } from "@/lib/types";
import { initialsFromEmail } from "@/lib/format";

export function PageHeader({
  title,
  subtitle,
  credits,
  userEmail,
}: {
  title: string;
  subtitle?: string;
  credits: Credits;
  userEmail: string;
}) {
  const t = useTranslations("PageHeader");
  const router = useRouter();
  const pct = Math.round((credits.balance / credits.total) * 100);

  return (
    <div className="bg-surface border-border relative flex items-center gap-4 border-b px-[18px] py-3">
      <span className="font-display text-[19px] font-bold tracking-[-0.4px]">
        Mold<span className="text-olive">AI</span>
      </span>
      <div className="bg-border h-5 w-px" />
      <button
        onClick={() => router.push("/")}
        title={t("backTitle")}
        className="border-border rounded-btn bg-surface text-muted-2 hover:bg-surface-alt border px-[11px] py-[6px] text-[12px] font-medium transition-colors"
      >
        {t("backButton")}
      </button>
      <div className="flex flex-col gap-px">
        <span className="text-[13px] font-semibold">{title}</span>
        {subtitle && (
          <span className="text-muted text-[11px]">{subtitle}</span>
        )}
      </div>
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
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: succeeds (nothing consumes `PageHeader` yet, but it must compile standalone)

- [ ] **Step 4: Commit**

```bash
git add components/shared/PageHeader.tsx messages/pt-BR.json
git commit -m "feat(shared): add PageHeader, extracted from editor Topbar"
```

---

### Task 8: Refactor `components/editor/Topbar.tsx` to use `PageHeader`

**Files:**

- Modify: `components/editor/Topbar.tsx`
- Modify: `messages/pt-BR.json` (trim `Topbar` down to just `savedVersion`)

**Interfaces:**

- Consumes: `PageHeader` (`@/components/shared/PageHeader`, Task 7)
- Produces: `Topbar({pattern, credits, userEmail})` — same public signature as before, now a thin wrapper. No behavior change for consumers (`components/editor/EditorShell.tsx` or wherever `Topbar` is rendered — do not need to touch that call site).

- [ ] **Step 1: Trim the `Topbar` namespace in `messages/pt-BR.json`**

Change:

```json
  "Topbar": {
    "backTitle": "Voltar para meus moldes",
    "backButton": "← Voltar",
    "savedVersion": "{savedAgo} · v{version}",
    "creditsLabel": "{planLabel} · {balance} créditos",
    "outOfTotal": "de {total}",
    "buyCreditsButton": "Comprar créditos",
    "signOutButton": "Sair"
  },
```

to:

```json
  "Topbar": {
    "savedVersion": "{savedAgo} · v{version}"
  },
```

- [ ] **Step 2: Rewrite the component**

```typescript
// components/editor/Topbar.tsx
"use client";

import { useTranslations } from "next-intl";
import { Credits, Pattern } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";

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

  return (
    <PageHeader
      title={pattern.name}
      subtitle={t("savedVersion", {
        savedAgo: pattern.savedAgo,
        version: pattern.version,
      })}
      credits={credits}
      userEmail={userEmail}
    />
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: succeeds

- [ ] **Step 4: Manually verify no regression in the editor**

Run: `npm run dev`, open `http://localhost:3000`, open any molde. Confirm the topbar looks and behaves identically to before (molde name, "salvo há … · vN", credits bar, "Comprar créditos", avatar, "Sair", "← Voltar" returning to `/`).

- [ ] **Step 5: Commit**

```bash
git add components/editor/Topbar.tsx messages/pt-BR.json
git commit -m "refactor(editor): rebuild Topbar on top of the shared PageHeader"
```

---

### Task 9: `components/settings/ProfileSection.tsx`

**Files:**

- Create: `components/settings/ProfileSection.tsx`
- Modify: `messages/pt-BR.json` (add `ProfileSection` namespace)

**Interfaces:**

- Consumes: `updateProfile` (`@/lib/api-client`, Task 6)
- Produces: `ProfileSection({initialName, email}): JSX.Element`

- [ ] **Step 1: Add the `ProfileSection` namespace to `messages/pt-BR.json`**

Add after the `"DashboardShell"` block (the last one in the file), before the closing `}`:

```json
  "DashboardShell": {
    ...
  },
  "ProfileSection": {
    "heading": "Perfil",
    "nameLabel": "Nome",
    "emailLabel": "E-mail",
    "emailHint": "O e-mail é o identificador de login e não pode ser alterado.",
    "saveButton": "Salvar",
    "saveSuccess": "Perfil atualizado.",
    "saveError": "Não foi possível salvar. Tente novamente.",
    "nameRequired": "Nome obrigatório."
  }
```

(Keep `"DashboardShell"`'s existing content — only add the new sibling key and move the final `}` accordingly. Exact prior content of `"DashboardShell"` is unchanged.)

- [ ] **Step 2: Create the component**

```typescript
// components/settings/ProfileSection.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { updateProfile } from "@/lib/api-client";

export function ProfileSection({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const t = useTranslations("ProfileSection");
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError(t("nameRequired"));
      setStatus("error");
      return;
    }
    setStatus("saving");
    setError(null);
    const result = await updateProfile(name.trim());
    if (result.status === "ok") {
      setStatus("ok");
    } else {
      setStatus("error");
      setError(result.error ?? t("saveError"));
    }
  }

  return (
    <section className="bg-surface border-border rounded-card flex flex-col gap-3 border p-[18px]">
      <h2 className="font-display text-[16px] font-semibold">
        {t("heading")}
      </h2>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("nameLabel")}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-border rounded-item bg-surface-alt focus:border-olive-border border px-[13px] py-[9px] text-[13px] outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("emailLabel")}
        <input
          value={email}
          disabled
          className="border-border rounded-item bg-surface-alt text-muted-2 border px-[13px] py-[9px] text-[13px] outline-none disabled:opacity-70"
        />
        <span className="text-muted text-[11px]">{t("emailHint")}</span>
      </label>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={status === "saving"}
          className="bg-ink rounded-item px-[15px] py-[9px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("saveButton")}
        </button>
        {status === "ok" && (
          <span className="text-olive-dark text-[12px]">
            {t("saveSuccess")}
          </span>
        )}
        {status === "error" && error && (
          <span className="text-alert text-[12px]">{error}</span>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: succeeds

- [ ] **Step 4: Commit**

```bash
git add components/settings/ProfileSection.tsx messages/pt-BR.json
git commit -m "feat(settings): add ProfileSection"
```

---

### Task 10: `components/settings/PasswordSection.tsx`

**Files:**

- Create: `components/settings/PasswordSection.tsx`
- Modify: `messages/pt-BR.json` (add `PasswordSection` namespace)

**Interfaces:**

- Consumes: `changePassword` (`@/lib/api-client`, Task 6)
- Produces: `PasswordSection(): JSX.Element`

- [ ] **Step 1: Add the `PasswordSection` namespace to `messages/pt-BR.json`**

Add as a sibling of `"ProfileSection"`:

```json
  "PasswordSection": {
    "heading": "Alterar senha",
    "currentLabel": "Senha atual",
    "newLabel": "Nova senha",
    "confirmLabel": "Confirmar nova senha",
    "submitButton": "Alterar senha",
    "mismatchError": "As senhas não coincidem.",
    "tooShortError": "A nova senha deve ter pelo menos 8 caracteres.",
    "successMessage": "Senha alterada com sucesso."
  }
```

- [ ] **Step 2: Create the component**

```typescript
// components/settings/PasswordSection.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { changePassword } from "@/lib/api-client";

const MIN_PASSWORD_LENGTH = 8;

export function PasswordSection() {
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
    current.length > 0 &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm;

  async function submit() {
    if (!canSubmit) return;
    setStatus("saving");
    setError(null);
    const result = await changePassword(current, next);
    if (result.status === "ok") {
      setStatus("ok");
      setCurrent("");
      setNext("");
      setConfirm("");
    } else {
      setStatus("error");
      setError(result.error ?? t("tooShortError"));
    }
  }

  return (
    <section className="bg-surface border-border rounded-card flex flex-col gap-3 border p-[18px]">
      <h2 className="font-display text-[16px] font-semibold">
        {t("heading")}
      </h2>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("currentLabel")}
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="border-border rounded-item bg-surface-alt focus:border-olive-border border px-[13px] py-[9px] text-[13px] outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("newLabel")}
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="border-border rounded-item bg-surface-alt focus:border-olive-border border px-[13px] py-[9px] text-[13px] outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("confirmLabel")}
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="border-border rounded-item bg-surface-alt focus:border-olive-border border px-[13px] py-[9px] text-[13px] outline-none"
        />
      </label>
      {mismatch && (
        <span className="text-alert text-[12px]">{t("mismatchError")}</span>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!canSubmit || status === "saving"}
          className="bg-ink rounded-item px-[15px] py-[9px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("submitButton")}
        </button>
        {status === "ok" && (
          <span className="text-olive-dark text-[12px]">
            {t("successMessage")}
          </span>
        )}
        {status === "error" && error && (
          <span className="text-alert text-[12px]">{error}</span>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: succeeds

- [ ] **Step 4: Commit**

```bash
git add components/settings/PasswordSection.tsx messages/pt-BR.json
git commit -m "feat(settings): add PasswordSection"
```

---

### Task 11: `components/settings/DangerZoneSection.tsx`

**Files:**

- Create: `components/settings/DangerZoneSection.tsx`
- Modify: `messages/pt-BR.json` (add `DangerZoneSection` namespace)

**Interfaces:**

- Consumes: `deleteAccount` (`@/lib/api-client`, Task 6), `signOut` (`next-auth/react`)
- Produces: `DangerZoneSection({userEmail}): JSX.Element`

- [ ] **Step 1: Add the `DangerZoneSection` namespace to `messages/pt-BR.json`**

Add as a sibling of `"PasswordSection"`:

```json
  "DangerZoneSection": {
    "heading": "Excluir conta",
    "warning": "Essa ação exclui permanentemente todos os seus moldes, créditos e histórico. Não pode ser desfeita.",
    "emailConfirmLabel": "Digite {email} para confirmar",
    "passwordLabel": "Senha",
    "submitButton": "Excluir conta",
    "genericError": "Não foi possível excluir a conta. Tente novamente."
  }
```

- [ ] **Step 2: Create the component**

```typescript
// components/settings/DangerZoneSection.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { deleteAccount } from "@/lib/api-client";

export function DangerZoneSection({ userEmail }: { userEmail: string }) {
  const t = useTranslations("DangerZoneSection");
  const [typedEmail, setTypedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "deleting" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const canSubmit = typedEmail === userEmail && password.length > 0;

  async function submit() {
    if (!canSubmit) return;
    setStatus("deleting");
    setError(null);
    const result = await deleteAccount(password);
    if (result.status === "ok") {
      await signOut({ callbackUrl: "/login" });
    } else {
      setStatus("error");
      setError(result.error ?? t("genericError"));
    }
  }

  return (
    <section className="bg-amber-bg border-alert rounded-card flex flex-col gap-3 border p-[18px]">
      <h2 className="text-alert font-display text-[16px] font-semibold">
        {t("heading")}
      </h2>
      <p className="text-muted-2 text-[12.5px] leading-[1.5]">
        {t("warning")}
      </p>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("emailConfirmLabel", { email: userEmail })}
        <input
          value={typedEmail}
          onChange={(e) => setTypedEmail(e.target.value)}
          className="border-border rounded-item bg-surface border px-[13px] py-[9px] text-[13px] outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px]">
        {t("passwordLabel")}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-border rounded-item bg-surface border px-[13px] py-[9px] text-[13px] outline-none"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!canSubmit || status === "deleting"}
          className="border-alert text-alert hover:bg-amber-bg rounded-btn border px-[15px] py-[9px] text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("submitButton")}
        </button>
        {status === "error" && error && (
          <span className="text-alert text-[12px]">{error}</span>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: succeeds

- [ ] **Step 4: Commit**

```bash
git add components/settings/DangerZoneSection.tsx messages/pt-BR.json
git commit -m "feat(settings): add DangerZoneSection"
```

---

### Task 12: `components/settings/SettingsShell.tsx`

**Files:**

- Create: `components/settings/SettingsShell.tsx`
- Modify: `messages/pt-BR.json` (add `SettingsShell` namespace)

**Interfaces:**

- Consumes: `PageHeader` (`@/components/shared/PageHeader`, Task 7), `ProfileSection` (Task 9), `PasswordSection` (Task 10), `DangerZoneSection` (Task 11), `Credits` (`@/lib/types`)
- Produces: `SettingsShell({userEmail, initialName, credits}): JSX.Element`

- [ ] **Step 1: Add the `SettingsShell` namespace to `messages/pt-BR.json`**

Add as a sibling of `"DangerZoneSection"`:

```json
  "SettingsShell": {
    "title": "Configurações"
  }
```

- [ ] **Step 2: Create the component**

```typescript
// components/settings/SettingsShell.tsx
"use client";

import { useTranslations } from "next-intl";
import type { Credits } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProfileSection } from "./ProfileSection";
import { PasswordSection } from "./PasswordSection";
import { DangerZoneSection } from "./DangerZoneSection";

export function SettingsShell({
  userEmail,
  initialName,
  credits,
}: {
  userEmail: string;
  initialName: string;
  credits: Credits;
}) {
  const t = useTranslations("SettingsShell");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t("title")}
        credits={credits}
        userEmail={userEmail}
      />
      <div className="bg-paper flex flex-1 flex-col gap-4 overflow-y-auto px-[24px] py-[22px]">
        <ProfileSection initialName={initialName} email={userEmail} />
        <PasswordSection />
        <DangerZoneSection userEmail={userEmail} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: succeeds

- [ ] **Step 4: Commit**

```bash
git add components/settings/SettingsShell.tsx messages/pt-BR.json
git commit -m "feat(settings): add SettingsShell composing PageHeader + sections"
```

---

### Task 13: `app/configuracoes/page.tsx`

**Files:**

- Create: `app/configuracoes/page.tsx`

**Interfaces:**

- Consumes: `auth` (`@/auth`), `getUserById` (`@/lib/db/users`, Task 2), `loadWallet` (`@/lib/db/wallet`, existing), `buildCredits` (`@/lib/api/compose`, existing), `SettingsShell` (Task 12)
- Produces: default export page component for the `/configuracoes` route

- [ ] **Step 1: Create the page**

```typescript
// app/configuracoes/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db/users";
import { loadWallet } from "@/lib/db/wallet";
import { buildCredits } from "@/lib/api/compose";
import { SettingsShell } from "@/components/settings/SettingsShell";

export default async function ConfiguracoesPage() {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const [user, wallet] = await Promise.all([
    getUserById(session.user.id),
    loadWallet(session.user.id),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsShell
        userEmail={session.user.email}
        initialName={user?.name ?? ""}
        credits={buildCredits(wallet, new Date())}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds

- [ ] **Step 3: Commit**

```bash
git add app/configuracoes/page.tsx
git commit -m "feat(settings): add /configuracoes page"
```

---

### Task 14: Wire the dashboard's "Preferências" button

**Files:**

- Modify: `components/dashboard/DashboardTopbar.tsx`

**Interfaces:**

- Consumes: `useRouter` (`next/navigation`)
- Produces: no new exports — same `DashboardTopbar({userEmail, credits})` signature, now with a working "Preferências" click.

- [ ] **Step 1: Add the router and wire the button**

In `components/dashboard/DashboardTopbar.tsx`, add the import:

```typescript
import { useRouter } from "next/navigation";
```

Add inside the component body, alongside the existing `useState` call:

```typescript
const router = useRouter();
```

Replace:

```typescript
            <button className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]">
              {t("preferencesMenuItem")}
            </button>
```

with:

```typescript
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

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds

- [ ] **Step 3: Manually verify**

Run: `npm run dev`, open `http://localhost:3000`, click "◍ Conta ▾" then "Preferências". Confirm it navigates to `/configuracoes` and the menu closes.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/DashboardTopbar.tsx
git commit -m "feat(dashboard): wire Preferências to /configuracoes"
```

---

### Task 15: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: all tests pass, including the new `lib/account/settings.test.ts` and the three new `app/api/account/*/route.test.ts` files.

- [ ] **Step 2: Run the production build (includes the TypeScript check)**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no errors. (Per this repo's known caveat, if a `.claude/worktrees/` directory exists, scope the lint run to `app lib components` rather than the bare repo-root command.)

- [ ] **Step 4: Manual end-to-end walkthrough in the browser**

Run: `npm run dev`, then in the browser:

1. Log in, go to the dashboard, click "◍ Conta ▾" → "Preferências" → lands on `/configuracoes`.
2. Header matches the editor's header style exactly (logo, back button, credits bar, avatar, sign out) with title "Configurações" and no subtitle.
3. Change the name in the Profile section, click "Salvar" → inline success message appears; reload the page → new name persists (via `getUserById` on next load).
4. Try saving a blank name → inline "Nome obrigatório." error, no request succeeds silently.
5. In Password section, enter a wrong current password → inline "Senha atual incorreta." error.
6. Enter mismatched new/confirm passwords → "Alterar senha" stays disabled and shows the mismatch message.
7. Enter a correct current password + valid new password → success message, fields clear. Log out and log back in with the new password to confirm it actually changed.
8. In the danger zone, confirm "Excluir conta" stays disabled until the typed email exactly matches and a password is entered.
9. (Use a disposable seeded/test account for this step, not `dev@moldai.local` if that's needed for other manual testing.) Complete account deletion with the correct password → redirected to `/login`; confirm the account's moldes are gone (cascade worked).
10. Click "← Voltar" from `/configuracoes` → lands back on `/`.

- [ ] **Step 5: Report results**

Summarize pass/fail for each step above. Do not claim the feature is complete until every step in this task has been actually run and observed, per this project's verification-before-completion convention.

---

## CLAUDE.md updates (do this after all tasks above are verified)

Add a new paragraph to the Architecture section (following the pattern of how the dashboard migration documented itself in `CLAUDE.md`'s "The dashboard (`4b`) is the app's home..." paragraph):

- Document `/configuracoes`, its three new `/api/account/*` routes, `lib/account/settings.ts`'s pure validate/verify functions, and the `components/settings/*` component breakdown.
- Document the `PageHeader` extraction: that `components/editor/Topbar.tsx` is now a thin wrapper, and that any future full-page screen should reuse `PageHeader` rather than hand-roll a new header.
- Remove "Configurações do usuário" from the MVP-roadmap "not yet built" list in the "What this is" section (added in the brainstorming session for this feature) — it's now shipped.
