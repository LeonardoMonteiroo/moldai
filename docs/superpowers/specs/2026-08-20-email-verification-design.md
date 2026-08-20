# Email verification (spec B of 3)

**Date:** 2026-08-20
**Status:** approved, ready for implementation planning
**Depends on:** [sign-up flow](./2026-08-20-signup-flow-design.md) (spec A)
**Independent of:** [auth rate limiting](./2026-08-20-auth-rate-limiting-design.md)
(spec C) — either may ship first.

## Problem

After spec A, anyone can create an account with an address they do not own and
use it immediately. This spec makes **a confirmed email address a precondition
for logging in**: sign-up mails a verification link, and `authorizeUser` rejects
unverified accounts until it is confirmed.

## Key context

This is where **mail infrastructure enters the project**. There is no mail
dependency, no SMTP service in `docker-compose.yml`, and no `.env.example`.
Application code reads only `process.env.NODE_ENV`; every other secret is
consumed implicitly by an SDK (Prisma, NextAuth, Anthropic).

Two Auth.js v5 mechanisms this design depends on, both verified against the
installed `@auth/core` types rather than assumed:

- `authorize(credentials, request)` receives the original `Request`.
- Throwing a `CredentialsSignin` subclass with a `code` property surfaces that
  code to the caller, so `/login` can tell "unverified" from "wrong password".

Note that `@auth/core`'s own docs recommend keeping credential errors generic.
Distinguishing `unverified` reveals that an account exists — accepted here for
the same reason spec A accepts it on the sign-up form, and recorded so the choice
is visible rather than accidental.

## Non-goals

- Password reset — its own feature. It would reuse this spec's token
  infrastructure, which is a reason to build that infrastructure cleanly, not a
  reason to widen scope now.
- Rate limiting — spec C. Note the interaction: **until C ships, the resend
  endpoint's only brake is its 60-second per-user cooldown.**
- Changing the email address on an existing account (`ProfileSection` keeps email
  read-only, as today).

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

Neither step auto-signs-in. Sign-up cannot, because the account starts
unverified. Verification deliberately does not either: at verify time the server
has proof of email ownership but not the password, and minting a session straight
from a link turns the email into a bearer credential.

## Design

### 1. Schema — one migration, `add_email_verification`

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
pattern data is touched. This is the only migration in the three-spec series.

**The migration backfills every existing user as verified**
(`UPDATE "User" SET "emailVerified" = now() WHERE "emailVerified" IS NULL`).
Without it, adding the gate locks out every account that already exists —
including both dev seeds and any account created under spec A. Grandfathering is
the non-destructive call; the gate applies to accounts created from here on.
`prisma/seed.ts` also sets `emailVerified` explicitly so a reseed stays
loggable-in.

### 2. Tokens — `lib/auth/verification.ts` (pure) + `lib/db/verification.ts` (repo)

Pure module, `node:crypto` only (still framework-free):

- `newVerificationToken(now)` → `{ raw, tokenHash, expiresAt }`. Raw is 32 random
  bytes base64url; `tokenHash` is its SHA-256 hex.
- `hashToken(raw)` → the same digest, for lookup.
- `isExpired(expiresAt, now)`.

SHA-256 rather than bcrypt: the token is high-entropy random, so a slow hash buys
nothing and a fast digest can serve as the primary key. Storing the digest means
a database leak does not yield usable links.

Lifetime **24 hours**, **single use** — the row is deleted on consumption.
Issuing a new token deletes the user's existing ones, so only the newest link
works.

Repository (`lib/db/verification.ts`), same never-throw contract as the other
repositories:

```ts
issueToken(userId: string, now: Date): Promise<string>;   // returns the raw token

consumeToken(tokenHash: string, now: Date): Promise<
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" }
>;   // deletes the row and stamps emailVerified in one transaction

lastIssuedAt(userId: string): Promise<Date | null>;   // resend cooldown
```

`consumeToken` returns the reason rather than a bare `null` so the route can
distinguish `invalid_token` from `expired_token` — an expired link needs to tell
the user to request a new one, a bogus one does not. An expired row is deleted as
it is rejected.

### 3. Mail — `lib/mail/` + Mailpit in a dev-only compose override

- `lib/mail/templates.ts` — **pure**, takes an injected `Translate` (the
  `lib/i18n/translate.ts` seam) plus the link, returns `{ subject, text, html }`.
  All copy lives in a `VerificationEmail` catalog namespace; the route resolves
  `t` via `getTranslations`. No hardcoded pt-BR.
- `lib/mail/send.ts` — the only file importing `nodemailer`. Builds the transport
  lazily at call time from `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` /
  `SMTP_FROM`; links are absolute via a new `APP_URL`.

**Missing-SMTP behavior is explicit, never silent.** With `SMTP_HOST` unset:
outside production it logs the verification link to the server console (keeps
tests and a bare `npm run dev` working); in production it throws, surfacing as
`mail_unavailable` rather than a "check your email" screen for a mail that was
never sent.

