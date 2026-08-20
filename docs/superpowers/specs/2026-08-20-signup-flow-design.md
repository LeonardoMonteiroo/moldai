# Sign-up flow (spec A of 3)

**Date:** 2026-08-20
**Status:** approved, ready for implementation planning
**Depends on:** nothing
**Followed by:** [email verification](./2026-08-20-email-verification-design.md)
(spec B) and [auth rate limiting](./2026-08-20-auth-rate-limiting-design.md)
(spec C), both of which depend on this one and are independent of each other.

## Problem

MoldAI has real auth (Auth.js v5, Credentials + JWT) but no way to create an
account. Users exist only via `prisma/seed.ts`. The login page advertises
account creation as unavailable — `messages/pt-BR.json` → `Login.signupNote`
renders "Criar conta — **em breve**".

This spec adds self-service sign-up: a public `/signup` page that creates a
`User`, signs the visitor in, and lands them on the dashboard.

### CLAUDE.md conflict (resolved)

CLAUDE.md documents self-signup as a deliberate scope boundary ("**Auth:** …
Login/logout only — self-signup is deferred, shown as 'em breve'"). Per the
project-stage rule this was raised before starting; the user approved building
it, so CLAUDE.md is updated as part of this work.

## Key context

New accounts need **no provisioning beyond the `User` row**. Both dependent
resources already lazy-seed on first access:

- `Wallet` — `lib/db/wallet.ts`'s `lockWallet` does `INSERT … ON CONFLICT DO NOTHING`.
- The two system size charts — `lib/db/sizeChart.ts`'s `ensureSystemSizeCharts`.

So sign-up is: validate → hash → insert one row → sign in.

## Non-goals

- **Email verification — spec B.** Until it ships, an account is usable
  immediately and the address is unproven.
- **Rate limiting — spec C.** Until it ships, account creation is unthrottled.
  Acceptable only because this instance is not publicly deployed; do not expose
  it to the internet before C.
- Password reset — its own feature, and it would want spec B's token
  infrastructure. Consequence to accept: a user who forgets their password has
  no self-service recovery.
- Onboarding (design `5b`) — stays out of scope.
- Any change to the mocked payment gateway.

## Design

### 1. Page — `app/signup/page.tsx`

Client component structurally mirroring `app/login/page.tsx`: same centered card,
same design tokens and class idiom, same `useTranslations` namespace pattern.
Four required fields:

| Field           | Type     | Notes                                                                                                                                     |
| --------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Nome            | text     | Required by the form even though `User.name` is nullable in Prisma — it feeds the avatar initials and `ProfileSection` from first render. |
| Email           | email    | `autoComplete="username"`                                                                                                                 |
| Senha           | password | `autoComplete="new-password"`, min 8 chars                                                                                                |
| Confirmar senha | password | `autoComplete="new-password"`                                                                                                             |

Confirm-password mismatch is gated **client-side only**, mirroring the existing
`PasswordSection` idiom rather than inventing a second one. The server never
receives the confirm field.

On a successful POST the page calls
`signIn("credentials", { email, password, redirect: false })` with the same
credentials, then `router.push("/")` + `router.refresh()` — the user lands on
the dashboard already authenticated, never retyping.

> **Spec B replaces this.** Once verification ships, an account starts unverified
> and cannot be signed in, so the auto-sign-in becomes a "verifique seu email"
> state instead. That is a handful of lines of rework, and auto-sign-in is the
> correct behavior for as long as A stands alone — not worth contorting A to
> avoid.

Like `/login`, the page does **not** redirect an already-signed-in visitor,
keeping the two auth pages symmetric.

### 2. API route — `POST /api/signup`

Top level, deliberately **not** under `/api/auth/*` (avoids overlapping the
`[...nextauth]` catch-all) and **not** under `/api/account/*` (every route there
is `requireUser()`-gated; a public sibling invites a future mistake). It is the
project's only unauthenticated route handler besides NextAuth's own.

**Error contract — a deliberate, documented deviation.** Existing account routes
(`profile`, `password`) return hardcoded pt-BR display strings; CLAUDE.md already
flags that as a "known asymmetry, not yet reconciled". New code should not deepen
it, so this route returns a machine-readable code the client resolves through the
catalog:

```ts
type SignupErrorCode =
  | "invalid_name"
  | "invalid_email"
  | "weak_password"
  | "email_taken"
  | "bad_body";

// lib/api-client.ts
type SignupResult =
  { status: "ok" } | { status: "error"; error: SignupErrorCode };
```

Specs B and C each extend this union (`mail_unavailable`, `rate_limited`).

Status codes: `200` ok, `409` `email_taken`, `400` everything else.

The client posts via a new `signUp()` in `lib/api-client.ts` — components never
call `fetch` directly.

### 3. Validation — `lib/account/signup.ts`

Pure, DB-free, dependency-injected, mirroring `lib/auth/authorize.ts`'s
`AuthorizeDeps` shape so it unit-tests without a live DB:

```ts
export interface NewUser {
  email: string; // already normalized
  name: string;
  passwordHash: string;
}

export interface SignupDeps {
  getUserByEmail: (email: string) => Promise<UserRecord | null>;
  createUser: (input: NewUser) => Promise<UserRecord | null>;
  hash: (plain: string) => Promise<string>;
}

export async function createAccount(
  deps: SignupDeps,
  input: { name: unknown; email: unknown; password: unknown },
): Promise<
  { ok: true; user: UserRecord } | { ok: false; error: SignupErrorCode }
>;
```

Rules:

- **Name** — reuses `validateName` from `lib/account/settings.ts` (trim,
  non-empty, max 80). No duplicated constant.
- **Password** — reuses `validateNewPassword` from the same module (min 8), so
  the 8-character minimum stays one constant shared with change-password.
- **Email** — normalized `trim().toLowerCase()`. This **must** match the
  normalization `authorizeUser` applies before lookup; otherwise an account
  created as `Foo@x.com` could never be logged into. Format check is a simple
  inline regex — no new dependency.

### 4. Duplicate email and the insert race

A pre-read via `getUserByEmail` gives the fast, friendly path but does not close
the read-then-insert window. So `lib/db/users.ts` gains:

```ts
createUser(input: NewUser): Promise<UserRecord | null>
// null === unique constraint fired (Prisma P2002)
```

This follows the repository contract already used by `lib/db/pattern.ts`: never
throw, return `null` for the expected failure. `createAccount` maps `null` →
`email_taken`, so a lost race produces the same user-visible message as the
pre-read path.

**Account enumeration is accepted.** The form says the email is already
registered rather than failing generically. A sign-up form that cannot say "this
email is taken" is not usable, and this is a personal-scale product. Recorded as
a conscious trade, not an oversight.

### 5. Free-tier wallet for new accounts

`lib/billing/wallet.ts`'s `seedWallet` changes from the pre-billing mock's Ateliê
320/500 to the design's Free tier:

```ts
{ plan: "free", planLabel: "Grátis", balance: 30, total: 30, renewsAt: now + 30d }
```

Rationale: open sign-up behind a real Anthropic API key must not hand every
stranger 500 credits. The values match design `5c` ("Grátis · R$ 0 · 30
créditos/mês") and the string already at `PlanSection.plans.free.creditsLabel`.
Renewal moves 12d → 30d to match `renewWallet`'s cycle; the 12 was mimicry of the
removed mock.

**Nothing downstream needs new code:** `PlanSection` is already data-driven off
`credits.plan` (Free renders "Plano atual", the other three keep "em breve"),
`applyPurchase("subscribe")` already upgrades free → atelier, and
`scripts/cron-renew.ts` already rolls any wallet forward.

**Two consequences:**

1. Existing accounts that never materialized a `Wallet` row drop to Free on next
   access. Accounts with a real row are untouched. No backfill migration — the
   same call made when the wallet was introduced.
2. `prisma/seed.ts` explicitly materializes an **Ateliê** wallet for
   `atelier@moldai.local`, leaving `dev@moldai.local` to lazy-seed Free, so the
   dev accounts cover both plan states for testing.

### 6. Remove the dead `resetWallet`

`resetWallet` (`lib/db/wallet.ts`) is called from nothing but its own test. It
consumes `seedWallet`, so this change would otherwise have to update it for no
benefit. Delete it and its `describe` block in `lib/db/wallet.test.ts`. This is
the one cleanup in scope — code this change directly touches, not unrelated
refactoring.

### 7. i18n

New `Signup` namespace in `messages/pt-BR.json`: heading, four field labels,
submit + loading labels, the confirm-mismatch message, an `errors.*` sub-object
keyed by `SignupErrorCode`, and the "já tem conta? Entrar" link text.

`Login.signupNote` loses its "em breve" and becomes a real link to `/signup`.

All display text comes from the catalog — no hardcoded pt-BR JSX.

### 8. Documentation

CLAUDE.md edits:

- **Auth** bullet — rewrite "Login/logout only — self-signup is deferred, shown
  as 'em breve'" to describe real self-service sign-up, and note that email
  verification and throttling are the next two specs.
- **API routes** — add `POST /api/signup`, noting it is the one unauthenticated
  route handler that isn't NextAuth's.
- **Billing** — new wallets seed at the Free tier (30/30, 30-day renewal);
  `applyPurchase("subscribe")` is the upgrade path.

## Testing

- `lib/account/signup.test.ts` — every error branch, email normalization
  (including the `Foo@X.com` → login-compatibility case), and the
  `createUser`-returns-`null` race mapping to `email_taken`. Pure, DI'd, no DB.
- `app/api/signup/route.test.ts` — status codes and response bodies per branch,
  with `lib/db/users` mocked, following the existing route-test pattern.
- `lib/billing/wallet.test.ts` — update the `seedWallet` expectations.
- `lib/db/wallet.test.ts` — drop the `resetWallet` describe block.
- Sweep the tests asserting literal `320`/`500`. Most build their wallet through
  `seedWallet(NOW)` and absorb the change automatically; the literals appear in
  `lib/api/compose.test.ts`, `lib/dashboardStore.test.ts`,
  `lib/db/pattern-wallet.test.ts`, `lib/db/wallet.test.ts`,
  `app/api/account/summary/route.test.ts`, `app/api/patterns/[id]/route.test.ts`.
  Confirm no test depends on a balance covering repeated debits
  (`COSTS.graduate` is the largest at 6; a 30-credit float is ample).

## Files

**New**

- `app/signup/page.tsx`
- `app/api/signup/route.ts`
- `lib/account/signup.ts`
- `lib/account/signup.test.ts`
- `app/api/signup/route.test.ts`

**Modified**

- `lib/db/users.ts` — add `createUser`
- `lib/api-client.ts` — add `signUp` + `SignupResult`
- `lib/billing/wallet.ts` — `seedWallet` → Free tier
- `lib/db/wallet.ts` — remove `resetWallet`
- `prisma/seed.ts` — explicit Ateliê wallet for `atelier@moldai.local`
- `messages/pt-BR.json` — `Signup` namespace, rewrite `Login.signupNote`
- `CLAUDE.md`
- the wallet tests listed above

**No Prisma migration.** `User` already has every column needed; no schema or
persisted-blob shape changes. Spec B brings the only migration in this series.
