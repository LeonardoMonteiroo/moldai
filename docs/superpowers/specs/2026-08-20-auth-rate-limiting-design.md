# Auth rate limiting (spec C of 3)

**Date:** 2026-08-20
**Status:** approved, ready for implementation planning
**Depends on:** [sign-up flow](./2026-08-20-signup-flow-design.md) (spec A)
**Independent of:** [email verification](./2026-08-20-email-verification-design.md)
(spec B) — either may ship first. See "Interaction with spec B" below.

## Problem

Spec A opens account creation to anyone with the URL, and the credentials login
route has **never** been throttled. Both are unauthenticated endpoints that
either burn resources (row creation, mail, bcrypt) or leak information under
repetition. This spec adds Redis-backed rate limiting to the auth surface.

The login hole predates this work — it is the larger of the two, and fixing it is
the reason this spec covers login rather than only the new sign-up route.

## Non-goals

- CAPTCHA. Rate limiting is the chosen defense; a determined distributed attacker
  with many IPs is out of scope for a personal-scale product.
- Throttling session-gated routes (pattern generation, account mutations). Those
  already require a valid session, and generation is bounded by the credit
  ledger, so the marginal value is low.
- Any generic middleware that limits every route. The policy is deliberately
  per-endpoint and explicit.

## Design

### 1. Module — `lib/rate-limit/`

Four files, each with one job:

- `lib/rate-limit/limits.ts` — **pure** policy table. One entry per bucket:
  `{ limit, windowSec }`. No logic, just the numbers, so the whole policy is
  reviewable in one place.
- `lib/rate-limit/ip.ts` — **pure** `clientIp(headers)`.
- `lib/rate-limit/client.ts` — the only file importing `ioredis`; a lazy
  singleton connected via `REDIS_URL`.
- `lib/rate-limit/consume.ts` — `consume(bucket, key)` →
  `{ allowed: boolean; retryAfterSec: number }`, plus `reset(bucket, key)` for
  clearing a counter after a successful login.

### 2. The counter — one atomic round trip

```
MULTI
  INCR   rl:<bucket>:<key>
  EXPIRE rl:<bucket>:<key> <windowSec> NX
EXEC
```

`EXPIRE … NX` (Redis 7+) sets the TTL only when none exists, which makes this a
fixed window that starts on the first request and expires itself. **No sweep job
is needed** — a real advantage over a Postgres-table implementation, which would
have required one.

### 3. Policies

| Bucket         | Key   | Limit       |
| -------------- | ----- | ----------- |
| `signup`       | IP    | 5 / hour    |
| `signup_email` | email | 3 / hour    |
| `login`        | IP    | 20 / 15 min |
| `login_email`  | email | 10 / 15 min |
| `verify`       | IP    | 20 / hour   |
| `resend`       | IP    | 10 / hour   |

Login counts **failed attempts only**, and a successful login deletes the
email-keyed counter — so a user who mistypes twice and then succeeds is not
penalised, while a brute-force run against one account still hits the wall.

**How the login throttle reaches the pure `authorizeUser`:** it does not import
the limiter. `AuthorizeDeps` gains `consume` and `reset`, and the credentials
input gains the caller's `ip`, keeping the module DB-free and testable with fake
deps exactly as it is today. `auth.ts` is what reads the IP off the `request`
argument Auth.js passes to `authorize` and supplies the real implementations.

`authorizeUser`'s failure reason gains `rate_limited`, which `auth.ts` maps to a
`CredentialsSignin` subclass with `code: "rate_limited"` so `/login` can say
"muitas tentativas" rather than "senha inválida".

### 4. Client IP, honestly

`clientIp` reads `x-forwarded-for` (leftmost entry) and falls back to a single
shared `unknown` bucket. Next 16 has no `request.ip` — it was removed in 15 — so
headers are the only source.

**`x-forwarded-for` is spoofable when the app is not behind a trusted proxy.** IP
limits are therefore best-effort. The email-keyed limits are the non-spoofable
backstop, which is why every sensitive bucket has one of each.

### 5. Redis unavailable → fail open

If the client throws or cannot connect, `consume` logs a server-side error and
returns `allowed: true`.

An auth system that locks everyone out when its cache dies is worse than one that
briefly loses throttling. This also keeps a bare host-side `npm run dev` and
`npm test` working with no Redis running. The trade is explicit: **while Redis is
down, there is no rate limiting.**

