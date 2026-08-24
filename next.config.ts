import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
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

export default withNextIntl(nextConfig);
