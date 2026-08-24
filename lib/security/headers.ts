export interface SecurityHeader {
  key: string;
  value: string;
}

// #27: pure data so next.config.ts's headers() has something the node
// vitest project can actually assert against -- next.config.ts itself isn't
// covered by either vitest project's include globs (lib/**, app/**,
// components/**), so the header list has to live somewhere testable.
// Strict-Transport-Security/X-Frame-Options/Referrer-Policy/
// X-Content-Type-Options ship now; a Content-Security-Policy is left for a
// follow-up since Next's inline bootstrap script needs a nonce and a naive
// policy would break the app (see issue #27).
export const SECURITY_HEADERS: SecurityHeader[] = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // Superseded by CSP's frame-ancestors, but that needs the nonce above --
  // this is the immediate clickjacking mitigation for /login's credentials
  // form until the CSP follow-up lands.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];
