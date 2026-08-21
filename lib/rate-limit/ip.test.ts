import { describe, it, expect } from "vitest";
import { clientIp } from "./ip";

describe("clientIp", () => {
  it("reads a single x-forwarded-for value", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });
  it("takes the leftmost entry of a comma list", () => {
    const h = new Headers({
      "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178",
    });
    expect(clientIp(h)).toBe("203.0.113.7");
  });
  it("trims surrounding whitespace", () => {
    const h = new Headers({ "x-forwarded-for": "  203.0.113.7 , 70.41.3.18" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });
  it("falls back to a shared 'unknown' bucket when the header is missing", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
  it("falls back to 'unknown' when the header is present but empty", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "   " }))).toBe("unknown");
  });
});
