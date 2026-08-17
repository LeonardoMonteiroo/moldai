#!/usr/bin/env node
// Production smoke test: verifies that REAL login works on the actual stack
// (`next start` / NODE_ENV=production), not just that the home page responds HTTP.
//
// Born from a real bug: a missing `trustHost` in Auth.js v5 took down every
// /api/auth/* route with a 500 (UntrustedHost) ONLY in production — in dev the
// host is trusted automatically. A smoke test that only checks the home page's
// HTTP status passes even with login broken; this one runs the full credentials
// flow and requires a valid session at the end, so it catches that class of regression.
//
// Usage:
//   node scripts/smoke-prod.mjs            # against SMOKE_URL (default localhost:3000)
//   SMOKE_URL=http://host:3000 node scripts/smoke-prod.mjs
// Env: SMOKE_URL, SMOKE_EMAIL, SMOKE_PASSWORD, SMOKE_READY_TIMEOUT_MS

const BASE = (process.env.SMOKE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const EMAIL = process.env.SMOKE_EMAIL ?? "dev@moldai.local";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "moldai-dev";
const READY_TIMEOUT_MS = Number(process.env.SMOKE_READY_TIMEOUT_MS ?? 120000);

// Minimal cookie jar (name -> value); resent on every request.
const jar = new Map();

function storeCookies(res) {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function req(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (jar.size) headers.cookie = cookieHeader();
  const res = await fetch(BASE + path, {
    redirect: "manual",
    ...init,
    headers,
  });
  storeCookies(res);
  return res;
}

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}
function ok(msg) {
  console.log(`✓ ${msg}`);
}

async function waitReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await req("/login");
      if (res.status === 200) return;
      last = `status ${res.status}`;
    } catch (e) {
      last = e?.code ?? e?.message ?? String(e);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  fail(
    `server didn't become ready at ${BASE} (${READY_TIMEOUT_MS}ms) — last: ${last}`,
  );
}

async function main() {
  console.log(`[smoke] target: ${BASE}  user: ${EMAIL}`);
  await waitReady();
  ok("GET /login → 200");

  // Auth endpoint needs to be up — a 500 here is the UntrustedHost symptom.
  const providers = await req("/api/auth/providers");
  if (providers.status !== 200) {
    fail(
      `GET /api/auth/providers → ${providers.status} (500 = trustHost/UntrustedHost)`,
    );
  }
  ok("GET /api/auth/providers → 200");

  // Root without a session should redirect to /login.
  const anon = await req("/");
  const anonLoc = anon.headers.get("location") ?? "";
  if (
    ![301, 302, 307, 308].includes(anon.status) ||
    !anonLoc.includes("/login")
  ) {
    fail(
      `GET / (anonymous) → ${anon.status} loc="${anonLoc}" (expected redirect to /login)`,
    );
  }
  ok("GET / (anonymous) → redirect /login");

  // CSRF token (Auth.js v5).
  const csrfRes = await req("/api/auth/csrf");
  if (csrfRes.status !== 200) fail(`GET /api/auth/csrf → ${csrfRes.status}`);
  const { csrfToken } = await csrfRes.json();
  if (!csrfToken) fail("csrfToken missing from the /api/auth/csrf response");
  ok("CSRF token obtained");

  // Login credentials.
  const body = new URLSearchParams({
    csrfToken,
    email: EMAIL,
    password: PASSWORD,
    callbackUrl: `${BASE}/`,
  });
  const login = await req("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (login.status >= 500) {
    fail(`POST login → ${login.status} (5xx: likely UntrustedHost/trustHost)`);
  }
  const loginLoc = login.headers.get("location") ?? "";
  if (/[?&]error=/.test(loginLoc)) {
    fail(`login rejected (bad credentials?): ${loginLoc}`);
  }
  ok(`POST login credentials → ${login.status}`);

  // Real proof: the session must exist and belong to the expected user.
  const session = await req("/api/auth/session");
  if (session.status !== 200) fail(`GET /api/auth/session → ${session.status}`);
  const sess = await session.json();
  if (sess?.user?.email !== EMAIL) {
    fail(
      `session missing the expected user — received: ${JSON.stringify(sess)}`,
    );
  }
  ok(`active session for ${sess.user.email}`);

  // And the authenticated root no longer redirects.
  const authed = await req("/");
  if (authed.status !== 200) {
    fail(`GET / (authenticated) → ${authed.status} (expected 200 — editor)`);
  }
  ok("GET / (authenticated) → 200 (editor)");

  console.log(
    "\n✓ production smoke OK — real login works on the next start stack",
  );
}

main().catch((e) => fail(e?.stack ?? String(e)));