**Mailpit** goes in a new `docker-compose.override.yml` (`axllent/mailpit`, SMTP
`1025`, web UI `8025`). Compose auto-merges an override file for a bare
`docker compose up` — exactly `npm run docker:up` — and ignores it for the
explicit `-f docker-compose.yml -f docker-compose.prod.yml` prod stack. So dev
gets a real rendered-email inbox and prod stays clean, with no script changes.
`npm run db:up` also merges the override but only starts `db`, so it is
unaffected.

A `.env.example` is added: with `APP_URL` and five `SMTP_*` joining
`DATABASE_URL`, `AUTH_SECRET`, and `ANTHROPIC_API_KEY`, undocumented setup has
become a real onboarding cost.

### 4. Changes to spec A's sign-up

- `POST /api/signup` gains `mail_unavailable` in `SignupErrorCode` (HTTP `503`).
- **Ordering:** create the user row and token first, then send. If sending
  throws, return `mail_unavailable`; the account is left unverified and is
  recoverable by resend — never a silent success.
- `app/signup/page.tsx` **drops the auto-sign-in**. On success the card swaps to
  a "verifique seu email" state in place — no navigation, no new route — showing
  the address the link went to and a "Reenviar" button. The component still holds
  the email and password in state, so resend can satisfy the credential gate
  in §6.

### 5. Verify page and the login gate

**`app/verify/page.tsx`** reads `?token=` and renders a card with a **"Confirmar
meu email" button** that POSTs to `/api/verify-email`. The confirmation is
deliberately not performed by the GET itself: corporate mail scanners and link
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
a misleading "senha inválida".

`lib/db/users.ts`'s selects add `emailVerified`.

> Spec C extends this same union with a `rate_limited` reason. Whichever ships
> second adds its member to an existing union rather than introducing one.

### 6. Resend — `POST /api/verify-email/resend`

Takes `{email, password}` and **verifies the credentials before resending**. That
single decision does three things: it removes the enumeration oracle, it prevents
the endpoint being used as a spam relay against arbitrary addresses, and it means
both entry points (the sign-up success card and the login error) already have the
values on hand.

Already-verified → `already_verified`. Within a **60-second cooldown** of the last
issue (`lastIssuedAt`) → `cooldown`. Otherwise reissue, invalidating the previous
token, and send.

Side effect worth stating: someone who signs up, loses the mail, **and** forgets
their password has no path forward, because password reset is a non-goal.

### 7. i18n

New namespaces in `messages/pt-BR.json`:

- `Verify` — confirm button, success, `invalid_token`, `expired_token`.
- `VerificationEmail` — subject, greeting, button/link text, expiry note.

`Signup` gains the "verifique seu email" success state, the resend button, and
`errors.mail_unavailable`. `Login` gains the `unverified_email` error and its
inline resend action.

### 8. Documentation

CLAUDE.md edits:

- **Auth** — describe the verification gate and that `authorizeUser` now returns
  a typed result instead of `null`.
- **API routes** — add `POST /api/verify-email` and
  `POST /api/verify-email/resend` to the unauthenticated set.
- **Commands / Docker** — the new `docker-compose.override.yml` carrying Mailpit
  (UI at `:8025`) and the dev-vs-prod override-merge rule.
- **i18n** — `/verify` is the first server component using `getTranslations`.

## Testing

- `lib/auth/verification.test.ts` — token/hash round-trip, expiry boundary, and
  that the raw token never equals the stored hash.
- `lib/auth/authorize.test.ts` — extend for the new result union: valid+verified,
  valid+unverified, wrong password, unknown email.
- `lib/mail/templates.test.ts` — pure, with an injected fake `Translate`; asserts
  the link appears in both the text and html parts.
- `app/api/verify-email/route.test.ts` and
  `app/api/verify-email/resend/route.test.ts` — status codes and bodies per
  branch, with `lib/db/*` and `lib/mail/send` mocked, following the existing
  route-test pattern. Resend covers wrong password, already-verified, cooldown.
- `app/api/signup/route.test.ts` — extend for `mail_unavailable`.

Manual check via Mailpit at `http://localhost:8025`: sign up, open the mail,
confirm, log in.

## Files

**New**

- `app/verify/page.tsx`
- `app/api/verify-email/route.ts`
- `app/api/verify-email/resend/route.ts`
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
- `lib/db/users.ts` — select `emailVerified`
- `lib/api-client.ts` — `verifyEmail`, `resendVerification`
- `app/signup/page.tsx` — drop auto-sign-in, add the success state
- `app/api/signup/route.ts` — issue the token, send the mail, `mail_unavailable`
- `app/login/page.tsx` — unverified error + resend action
- `prisma/seed.ts` — `emailVerified` on the dev seeds
- `package.json` — add `nodemailer` + `@types/nodemailer`
- `messages/pt-BR.json`
- `CLAUDE.md`
