import { describe, it, expect } from "vitest";
import {
  newVerificationToken,
  hashToken,
  isExpired,
  TOKEN_TTL_MS,
} from "./verification";

const NOW = new Date("2026-08-20T12:00:00.000Z");

describe("newVerificationToken", () => {
  it("returns a raw token whose sha-256 is the stored hash", () => {
    const t = newVerificationToken(NOW);
    expect(hashToken(t.raw)).toBe(t.tokenHash);
  });

  it("never stores the raw token itself", () => {
    const t = newVerificationToken(NOW);
    expect(t.tokenHash).not.toBe(t.raw);
    expect(t.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is URL-safe and high-entropy", () => {
    const t = newVerificationToken(NOW);
    expect(t.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.raw.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
  });

  it("does not repeat", () => {
    const seen = new Set(
      Array.from({ length: 50 }, () => newVerificationToken(NOW).raw),
    );
    expect(seen.size).toBe(50);
  });

  it("expires 24 hours after now", () => {
    const t = newVerificationToken(NOW);
    expect(t.expiresAt.getTime()).toBe(NOW.getTime() + TOKEN_TTL_MS);
    expect(TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("isExpired", () => {
  it("is false strictly before the deadline", () => {
    expect(isExpired(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });
  it("is true exactly at the deadline", () => {
    expect(isExpired(NOW, NOW)).toBe(true);
  });
  it("is true after the deadline", () => {
    expect(isExpired(new Date(NOW.getTime() - 1), NOW)).toBe(true);
  });
});
