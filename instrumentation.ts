import * as Sentry from "@sentry/nextjs";

// #57: Next calls register() once, when a new server instance boots, and
// waits for it to complete before serving the first request
// (node_modules/next/dist/docs/.../instrumentation.md) -- so a thrown
// ServerEnvError here fails the container/dev-server start outright,
// instead of the previous behaviour of every env var being read ad hoc at
// first use (a bad SMTP_PORT surfaced as a 503 on the first real signup,
// after the user row had already been created).
//
// Deliberately NOT parsed at module scope of anything else: `npm run
// typecheck` is `next build` (package.json), which imports routes that
// reference these vars but never starts a server instance -- a module-scope
// throw there would break the build and CI, where the env is dummy/absent.
export async function register() {
  // Relative, not "@/..." -- same caution as next.config.ts: this file
  // loads at server-instance boot, before the tsconfig path alias is
  // guaranteed to have been applied to it.
  const { initSentry } = await import("./lib/observability/sentry");
  // #275: awaited and initialized first, so a boot-time env failure below
  // is itself reportable -- initSentry's own SDK import is lazy (see
  // sentry.ts), so without the await, the captureException call below could
  // run before Sentry.init has actually happened. A no-op when
  // NEXT_PUBLIC_SENTRY_DSN is unset.
  await initSentry(process.env.NEXT_RUNTIME === "edge" ? "edge" : "node");

  const { parseServerEnv } = await import("./lib/schemas/env");
  try {
    parseServerEnv(process.env);
  } catch (err) {
    console.error("[boot] " + (err instanceof Error ? err.message : err));
    Sentry.captureException(err, { tags: { scope: "boot" } });
    // The container is about to exit (the throw below) -- without this the
    // process can die before Sentry's transport flushes the event.
    await Sentry.flush(2000);
    throw err;
  }
}

// #275: server errors Next itself catches outside the reportError() seam
// (a route handler, Server Action, or Server Component throw that never
// reaches one of the app's own try/catch blocks) still get reported. A
// no-op when no DSN is configured, same as the rest of this file.
export const onRequestError = Sentry.captureRequestError;
