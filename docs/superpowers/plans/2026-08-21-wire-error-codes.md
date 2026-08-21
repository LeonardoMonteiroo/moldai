# Wire Error Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all 43 hardcoded pt-BR display strings from `app/api/**` and `lib/**`, so the wire and the database carry codes and pt-BR is resolved only at the edge that renders it.

**Architecture:** Three mechanisms, each already established in this repo. Wire error payloads carry a machine-readable code the client resolves via `t("errors." + code)` (the `SignupErrorCode` precedent). Text the server persists into a pattern blob is produced through an injected `Translate` (the `draftGarment` precedent). Derivable labels become catalog lookups keyed by the EN enum value, which lets two persisted fields — `Wallet.planLabel` and `Pattern.savedAgo` — be dropped entirely.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 / Postgres, next-intl (single locale pt-BR), Zustand, Vitest (two projects: `node` and `dom`).

**Spec:** [docs/superpowers/specs/2026-08-21-wire-error-codes-design.md](../specs/2026-08-21-wire-error-codes-design.md)

## Global Constraints

- **Commits:** English, [Conventional Commits](https://www.conventionalcommits.org/) — `type(scope): summary`.
- **Language boundary:** code identifiers, wire keys, enum values, Prisma models/columns and routes are **English**; all UI display text is **pt-BR** and comes from `messages/pt-BR.json` via a component namespace. After this plan, that rule has no exceptions in `app/api/**` or `lib/**`.
- **`lib/` stays framework-free of `next-intl`.** Functions producing display text take an injected `Translate` (`lib/i18n/translate.ts`, `(key, values?) => string`). next-intl's `t` is structurally assignable to it. `NextResponse` in `lib/` is fine and already established (`lib/auth/session.ts`, `lib/db/pattern.ts`).
- **Repository contract:** everything under `lib/db/` returns `null`/`false` for expected failures, never throws, never leaks whether a row exists.
- **Never assert on a pasted pt-BR literal in a test.** Assert against the exported `ptBR` catalog object (`components/test-utils.tsx`). Test-supplied fixture data (a pattern name, a formatted subtitle) may be a plain literal.
- **Design tokens only** — no hex in components; no `text-[Npx]`; type comes from the named scale.
- **Next.js 16, not the one you remember.** Read `node_modules/next/dist/docs/` before writing route-handler code.
- **Verification:** `npm test`, `npx eslint app lib components`, and `npm run build` must all pass before a task is done. Use `npm run build` for typechecking — bare `tsc` reports a spurious `app/layout.tsx` LayoutProps error under Next 16.
- **Lint scoping:** run `npx eslint app lib components`, not bare `npm run lint`, if a worktree exists under `.claude/worktrees/`.
- **Do not touch:** the AI's `assistantMessage` (model-produced, mirrors the user's language by design), `app/layout.tsx`'s metadata description, English `throw new Error` messages, or the DXF file-content strings in `lib/export/dxf.ts` / `dxf-aama.ts`.
- **Branch:** `refactor/wire-error-codes`, already created, spec already committed on it.

---

### Task 1: `lib/api/errors.ts` — the shared error vocabulary

Self-contained: delivers a tested module nothing calls yet.

**Files:**

- Create: `lib/api/errors.ts`
- Test: `lib/api/errors.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `RouteErrorCode`, `NotFoundCode`, `SharedErrorCode`, `ERROR_STATUS: Record<SharedErrorCode, number>`, `apiError(code: string, httpStatus: number, headers?: HeadersInit): NextResponse`.

**Why `apiError` takes `code: string` and not a union:** domain codes like `wrong_password` live next to their pure logic in `lib/account/settings.ts` and must not be dragged into this module — that would invert the dependency the colocation rule exists to prevent. The caller narrows its code through its own exhaustive `Record` before calling. `ERROR_STATUS` covers only the shared codes.

- [ ] **Step 1: Write the failing test**

Create `lib/api/errors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ERROR_STATUS, apiError, type SharedErrorCode } from "./errors";

// Listed literally rather than derived, so adding a union member without a
// status fails this test instead of silently widening it.
const ALL_SHARED: SharedErrorCode[] = [
  "bad_body",
  "unauthorized",
  "pattern_not_found",
  "size_chart_not_found",
  "account_not_found",
];

describe("ERROR_STATUS", () => {
  it("maps every shared code to an HTTP status", () => {
    for (const code of ALL_SHARED) {
      expect(typeof ERROR_STATUS[code]).toBe("number");
    }
  });

  it("has no extra keys beyond the union", () => {
    expect(Object.keys(ERROR_STATUS).sort()).toEqual([...ALL_SHARED].sort());
  });
});

