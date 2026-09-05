import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// #275: "@sentry/nextjs" is only ever dynamically imported inside sentry.ts
// (never at module top level -- see that file's header comment for why),
// so vi.mock still has to target this exact specifier: Vitest intercepts a
// dynamic import() the same way it intercepts a static one, as long as the
// specifier matches (CLAUDE.md's mock-specifier rule).
vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  withScope: vi.fn((callback: (scope: unknown) => void) => {
    callback({ setTag: vi.fn(), setContext: vi.fn() });
  }),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import {
  sentryOptions,
  initSentry,
  redactContext,
  forwardToSentry,
} from "./sentry";

const ORIGINAL_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

// forwardToSentry is a synchronous fire-and-forget function (matches
// reportError's own void signature) -- its actual Sentry work happens
// inside an un-awaited internal async function, gated behind a dynamic
// import(). This flushes the microtask queue so that work has a chance to
// finish before an assertion runs.
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("sentryOptions / initSentry", () => {
  afterEach(() => {
    if (ORIGINAL_DSN === undefined) {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    } else {
      process.env.NEXT_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
    }
    vi.restoreAllMocks();
  });

  it("returns null and never calls Sentry.init when no DSN is set", async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    expect(sentryOptions("node")).toBeNull();
    await initSentry("node");
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("returns errors-only options (no tracing, no default PII), tagged with the runtime", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://key@o1.ingest.sentry.io/1";
    const options = sentryOptions("node");
    expect(options).toEqual({
      dsn: "https://key@o1.ingest.sentry.io/1",
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      initialScope: { tags: { runtime: "node" } },
    });
  });

  it("calls Sentry.init with those options when a DSN is set", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://key@o1.ingest.sentry.io/1";
    await initSentry("browser");
    expect(Sentry.init).toHaveBeenCalledWith(sentryOptions("browser"));
  });
});

describe("redactContext", () => {
  it("passes through undefined unchanged", () => {
    expect(redactContext(undefined)).toBeUndefined();
  });

  it("keeps identifier fields intact", () => {
    expect(
      redactContext({ userId: "u1", patternId: "p1", check: "postgres" }),
    ).toEqual({ userId: "u1", patternId: "p1", check: "postgres" });
  });

  // #275: the acceptance criterion this exists for -- an email address must
  // never reach the Sentry payload, even though
  // app/api/password-reset/request/route.ts's stdout line keeps it.
  it("redacts an email value without dropping the sibling key", () => {
    const redacted = redactContext({ email: "user@example.com" });
    expect(redacted).toEqual({ email: "[redacted]" });
    expect(JSON.stringify(redacted)).not.toContain("user@example.com");
  });

  it("redacts other sensitive-looking keys: token, password, message, image", () => {
    const redacted = redactContext({
      token: "abc",
      password: "hunter2",
      message: "chat body text",
      image: "data:image/png;base64,...",
      userId: "u1",
    });
    expect(redacted).toEqual({
      token: "[redacted]",
      password: "[redacted]",
      message: "[redacted]",
      image: "[redacted]",
      userId: "u1",
    });
  });
});

describe("forwardToSentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://key@o1.ingest.sentry.io/1";
  });

  afterEach(() => {
    if (ORIGINAL_DSN === undefined) {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    } else {
      process.env.NEXT_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
    }
  });

  it("never imports/calls the SDK when no DSN is configured", async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    forwardToSentry("generate", new Error("boom"));
    await flushMicrotasks();
    expect(Sentry.withScope).not.toHaveBeenCalled();
  });

  it("captures an Error via captureException, tagged with scope", async () => {
    const err = new Error("boom");
    forwardToSentry("generate", err, { patternId: "p1" });
    await flushMicrotasks();
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  // lib/db/users.ts's deleteUser() passes a plain string, not an Error.
  it("captures a non-Error value via captureMessage instead of captureException", async () => {
    forwardToSentry("account.delete", "account deleted", { userId: "u1" });
    await flushMicrotasks();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "[account.delete] account deleted",
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("redacts context before attaching it to the scope", async () => {
    let captured: Record<string, unknown> | undefined;
    // Cast: the real @sentry/nextjs withScope's overloaded type signature
    // doesn't structurally match this single-argument mock shape, and the
    // mock (declared in the vi.mock factory above) is untyped anyway.
    const withScopeMock = Sentry.withScope as unknown as ReturnType<
      typeof vi.fn
    >;
    withScopeMock.mockImplementationOnce(
      (callback: (scope: unknown) => void) => {
        callback({
          setTag: vi.fn(),
          setContext: (_key: string, value: Record<string, unknown>) => {
            captured = value;
          },
        });
      },
    );
    forwardToSentry("password-reset-request", new Error("smtp down"), {
      email: "user@example.com",
    });
    await flushMicrotasks();
    expect(captured).toEqual({ email: "[redacted]" });
  });

  it("works with no context at all", async () => {
    expect(() =>
      forwardToSentry("draft.engine.unknown", new Error("x")),
    ).not.toThrow();
    await flushMicrotasks();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
