# Sign-up flow with email verification

**Date:** 2026-08-20
**Status:** approved design, revised — email verification now in scope

## Problem

MoldAI has real auth (Auth.js v5, Credentials + JWT) but no way to create an
account. Users exist only via `prisma/seed.ts`. The login page advertises
account creation as unavailable — `messages/pt-BR.json` → `Login.signupNote`
renders "Criar conta — **em breve**".

This spec adds self-service sign-up: a public `/signup` page creates a `User`,
emails a verification link, and **login is blocked until that link is
confirmed**.

### CLAUDE.md conflict (resolved)

CLAUDE.md documents self-signup as a deliberate scope boundary ("**Auth:** …
Login/logout only — self-signup is deferred, shown as 'em breve'"). Per the
project-stage rule this was raised before starting; the user approved building
it, so CLAUDE.md is updated as part of this work.

## Key context

New accounts need **no billing/size-chart provisioning**. Both dependent
resources already lazy-seed on first access:

- `Wallet` — `lib/db/wallet.ts`'s `lockWallet` does `INSERT … ON CONFLICT DO NOTHING`.
- The two system size charts — `lib/db/sizeChart.ts`'s `ensureSystemSizeCharts`.

Since an unverified user can never reach an authenticated route, neither
materializes until the first successful login. No change needed there.

What is genuinely new: **mail infrastructure**. There is no mail dependency, no
SMTP service in `docker-compose.yml`, and no `.env.example`. Application code
reads only `process.env.NODE_ENV`; every other secret is consumed implicitly by
an SDK (Prisma, NextAuth, Anthropic).

## Non-goals

- Password reset / "esqueci minha senha" — its own feature. It would reuse this
  spec's token infrastructure, which is a reason to build that infrastructure
  cleanly, not a reason to widen scope now. Consequence to accept: a user who
  forgets their password still has no self-service recovery.
- Rate limiting or CAPTCHA on sign-up. The resend endpoint is credential-gated
  (§9), which removes the open-relay risk, but raw sign-up remains unthrottled.
- Onboarding (design `5b`) — stays out of scope.
- Any change to the mocked payment gateway.

## Flow

```
/signup  ──POST /api/signup──▶  User row (emailVerified: null)
                                 + EmailVerificationToken
                                 + email sent
   │
   └─▶ success state: "enviamos um link para <email>" [Reenviar]

email link ──▶ GET /verify?token=…  ──▶ [Confirmar meu email] button
                                            │
                                            └─POST /api/verify-email─▶ emailVerified = now()
                                                                        token deleted
                                                                        ─▶ /login

/login ──▶ unverified? ──▶ "confirme seu email" + [Reenviar] (credential-gated)
```

Sign-up does **not** auto-sign-in any more — that was the pre-verification
design. Verification does not auto-sign-in either: at verify time the server has
proof of email ownership but not the password, and minting a session straight
from a link turns the email into a bearer credential. The user lands on `/login`
with a success notice.

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
`PasswordSection` idiom. The server never receives the confirm field.

On success the card swaps to a **"verifique seu email" state** in place — no
navigation, no new route. It shows the address the link went to and a "Reenviar"
button (the component still holds the email and password in state, so resend can
satisfy the credential gate in §9).

Like `/login`, the page does not redirect an already-signed-in visitor; keeping
the two auth pages symmetric.

### 2. API route — `POST /api/signup`

Top level, deliberately **not** under `/api/auth/*` (avoids overlapping the
`[...nextauth]` catch-all) and **not** under `/api/account/*` (every route there
is `requireUser()`-gated; a public sibling invites a future mistake).

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
  | "bad_body"
  | "mail_unavailable";

// lib/api-client.ts
type SignupResult =
  { status: "ok" } | { status: "error"; error: SignupErrorCode };
```

Status codes: `200` ok, `409` `email_taken`, `503` `mail_unavailable`, `400` rest.

The client posts via a new `signUp()` in `lib/api-client.ts` — components never
call `fetch` directly.

**Ordering:** the user row and token are created first, then the mail is sent. If
sending throws, the route returns `mail_unavailable` and the account is left
unverified — recoverable by resend, and never a silent success.

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
`email_taken`, so a lost race produces the same message as the pre-read path.

**Account enumeration is accepted.** The form says the email is already
registered rather than failing generically. A sign-up form that cannot say "this
email is taken" is not usable, and this is a personal-scale product. The same
trade is applied consistently at the login gate (§8).

### 5. Schema — one migration, `add_email_verification`

```prisma
model User {
  // …existing fields
  emailVerified DateTime?
  verificationTokens EmailVerificationToken[]
}

model EmailVerificationToken {
  tokenHash String   @id          // sha-256 of the raw token, hex
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([userId])
}
```

Additive only — no column drops, no persisted-JSON-blob shape change, so no
pattern data is touched.

**The migration backfills every existing user as verified**
(`UPDATE "User" SET "emailVerified" = now() WHERE "emailVerified" IS NULL`).
Without it, adding the gate locks out every account that already exists —
including both dev seeds. Grandfathering existing accounts is the non-destructive
call; the gate applies to accounts created from here on. `prisma/seed.ts` also
sets `emailVerified` explicitly so a reseed stays loggable-in.

### 6. Tokens — `lib/auth/verification.ts` (pure) + `lib/db/verification.ts` (repo)

Pure module, `node:crypto` only (still framework-free):

- `newVerificationToken(now)` → `{ raw, tokenHash, expiresAt }`. Raw is 32 random
  bytes base64url; `tokenHash` is its SHA-256 hex.
- `hashToken(raw)` → the same digest, for lookup.
- `isExpired(expiresAt, now)`.

SHA-256 rather than bcrypt: the token is high-entropy random, so a slow hash buys
nothing and a fast digest lets the row be looked up by primary key. Storing the
digest means a database leak does not yield usable links.

Lifetime **24 hours**, **single use** — the row is deleted on consumption.
Issuing a new token deletes the user's existing ones, so only the newest link
works.

Repository (`lib/db/verification.ts`), same never-throw contract:

```ts
issueToken(userId: string, now: Date): Promise<string>;   // returns the raw token

consumeToken(tokenHash: string, now: Date): Promise<
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" }
>;   // deletes the row and stamps emailVerified in one transaction

lastIssuedAt(userId: string): Promise<Date | null>;   // resend cooldown
```

`consumeToken` returns the reason rather than a bare `null` so the route can
distinguish `invalid_token` from `expired_token` (§8) — an expired link needs to
tell the user to request a new one, a bogus one does not. An expired row is
deleted as it is rejected.

### 7. Mail — `lib/mail/` + Mailpit in compose

- `lib/mail/templates.ts` — **pure**, takes an injected `Translate` (the
  `lib/i18n/translate.ts` seam) plus the link, returns `{ subject, text, html }`.
  All copy lives in a `VerificationEmail` catalog namespace; the route resolves
  `t` via `getTranslations`. No hardcoded pt-BR.
- `lib/mail/send.ts` — the only file importing `nodemailer`. Builds the transport
  lazily at call time from `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` /
  `SMTP_FROM`; links are absolute via a new `APP_URL`.

**Missing-SMTP behavior is explicit, never silent.** With `SMTP_HOST` unset:
outside production it logs the verification link to the server console (keeps
tests and a bare `npm run dev` working); in production it throws, which surfaces
as `mail_unavailable` (§2) rather than a "check your email" screen for a mail
that was never sent.

**Mailpit** goes in a new `docker-compose.override.yml` (`axllent/mailpit`, SMTP
`1025`, web UI `8025`). Compose auto-merges an override file for a bare
`docker compose up` — which is exactly `npm run docker:up` — and ignores it for
the explicit `-f docker-compose.yml -f docker-compose.prod.yml` prod stack. So dev
gets a real rendered-email inbox and prod stays clean, with no script changes.
`npm run db:up` also merges the override but only starts `db`, so it is unaffected.

A `.env.example` is added: the var count crosses the point where undocumented
setup is a real onboarding cost (`DATABASE_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`,
`APP_URL`, and the five `SMTP_*`).

### 8. Verify page and the login gate

**`app/verify/page.tsx`** reads `?token=` and renders a card with a **"Confirmar
meu email" button** that POSTs to `/api/verify-email`. The confirmation is
deliberately not done by the GET itself: corporate mail scanners and link
previewers fetch URLs in flight and would burn the single-use token before the
user ever clicked. One extra click buys immunity to that.

This is the project's first **server component with display text**, so it uses
`await getTranslations(...)` — the path CLAUDE.md already anticipates ("a server
component would use `await getTranslations(...)`, but none needs it yet").

**`POST /api/verify-email`** takes `{token}` → `consumeToken` → `{status:"ok"}`
or `invalid_token` / `expired_token`. The page then shows success and links to
`/login`.

**The gate itself** is in `lib/auth/authorize.ts`. `UserRecord` gains
`emailVerified`, and the function stops returning a bare `null`:

```ts
type AuthorizeResult =
  | { ok: true; user: { id: string; email: string; name: string | null } }
  | { ok: false; reason: "invalid" | "unverified" };
```

`auth.ts` maps `invalid` → `null` (Auth.js's generic `CredentialsSignin`) and
`unverified` → a `CredentialsSignin` subclass carrying `code: "unverified_email"`,
so `/login` can show "confirme seu email" with an inline resend action instead of
a misleading "senha inválida". Distinguishing the two does reveal that an account
exists, consistent with the enumeration trade already accepted in §4.

`lib/db/users.ts`'s selects add `emailVerified`.

### 9. Resend — `POST /api/verify-email/resend`

Takes `{email, password}` and **verifies the credentials before resending**. That
single decision does three things: it removes the enumeration oracle, it prevents
the endpoint being used as a spam relay against arbitrary addresses, and it means
both entry points (the sign-up success card and the login error) already have the
values on hand.

Already-verified → `already_verified`. Within a **60-second cooldown** of the last
issue (`lastIssuedAt`) → `cooldown`. Otherwise reissue, invalidating the previous
token, and send.

### 10. Free-tier wallet for new accounts

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
   dev accounts cover both plan states.

### 11. Remove the dead `resetWallet`

`resetWallet` (`lib/db/wallet.ts`) is called from nothing but its own test. It
consumes `seedWallet`, so this change would otherwise have to update it for no
benefit. Delete it and its `describe` block in `lib/db/wallet.test.ts`. This is
the one cleanup in scope — code this change directly touches, not unrelated
refactoring.

### 12. i18n

New namespaces in `messages/pt-BR.json`:

- `Signup` — heading, four labels, submit/loading, confirm-mismatch, the
  "verifique seu email" success state + resend button, and `errors.*` keyed by
  `SignupErrorCode`.
- `Verify` — the confirm button, success, `invalid_token`, `expired_token`.
- `VerificationEmail` — subject, greeting, button/link text, expiry note.

`Login` gains the `unverified_email` error and its resend action;
`Login.signupNote` loses "em breve" and becomes a real link to `/signup`.

### 13. Documentation

CLAUDE.md edits:

- **Auth** bullet — rewrite the "self-signup is deferred" sentence; describe
  sign-up, the verification gate, and that `authorizeUser` now returns a typed
  result instead of `null`.
- **API routes** — add `POST /api/signup`, `POST /api/verify-email`,
  `POST /api/verify-email/resend`, noting these are the only unauthenticated
  route handlers besides NextAuth's.
- **Commands / Docker** — the new `docker-compose.override.yml` and Mailpit's UI
  at `:8025`, plus the dev-vs-prod override-merge rule.
- **Billing** — new wallets seed at Free (30/30, 30-day renewal);
  `applyPurchase("subscribe")` is the upgrade path.
- **i18n** — `/verify` is the first server component using `getTranslations`.

## Testing

- `lib/account/signup.test.ts` — every error branch, email normalization
  (including the `Foo@X.com` → login-compatibility case), and
  `createUser`-returns-`null` mapping to `email_taken`.
- `lib/auth/verification.test.ts` — token/hash round-trip, expiry boundary,
  and that the raw token never equals the stored hash.
- `lib/auth/authorize.test.ts` — extend for the new result union: valid+verified,
  valid+unverified, wrong password, unknown email.
- `lib/mail/templates.test.ts` — pure, with an injected fake `Translate`;
  asserts the link appears in both the text and html parts.
- `app/api/signup/route.test.ts`, `app/api/verify-email/route.test.ts`,
  `app/api/verify-email/resend/route.test.ts` — status codes and bodies per
  branch, with `lib/db/*` and `lib/mail/send` mocked, following the existing
  route-test pattern. Resend covers wrong password, already-verified, cooldown.
- `lib/billing/wallet.test.ts` — update `seedWallet` expectations.
- `lib/db/wallet.test.ts` — drop the `resetWallet` describe block.
- Sweep tests asserting literal `320`/`500`. Most build their wallet through
  `seedWallet(NOW)` and absorb the change; the literals appear in
  `lib/api/compose.test.ts`, `lib/dashboardStore.test.ts`,
  `lib/db/pattern-wallet.test.ts`, `lib/db/wallet.test.ts`,
  `app/api/account/summary/route.test.ts`, `app/api/patterns/[id]/route.test.ts`.
  Confirm none depends on a balance covering repeated debits (`COSTS.graduate` is
  the largest at 6; a 30-credit float is ample).

Manual check via Mailpit at `http://localhost:8025`: sign up, open the mail,
confirm, log in.

## Files

**New**

- `app/signup/page.tsx`
- `app/verify/page.tsx`
- `app/api/signup/route.ts`
- `app/api/verify-email/route.ts`
- `app/api/verify-email/resend/route.ts`
- `lib/account/signup.ts`
- `lib/auth/verification.ts`
- `lib/db/verification.ts`
- `lib/mail/send.ts`
- `lib/mail/templates.ts`
- `docker-compose.override.yml`
- `.env.example`
- tests listed above
- `prisma/migrations/*_add_email_verification/`

**Modified**

- `prisma/schema.prisma` — `User.emailVerified`, `EmailVerificationToken`
- `lib/auth/authorize.ts` — typed result, verification gate
- `lib/auth/types.ts` — `UserRecord.emailVerified`
- `auth.ts` — map `unverified` to a coded `CredentialsSignin`
- `lib/db/users.ts` — `createUser`, select `emailVerified`
- `lib/api-client.ts` — `signUp`, `verifyEmail`, `resendVerification`
- `app/login/page.tsx` — unverified error + resend action
- `lib/billing/wallet.ts` — `seedWallet` → Free tier
- `lib/db/wallet.ts` — remove `resetWallet`
- `prisma/seed.ts` — `emailVerified` on seeds; explicit Ateliê wallet for `atelier@moldai.local`
- `package.json` — add `nodemailer` + `@types/nodemailer`
- `messages/pt-BR.json`
- `CLAUDE.md`
- the wallet tests listed above
