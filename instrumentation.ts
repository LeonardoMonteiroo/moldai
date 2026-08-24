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
  const { parseServerEnv } = await import("./lib/schemas/env");
  try {
    parseServerEnv(process.env);
  } catch (err) {
    console.error("[boot] " + (err instanceof Error ? err.message : err));
    throw err;
  }
}
