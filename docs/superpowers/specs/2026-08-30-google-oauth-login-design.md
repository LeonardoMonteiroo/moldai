# Google OAuth sign-in

**Date:** 2026-08-30
**Status:** approved, ready for implementation planning
**Resolves:** [#235](https://github.com/LeonardoMonteiroo/moldai/issues/235), and CLAUDE.md's design-README open question 4 ("Login gains a 'Continuar com Google' button... confirm before implementing").

## Problem

The redesign handoff (`docs/design/README.md`) shows a "Continuar com Google" button on the Login card. Today `auth.ts` has exactly one provider, Credentials — there is no Google OAuth anywhere in the product, and CLAUDE.md explicitly flags this item as needing a real-vs-decorative decision before any UI ships. This spec makes it real: Google becomes a second, fully working sign-in/sign-up path, linked to the same `User` table Credentials already uses.

## Key context

- `auth.ts` today: `session: { strategy: "jwt" }`, one `Credentials` provider whose `authorize` calls the pure `authorizeUser` (`lib/auth/authorize.ts`). No adapter.
- `User` (`prisma/schema.prisma`) has `passwordHash String` (required), `emailVerified DateTime?`, no `Account`/`Session` tables — this app has never needed Auth.js's own persistence layer because Credentials + JWT sessions don't require one.
- Auth.js v5 supports an adapter alongside Credentials **only** with JWT sessions (Credentials cannot use database sessions) — already satisfied by this repo's existing config.
- Decided with the user (2026-08-30), each is a real product/security call, not an implementation detail:
  1. **Account linking**: a Google sign-in whose email matches an existing Credentials `User` auto-links (no password prompt) — Google's email is itself verified.
  2. **New Google signups skip MoldAI's own verification mail** — `emailVerified` is stamped immediately from Google's proof.
  3. **Schema**: full standard Auth.js Prisma adapter shape (`Account`, `Session`, `VerificationToken`), not a lightweight `googleId` column — `Session`/`VerificationToken` will exist but sit unused (this app keeps JWT sessions and its own `EmailVerificationToken`/`PasswordResetToken`); documented as a conscious tradeoff, not an oversight.
  4. **Passwordless accounts**: a Google-only `User` (`passwordHash: null`) can set a password once via a new "Definir senha" flow in `/settings`; until then, account deletion's password gate is skipped (email-match only).
  5. **Button appears on both Login and Signup cards** (design doc shows it only on Login; both get it for a consistent OAuth entry point).
  6. **No live Google Cloud OAuth client in this environment** — the user will add `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` to their own `.env.local` and verify end-to-end themselves, the Stripe-integration precedent (built + unit-tested here, never exercised against a real account in this environment).
  7. **Retroactive verification**: linking Google to an existing _unverified_ Credentials account (`emailVerified: null`) also stamps `emailVerified` now — Google's proof is strictly stronger evidence than MoldAI's own unclicked mail link, and this unblocks that account's Credentials login going forward too.

## Non-goals

- Any other OAuth provider (GitHub, Apple, …) — out of scope, not precluded by this design.
- Avatars/profile pictures anywhere in the UI. `User.image` is added only because the Prisma adapter's `createUser` would otherwise error on Google's `image` field in the profile payload — it is written, never read by any screen.
- Multi-provider account *un*linking, or a UI listing which providers an account has linked. A future need, not required by #235.
- Rate limiting the OAuth routes — unlike Credentials, there is no password to brute-force and no email-enumeration surface (`OAuthAccountNotLinked`/`AccessDenied` reveal nothing about which emails exist), so no new bucket in `lib/rate-limit/limits.ts`.

## Design

### 1. Schema — one migration, `add_google_oauth`

```prisma
model User {
  // …existing fields
  passwordHash String?     // was required -- a Google-only account has none
  image        String?     // required by the adapter's createUser payload; unread by any screen
  accounts     Account[]
}

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

// Standard Auth.js adapter shape, kept for contract compatibility -- never
// written to. This app keeps JWT sessions (no database Session row is ever
// created) and already has its own EmailVerificationToken/PasswordResetToken
// (Auth.js's own VerificationToken backs its Email/magic-link provider only,
// which this app doesn't use). Two empty tables are the conscious cost of
// "full adapter over a lightweight column" (decided with the user).
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

Additive except relaxing `passwordHash`'s `NOT NULL` — every existing row already has a hash, so this is a no-op for current data, no backfill needed. `Session` needs a back-relation added to `User` (`sessions Session[]`) for the relation to compile, matching the `accounts` relation above.

### 2. `auth.ts` — Google provider + adapter

```ts
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  useSecureCookies: secureCookiesForEnv(process.env.NODE_ENV),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({/* unchanged */}),
    Google({
      // Google verifies email ownership itself, which is exactly the trust
      // this repo already places in its own mailed verification link --
      // this flag is what lets a Google sign-in auto-link to an existing
      // Credentials row sharing that email, per the user's decision above.
      // The signIn callback below adds one more check on top: it refuses
      // the sign-in outright if Google's own profile claims the email is
      // NOT verified, so this flag is never trusted blindly.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      if (profile?.email_verified !== true) return false;
      // Retroactive verification: an existing Credentials row that never
      // clicked its own mail link gets emailVerified stamped now, from
      // strictly stronger evidence. Extracted into a pure-ish helper
      // (lib/auth/googleLink.ts) so it's unit-testable without a live DB.
      await maybeStampVerifiedOnLink(user.id, prisma);
      return true;
    },
    jwt({ token, user }) {
      /* unchanged */
    },
    session({ session, token }) {
      /* unchanged */
    },
  },
});
```

`maybeStampVerifiedOnLink(userId, client)` (`lib/auth/googleLink.ts`) is the one new piece of logic: reads the `User` row, and if `emailVerified` is `null`, sets it to `now()`. A thin repo wrapper, tested the way `lib/db/users.ts`'s functions are tested elsewhere (mocked Prisma client, not a live DB).

### 3. Credentials path — `no_password` reason

`UserRecord.passwordHash` becomes `string | null` (`lib/auth/types.ts`). `AuthorizeFailure` gains `"no_password"`:

```ts
export type AuthorizeFailure =
  "invalid" | "unverified" | "rate_limited" | "no_password";
