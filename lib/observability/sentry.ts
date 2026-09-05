/**
 * #275: the actual Sentry wiring behind `reportError` (report.ts). Kept out
 * of instrumentation.ts/instrumentation-client.ts on purpose -- those two
 * root files sit outside both vitest projects' include globs (`lib/**`,
 * `app/**`, `components/**`), the same reason `lib/security/headers.ts`
 * exists as pure data instead of living inline in next.config.ts. Every
 * root file that touches Sentry is a two-line caller into this module.
 *
 * This module is imported from the browser bundle too
 * (instrumentation-client.ts), so it must never import anything node-only.
 *
 * "@sentry/nextjs" is deliberately NEVER imported at this file's top level
 * -- only ever via a dynamic `import()` gated behind a DSN check, and only
 * from inside initSentry/forwardToSentry. Two reasons, both real:
 *  1. It has to stay a true no-op when NEXT_PUBLIC_SENTRY_DSN is unset --
 *     not just "Sentry.init() is never called", but "the SDK is never even
 *     loaded" -- so every environment without a configured DSN (which is
 *     every test run, and any deploy that hasn't set one up) pays zero cost.
 *  2. `reportError` is called from dozens of call sites across `lib/**` and
 *     `components/**`, several reached transitively by ordinary component
 *     renders in the `dom` vitest project. A static top-level `import * as
 *     Sentry from "@sentry/nextjs"` here drags in that package's bundled
 *     build-time webpack-plugin dependency as an unconditional side effect
 *     of the import itself (its main entry re-exports `withSentryConfig`
 *     unconditionally) -- which crashes under Vitest's jsdom transform
 *     pipeline with `TypeError: The URL must be of scheme file` the moment
 *     any component test collects a file that transitively imports
 *     reportError, without ever calling it. Confirmed empirically: the
 *     `node` vitest project (route/script tests) is unaffected: only `dom`
 *     is. The dynamic-import + DSN-gate below means that code path is
 *     simply never reached while no DSN is configured, so this stays
 *     correct without every affected component test having to mock
 *     "@sentry/nextjs" for a package it never otherwise touches.
 */

export type SentryRuntime = "node" | "edge" | "browser";

interface SentryInitOptions {
  dsn: string;
  environment?: string;
  // Errors only (#275 decision): no performance tracing, no Session
  // Replay. Replay records the DOM, which would ship chat message bodies
  // and generated pattern images to Sentry -- a direct violation of the
  // issue's "chat message bodies and attached images are never attached to
  // an event" criterion. Errors-only also keeps this inside the free
  // Developer tier's 5k-events/month quota with room to spare.
  tracesSampleRate: number;
  // Explicit even though it's the SDK default -- this is the one place
  // personal data could leak into a third party, so the choice is stated
  // rather than inherited silently.
  sendDefaultPii: boolean;
  // Tags every event this client produces with which of the three SDKs
  // reported it -- useful triage signal (a browser-tagged event and a
  // node-tagged one for the "same" bug can have very different causes),
  // and the only thing the `runtime` parameter itself affects today.
  initialScope: { tags: { runtime: SentryRuntime } };
}

function isDsnConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
}

/**
 * Pure -- returns the Sentry.init options for a given runtime, or null when
 * no DSN is configured. Unset stays a silent no-op (same shape as
 * LLM_BASE_URL/REDIS_URL in lib/schemas/env.ts): `npm run build` in CI has
 * no DSN and must keep passing, and a deploy that never sets one must not
 * warn or fail.
 *
 * One DSN variable serves both runtimes on purpose. A DSN is not a secret
 * (it ships inside the browser bundle regardless of what it's named), so a
 * server-only SENTRY_DSN holding the identical value would just be a second
 * copy of the same fact -- the thing CLAUDE.md's non-negotiables forbid.
 * NEXT_PUBLIC_SENTRY_DSN is also the repo's first NEXT_PUBLIC_* var: it has
 * to carry that prefix because the browser build needs it, which is also
 * why it's read at Docker BUILD time (see the Dockerfile's ARG), not just
 * at runtime like every other var in this schema.
 */
export function sentryOptions(
  runtime: SentryRuntime,
): SentryInitOptions | null {
  if (!isDsnConfigured()) return null;
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN as string,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    initialScope: { tags: { runtime } },
  };
}

export async function initSentry(runtime: SentryRuntime): Promise<void> {
  const options = sentryOptions(runtime);
  if (!options) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init(options);
}

// Keys whose VALUE reportError's callers are known (or likely) to put
// personal data or generated content behind, even though the shape of
// `context` is an open Record. Matched against the key only, case
// insensitively, so a new call site that reuses one of these names is
// caught by construction instead of needing this list to also learn the
// call site.
const SENSITIVE_KEY_PATTERN =
  /email|mail|token|password|hash|secret|api[_-]?key|authorization|cookie|message|prompt|image|content|body/i;

const REDACTED = "[redacted]";

/**
 * #275's last acceptance criterion: "no new personal data leaves the app:
 * userId/patternId context only -- chat message bodies and attached images
 * are never attached to an event." The known offender is
 * app/api/password-reset/request/route.ts's `reportError("password-reset-
 * request", err, { email })` -- redacting here, rather than editing that
 * call site, is deliberate: stdout is local to the operator and keeps the
 * email (their only handle on a mail failure), only the Sentry payload
 * drops it.
 */
export function redactContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!context) return context;
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    redacted[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : value;
  }
  return redacted;
}

/**
 * Forwards one reportError() call to Sentry with `scope` and `context`
 * preserved, redacted first (redactContext above). A synchronous no-op --
 * both in signature (callers never await it, matching reportError's own
 * fire-and-forget void return) and in cost -- when no DSN is configured:
 * see the module comment for why that has to mean "never loads the SDK",
 * not just "never calls Sentry.init".
 *
 * `err` is `unknown`, not always an Error -- lib/db/users.ts's deleteUser()
 * calls `reportError("account.delete", "account deleted", { userId })` with
 * a plain string as the "error" (deletion cascades away everything that
 * could produce a real one). captureException on a non-Error value produces
 * a low-quality synthetic event, so anything that isn't an Error goes
 * through captureMessage instead.
 */
export function forwardToSentry(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!isDsnConfigured()) return;
  void forward();

  async function forward(): Promise<void> {
    try {
      const Sentry = await import("@sentry/nextjs");
      const redacted = redactContext(context);
      Sentry.withScope((s) => {
        s.setTag("scope", scope);
        if (redacted) s.setContext("moldai", redacted);
        if (err instanceof Error) {
          Sentry.captureException(err);
        } else {
          Sentry.captureMessage(`[${scope}] ${String(err)}`);
        }
      });
    } catch {
      // Best-effort. A broken/unreachable Sentry transport must never be
      // the reason reportError() itself throws -- it's called from catch
      // blocks that are already handling a real failure.
    }
  }
}