### 6. Compose

`redis:7-alpine` in the base `docker-compose.yml` — unlike spec B's Mailpit, this
one is needed in production too, so it does not belong in the dev-only override.

- Persistence disabled (`--save "" --appendonly no`) and no volume mounted: the
  counters are meant to be ephemeral.
- Host port **6380** (not 6379), mirroring the existing Postgres `5433` choice,
  so it cannot collide with a locally installed Redis. Inside the network it is
  `redis:6379`, the same container-vs-host split CLAUDE.md already documents for
  Postgres.
- Healthcheck `redis-cli ping`; `app` gains
  `depends_on: redis: { condition: service_healthy }`.
- New env var `REDIS_URL`.

### 7. Wiring

Each limited handler consumes **before** doing any real work:

- `POST /api/signup` — `signup` (IP) and `signup_email` (email) → `429` with a
  `Retry-After` header and `rate_limited` in `SignupErrorCode`.
- Credentials login — via `AuthorizeDeps`, as in §3.
- `POST /api/verify-email` — `verify` (IP).
- `POST /api/verify-email/resend` — `resend` (IP).

### Interaction with spec B

The last two endpoints only exist once spec B ships. The policy table carries all
six buckets from the start regardless — an unused entry costs nothing — so the
coupling is one line per route, in whichever spec lands second:

- **If C ships first:** this spec is what converts `authorizeUser` from returning
  a bare `null` to the `{ ok: false; reason }` union, with members
  `invalid | rate_limited`. B then adds `unverified` to it and wires `consume`
  into its two new routes as it creates them.
- **If B ships first:** B introduces the union as `invalid | unverified`, and C
  adds `rate_limited` plus the two `consume` calls.

The union is introduced once by whichever ships first and extended by the other;
`AuthorizeResult`'s final shape is the same either way.

Either way no work is thrown away.

### 8. i18n

`rate_limited` error strings added to the `Signup`, `Login`, and (if spec B has
shipped) `Verify` namespaces. All display text from the catalog, as usual.

### 9. Documentation

CLAUDE.md gains a short **rate limiting** subsection: Redis-backed fixed window,
where the policy table lives, fail-open behavior, and the spoofable-IP caveat.
The **Docker** section gains the `redis` service and its host `6380`, alongside
the existing `db:5432`-vs-`localhost:5433` note. `.env.example` (created by spec
B, or by this spec if it ships first) gains `REDIS_URL`.

## Testing

- `lib/rate-limit/consume.test.ts` — with a fake Redis client: allows up to the
  limit, denies past it, reports `retryAfterSec` from the TTL, and **fails open
  when the client throws**.
- `lib/rate-limit/ip.test.ts` — `x-forwarded-for` parsing: single value, comma
  list, missing header.
- `lib/auth/authorize.test.ts` — extend with fake `consume`/`reset`: denies when
  over the limit without ever calling `verify`, and resets the email counter on a
  successful login.
- Route tests — each limited route gets its `429` branch, with
  `lib/rate-limit/consume` mocked.

Unit tests never touch a real Redis: `consume` is mocked at the route level and
given a fake client at the unit level.

Manual check: hammer the login form past 20 attempts and confirm the `429` and
the "muitas tentativas" message; stop the `redis` container and confirm auth
still works (fail open) with an error in the server log.

## Files

**New**

- `lib/rate-limit/limits.ts`
- `lib/rate-limit/ip.ts`
- `lib/rate-limit/client.ts`
- `lib/rate-limit/consume.ts`
- tests listed above

**Modified**

- `docker-compose.yml` — `redis` service, `app` `depends_on`
- `lib/auth/authorize.ts` — `consume`/`reset` deps, `ip` input, `rate_limited`
- `auth.ts` — read the IP off `request`, inject the limiter, map `rate_limited`
- `app/api/signup/route.ts` — consume + `429`
- `app/api/verify-email/route.ts`, `app/api/verify-email/resend/route.ts` — consume + `429` (only if spec B has shipped)
- `app/login/page.tsx` — `rate_limited` message
- `lib/api-client.ts` — `rate_limited` in the error unions
- `package.json` — add `ioredis`
- `.env.example` — `REDIS_URL`
- `messages/pt-BR.json`
- `CLAUDE.md`

**No Prisma migration.** Counters live in Redis.
