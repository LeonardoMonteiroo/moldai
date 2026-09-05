import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
// Not the top-level "@sentry/nextjs" export -- that one re-exports
// withSentryConfig only as a deprecation shim (warns on every build,
// removed in v11); "@sentry/nextjs/config" is the SDK's own recommended
// import for it.
import { withSentryConfig } from "@sentry/nextjs/config";
// Relative, not "@/..." -- next.config.ts loads outside the app's normal
// module resolution, before the tsconfig path alias is guaranteed to apply.
import { SECURITY_HEADERS } from "./lib/security/headers";

const nextConfig: NextConfig = {
  // #27: stop advertising the framework on every response.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
const configured = withNextIntl(nextConfig);

// #275: withSentryConfig's only job here is uploading source maps at build
// time, which needs SENTRY_AUTH_TOKEN (+ org/project) -- CI's `build` job
// (.github/workflows/ci.yml) sets none of those, and `npm run typecheck` IS
// `next build` (package.json), so an unconditional wrap would risk that
// path on every PR. Gating on the token means the wrap only activates for a
// real deploy that has one; error reporting itself (instrumentation.ts's
// onRequestError, instrumentation-client.ts) works either way, just with
// minified stack traces when the wrap is skipped.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(configured, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      disableLogger: true,
    })
  : configured;
