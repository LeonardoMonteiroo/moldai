import { forwardToSentry } from "./sentry";

/**
 * The one seam between "logged to stdout" and a real error-reporting
 * service. Every catch that swallows a failure the operator needs to know
 * about calls this instead of console.error directly, so wiring in a real
 * reporter is an edit to this one file, not a sweep across every call site
 * -- #275 is that edit: still writes to stdout unchanged (below), and also
 * forwards to Sentry via ./sentry.ts (a no-op when NEXT_PUBLIC_SENTRY_DSN
 * is unset). The forwarded context is redacted first -- see
 * ./sentry.ts's redactContext -- so this stays safe to call with whatever
 * an existing site already passes (see app/api/password-reset/request/
 * route.ts's `{ email }`) without auditing every call site first.
 */
export function reportError(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (context) {
    console.error(`[${scope}]`, err, context);
  } else {
    console.error(`[${scope}]`, err);
  }
  forwardToSentry(scope, err, context);
}