```

In `authorizeUser`, after `getUserByEmail` returns a row: if `user.passwordHash === null`, return `{ ok: false, reason: "no_password" }` **before** the bcrypt compare (there's no hash to compare against, and comparing against `DUMMY_HASH` here would misleadingly read as "wrong password" rather than "this account has no password"). `auth.ts` maps it to a new `NoPasswordError extends CredentialsSignin` with `code: "no_password"`, alongside the existing `UnverifiedEmailError`/`RateLimitedError`. `LoginCard` resolves it to a distinct message ("esta conta usa login com Google").

### 4. Login/Signup UI

- **`LoginCard.tsx` / `SignupCard.tsx`**: below the existing form, an "ou" divider plus a `Button` calling `signIn("google", { callbackUrl: "/" })` — a real redirect (unlike the Credentials form's `redirect: false`). New catalog keys per namespace: `Login.continueWithGoogle`/`Login.orDivider`, `Signup.continueWithGoogle`/`Signup.orDivider` (run through the humanizer pass since it's new catalog copy — likely near-identical short strings, still a pass, not a skip).
- **OAuth error surfacing**: Auth.js redirects a failed Google flow to `/login?error=<code>` (e.g. `OAuthAccountNotLinked`, `AccessDenied`, `Configuration`). `LoginCard` reads `useSearchParams()` on mount (new — nothing reads `error` from the URL today) and resolves known codes via `t("errors."+code)`, falling back to a generic message for an unrecognised code.
- Both cards' existing Credentials form and error states are untouched.

### 5. Settings — passwordless accounts

`app/settings/page.tsx` already loads the full `user` row via `getUserById` — it gains one derived boolean, `hasPassword: user.passwordHash !== null`, threaded through `SettingsShell` → `PasswordSection`/`DangerZoneSection` as a new prop (the same plain-prop shape `userEmail`/`initialName` already use).

- **`PasswordSection`**: when `hasPassword` is `false`, renders a "Definir senha" variant — no "senha atual" field, just new/confirm — and calls a new `setPassword(newPassword)` API-client function hitting the same `POST /api/account/password` route with `currentPassword` omitted. Server-side: `changePassword` (`lib/account/settings.ts`) takes `storedHash: string | null`; when `null`, skip the current-password check entirely (there's nothing to verify against) and go straight to `validateNewPassword`/hash. `updateUserPasswordHash` is unchanged (already takes any string hash).
- **`DangerZoneSection`**: when `hasPassword` is `false`, the password field is omitted and `canSubmit` depends only on the typed-email match; the delete route's `verifyForDeletion(deps, password, storedHash: string | null)` returns `true` immediately when `storedHash` is `null` (ownership is already established by the session — the password check was always the _second_ factor, not the only one).
- Once a Google-only user sets a password, `hasPassword` becomes `true` on next load and both sections behave exactly as they do for a Credentials account today — no new branch needed after that point.

### 6. Documentation

CLAUDE.md edits:

- **Auth bullet** — rewritten to describe Google as a second provider, the adapter, the auto-link/retroactive-verification rules, and the `allowDangerousEmailAccountLinking` trust boundary (Google's own email verification).
- **Screens → `/login`/`/signup`** — resolve the design-README's open question 4; note the button now appears on both cards.
- **`.env.example`** — add `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, documented as required only when Google sign-in is exercised, same shape as the Stripe block's "required only when PAYMENT_PROVIDER=stripe" framing.