describe("apiError", () => {
  it("keeps not_found as the wire status word for resource codes", async () => {
    const res = apiError("pattern_not_found", 404);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      status: "not_found",
      error: "pattern_not_found",
    });
  });

  it("keeps unauthorized as its own wire status word", async () => {
    const res = apiError("unauthorized", 401);
    await expect(res.json()).resolves.toEqual({
      status: "unauthorized",
      error: "unauthorized",
    });
  });

  it("defaults the wire status word to error", async () => {
    const res = apiError("bad_body", 400);
    await expect(res.json()).resolves.toEqual({
      status: "error",
      error: "bad_body",
    });
  });

  it("leaves account_not_found on the error status word", async () => {
    // Deliberate: today's /api/account/* 404s ship {status:"error"}, and this
    // change must not alter a wire shape while swapping prose for a code.
    const res = apiError("account_not_found", 404);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      status: "error",
      error: "account_not_found",
    });
  });

  it("passes headers through", () => {
    const res = apiError("bad_body", 400, { "Retry-After": "30" });
    expect(res.headers.get("Retry-After")).toBe("30");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/api/errors.test.ts`
Expected: FAIL — `Failed to resolve import "./errors"`.

- [ ] **Step 3: Write the implementation**

Create `lib/api/errors.ts`:

```ts
import { NextResponse } from "next/server";

/** Codes any route can emit, independent of domain. */
export type RouteErrorCode = "bad_body" | "unauthorized";

/** One per resource kind. */
export type NotFoundCode =
  "pattern_not_found" | "size_chart_not_found" | "account_not_found";

export type SharedErrorCode = RouteErrorCode | NotFoundCode;

export const ERROR_STATUS: Record<SharedErrorCode, number> = {
  bad_body: 400,
  unauthorized: 401,
  pattern_not_found: 404,
  size_chart_not_found: 404,
  account_not_found: 404,
};

// The `status` field in the body is NOT the HTTP status — it is the wire
// discriminator clients switch on, and it differs per code today. This map
// reproduces the existing shapes exactly so swapping prose for a code is not
// also a wire change. Note the wart it preserves: /api/account/* answers its
// 404 with status "error", not "not_found".
const STATUS_WORD: Record<string, string> = {
  unauthorized: "unauthorized",
  pattern_not_found: "not_found",
  size_chart_not_found: "not_found",
};

/**
 * Builds an error response carrying a machine-readable code. `code` is a bare
 * string because domain codes (e.g. "wrong_password") live beside their own
 * pure logic; the caller has already narrowed it through its own exhaustive
 * Record.
 */
export function apiError(
  code: string,
  httpStatus: number,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json(
    { status: STATUS_WORD[code] ?? "error", error: code },
    { status: httpStatus, headers },
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/api/errors.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/api/errors.ts lib/api/errors.test.ts
git commit -m "feat(api): add the shared wire error-code vocabulary"
```

---

### Task 2: Convert the 12 unrendered error payloads to codes

These 12 payloads are never rendered — no client reads `.error` from any of these responses — so no catalog or component work pairs with them.

**Files:**

- Modify: `lib/auth/session.ts:19-24`
- Modify: `lib/db/pattern.ts:19-24`
- Modify: `app/api/patterns/[id]/route.ts:36-49`
- Modify: `app/api/patterns/[id]/generate/route.ts:28-41`
- Modify: `app/api/patterns/[id]/graduate/route.ts:21-27` and `:42`
- Modify: `app/api/patterns/[id]/conflict/resolve/route.ts:24-30`
- Modify: `app/api/size-charts/[id]/route.ts:8-14` and `:21-27`
- Modify: `app/api/size-charts/[id]/activate/route.ts:11-18`
- Test: `lib/auth/session.test.ts`, plus any existing route tests asserting the prose

**Interfaces:**

- Consumes: `apiError`, `ERROR_STATUS` from Task 1.
- Produces: `unauthorized()` and `patternNotFound()` keep their exact signatures (`(): NextResponse`); only their body's `error` value changes. A new `"no_gradable_sizes"` code is introduced locally in the graduate route.

- [ ] **Step 1: Write the failing test**

Add to `lib/auth/session.test.ts`:

```ts
it("carries the unauthorized code, not pt-BR prose", async () => {
  const res = unauthorized();
  expect(res.status).toBe(401);
  await expect(res.json()).resolves.toEqual({
    status: "unauthorized",
    error: "unauthorized",
  });
});
```

Add to the existing `lib/db/pattern.test.ts` (do **not** create a new file — that test file is already there):

```ts
import { describe, it, expect } from "vitest";
import { patternNotFound } from "./pattern";

describe("patternNotFound", () => {
  it("carries the pattern_not_found code, not pt-BR prose", async () => {
    const res = patternNotFound();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      status: "not_found",
      error: "pattern_not_found",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/auth/session.test.ts lib/db/pattern.test.ts`
Expected: FAIL — received `error: "Login necessário."` and `error: "Molde não encontrado."`.

- [ ] **Step 3: Convert the two `lib/` helpers**

In `lib/auth/session.ts`, replace the body of `unauthorized`:

```ts
import { apiError, ERROR_STATUS } from "@/lib/api/errors";

export function unauthorized(): NextResponse {
  return apiError("unauthorized", ERROR_STATUS.unauthorized);
}
```

Remove the now-unused `NextResponse` value import if nothing else in the file constructs one — keep `import type { NextResponse } from "next/server"` if it is still referenced in a signature.

In `lib/db/pattern.ts`, replace the body of `patternNotFound`:

```ts
import { apiError, ERROR_STATUS } from "@/lib/api/errors";

export function patternNotFound(): NextResponse {
  return apiError("pattern_not_found", ERROR_STATUS.pattern_not_found);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/auth/session.test.ts lib/db/pattern.test.ts`
Expected: PASS.

- [ ] **Step 5: Convert the pattern routes**

In `app/api/patterns/[id]/route.ts`, add the import and replace both prose payloads in `PATCH`:

```ts
import { apiError, ERROR_STATUS } from "@/lib/api/errors";

// inside PATCH, replacing the two NextResponse.json error returns:
try {
  body = await request.json();
} catch {
  return apiError("bad_body", ERROR_STATUS.bad_body);
}
const name = typeof body.name === "string" ? body.name.trim() : "";
if (!name) return apiError("invalid_name", 400);
```

In `app/api/patterns/[id]/generate/route.ts`:

```ts
import { apiError, ERROR_STATUS } from "@/lib/api/errors";

// replacing the two error returns at the top of POST:
try {
  body = await request.json();
} catch {
  return apiError("bad_body", ERROR_STATUS.bad_body);
}
const trimmed = typeof body.message === "string" ? body.message.trim() : "";
if (!trimmed) return apiError("missing_message", 400);
```

In `app/api/patterns/[id]/graduate/route.ts`, replace the `bad_body` payload the same way, and the `"Nenhum tamanho válido para graduar."` payload at line 42 with:

```ts
return {
  result: apiError("no_gradable_sizes", 400),
  entries: [],
};
```

Keep the surrounding `withPatternAndWallet` return shape exactly as it is — only the `NextResponse.json(...)` expression changes.

In `app/api/patterns/[id]/conflict/resolve/route.ts`, replace its `bad_body` payload the same way.

- [ ] **Step 6: Convert the size-chart routes**

In `app/api/size-charts/[id]/route.ts`:

```ts
import { apiError, ERROR_STATUS } from "@/lib/api/errors";

function notFound(): NextResponse {
  return apiError("size_chart_not_found", ERROR_STATUS.size_chart_not_found);
}
```

and replace the `PATCH` body-parse payload with `return apiError("bad_body", ERROR_STATUS.bad_body);`.

In `app/api/size-charts/[id]/activate/route.ts`:

```ts
import { apiError, ERROR_STATUS } from "@/lib/api/errors";

if (!ok) {
  return apiError("size_chart_not_found", ERROR_STATUS.size_chart_not_found);
}
```

- [ ] **Step 7: Verify no pt-BR prose remains in these files**

Run:

```bash
grep -rnE '"[A-Za-zÀ-ÿ][^"]* [^"]*"' app/api/patterns app/api/size-charts --include='*.ts' | grep -v '\.test\.' | grep -vE 'Content-Type|application/json'
```

Expected: only the Task 4 chat-text lines (`generate:85`, `:106`, `:135`, `graduate:67`, `:68`, `conflict/resolve:41`, `:42`). No `Corpo inválido.`, no `Grade não encontrada.`, no `Nome obrigatório.`, no `Mensagem obrigatória.`, no `Nenhum tamanho válido`.

- [ ] **Step 8: Run the full suite, lint and build**

Run: `npx vitest run && npx eslint app lib components && npm run build`
Expected: all pass. Fix any existing route test that asserted the old prose by asserting the code instead.

- [ ] **Step 9: Commit**

```bash
git add lib/auth/session.ts lib/auth/session.test.ts lib/db/pattern.ts lib/db/pattern.test.ts app/api/patterns app/api/size-charts
git commit -m "refactor(api): carry error codes instead of pt-BR prose on unrendered payloads"
```

---

### Task 3: Convert the three account routes and resolve their codes in the UI

These three routes are the only ones whose `error` string a user can actually read, so the route and its client move together.

**Files:**

- Modify: `app/api/account/profile/route.ts`, `app/api/account/password/route.ts`, `app/api/account/route.ts`
- Modify: `components/settings/ProfileSection.tsx:43`, `components/settings/PasswordSection.tsx:45`, `components/settings/DangerZoneSection.tsx:34`
- Modify: `messages/pt-BR.json` — add an `errors` object to each of the three namespaces
- Modify: `lib/api-client.ts:55-58` — narrow `AccountActionResult.error`
- Test: `app/api/account/profile/route.test.ts`, plus new `dom` tests for the three sections

**Interfaces:**

- Consumes: `apiError`, `ERROR_STATUS` (Task 1); `ChangePasswordResult`'s existing `"wrong_password" | "weak_password"` from `lib/account/settings.ts`.
- Produces: `AccountErrorCode = SharedErrorCode | "invalid_name" | "wrong_password" | "weak_password"` exported from `lib/api-client.ts`; `AccountActionResult.error?: AccountErrorCode`.

- [ ] **Step 1: Add the catalog keys**

In `messages/pt-BR.json`, add to `ProfileSection`:

```json
    "errors": {
      "bad_body": "Não foi possível salvar. Tente novamente.",
      "invalid_name": "Nome obrigatório."
    }
```

Add to `PasswordSection`:

```json
    "errors": {
      "bad_body": "Não foi possível alterar a senha. Tente novamente.",
      "account_not_found": "Não foi possível alterar a senha. Tente novamente.",
      "wrong_password": "Senha atual incorreta.",
      "weak_password": "A nova senha deve ter pelo menos 8 caracteres."
    }
```

Add to `DangerZoneSection`:

```json
    "errors": {
      "bad_body": "Não foi possível excluir a conta. Tente novamente.",
      "account_not_found": "Não foi possível excluir a conta. Tente novamente.",
      "wrong_password": "Senha incorreta."
    }
```

Leave the existing `saveError`, `nameRequired`, `tooShortError` and `genericError` keys in place — `nameRequired` and `tooShortError` are still used for client-side pre-submit validation, and `saveError`/`genericError` remain the fallback when `result.error` is absent.

- [ ] **Step 2: Write the failing route test**

Add to `app/api/account/profile/route.test.ts`:

```ts
it("answers invalid_name as a code, not pt-BR prose", async () => {
  const res = await PATCH(req({ name: "   " }));
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    status: "error",
    error: "invalid_name",
  });
});

it("answers bad_body as a code when the body is not JSON", async () => {
  const res = await PATCH(
    new Request("http://test", { method: "PATCH", body: "not json" }),
  );
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run app/api/account/profile/route.test.ts`
Expected: FAIL — received `error: "Nome obrigatório."`.

- [ ] **Step 4: Convert the three routes**

`app/api/account/profile/route.ts`:

```ts
import { apiError, ERROR_STATUS } from "@/lib/api/errors";

try {
  body = await request.json();
} catch {
  return apiError("bad_body", ERROR_STATUS.bad_body);
}

const name = validateName(body.name);
if (!name) return apiError("invalid_name", 400);
```

`app/api/account/password/route.ts` — note the whole prose ternary disappears, because `changePassword` already returns the right codes:

```ts
import { apiError, ERROR_STATUS } from "@/lib/api/errors";
import type { ChangePasswordResult } from "@/lib/account/settings";

// Domain codes carry their own status here, mirroring app/api/signup/route.ts's
// local STATUS map. Both are client-fixable input errors, so both are 400.
const DOMAIN_STATUS: Record<
  Extract<ChangePasswordResult, { ok: false }>["error"],
  number
> = { wrong_password: 400, weak_password: 400 };

try {
  body = await request.json();
} catch {
  return apiError("bad_body", ERROR_STATUS.bad_body);
}

const user = await getUserById(gate.id);
if (!user) {
  return apiError("account_not_found", ERROR_STATUS.account_not_found);
}

const result = await changePassword(
  { verify: verifyPassword, hash: hashPassword },
  body.currentPassword,
  body.newPassword,
  user.passwordHash,
);
if (!result.ok) {
  return apiError(result.error, DOMAIN_STATUS[result.error]);
}
```

`app/api/account/route.ts`:

```ts
import { apiError, ERROR_STATUS } from "@/lib/api/errors";

try {
  body = await request.json();
} catch {
  return apiError("bad_body", ERROR_STATUS.bad_body);
}

const user = await getUserById(gate.id);
if (!user) {
  return apiError("account_not_found", ERROR_STATUS.account_not_found);
}

const ok = await verifyForDeletion(
  { verify: verifyPassword },
  body.password,
  user.passwordHash,
);
if (!ok) return apiError("wrong_password", 400);
```

- [ ] **Step 5: Narrow the wire type**

In `lib/api-client.ts`, replace the `AccountActionResult` interface:

```ts
import type { SharedErrorCode } from "./api/errors";

export type AccountErrorCode =
  SharedErrorCode | "invalid_name" | "wrong_password" | "weak_password";

export interface AccountActionResult {
  status: "ok" | "error";
  error?: AccountErrorCode;
}
```

- [ ] **Step 6: Resolve the codes in the three sections**

`components/settings/ProfileSection.tsx:43` becomes:

```tsx
setError(result.error ? t(`errors.${result.error}`) : t("saveError"));
```

`components/settings/PasswordSection.tsx:45` becomes:

```tsx
setError(result.error ? t(`errors.${result.error}`) : t("tooShortError"));
```

`components/settings/DangerZoneSection.tsx:34` becomes:

```tsx
setError(result.error ? t(`errors.${result.error}`) : t("genericError"));
```

- [ ] **Step 7: Write the `dom` tests**

Create `components/settings/PasswordSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl, ptBR } from "../test-utils";

vi.mock("@/lib/api-client", () => ({ changePassword: vi.fn() }));

import { PasswordSection } from "./PasswordSection";
import { changePassword } from "@/lib/api-client";

describe("PasswordSection", () => {
  beforeEach(() => vi.mocked(changePassword).mockReset());

  it("renders the catalog text for a wrong_password code", async () => {
    vi.mocked(changePassword).mockResolvedValue({
      status: "error",
      error: "wrong_password",
    });
    renderWithIntl(<PasswordSection />);

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.currentLabel),
      "old-password",
    );
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.newLabel),
      "new-password-1",
    );
    await user.type(
      screen.getByLabelText(ptBR.PasswordSection.confirmLabel),
      "new-password-1",
    );
    await user.click(
      screen.getByRole("button", { name: ptBR.PasswordSection.submitButton }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(ptBR.PasswordSection.errors.wrong_password),
      ).toBeInTheDocument();
    });
  });
});
```

`PasswordSection` takes no props, so `<PasswordSection />` is the whole render. Its three inputs are labelled through `FieldLabel`/`htmlFor`, so `getByLabelText` with the catalog label resolves them.

- [ ] **Step 8: Run everything**

Run: `npx vitest run && npx eslint app lib components && npm run build`
Expected: all pass.

- [ ] **Step 9: Verify no pt-BR prose remains in `app/api/account`**

Run:

```bash
grep -rnE '"[A-Za-zÀ-ÿ][^"]* [^"]*"' app/api/account --include='*.ts' | grep -v '\.test\.'
```

Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add app/api/account components/settings lib/api-client.ts messages/pt-BR.json
git commit -m "refactor(settings): resolve account error codes through the catalog"
```

---

### Task 4: Server-produced chat text into `PatternData.chat.*`

**Files:**

- Modify: `messages/pt-BR.json` — add `chat` to the `PatternData` namespace
- Modify: `app/api/patterns/[id]/generate/route.ts:85`, `:106`, `:135`
- Modify: `app/api/patterns/[id]/graduate/route.ts:67-68`
- Modify: `app/api/patterns/[id]/conflict/resolve/route.ts:41-42`
- Test: `messages` key-existence is enforced by the convention hook's CHECK 4; add a route test for the graduate message

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: catalog keys `PatternData.chat.askFallback`, `.declineFallback`, `.creditChip`, `.graduated`, `.sleeveRefit`, `.freeFixChip`.

- [ ] **Step 1: Add the catalog keys**

Add to the `PatternData` namespace in `messages/pt-BR.json`:

```json
    "chat": {
      "askFallback": "Pra acertar a modelagem, me responde:",
      "declineFallback": "Não consegui aplicar esse pedido.",
      "creditChip": "−{cost, plural, one {# crédito} other {# créditos}}",
      "graduated": "Graduação aplicada para {list}.",
      "sleeveRefit": "Copa da manga refeita para a cava ajustada — as costuras voltaram a bater.",
      "freeFixChip": "correção gratuita"
    }
```

The ICU plural on `creditChip` replaces the two hardcoded chips that differed only in `crédito`/`créditos`.

- [ ] **Step 2: Use them in the generate route**

`app/api/patterns/[id]/generate/route.ts` already holds `const t = await getTranslations("PatternData")`. Replace the three literals:

```ts
            text: decision.assistantMessage || t("chat.askFallback"),
```

```ts
            text:
              decision.assistantMessage ||
              decision.declineReason ||
              t("chat.declineFallback"),
```

```ts
          chips: [{ label: t("chat.creditChip", { cost }), tone: "credit" }],
```

- [ ] **Step 3: Use them in the conflict/resolve route**

`app/api/patterns/[id]/conflict/resolve/route.ts` already holds a `PatternData` translator. Replace:

```ts
        text: t("chat.sleeveRefit"),
        chips: [{ label: t("chat.freeFixChip"), tone: "neutral" }],
```

- [ ] **Step 4: Add a translator to the graduate route and use it**

`app/api/patterns/[id]/graduate/route.ts` has no translator yet. Add the import and the call, then replace both literals:

```ts
import { getTranslations } from "next-intl/server";

// near the top of POST, before withPatternAndWallet:
const t = await getTranslations("PatternData");
```

```ts
        text: t("chat.graduated", { list: formatList(sizes) }),
        chips: [{ label: t("chat.creditChip", { cost }), tone: "credit" }],
```

`formatList` still takes only `items` at this point — Task 5 changes its signature and this call site with it.

- [ ] **Step 5: Verify the catalog keys resolve**

Run: `npx vitest run && npx eslint app lib components && npm run build`
Expected: all pass. The convention hook's CHECK 4 validates that each `t("chat.…")` key exists inside the declared `PatternData` namespace; a typo fails here rather than rendering the key name at runtime.

- [ ] **Step 6: Verify no chat prose remains**

Run:

```bash
grep -rnE '"[A-Za-zÀ-ÿ][^"]* [^"]*"' app/api/patterns --include='*.ts' | grep -v '\.test\.'
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add app/api/patterns messages/pt-BR.json
git commit -m "refactor(chat): resolve server-produced chat text through PatternData"
```

---

### Task 5: `lib/format.ts` takes a `Translate`

**Files:**

- Modify: `lib/format.ts`
- Modify: `messages/pt-BR.json` — new `Format` namespace
- Modify: `components/dashboard/PatternCard.tsx:69`, `components/dashboard/RecentUsageCard.tsx:28`, `components/settings/UsageSection.tsx:108`, `components/editor/PieceDetailsPanel.tsx:85`, `app/api/patterns/[id]/graduate/route.ts`
- Test: `lib/format.test.ts`

**Interfaces:**

- Consumes: `Translate` from `lib/i18n/translate.ts`.
- Produces: `relativeTime(t: Translate, iso: string, now?: Date): string` and `formatList(t: Translate, items: string[]): string`. `initialsFromEmail(email: string): string` is unchanged — it produces no display text.

- [ ] **Step 1: Add the catalog namespace**

Add a top-level `Format` namespace to `messages/pt-BR.json`:

```json
  "Format": {
    "relativeNow": "agora",
    "relativeMinutes": "há {n} min",
    "relativeHours": "há {n}h",
    "relativeDays": "há {n}d",
    "listConjunction": " e ",
    "dateLocale": "pt-BR"
  }
```

`dateLocale` is a catalog value because the locale a date is formatted in belongs to the catalog, not to a `lib/` constant — it is the same seam, applied to a BCP-47 tag instead of a sentence.

- [ ] **Step 2: Write the failing test**

Replace the `relativeTime` block in `lib/format.test.ts` and add a `formatList` block:

```ts
import { describe, it, expect } from "vitest";
import { relativeTime, formatList, initialsFromEmail } from "./format";

// A fake translator that echoes the key and its values, so these tests assert
// the seam (which key, which interpolation) and never a pt-BR string.
const t = (key: string, values?: Record<string, unknown>) => {
  // dateLocale must echo a VALID BCP-47 tag: toLocaleDateString throws
  // RangeError on an invalid one, which would error the test rather than fail it.
  if (key === "dateLocale") return "en-US";
  return values ? `${key}:${JSON.stringify(values)}` : key;
};

describe("relativeTime", () => {
  const now = new Date("2026-08-21T12:00:00Z");

  it("emits the now key under a minute", () => {
    expect(relativeTime(t, "2026-08-21T11:59:30Z", now)).toBe("relativeNow");
  });

  it("emits minutes with an n value", () => {
    expect(relativeTime(t, "2026-08-21T11:45:00Z", now)).toBe(
      'relativeMinutes:{"n":15}',
    );
  });

  it("emits hours with an n value", () => {
    expect(relativeTime(t, "2026-08-21T09:00:00Z", now)).toBe(
      'relativeHours:{"n":3}',
    );
  });

  it("emits days with an n value", () => {
    expect(relativeTime(t, "2026-08-19T12:00:00Z", now)).toBe(
      'relativeDays:{"n":2}',
    );
  });

  it("falls back to a locale date past a week, using the catalog locale", () => {
    const out = relativeTime(t, "2026-07-01T12:00:00Z", now);
    expect(out).not.toContain("relative");
    // Pins that the tag came from t("dateLocale"): a hardcoded "pt-BR" in the
    // implementation yields "01/07/2026", not the en-US "7/1/2026".
    expect(out).toBe(
      new Date("2026-07-01T12:00:00Z").toLocaleDateString("en-US"),
    );
  });
});

describe("formatList", () => {
  it("returns a lone item unchanged", () => {
    expect(formatList(t, ["P"])).toBe("P");
  });

  it("returns an empty string for no items", () => {
    expect(formatList(t, [])).toBe("");
  });

  it("joins two items with the catalog conjunction", () => {
    expect(formatList(t, ["P", "M"])).toBe("PlistConjunctionM");
  });

  it("comma-separates all but the last, then uses the conjunction", () => {
    expect(formatList(t, ["P", "M", "G"])).toBe("P, MlistConjunctionG");
  });
});

describe("initialsFromEmail", () => {
  it("takes the first two letters of the local part", () => {
    expect(initialsFromEmail("leonardo@moldai.dev")).toBe("LE");
  });
});
```

The fake translator returns `"en-US"` for `dateLocale` on purpose: `toLocaleDateString` throws `RangeError` on an invalid tag (verified — `toLocaleDateString("dateLocale")` throws), which would _error_ the test rather than fail it. Echoing a real-but-different locale is what makes the assertion discriminate: a hardcoded `"pt-BR"` in the implementation yields `01/07/2026` where the test expects the en-US `7/1/2026`.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/format.test.ts`
Expected: FAIL — `relativeTime` currently ignores its first argument and returns pt-BR.

- [ ] **Step 4: Rewrite `lib/format.ts`**

```ts
import type { Translate } from "@/lib/i18n/translate";

// Joins a list as prose. The conjunction is pt-BR in the catalog, not here.
export function formatList(t: Translate, items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}${t("listConjunction")}${items[items.length - 1]}`;
}

export function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const letters = local.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 2) || "?").toUpperCase();
}

// "updated" labels on the dashboard, the usage list and the editor header.
// The caller supplies a translator scoped to the Format namespace.
export function relativeTime(
  t: Translate,
  iso: string,
  now: Date = new Date(),
): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return t("relativeNow");
  if (min < 60) return t("relativeMinutes", { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t("relativeHours", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("relativeDays", { n: days });
  return new Date(iso).toLocaleDateString(t("dateLocale"));
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run lib/format.test.ts`
Expected: PASS.

- [ ] **Step 6: Update the five call sites**

In `components/dashboard/PatternCard.tsx`, add a second translator and pass it:

```tsx
import { useTranslations } from "next-intl";

const tf = useTranslations("Format");
// …
{
  relativeTime(tf, pattern.updatedAt);
}
```

Do the same in `components/dashboard/RecentUsageCard.tsx` (`relativeTime(tf, e.createdAt)`) and `components/settings/UsageSection.tsx` (`relativeTime(tf, entry.createdAt)`).

In `components/editor/PieceDetailsPanel.tsx`, add `const tf = useTranslations("Format");` and change line 85 to `list: formatList(tf, gradable),`.

In `app/api/patterns/[id]/graduate/route.ts`, add a second server translator and use it:

```ts
  const tFormat = await getTranslations("Format");
  // …
        text: t("chat.graduated", { list: formatList(tFormat, sizes) }),
```

- [ ] **Step 7: Run everything**

Run: `npx vitest run && npx eslint app lib components && npm run build`
Expected: all pass. Any `dom` test that rendered a relative time now needs a `Format`-namespace-backed assertion; `renderWithIntl` already supplies the real catalog, so no stub is needed.

- [ ] **Step 8: Commit**

```bash
git add lib/format.ts lib/format.test.ts components app/api/patterns messages/pt-BR.json
git commit -m "refactor(format): resolve relative times and list prose through the catalog"
```

---

### Task 6: The paywall carries an action code

**Files:**

- Modify: `lib/store.ts:23-31` (`PaywallState`), `:105`, `:163`, `:206`, `:233`, `:246`
- Modify: `components/editor/PaywallModal.tsx:25-26`, `:48`
- Modify: `messages/pt-BR.json` — `PaywallModal.actions`
- Test: `lib/store.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `PaywallState.action: "adjust" | "graduate" | null` replaces `actionLabel: string`. Every reset site sets `action: null`.

- [ ] **Step 1: Add the catalog keys**

Add to the `PaywallModal` namespace in `messages/pt-BR.json`:

```json
    "actions": {
      "adjust": "Esse ajuste",
      "graduate": "Essa graduação"
    }
```

Stored already capitalised, because `description` interpolates `{action}` at the start of a sentence. This is what lets the `charAt(0).toUpperCase()` surgery go away.

- [ ] **Step 2: Write the failing test**

Add to `lib/store.test.ts`:

```ts
it("stashes the graduate action code on the paywall, not pt-BR prose", async () => {
  vi.mocked(api.graduate).mockResolvedValue({
    status: "insufficient_credits",
    required: 3,
    balance: 1,
  });
  useEditorStore.setState({ patternId: "p1" });

  await useEditorStore.getState().graduateSizes(["P", "M"]);

  expect(useEditorStore.getState().paywall.action).toBe("graduate");
});
```

Match the mocking style already used in `lib/store.test.ts` — read the file first and reuse its existing `api` mock and reset helpers rather than inventing new ones.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/store.test.ts`
Expected: FAIL — `paywall.action` is `undefined`.

- [ ] **Step 4: Change the store**

In `lib/store.ts`, replace the field in `PaywallState`:

```ts
interface PaywallState {
  open: boolean;
  required: number;
  balance: number;
  action: "adjust" | "graduate" | null;
  retry: (() => void) | null;
}
```

At `:163` (inside `sendMessage`) use `action: "adjust",`; at `:206` (inside `graduateSizes`) use `action: "graduate",`. At the three reset sites (`:105` initial state, the post-purchase reset, and `closePaywall`) replace `actionLabel: ""` with `action: null`.

- [ ] **Step 5: Change the modal**

In `components/editor/PaywallModal.tsx`, delete the two-line `actionLabel` computation and interpolate the resolved code:

```tsx
<DialogDescription>
  {t("description", {
    action: paywall.action ? t(`actions.${paywall.action}`) : "",
    required: paywall.required,
    balance: paywall.balance,
  })}
</DialogDescription>
```

- [ ] **Step 6: Run everything**

Run: `npx vitest run && npx eslint app lib components && npm run build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/store.ts lib/store.test.ts components/editor/PaywallModal.tsx messages/pt-BR.json
git commit -m "refactor(paywall): carry an action code instead of a pt-BR label"
```

---

### Task 7: The last three `lib/` display strings

**Files:**

- Modify: `lib/export/index.ts:19`
- Modify: `lib/db/sizeChart.ts:70-89` (`createSizeChart`)
- Modify: `app/api/size-charts/route.ts:32`, `app/api/size-charts/[id]/duplicate/route.ts:11`
- Modify: `lib/editor/state.ts:73`, `lib/db/pattern.ts:77-81` (`createPattern`), `app/api/patterns/route.ts:15`
- Modify: `messages/pt-BR.json`
- Test: `lib/editor/state.test.ts`

**Interfaces:**

- Consumes: `Translate`.
- Produces: `createSizeChart(userId: string, copySuffix: string, sourceSizeChartId?: string)`; `createPattern(userId: string, t: Translate)`; `seedPatternState(t: Translate, ...existing params)` — read the current signature and prepend `t`, matching how `applyGarmentSpec` already takes one.

- [ ] **Step 1: Add the catalog keys**

Add to the `PatternData` namespace:

```json
    "newPatternName": "Novo molde"
```

Add to the `SizeCharts` namespace (the `/size-charts` screen namespace; the two routes that create a chart read the same namespace server-side):

```json
    "copySuffix": " (cópia)"
```

Add `exportFailed` to the **`PatternData`** namespace:

```json
    "exportFailed": "A exportação falhou. Tente novamente."
```

`PatternData` is the correct namespace here and not `Footer`: `components/editor/Footer.tsx:82` already calls `exportPattern(pattern, format, tData, …)` where `tData = useTranslations("PatternData")`, so that is the translator the function receives and the only namespace its keys can resolve against.

- [ ] **Step 2: Fix the export failure string**

`exportPattern` already receives that `PatternData` translator and ignores it for this one string. In `lib/export/index.ts`:

```ts
const fail = () => onError?.(t("exportFailed"));
```

No call-site change is needed — `Footer.tsx:82` already passes `tData`.

- [ ] **Step 3: Fix the duplicate-chart suffix**

In `lib/db/sizeChart.ts`:

```ts
export async function createSizeChart(
  userId: string,
  copySuffix: string,
  sourceSizeChartId?: string,
): Promise<SizeChartRecord> {
  // …unchanged…
  const data: SizeChartData = {
    ...sourceData,
    name: `${sourceData.name}${copySuffix}`,
    isSystem: false,
  };
```

In `app/api/size-charts/[id]/duplicate/route.ts`:

```ts
import { getTranslations } from "next-intl/server";

const t = await getTranslations("SizeCharts");
const chart = await createSizeChart(gate.id, t("copySuffix"), id);
```

Do the same in `app/api/size-charts/route.ts:32` (`createSizeChart(gate.id, t("copySuffix"), sourceId)`).

- [ ] **Step 4: Write the failing test for the seeded pattern name**

In `lib/editor/state.test.ts`, add:

```ts
it("takes the new-pattern name from the translator", () => {
  const t = (key: string) => key;
  const state = seedPatternState(t);
  expect(state.pattern.name).toBe("newPatternName");
});
```

Adjust the call to match `seedPatternState`'s real parameter list once `t` is prepended.

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run lib/editor/state.test.ts`
Expected: FAIL — receives `"Novo molde"`.

- [ ] **Step 6: Thread the translator to `seedPatternState`**

In `lib/editor/state.ts`, prepend `t: Translate` to `seedPatternState`'s parameters and use it:

```ts
    name: t("newPatternName"),
```

In `lib/db/pattern.ts`:

```ts
export async function createPattern(
  userId: string,
  t: Translate,
): Promise<string> {
  const data = seedPatternState(t) as unknown as Prisma.InputJsonValue;
  const row = await prisma.pattern.create({ data: { userId, data } });
  return row.id;
}
```

In `app/api/patterns/route.ts`:

```ts
import { getTranslations } from "next-intl/server";

export async function POST() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const t = await getTranslations("PatternData");
  const id = await createPattern(gate.id, t);
  return NextResponse.json({ id });
}
```

Fix every other `seedPatternState(...)` caller the compiler flags — including test files, which can pass `(key) => key`.

- [ ] **Step 7: Run everything**

Run: `npx vitest run && npx eslint app lib components && npm run build`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add lib app/api messages/pt-BR.json
git commit -m "refactor(i18n): resolve the remaining lib display strings through the catalog"
```

---

### Task 8: Drop the `Wallet.planLabel` column

**Files:**

- Create: `prisma/migrations/20260821120000_drop_wallet_plan_label/migration.sql`
- Modify: `prisma/schema.prisma:60`
- Modify: `lib/billing/wallet.ts:5`, `:28-29`, `:63-64`
- Modify: `lib/db/wallet.ts:12`, `:18-25`, `:34-39`, `:49-51`
- Modify: `lib/types.ts:94-100` (`Credits`)
- Modify: `lib/api/compose.ts:5-12`
- Modify: `components/shared/PageHeader.tsx:95`
- Does NOT touch `messages/pt-BR.json` — see Step 1, this task adds no catalog keys
- Test: `lib/billing/wallet.test.ts`, `lib/api/compose.test.ts`, `lib/db/wallet.test.ts`, `components/shared/PageHeader.test.tsx`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `Wallet` and `Credits` both lose `planLabel`. `buildCredits(wallet, now)` keeps its signature. `PageHeader` resolves the label itself.

- [ ] **Step 1: Do NOT add a new catalog block — reuse the existing plan names**

`messages/pt-BR.json` already holds all four plan display names at `PlanSection.plans.{free,atelier,studio,factory}.name` (`"Grátis"`, `"Ateliê"`, `"Estúdio"`, `"Confecção"`), because `PlanSection` renders the four cards from design `5c`. Adding a second `plan.*` block under `PageHeader` would duplicate that copy into two places a rename has to touch — and, worse, a two-key block would fail to resolve for a `studio` or `factory` wallet, since `PlanId` is `"free" | "atelier" | "studio" | "factory"`, not a pair.

So this task adds **no** catalog keys. `PageHeader` reads the existing ones.

- [ ] **Step 2: Write the failing test**

In `lib/api/compose.test.ts`, replace any `planLabel` assertion with:

```ts
it("does not put a display label on the wire", () => {
  const credits = buildCredits(wallet, now);
  expect(credits).not.toHaveProperty("planLabel");
  expect(credits.plan).toBe("free");
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/api/compose.test.ts`
Expected: FAIL — `credits` still has `planLabel`.

- [ ] **Step 4: Write the migration**

Create `prisma/migrations/20260821120000_drop_wallet_plan_label/migration.sql`:

```sql
-- planLabel held pt-BR display text ("Grátis"/"Ateliê") fully derivable from
-- "plan", which made it possible for the label to drift from the plan it
-- described. The label is now a catalog lookup keyed by the plan enum, so the
-- column carries nothing that cannot be recomputed.
ALTER TABLE "Wallet" DROP COLUMN "planLabel";
```

Remove the `planLabel String` line from the `Wallet` model in `prisma/schema.prisma`.

- [ ] **Step 5: Remove the field from the billing module and the repository**

In `lib/billing/wallet.ts`: delete `planLabel: string;` from the `Wallet` interface, delete `planLabel: "Grátis",` from `seedWallet`'s returned object, and delete the `wallet.planLabel = "Ateliê";` line in `applyPurchase` (keep the `wallet.plan = "atelier";` line).

In `lib/db/wallet.ts`: delete `planLabel: string;` from `WalletRow`, delete `planLabel: row.planLabel,` from `toWallet`, and drop the column from all three raw SQL statements:

```ts
await tx.$executeRaw`
    INSERT INTO "Wallet" ("userId", "plan", "balance", "total", "renewsAt", "updatedAt")
    VALUES (${userId}, ${seed.plan}, ${seed.balance}, ${seed.total}, ${seed.renewsAt}, now())
    ON CONFLICT ("userId") DO NOTHING`;
const rows = await tx.$queryRaw<WalletRow[]>`
    SELECT "plan", "balance", "total", "renewsAt"
    FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
```

```ts
await tx.$executeRaw`
    UPDATE "Wallet"
    SET "plan" = ${wallet.plan},
        "balance" = ${wallet.balance}, "total" = ${wallet.total},
        "renewsAt" = ${wallet.renewsAt}, "updatedAt" = now()
    WHERE "userId" = ${userId}`;
```

- [ ] **Step 6: Remove it from the wire type and the composer**

In `lib/types.ts`, delete `planLabel: string;` from `Credits`. In `lib/api/compose.ts`, delete `planLabel: wallet.planLabel,` from `buildCredits`.

- [ ] **Step 7: Resolve the label in `PageHeader`**

In `components/shared/PageHeader.tsx`, add a second translator bound to the namespace that already owns the plan names, and resolve the label from the enum:

```tsx
const tPlan = useTranslations("PlanSection");
// …
{
  t("creditsLabel", {
    planLabel: tPlan(`plans.${credits.plan}.name`),
    balance: credits.balance,
  });
}
```

The `creditsLabel` ICU placeholder name stays `planLabel` — only its source changes — so the catalog string itself needs no edit. Reading `PlanSection`'s namespace from `PageHeader` is deliberate: those four names are the single source of truth for plan copy, and this covers all four `PlanId` members rather than just the two `applyPurchase` can currently issue.

- [ ] **Step 8: Apply the migration and run everything**

Run:

```bash
npm run db:up
npm run db:migrate
npx vitest run && npx eslint app lib components && npm run build
```

Expected: the migration applies cleanly; all checks pass. Fix `lib/db/wallet.test.ts`, `lib/billing/wallet.test.ts`, `lib/db/pattern-wallet.test.ts` and `components/shared/PageHeader.test.tsx` fixtures that still set or assert `planLabel`.

- [ ] **Step 9: Commit**

```bash
git add prisma lib components/shared messages/pt-BR.json
git commit -m "refactor(billing): derive the plan label instead of storing it"
```

---

### Task 9: Drop `Pattern.savedAgo` from the blob

`savedAgo` is both hardcoded pt-BR and a live bug: nothing recomputes it, so the editor header reads "salvo agora" forever, including after a reload. Deriving it from `updatedAt` fixes both.

**Files:**

- Modify: `lib/types.ts:138` (`Pattern.savedAgo`)
- Modify: `lib/editor/state.ts:75`, `:126-131` (`bumpVersion`)
- Modify: `lib/db/pattern.ts:68-75` (`loadPattern`)
- Modify: `lib/api/compose.ts` (`composeEditorState`)
- Modify: `app/api/patterns/[id]/route.ts:17-27`, `app/api/billing/purchase/route.ts:24`
- Modify: `components/editor/EditorShell.tsx:53-56`
- Test: `lib/editor/state.test.ts`, `lib/api/compose.test.ts`

**Interfaces:**

- Consumes: `relativeTime(t, iso, now?)` from Task 5.
- Produces: `loadPattern(patternId, userId): Promise<{ state: PatternState; updatedAt: Date } | null>`; `composeEditorState(patternState, wallet, now, updatedAt?: Date)` where `updatedAt` defaults to `now`; `Pattern` no longer has `savedAgo`; the wire `Pattern` gains `updatedAt: string`.

**Why `lockPattern` is not widened:** every mutating route runs inside `withPattern`/`withPatternAndWallet`, and `savePattern` sets `"updatedAt" = now()`. So a mutation response's `updatedAt` _is_ the route's `now`, and passing `now` for both arguments is exact, not an approximation. Only the two non-mutating readers (`GET /api/patterns/[id]` and the purchase route) need the stored timestamp.

- [ ] **Step 1: Write the failing test**

In `lib/api/compose.test.ts`, add:

```ts
it("puts updatedAt on the wire and no savedAgo", () => {
  const state = composeEditorState(
    patternState,
    wallet,
    new Date("2026-08-21T12:00:00Z"),
    new Date("2026-08-21T11:30:00Z"),
  );
  expect(state.pattern).not.toHaveProperty("savedAgo");
  expect(state.pattern.updatedAt).toBe("2026-08-21T11:30:00.000Z");
});

it("defaults updatedAt to now when the caller just mutated the row", () => {
  const now = new Date("2026-08-21T12:00:00Z");
  const state = composeEditorState(patternState, wallet, now);
  expect(state.pattern.updatedAt).toBe(now.toISOString());
});
```

Reuse the `patternState` and `wallet` fixtures already in that file.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/api/compose.test.ts`
Expected: FAIL — `composeEditorState` takes three arguments and `pattern.updatedAt` is undefined.

- [ ] **Step 3: Change the types**

In `lib/types.ts`, in the `Pattern` interface, replace `savedAgo: string;` with `updatedAt: string;`.

- [ ] **Step 4: Stop writing it in the state module**

In `lib/editor/state.ts`, delete the `savedAgo: "ainda não salvo",` line from `seedPatternState`'s returned pattern, and in `bumpVersion` delete `savedAgo: "salvo agora",`:

```ts
export function bumpVersion(state: PatternState): void {
  state.pattern = {
    ...state.pattern,
    version: state.pattern.version + 1,
  };
}
```

`updatedAt` is not part of the persisted blob — it is composed onto the wire from the row's own column — so `seedPatternState` gains nothing in its place.

- [ ] **Step 5: Compose it onto the wire**

In `lib/api/compose.ts`:

```ts
export function composeEditorState(
  patternState: PatternState,
  wallet: Wallet,
  now: Date,
  // Defaults to `now` because every mutating caller has just written
  // "updatedAt" = now() in the same transaction.
  updatedAt: Date = now,
): EditorState {
  return {
    ...patternState,
    pattern: { ...patternState.pattern, updatedAt: updatedAt.toISOString() },
    credits: buildCredits(wallet, now),
  };
}
```

- [ ] **Step 6: Widen `loadPattern`**

In `lib/db/pattern.ts`:

```ts
export async function loadPattern(
  patternId: string,
  userId: string,
): Promise<{ state: PatternState; updatedAt: Date } | null> {
  const row = await prisma.pattern.findUnique({ where: { id: patternId } });
  if (!row || row.userId !== userId) return null;
  return { state: toState(row.data), updatedAt: row.updatedAt };
}
```

- [ ] **Step 7: Update the two readers**

In `app/api/patterns/[id]/route.ts`'s `GET`:

```ts
const [loaded, wallet] = await Promise.all([
  loadPattern(id, gate.id),
  loadWallet(gate.id),
]);
if (!loaded) return patternNotFound();
return NextResponse.json(
  composeEditorState(loaded.state, wallet, new Date(), loaded.updatedAt),
);
```

In `app/api/billing/purchase/route.ts`, read the file around line 24 and apply the same change: destructure `loaded.state` where `patternState` was used and pass `loaded.updatedAt` as the fourth argument to `composeEditorState`.

- [ ] **Step 8: Render it in the editor header**

In `components/editor/EditorShell.tsx`:

```tsx
import { relativeTime } from "@/lib/format";

  const tf = useTranslations("Format");
  // …
          subtitle={t("savedVersion", {
            savedAgo: relativeTime(tf, pattern.updatedAt),
            version: pattern.version,
          })}
```

The `savedVersion` placeholder name stays `savedAgo`, so the catalog string `"{savedAgo} · v{version}"` needs no edit.

- [ ] **Step 9: Run everything**

Run: `npx vitest run && npx eslint app lib components && npm run build`
Expected: all pass. Fix every fixture that still sets `savedAgo` (`lib/editor/state.test.ts`, `lib/api/compose.test.ts`, `lib/db/pattern-wallet.test.ts`, `lib/store.test.ts`, and any `dom` test building a `Pattern`).

- [ ] **Step 10: Confirm no blob reset is needed**

Old rows still contain a `savedAgo` key inside `data`. `toState` casts the parsed JSON, and nothing reads the field, so the extra key is inert — this is deliberately the cheap direction of a blob change, unlike the `reset_moldes_english` precedent that changed a shape readers depended on. Verify by loading a pre-existing pattern in the dev stack:

```bash
npm run docker:up
```

Open an existing pattern at `/pattern/[id]` and confirm the header renders a relative time rather than a blank or "ainda não salvo".

- [ ] **Step 11: Commit**

```bash
git add lib app/api components/editor
git commit -m "refactor(editor): derive savedAgo from updatedAt instead of persisting it"
```

---

### Task 10: Documentation and final verification

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the i18n section**

Delete the paragraph beginning **"Known asymmetry, not yet reconciled:"** — it is now false. Replace it with:

```markdown
- **The wire and the database carry codes, never pt-BR prose.** Every `app/api/*` error payload is `{status, error: <code>}` where the code is machine-readable and the client resolves it through the catalog (`t("errors." + code)`), the `SignupErrorCode` precedent. Shared route-level codes and the `apiError` helper live in `lib/api/errors.ts`; **domain codes stay beside their own pure logic** (`ChangePasswordResult` in `lib/account/settings.ts`, `SignupErrorCode` in `lib/account/signup.ts`) because those unions type a pure function's return, and each route unions the two and maps its own HTTP statuses. `apiError` takes a bare `string` for exactly that reason. Its `STATUS_WORD` map reproduces each response's pre-existing `status` discriminator, warts included: `/api/account/*` answers its 404 with `status: "error"`, not `"not_found"`.
```

- [ ] **Step 2: Record the two dropped fields**

Add to the Billing section:

```markdown
- `Wallet` has **no `planLabel`** (migration `drop_wallet_plan_label`). It stored pt-BR display text fully derivable from `plan`, which let the label drift from the plan it named; `PageHeader` now resolves `t("plan." + credits.plan)`, per the catalog-lookup-keyed-by-EN-enum rule.
```

Add to the data-layer section:

```markdown
- `Pattern` has **no `savedAgo`**. It was persisted pt-BR display text that nothing recomputed, so the editor header claimed "salvo agora" indefinitely, including after a reload. The wire `Pattern` carries `updatedAt` instead and the editor renders `relativeTime(t, updatedAt)`. `loadPattern` therefore returns `{state, updatedAt}`; `lockPattern` does **not**, because `savePattern` sets `updatedAt = now()` inside the same transaction, so a mutating route's `now` already _is_ the row's timestamp. Old blobs still carry an inert `savedAgo` key — no reset migration was needed, this being the cheap direction of a blob change.
```

- [ ] **Step 3: Record the hook's blind spot**

Add to the conventions list:

```markdown
- **`.claude/hooks/check-conventions.mjs`'s hardcoded-pt-BR check (CHECK 1) runs on `.tsx` only.** Every route handler is `.ts`, which is how 43 pt-BR strings accumulated in `app/api/**` and `lib/**` unnoticed before the wire-error-codes sweep. Nothing mechanical guards those paths today — a prose string in a route handler will not be caught for you.
```

- [ ] **Step 4: Verify the sweep is complete**

Run:

```bash
grep -rnE '"[A-Za-zÀ-ÿ][^"]* [^"]*"|`[^`]*[a-záéíóúãç][^`]* [^`]*`' app/api lib --include='*.ts' \
  | grep -v '\.test\.' \
  | grep -vE 'Content-Type|application/json|Retry-After|SELECT|INSERT|UPDATE|WHERE|VALUES|ON CONFLICT|FOR UPDATE|jsonb|throw new Error|prompt\.ts|schema\.ts|history\.ts|decision\.ts|dxf'
```

Expected: no pt-BR display prose. Remaining hits must be only: English AI prompt/schema text in `lib/ai/`, English `throw new Error` messages, SQL, HTTP headers, and the DXF file-content strings — all explicitly out of scope per the spec.

- [ ] **Step 5: Full verification**

Run: `npx vitest run && npx eslint app lib components && npm run build`
Expected: all pass, and the test count is at least the 421 the suite had before this plan.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record codes on the wire and the two dropped persisted fields"
```

---

## Task-to-commit-group mapping

The spec named four ordered commit groups. This plan splits them finer so each task carries its own test cycle:

| Spec group                | Tasks     |
| ------------------------- | --------- |
| 1 · error codes           | 1, 2, 3   |
| 2 · chat text             | 4         |
| 3 · `lib/` Translate seam | 5, 6, 7   |
| 4 · derive-and-drop       | 8, 9      |
| —                         | 10 (docs) |

## Known risks

- **Task 8 is the only irreversible step.** `ALTER TABLE … DROP COLUMN` discards the stored labels. They are recomputable from `plan`, so nothing is lost, but the migration cannot be rolled back by re-running it. Take a `pg_dump` first if working against any database whose contents matter.
- **Task 9 changes what the editor header displays** — from a frozen "salvo agora" to a live relative time. This is the intended fix, not a regression, but it is a visible product change and should be eyeballed in the running app (Step 10), not just asserted in tests.
- **Do not verify the conflict/resolve route in the Docker dev stack.** `POST /api/patterns/[id]/conflict/resolve` answers 404 there for reasons unrelated to this work (documented in CLAUDE.md). Verify anything touching it against `npm run dev` on the host.
