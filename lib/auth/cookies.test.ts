import { describe, it, expect } from "vitest";
import { secureCookiesForEnv } from "./cookies";

describe("secureCookiesForEnv", () => {
  it("is true in production", () => {
    expect(secureCookiesForEnv("production")).toBe(true);
  });

  it("is false in development, so local http dev still authenticates", () => {
    expect(secureCookiesForEnv("development")).toBe(false);
  });

  it("is false when unset", () => {
    expect(secureCookiesForEnv(undefined)).toBe(false);
  });
});