`docs/decisions.md` gets a new entry: why `allowDangerousEmailAccountLinking` is the intended behavior here (not a misconfiguration), and why `Session`/`VerificationToken` exist unused (the full-adapter tradeoff).

## Testing

- `lib/auth/authorize.test.ts` — extend for `passwordHash: null` → `no_password`, verified as _not_ falling through to the bcrypt-compare branch.
- `lib/auth/googleLink.test.ts` (new) — `maybeStampVerifiedOnLink` against a mocked Prisma client: stamps when `emailVerified` is null, no-ops when already set.
- `lib/account/settings.test.ts` — extend `changePassword`/`verifyForDeletion` for `storedHash: null`.
- `components/settings/PasswordSection.test.tsx` / `DangerZoneSection.test.tsx` — extend for `hasPassword={false}`, asserting the current-password field is absent and the right calls happen.
- `components/auth/LoginCard.test.tsx` / `SignupCard.test.tsx` — extend for the new button rendering and the `?error=` query-param resolution.
- `app/api/account/password/route.test.ts` / `app/api/account/route.test.ts` — extend for the null-hash branches.
- No integration test against real Google — same caveat CLAUDE.md already states for Stripe: verified via the adapter/SDK's own types and this repo's unit tests only. The user will do the live end-to-end check once `GOOGLE_CLIENT_ID`/`SECRET` are in their own `.env.local`.

## Files

**New**

- `lib/auth/googleLink.ts` + test
- `prisma/migrations/*_add_google_oauth/`
- tests listed above (extensions to existing files, not new files, except `googleLink.test.ts`)

**Modified**

- `prisma/schema.prisma` — `Account`, `Session`, `VerificationToken`, `User.passwordHash`/`image`/`accounts`/`sessions`
- `auth.ts` — `Google` provider, `PrismaAdapter`, `signIn` callback, `NoPasswordError`
- `lib/auth/authorize.ts` — `no_password` reason
- `lib/auth/types.ts` — `UserRecord.passwordHash: string | null`
- `lib/account/settings.ts` — `changePassword`/`verifyForDeletion` accept `null` hash
- `lib/db/users.ts` — selects already include `passwordHash`; no shape change needed beyond the type
- `app/api/account/password/route.ts` — allow omitted `currentPassword`
- `lib/schemas/account.ts` — `AccountPasswordBodySchema.currentPassword` becomes optional
- `lib/api-client.ts` — `setPassword` (or extend `changePassword` to accept an optional current password)
- `components/auth/LoginCard.tsx` / `SignupCard.tsx` — divider + Google button, `?error=` handling
- `components/settings/PasswordSection.tsx` / `DangerZoneSection.tsx` — `hasPassword` prop, "Definir senha" branch, skip-password-check branch
- `components/settings/SettingsShell.tsx` — thread `hasPassword` through
- `app/settings/page.tsx` — derive `hasPassword`
- `messages/pt-BR.json` — `Login`/`Signup` Google button + divider + error keys, `PasswordSection` "set password" copy
- `.env.example` — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
- `package.json` — add `@auth/prisma-adapter`
- `CLAUDE.md`, `docs/decisions.md`
