import { describe, it, expect } from "vitest";
import { SECURITY_HEADERS } from "./headers";

function value(key: string): string | undefined {
  return SECURITY_HEADERS.find((h) => h.key === key)?.value;
}

describe("SECURITY_HEADERS", () => {
  it("pins HSTS to two years, including subdomains", () => {
    expect(value("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
  });

  it("denies framing outright, mitigating clickjacking on /login", () => {
    expect(value("X-Frame-Options")).toBe("DENY");
  });

  it("caps the referrer leaked cross-origin", () => {
    expect(value("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("stops MIME sniffing", () => {
    expect(value("X-Content-Type-Options")).toBe("nosniff");
  });
});
