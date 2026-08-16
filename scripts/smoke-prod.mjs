#!/usr/bin/env node
// Smoke de produção: valida que o LOGIN de verdade funciona no stack real
// (`next start` / NODE_ENV=production), não só que a home responde HTTP.
//
// Nasceu de um bug real: `trustHost` ausente no Auth.js v5 derrubava todo
// /api/auth/* com 500 (UntrustedHost) SÓ em produção — em dev o host é
// confiado automaticamente. Um smoke que só checa o código HTTP da home passa
// mesmo com o login quebrado; este faz o fluxo credentials completo e exige
// uma sessão válida no fim, então pega essa classe de regressão.
//
// Uso:
//   node scripts/smoke-prod.mjs            # contra SMOKE_URL (default localhost:3000)
//   SMOKE_URL=http://host:3000 node scripts/smoke-prod.mjs
// Env: SMOKE_URL, SMOKE_EMAIL, SMOKE_PASSWORD, SMOKE_READY_TIMEOUT_MS

const BASE = (process.env.SMOKE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const EMAIL = process.env.SMOKE_EMAIL ?? "dev@moldai.local";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "moldai-dev";
const READY_TIMEOUT_MS = Number(process.env.SMOKE_READY_TIMEOUT_MS ?? 120000);

// Cookie jar mínimo (nome -> valor); reenviado em cada request.
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
    `servidor não ficou pronto em ${BASE} (${READY_TIMEOUT_MS}ms) — último: ${last}`,
  );
}

async function main() {
  console.log(`[smoke] alvo: ${BASE}  usuário: ${EMAIL}`);
  await waitReady();
  ok("GET /login → 200");

  // Endpoint de auth precisa estar de pé — 500 aqui é o sintoma do UntrustedHost.
  const providers = await req("/api/auth/providers");
  if (providers.status !== 200) {
    fail(
      `GET /api/auth/providers → ${providers.status} (500 = trustHost/UntrustedHost)`,
    );
  }
  ok("GET /api/auth/providers → 200");

  // Raiz sem sessão deve mandar para /login.
  const anon = await req("/");
  const anonLoc = anon.headers.get("location") ?? "";
  if (
    ![301, 302, 307, 308].includes(anon.status) ||
    !anonLoc.includes("/login")
  ) {
    fail(
      `GET / (anônimo) → ${anon.status} loc="${anonLoc}" (esperado redirect p/ /login)`,
    );
  }
  ok("GET / (anônimo) → redirect /login");

  // CSRF token (Auth.js v5).
  const csrfRes = await req("/api/auth/csrf");
  if (csrfRes.status !== 200) fail(`GET /api/auth/csrf → ${csrfRes.status}`);
  const { csrfToken } = await csrfRes.json();
  if (!csrfToken) fail("csrfToken ausente na resposta de /api/auth/csrf");
  ok("CSRF token obtido");

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
    fail(
      `POST login → ${login.status} (5xx: provável UntrustedHost/trustHost)`,
    );
  }
  const loginLoc = login.headers.get("location") ?? "";
  if (/[?&]error=/.test(loginLoc)) {
    fail(`login rejeitado (credenciais?): ${loginLoc}`);
  }
  ok(`POST login credentials → ${login.status}`);

  // Prova real: a sessão precisa existir e ser do usuário esperado.
  const session = await req("/api/auth/session");
  if (session.status !== 200) fail(`GET /api/auth/session → ${session.status}`);
  const sess = await session.json();
  if (sess?.user?.email !== EMAIL) {
    fail(`sessão sem o usuário esperado — recebido: ${JSON.stringify(sess)}`);
  }
  ok(`sessão ativa para ${sess.user.email}`);

  // E a raiz autenticada não redireciona mais.
  const authed = await req("/");
  if (authed.status !== 200) {
    fail(`GET / (autenticado) → ${authed.status} (esperado 200 — editor)`);
  }
  ok("GET / (autenticado) → 200 (editor)");

  console.log(
    "\n✓ smoke de produção OK — login real funciona no stack next start",
  );
}

main().catch((e) => fail(e?.stack ?? String(e)));
