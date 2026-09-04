# Rate limiting

> For the why behind these rules — the `REDIS_OPTIONS` cold-start measurement and the per-bucket ordering reasoning — see [`../decisions/rate-limiting.md`](../decisions/rate-limiting.md).
> For universal, cross-cutting rules, see the root [`CLAUDE.md`](../../CLAUDE.md).

Redis-backed fixed window: `consume()` (`lib/rate-limit/consume.ts`) runs one atomic `MULTI` — `INCR` + `EXPIRE … NX` + `TTL` — so the window starts on the first request and expires itself; no sweep job. **The whole policy is the table in `lib/rate-limit/limits.ts`, reproduced here in full so a stale copy is a visible mismatch rather than a silent one:**

```
signup 5/h · signup_email 3/h · login 20/15min · login_email 10/15min
verify 20/h · resend 10/h · resend_email 5/h · resend_attempt 10/15min
create 60/h · password_reset_request 10/h · password_reset_request_email 5/h
password_reset_confirm 20/h · purchase 10/h · purchase_user 10/h
```

- **Every sensitive endpoint gets an IP-keyed bucket AND a second non-spoofable one**, because `x-forwarded-for` is spoofable when the app isn't behind a trusted proxy. **Deployment consequence: behind a reverse proxy, that proxy must overwrite `x-forwarded-for` for the IP limits to mean anything** — Next only fills the header when the client didn't send one.
- **Four buckets are deliberate exceptions to the IP+email pairing:** `verify` and `password_reset_confirm` guard a request carrying no email, only a single-use 256-bit token, so the token _is_ the backstop and a counter would add nothing; `create` and `purchase_user` are keyed on the **account id** rather than the IP, since the caller is already a known account (`create` covers the three authenticated-write creates that had no throttle at all before; `purchase_user` pairs with an IP-keyed `purchase` on a route that had no bucket at all).
- **Bucket ordering within a route is deliberate.** `resend_email` is consumed **after** the credential and cooldown checks, so it counts mails actually attempted per address — a victim can't have their quota burned by someone without their password, and impatient retries inside the cooldown (which send no mail) cost nothing. `password_reset_request*` is consumed **regardless of whether the address exists**, so an attacker can't flood a victim's inbox just because the account is unregistered.
- **The limiter reaches the pure `authorizeUser` through `AuthorizeDeps` (`consume`/`reset`), never an import** — keeping that module DB-free, Redis-free, and testable with fakes.
- **It fails open:** if Redis is unreachable, `consume` logs and allows. Both Docker stacks gate `app` on `redis`'s healthcheck; **the host flow is not automatically covered** — `npm run db:up` brings up Redis for exactly this reason, and skipping it means every `consume()` silently takes the fail-open branch.
- **`REDIS_OPTIONS` (`lib/rate-limit/client.ts`) is a correctness setting, not a preference.** `enableOfflineQueue: false` is required so a fresh process's first commands don't get issued before the socket is writeable and rejected outright (which `consume` would turn into fail-open); `maxRetriesPerRequest` bounds the wait and `commandTimeout` (1 s) is a hard per-command ceiling. `client.test.ts` asserts the three options as a regression guard.
- **Accepted trade-off:** `login_email` is consumed before the password check and only a _successful_ password clears it — so anyone who knows a victim's email can spend those 10 attempts and soft-lock the account for the rest of the window, and the victim's own correct password can't clear the counter because the throttle returns first. Self-expiring and standard for per-account throttling, but a real property of the system.
