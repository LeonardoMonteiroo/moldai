import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError, fetchPattern, generate, listPatterns } from "./api-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api-client HTTP error handling", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The bug: getJson never checked res.ok, so a 401's error body was returned
  // typed as EditorState. The store then wrote `pattern: undefined` into itself
  // and the editor sat on its loading screen forever.
  it("throws ApiError instead of returning a 401 body as data", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ status: "unauthorized", error: "unauthorized" }, 401),
    );
    await expect(fetchPattern("p1")).rejects.toBeInstanceOf(ApiError);
  });

  it("carries the HTTP status and the wire error code on the thrown error", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ status: "not_found", error: "pattern_not_found" }, 404),
    );
    const err = await fetchPattern("p1").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.code).toBe("pattern_not_found");
  });

  it("throws on a 500 that returns no JSON at all", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("<html>Internal Server Error</html>", { status: 500 }),
    );
    const err = await listPatterns().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
  });

  // 402 is part of generate's contract -- the paywall flow reads the body -- so
  // it must NOT be turned into a throw.
  it("does not throw for the 402 insufficient-credits contract", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        { status: "insufficient_credits", required: 6, balance: 1 },
        402,
      ),
    );
    const result = await generate("p1", "uma blusa");
    expect(result.status).toBe("insufficient_credits");
  });

  it("returns the parsed body on success", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([{ id: "p1" }]));
    await expect(listPatterns()).resolves.toEqual([{ id: "p1" }]);
  });
});
