/**
 * The one seam between "logged to stdout" and a real error-reporting
 * service. Every catch that swallows a failure the operator needs to know
 * about calls this instead of console.error directly, so wiring in a real
 * reporter (Sentry, etc.) later is an edit to this one file, not a sweep
 * across every call site.
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
}
