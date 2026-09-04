// Shared rig for the design-review drivers.
//
// These are not tests. Each scenario's job is to put a screen into one real
// state so it can be looked at next to its reference capture; the values they
// print are what the review agreed on, reported rather than enforced.
//
// ESM with a .mjs extension, matching scripts/smoke-prod.mjs -- the repo's
// existing home for an operational script.
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SKILL = path.join(ROOT, ".claude", "skills", "playwright-skill");

// Playwright is not a dependency of this project: it lives in the
// playwright-skill's own node_modules, which is what this repo already uses to
// drive a browser. Reaching it by absolute path keeps that arrangement while
// letting these scripts live here, versioned next to the app they describe.
// createRequire is what makes an absolute path loadable from ESM at all.
const { chromium } = createRequire(import.meta.url)(
  path.join(SKILL, "node_modules", "playwright"),
);

// Every reference capture in docs/design/screenshots is a confirmed 1280x900
// shot. Matching it exactly is the whole point: a screenshot taken at another
// size cannot be laid next to the reference.
export const VIEWPORT = { width: 1280, height: 900 };

export const BASE_URL = process.env.REVIEW_URL || "http://localhost:3000";
export const OUT_DIR =
  process.env.REVIEW_OUT || path.join(os.tmpdir(), "moldai-design-review");
const REFERENCE_DIR = path.join(ROOT, "docs", "design", "screenshots");

// Collects every checked value instead of throwing on the first difference, so
// one run reports everything worth looking at on that screen.
export function collector() {
  const rows = [];
  return {
    rows,
    eq(what, actual, expected) {
      rows.push({
        what,
        actual,
        expected,
        ok: String(actual) === String(expected),
      });
    },
    get differences() {
      return rows.filter((r) => r.ok === false);
    },
  };
}

function redis(...args) {
  const pw = readEnvLocal("REDIS_PASSWORD");
  return execFileSync(
    "docker",
    [
      "exec",
      "moldai-redis",
      "redis-cli",
      "-a",
      pw,
      "--no-auth-warning",
      ...args,
    ],
    { encoding: "utf8" },
  );
}

// Seeded through the container rather than by hammering the endpoint: ten real
// logins would also spend the IP-keyed bucket that every other scenario shares.
export function seedRateLimit(bucket, id, value, ttlSec = 900) {
  redis("SET", `rl:${bucket}:${id}`, String(value), "EX", String(ttlSec));
}

export function clearRateLimit(bucket, id) {
  redis("DEL", `rl:${bucket}:${id}`);
}

// The limiter is only ever the subject in login.rateLimited, which seeds its
// own bucket. Everywhere else the counters are pure friction: a login attempt
// spends login_email and only a *successful* password clears it, so the
// accounts used here -- all of which fail on purpose -- would soft-lock
// themselves after a handful of runs, and the IP-keyed `login` bucket caps a
// full batch at three passes. Clearing them up front is what makes a helper
// still work on its tenth use.
export function clearLoginThrottles(emails = []) {
  const keys = redis("KEYS", "rl:login:*").split(/\r?\n/).filter(Boolean);
  for (const k of keys) redis("DEL", k);
  for (const e of emails) redis("DEL", `rl:login_email:${e}`);
}

// Same reasoning as clearLoginThrottles, for the resend path: driving the
// "link reenviado" state spends resend_email (5/h per address) and the two
// IP-keyed buckets, so a few runs would leave the helper unable to reach the
// very state it exists to show.
export function clearResendThrottles(emails = []) {
  for (const b of ["resend", "resend_attempt"]) {
    const keys = redis("KEYS", `rl:${b}:*`).split(/\r?\n/).filter(Boolean);
    for (const k of keys) redis("DEL", k);
  }
  for (const e of emails) redis("DEL", `rl:resend_email:${e}`);
}

// Signup is the tightest bucket of the three (5/h per IP, 3/h per address) and
// it is spent before the duplicate check, so even the "email ja cadastrado"
// answer this driver is after costs a slot. Two runs would exhaust it.
export function clearSignupThrottles(emails = []) {
  const keys = redis("KEYS", "rl:signup:*").split(/\r?\n/).filter(Boolean);
  for (const k of keys) redis("DEL", k);
  for (const e of emails) redis("DEL", `rl:signup_email:${e}`);
}

export function readEnvLocal(key) {
  const line = fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(key + "="));
  if (!line) throw new Error(`${key} ausente em .env.local`);
  return line.slice(key.length + 1);
}

// Reads the newest mail Mailpit holds for an address and pulls the link out of
// it. The dev stack's inbox is the only place a real, unconsumed token exists:
// the database stores a sha-256 digest, not the token itself, so there is no
// way to reconstruct one -- it has to come from the mail the app actually sent.
export async function latestMailLink(email, pattern) {
  const list = await (
    await fetch("http://localhost:8025/api/v1/messages")
  ).json();
  const mine = (list.messages || []).filter((m) =>
    (m.To || []).some((t) => t.Address === email),
  );
  if (!mine.length) throw new Error(`Mailpit nao tem mensagem para ${email}`);
  // Newest first, but matched on the link rather than just taken: one address
  // receives both verification and password-reset mail, so "the latest message"
  // is often the wrong kind. The pattern is what identifies the one wanted.
  for (const m of mine) {
    const full = await (
      await fetch(`http://localhost:8025/api/v1/message/${m.ID}`)
    ).json();
    const link = ((full.Text || "") + (full.HTML || "")).match(pattern);
    if (link) return link[0];
  }
  throw new Error(
    `nenhuma das ${mine.length} mensagens de ${email} tem link casando com ${pattern}`,
  );
}

export async function fill(page, selector, value) {
  await page.fill(selector, value);
}

// Waits for whichever outcome the app actually reaches, so a scenario reports
// "the screen said X" instead of timing out on the selector it hoped for.
export async function waitForEither(page, okSelector, errSelector) {
  const found = await Promise.race([
    page.waitForSelector(okSelector).then(() => "ok"),
    page.waitForSelector(errSelector).then(() => "erro"),
  ]);
  if (found === "erro") {
    const msg = await page.$eval(errSelector, (el) => el.textContent.trim());
    throw new Error(`esperava sucesso, veio erro na tela: "${msg}"`);
  }
}

export async function withPage(fn) {
  const browser = await chromium.launch({
    headless: process.env.REVIEW_HEADLESS === "1",
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    return await fn(page, context);
  } finally {
    await browser.close();
  }
}

export function capturePath(id) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return path.join(OUT_DIR, `${id.replace(/\./g, "-")}.png`);
}

export function referencePath(rel) {
  return path.join(REFERENCE_DIR, rel);
}
