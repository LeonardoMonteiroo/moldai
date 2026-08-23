import { describe, it, expect } from "vitest";
import { ERROR_STATUS, apiError, type SharedErrorCode } from "./errors";

// Listed literally rather than derived, so adding a union member without a
// status fails this test instead of silently widening it.
const ALL_SHARED: SharedErrorCode[] = [
  "bad_body",
  "unauthorized",
  "service_unavailable",
  "pattern_not_found",
  "size_chart_not_found",
  "account_not_found",
  "sloper_not_found",
];

describe("ERROR_STATUS", () => {
  it("maps every shared code to an HTTP status", () => {
    for (const code of ALL_SHARED) {
      expect(typeof ERROR_STATUS[code]).toBe("number");
    }
  });

  it("has no extra keys beyond the union", () => {
    expect(Object.keys(ERROR_STATUS).sort()).toEqual([...ALL_SHARED].sort());
  });
});

describe("apiError", () => {
  it("keeps not_found as the wire status word for resource codes", async () => {
    const res = apiError("pattern_not_found", 404);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      status: "not_found",
      error: "pattern_not_found",
    });
  });

  it("keeps unauthorized as its own wire status word", async () => {
    const res = apiError("unauthorized", 401);
    await expect(res.json()).resolves.toEqual({
      status: "unauthorized",
      error: "unauthorized",
    });
  });

  it("defaults the wire status word to error", async () => {
    const res = apiError("bad_body", 400);
    await expect(res.json()).resolves.toEqual({
      status: "error",
      error: "bad_body",
    });
  });

  it("leaves account_not_found on the error status word", async () => {
    // Deliberate: today's /api/account/* 404s ship {status:"error"}, and this
    // change must not alter a wire shape while swapping prose for a code.
    const res = apiError("account_not_found", 404);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      status: "error",
      error: "account_not_found",
    });
  });

  it("emits service_unavailable at 503, defaulting to the error status word", async () => {
    const res = apiError(
      "service_unavailable",
      ERROR_STATUS.service_unavailable,
    );
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      status: "error",
      error: "service_unavailable",
    });
  });

  it("passes headers through", () => {
    const res = apiError("bad_body", 400, { "Retry-After": "30" });
    expect(res.headers.get("Retry-After")).toBe("30");
  });
});
