---
name: new-api-route
description: Scaffold a new app/api/*/route.ts handler following this repo's non-negotiables — requireUser() gate, bounded body parsing, machine-readable error codes, (patternId, userId)-scoped ownership queries, and the Pattern-then-Wallet lock order. Use when asked to add a new API route/endpoint under app/api, or to wire a new server action that touches Pattern/Wallet/SizeChart — also invocable with /new-api-route. Do not use for editing an existing route's logic without adding a new one.
---

# New API route

There are 30 `route.ts` files under `app/api/*` today, all shaped the same way. Read `docs/architecture/api-routes.md` first — this skill is the authoring checklist for the rules that file states for review.

## The five things every route does, in order

Template: `app/api/size-charts/[id]/activate/route.ts` (17 lines, does all five with nothing extra) — read it once before writing a new one.

```ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";

export async function POST(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;        // 1. auth gate

  const body = await readJsonObject(request);            // 2. bounded body parse
  if (body instanceof NextResponse) return body;

  // 3. domain logic, through a (patternId, userId)-scoped lib/db/* call
  const result = await someScopedDbCall(gate.id, id, body);
  if (result === null) {                                  // 4. null/false -> 404, never 403
    return apiError("some_not_found", ERROR_STATUS.some_not_found);
  }

  return NextResponse.json({ status: "ok", ...result });   // 5. machine-readable wire shape
}
```

### 1. Auth gate — `requireUser()` (`lib/auth/guard.ts:17`)

Every route needs it, **except** the six named exceptions in `CLAUDE.md`: signup, email verification, password reset, `/api/health`, the Stripe webhook, NextAuth's own `[...nextauth]/route.ts`. If your new route isn't one of those six, it gets the gate — no exceptions negotiated case-by-case. The idiom is always `if (gate instanceof NextResponse) return gate;`, never a manual session check.

### 2. Body parsing — never `request.json()` directly

- `readJsonObject(request)` (`lib/api/body.ts:65`) — an untyped `Record<string, unknown>`, for a route that does its own field-by-field validation/clamping (the `validateSpec`/`validateSizeChartPatch` style: never throw on garbage, clamp or drop instead).
- `parseBody(request, zodSchema)` (`lib/api/body.ts:102`) — for a route whose body has no such downstream clamp; on failure it always answers a bare `bad_body`, never the zod issue path (that's English prose that would leak schema shape to the client).
- Both are bounded to `MAX_BODY_BYTES` (64 KB) by default, reading the stream incrementally so a client lying about `Content-Length` can't get past the ceiling. Pass a larger explicit `maxBytes` only if the route legitimately needs it (the generate route's attachment payload is the one precedent) — never raise the default.
- Both return the `if (x instanceof NextResponse) return x;` idiom. A route that reads a body field before this check is exactly the class of bug `readJsonObject` was introduced to close (six routes did this before).

### 3. Domain logic — reuse the scoped `lib/db/*` primitives, don't hand-roll a query

Read `lib/db/pattern.ts` and `lib/db/pattern-wallet.ts` before writing a new query.

- **Every pattern-scoped query takes `(patternId, userId)` and returns `null`/`false` on either "not found" or "not yours" — never throws, never distinguishes the two.** `lockPattern`, `loadPattern`, `deletePattern` are the precedents; a route turns the `null`/`false` into `apiError("pattern_not_found", ...)`, a 404 — never a 403, which would leak existence.
- **`withPattern` (`lib/db/pattern.ts:53`) is the load→mutate→save primitive** — reuse it for a new pattern-mutating route rather than writing your own transaction.
- **If the route also touches the wallet (spends/refunds credits), use `withPatternAndWallet` (`lib/db/pattern-wallet.ts:16`) — it is the *only* function allowed to hold both locks, always Pattern first then Wallet.** Never combine `withPattern` and `withWallet` (`lib/db/wallet.ts:73`) by hand in one route — that's how you get the reversed lock order and a deadlock under concurrency.
- **Size charts have their own scoping plus a read-only rule**: `lib/db/sizeChart.ts` rejects a mutation on a chart the caller doesn't own, and separately rejects any mutation on a system chart (`isSystem`) regardless of ownership. A new size-chart-mutating route needs both checks, not just ownership.
- A new query that filters by `id` alone, or that lets `findUniqueOrThrow` throw, is the exact anti-pattern `migration-safety.md`'s review agent blocks on — write the scoped, non-throwing version the first time.

### 4. Errors — codes, not prose

- Add a new error code to `RouteErrorCode` or `NotFoundCode` in `lib/api/errors.ts:4`/`:8`, with its HTTP status in `ERROR_STATUS` (`:16`) and, if its wire `status` word isn't the default, an entry in `STATUS_WORD` (`:33`).
- Call `apiError(code, ERROR_STATUS[code])` — never `NextResponse.json({ error: "some pt-BR sentence" })`. The client resolves the code through `t("errors." + code)` — add that catalog entry in `messages/pt-BR.json` in the same change, or the client renders a missing-key fallback.
- A success response's shape is whatever the route needs, but keep `status: "ok"` (or the route's existing convention) as the discriminator the client checks first.

### 5. Rate limiting — only for a genuinely sensitive endpoint

Most routes don't need this. If the new route is auth-adjacent, spends money, or is otherwise abuse-prone (signup, login, password reset, generate), read `docs/architecture/rate-limiting.md` and wire it the same way an existing bucket does. Remember: **the limiter fails open** — a Redis outage must never lock legitimate users out.

## Test the route

Every `route.ts` has a sibling `route.test.ts` in this repo (globbing `route*.ts` catches both — don't let that inflate a route count in a doc claim). Cover: the auth-gate rejection, the not-found/not-yours case, the body-validation rejection, and the success path. Mock at the `lib/db/*` boundary, not deeper.

## Verification

`npx vitest run app/api` scoped first, then the full `/verify` sequence before considering the route done.
