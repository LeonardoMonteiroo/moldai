// #27: pure and DB/framework-free so it's testable without booting NextAuth
// -- the same DI-free shape as the rest of lib/auth/. Explicit rather than
// left to @auth/core's own request-protocol-derived default
// (node_modules/@auth/core/lib/init.js), which silently drops the Secure
// flag if a reverse proxy terminates TLS without forwarding
// x-forwarded-proto: https (see .env.example's "reverse proxy" section).
// Named without a "use" prefix on purpose -- react-hooks/rules-of-hooks
// treats any useXxx identifier as a hook by naming convention alone, which
// misfires on this plain top-level call in a NextAuth config object.
export function secureCookiesForEnv(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}
