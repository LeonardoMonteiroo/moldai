import { describe, it, expect } from "vitest";
import { parseServerEnv, ServerEnvError } from "./env";

const BASE_DEV_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "a".repeat(32),
  ANTHROPIC_API_KEY: "sk-test",
};

describe("parseServerEnv", () => {
  it("accepts a minimal dev environment with no NODE_ENV set", () => {
    const env = parseServerEnv(BASE_DEV_ENV);
    expect(env.DATABASE_URL).toBe(BASE_DEV_ENV.DATABASE_URL);
    expect(env.SMTP_PORT).toBe(587);
  });

  // #57: this is the exact bug the issue describes -- a non-numeric
  // SMTP_PORT used to make `Number(process.env.SMTP_PORT ?? 587)` return
  // NaN deep inside sendMail, only discovered when a user tried to sign up.
  it("rejects a non-numeric SMTP_PORT instead of silently coercing to NaN", () => {
    expect(() =>
      parseServerEnv({ ...BASE_DEV_ENV, SMTP_PORT: "smtp" }),
    ).toThrow(ServerEnvError);
  });

  it("rejects an out-of-range SMTP_PORT", () => {
    expect(() =>
      parseServerEnv({ ...BASE_DEV_ENV, SMTP_PORT: "70000" }),
    ).toThrow(ServerEnvError);
  });

  it("rejects a missing DATABASE_URL", () => {
    const { DATABASE_URL: _unused, ...rest } = BASE_DEV_ENV;
    expect(() => parseServerEnv(rest)).toThrow(ServerEnvError);
  });

  it("rejects a missing ANTHROPIC_API_KEY", () => {
    const { ANTHROPIC_API_KEY: _unused, ...rest } = BASE_DEV_ENV;
    expect(() => parseServerEnv(rest)).toThrow(ServerEnvError);
  });

  it("rejects an AUTH_SECRET shorter than 32 characters", () => {
    expect(() =>
      parseServerEnv({ ...BASE_DEV_ENV, AUTH_SECRET: "too-short" }),
    ).toThrow(ServerEnvError);
  });

  it("allows APP_URL and SMTP_HOST to stay unset outside production", () => {
    expect(() =>
      parseServerEnv({ ...BASE_DEV_ENV, NODE_ENV: "development" }),
    ).not.toThrow();
  });

  // #57 "Why": APP_URL/SMTP_HOST were only ever checked inside the mail
  // send path, after a user row already existed. Requiring them at parse
  // time is what lets instrumentation.ts fail the boot instead.
  it("requires APP_URL and SMTP_HOST in production", () => {
    expect(() =>
      parseServerEnv({ ...BASE_DEV_ENV, NODE_ENV: "production" }),
    ).toThrow(ServerEnvError);
  });

  it("accepts a full production environment", () => {
    expect(() =>
      parseServerEnv({
        ...BASE_DEV_ENV,
        NODE_ENV: "production",
        APP_URL: "https://moldai.example.com",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "465",
      }),
    ).not.toThrow();
  });

  it("includes every failing field in the thrown message, not just the first", () => {
    try {
      parseServerEnv({ SMTP_PORT: "smtp" });
      throw new Error("expected parseServerEnv to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ServerEnvError);
      const message = (err as ServerEnvError).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("AUTH_SECRET");
      expect(message).toContain("ANTHROPIC_API_KEY");
      expect(message).toContain("SMTP_PORT");
    }
  });
});
