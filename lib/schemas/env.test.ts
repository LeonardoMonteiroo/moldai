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

  // #269: all four LLM_* vars are optional -- production sets none of them
  // today, and must keep parsing exactly as before.
  it("accepts LLM_PROVIDER unset, and rejects an unrecognized value", () => {
    expect(() => parseServerEnv(BASE_DEV_ENV)).not.toThrow();
    expect(() =>
      parseServerEnv({ ...BASE_DEV_ENV, LLM_PROVIDER: "openai" }),
    ).toThrow(ServerEnvError);
  });

  it("accepts a local-provider environment", () => {
    expect(() =>
      parseServerEnv({
        ...BASE_DEV_ENV,
        LLM_PROVIDER: "local",
        LLM_BASE_URL: "http://localhost:8000/v1",
        LLM_MODEL: "qwen2.5-vl-7b-instruct",
      }),
    ).not.toThrow();
  });

  // #275: NEXT_PUBLIC_SENTRY_DSN is optional in every environment -- unset
  // means reportError() stays console-only (lib/observability/sentry.ts).
  it("accepts NEXT_PUBLIC_SENTRY_DSN unset, and rejects a non-URL value", () => {
    expect(() => parseServerEnv(BASE_DEV_ENV)).not.toThrow();
    expect(() =>
      parseServerEnv({ ...BASE_DEV_ENV, NEXT_PUBLIC_SENTRY_DSN: "not-a-url" }),
    ).toThrow(ServerEnvError);
  });

  it("accepts a valid NEXT_PUBLIC_SENTRY_DSN", () => {
    expect(() =>
      parseServerEnv({
        ...BASE_DEV_ENV,
        NEXT_PUBLIC_SENTRY_DSN: "https://key@o1.ingest.sentry.io/1",
      }),
    ).not.toThrow();
  });

  // #276: all four LANGFUSE_* vars are optional -- unset must keep parsing
  // exactly as before, in every environment including production.
  it("accepts LANGFUSE_* unset", () => {
    expect(() => parseServerEnv(BASE_DEV_ENV)).not.toThrow();
  });

  it("rejects a non-URL LANGFUSE_BASE_URL", () => {
    expect(() =>
      parseServerEnv({ ...BASE_DEV_ENV, LANGFUSE_BASE_URL: "not-a-url" }),
    ).toThrow(ServerEnvError);
  });

  it("rejects a LANGFUSE_TRACE_CONTENT value other than 'true'/'false'", () => {
    expect(() =>
      parseServerEnv({ ...BASE_DEV_ENV, LANGFUSE_TRACE_CONTENT: "yes" }),
    ).toThrow(ServerEnvError);
  });

  it("accepts a full Langfuse tracing environment", () => {
    expect(() =>
      parseServerEnv({
        ...BASE_DEV_ENV,
        LANGFUSE_SECRET_KEY: "sk-lf-test",
        LANGFUSE_PUBLIC_KEY: "pk-lf-test",
        LANGFUSE_BASE_URL: "https://langfuse.example.com",
        LANGFUSE_TRACE_CONTENT: "true",
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
