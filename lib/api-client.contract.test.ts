import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as apiClient from "./api-client";
import {
  ApiError,
  activateSizeChart,
  changePassword,
  completeOnboarding,
  confirmPasswordReset,
  createPattern,
  createSizeChart,
  createSloper,
  deleteAccount,
  deletePattern,
  deleteSizeChart,
  deleteSloper,
  duplicateSizeChart,
  fetchPattern,
  generate,
  getAccountSummary,
  getExportPreset,
  getLedgerHistory,
  graduate,
  importSizeChart,
  listPatterns,
  listSizeCharts,
  listSlopers,
  listVersions,
  purchase,
  renamePattern,
  renameSloper,
  requestPasswordReset,
  resendVerification,
  resolveConflict,
  restoreVersion,
  saveExportPreset,
  signUp,
  updateProfile,
  updateSizeChart,
  verifyEmail,
} from "./api-client";
import { DEFAULT_EXPORT_PRESET } from "./export/preset";
import type { SizeChartData } from "./types";

/**
 * #168: the request shape and the declared failure contract of every
 * exported call, driven from one table.
 *
 * `lib/api-client.test.ts` covers request()'s own error handling; this file
 * covers the ~36 thin wrappers around it. They are thin by design, which is
 * exactly why they need a mechanical check: the whole surface is URL, method
 * and body-key spelling, and a mistake in any of the three fails silently at
 * runtime -- a renamed route reads to the caller as "not found", a
 * mis-spelled body key reads to the route as an absent field. The second
 * half of the file pins which HTTP statuses each call returns as DATA and
 * which it throws on (`handled`), because getting that backwards is silent
 * in both directions: a swallowed error becomes a success-shaped body the
 * store writes into itself, and an opted-out status becomes an unhandled
 * rejection where the screen expected a domain code to render.
 */

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Sent {
  url: string;
  method: string;
  body: unknown;
  hasBody: boolean;
  contentType: string | null;
}

function lastRequest(): Sent {
  const call = vi.mocked(fetch).mock.calls.at(-1) as
    [string, RequestInit | undefined] | undefined;
  if (!call) throw new Error("no fetch call was made");
  const [url, init] = call;
  const headers = init?.headers as Record<string, string> | undefined;
  return {
    url,
    method: init?.method ?? "GET",
    body:
      init?.body === undefined ? undefined : JSON.parse(init.body as string),
    hasBody: init?.body !== undefined,
    contentType: headers?.["Content-Type"] ?? null,
  };
}

interface ShapeCase {
  /** The exported function's name, optionally with a " (variant)" suffix. */
  name: string;
  call: () => Promise<unknown>;
  url: string;
  method?: string;
  /** Omitting the key entirely means the request must carry no body at all. */
  body?: unknown;
}

const SHAPE_CASES: ShapeCase[] = [
  { name: "listPatterns", call: () => listPatterns(), url: "/api/patterns" },
  {
    name: "createPattern (blank)",
    call: () => createPattern(),
    url: "/api/patterns",
    method: "POST",
    // JSON.stringify drops the undefined sloperId, so a blank create still
    // posts an object -- an absent body would fail the route's own
    // readJsonObject guard rather than reading as "no sloperId".
    body: {},
  },
  {
    name: "createPattern (from a sloper)",
    call: () => createPattern("sl1"),
    url: "/api/patterns",
    method: "POST",
    body: { sloperId: "sl1" },
  },
  {
    name: "fetchPattern",
    call: () => fetchPattern("p1"),
    url: "/api/patterns/p1",
  },
  {
    name: "renamePattern",
    call: () => renamePattern("p1", "Blusa"),
    url: "/api/patterns/p1",
    method: "PATCH",
    body: { name: "Blusa" },
  },
  {
    name: "deletePattern",
    call: () => deletePattern("p1"),
    url: "/api/patterns/p1",
    method: "DELETE",
    // No body key: sendJson passes an undefined body straight through.
  },
  {
    name: "listVersions",
    call: () => listVersions("p1"),
    url: "/api/patterns/p1/versions",
  },
  {
    name: "restoreVersion",
    call: () => restoreVersion("p1", "v3"),
    url: "/api/patterns/p1/versions/v3/restore",
    method: "POST",
    body: {},
  },
  {
    name: "generate (text only)",
    call: () => generate("p1", "uma blusa"),
    url: "/api/patterns/p1/generate",
    method: "POST",
    body: { message: "uma blusa" },
  },
  {
    name: "generate (answering a clarify card)",
    call: () => generate("p1", "manga curta", true),
    url: "/api/patterns/p1/generate",
    method: "POST",
    body: { message: "manga curta", answering: true },
  },
  {
    name: "graduate",
    call: () => graduate("p1", ["P", "M"]),
    url: "/api/patterns/p1/graduate",
    method: "POST",
    body: { sizes: ["P", "M"] },
  },
  {
    name: "resolveConflict",
    call: () => resolveConflict("p1", "fix"),
    url: "/api/patterns/p1/conflict/resolve",
    method: "POST",
    body: { action: "fix" },
  },
  {
    name: "purchase (topup)",
    call: () => purchase("topup"),
    url: "/api/billing/purchase",
    method: "POST",
    // `plan`/`patternId` are dropped rather than sent as null: the route's
    // own resolvePurchase rejects a present-but-unusable plan outright.
    body: { type: "topup" },
  },
  {
    name: "purchase (subscribe, from the editor's paywall)",
    call: () => purchase("subscribe", "studio", "p1"),
    url: "/api/billing/purchase",
    method: "POST",
    body: { type: "subscribe", plan: "studio", patternId: "p1" },
  },
  {
    name: "getAccountSummary",
    call: () => getAccountSummary(),
    url: "/api/account/summary",
  },
  {
    name: "getLedgerHistory",
    call: () => getLedgerHistory(),
    url: "/api/account/ledger",
  },
  {
    name: "getExportPreset",
    call: () => getExportPreset(),
    url: "/api/account/export-preset",
  },
  {
    name: "saveExportPreset",
    call: () => saveExportPreset(DEFAULT_EXPORT_PRESET),
    url: "/api/account/export-preset",
    method: "PUT",
    body: DEFAULT_EXPORT_PRESET,
  },
  {
    name: "updateProfile",
    call: () => updateProfile("Ana"),
    url: "/api/account/profile",
    method: "PATCH",
    body: { name: "Ana" },
  },
  {
    name: "changePassword",
    call: () => changePassword("old-secret", "new-secret"),
    url: "/api/account/password",
    method: "POST",
    body: { currentPassword: "old-secret", newPassword: "new-secret" },
  },
  {
    name: "deleteAccount",
    call: () => deleteAccount("secret"),
    url: "/api/account",
    method: "DELETE",
    body: { password: "secret" },
  },
  {
    name: "completeOnboarding (skipped)",
    call: () => completeOnboarding(),
    url: "/api/account/onboarding",
    method: "POST",
    body: {},
  },
  {
    name: "completeOnboarding (with a work style)",
    call: () => completeOnboarding("atelier"),
    url: "/api/account/onboarding",
    method: "POST",
    body: { workStyle: "atelier" },
  },
  {
    name: "signUp",
    call: () => signUp("Ana", "ana@example.com", "secret-123"),
    url: "/api/signup",
    method: "POST",
    body: { name: "Ana", email: "ana@example.com", password: "secret-123" },
  },
  {
    name: "verifyEmail",
    call: () => verifyEmail("tok"),
    url: "/api/verify-email",
    method: "POST",
    body: { token: "tok" },
  },
  {
    name: "resendVerification",
    call: () => resendVerification("ana@example.com", "secret-123"),
    url: "/api/verify-email/resend",
    method: "POST",
    body: { email: "ana@example.com", password: "secret-123" },
  },
  {
    name: "requestPasswordReset",
    call: () => requestPasswordReset("ana@example.com"),
    url: "/api/password-reset/request",
    method: "POST",
    body: { email: "ana@example.com" },
  },
  {
    name: "confirmPasswordReset",
    call: () => confirmPasswordReset("tok", "new-secret"),
    url: "/api/password-reset/confirm",
    method: "POST",
    body: { token: "tok", newPassword: "new-secret" },
  },
  {
    name: "listSizeCharts",
    call: () => listSizeCharts(),
    url: "/api/size-charts",
  },
  {
    name: "createSizeChart (blank)",
    call: () => createSizeChart(),
    url: "/api/size-charts",
    method: "POST",
    body: {},
  },
  {
    name: "createSizeChart (duplicating a source)",
    call: () => createSizeChart("sc1"),
    url: "/api/size-charts",
    method: "POST",
    body: { sourceId: "sc1" },
  },
  {
    name: "updateSizeChart",
    call: () => updateSizeChart("sc1", { name: "Feminino" }),
    url: "/api/size-charts/sc1",
    method: "PATCH",
    body: { name: "Feminino" },
  },
  {
    name: "deleteSizeChart",
    call: () => deleteSizeChart("sc1"),
    url: "/api/size-charts/sc1",
    method: "DELETE",
  },
  {
    name: "duplicateSizeChart",
    call: () => duplicateSizeChart("sc1"),
    url: "/api/size-charts/sc1/duplicate",
    method: "POST",
    body: {},
  },
  {
    name: "importSizeChart",
    // #12: wrapped under a `chart` key -- it shares POST /api/size-charts
    // with createSizeChart, which reads `sourceId` off the same body.
    call: () => importSizeChart({ name: "Importada" } as SizeChartData),
    url: "/api/size-charts",
    method: "POST",
    body: { chart: { name: "Importada" } },
  },
  {
    name: "activateSizeChart",
    call: () => activateSizeChart("sc1"),
    url: "/api/size-charts/sc1/activate",
    method: "POST",
    body: {},
  },
  { name: "listSlopers", call: () => listSlopers(), url: "/api/slopers" },
  {
    name: "createSloper",
    call: () => createSloper("p1", "Base blusa"),
    url: "/api/slopers",
    method: "POST",
    body: { patternId: "p1", name: "Base blusa" },
  },
  {
    name: "renameSloper",
    call: () => renameSloper("sl1", "Base 2"),
    url: "/api/slopers/sl1",
    method: "PATCH",
    body: { name: "Base 2" },
  },
  {
    name: "deleteSloper",
    call: () => deleteSloper("sl1"),
    url: "/api/slopers/sl1",
    method: "DELETE",
  },
];

describe("api-client request shapes", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: "ok" }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(SHAPE_CASES)("$name hits its own route", async (c) => {
    await c.call();
    const sent = lastRequest();
    expect(sent.url).toBe(c.url);
    expect(sent.method).toBe(c.method ?? "GET");
    if ("body" in c) {
      expect(sent.hasBody).toBe(true);
      expect(sent.body).toEqual(c.body);
      // Every write declares JSON, or the route's own request.json()
      // rejects and readJsonObject answers a bare bad_body.
      expect(sent.contentType).toBe("application/json");
    } else {
      // A GET must never carry a body -- fetch rejects outright with one --
      // and DELETE-without-a-body must not declare a Content-Type it isn't
      // sending, which sendJson gets right only by passing `undefined`
      // through rather than stringifying it into "undefined".
      expect(sent.hasBody).toBe(false);
    }
  });

  // The table is only as good as its coverage of the module, so the module
  // itself is the source of truth for what has to be in it.
  it("exercises every exported request helper", () => {
    const exercised = new Set(
      SHAPE_CASES.map((c) => c.name.replace(/ \(.*$/, "")),
    );
    const missing = Object.entries(apiClient)
      .filter(
        ([name, value]) =>
          typeof value === "function" &&
          // Neither issues a request: errorCode is a pure mapper and
          // ApiError is the thrown class itself.
          name !== "errorCode" &&
          name !== "ApiError" &&
          !exercised.has(name),
      )
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });
});

describe("api-client failure contracts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  // DOMAIN_ERRORS = [400, 401, 404, 409, 429, 503]: the calling screen
  // resolves the body's `error` through its own catalog namespace, so these
  // statuses must come back as data.
  const DOMAIN_CALLS: [string, () => Promise<unknown>][] = [
    ["signUp", () => signUp("Ana", "a@b.co", "secret-123")],
    ["verifyEmail", () => verifyEmail("tok")],
    ["resendVerification", () => resendVerification("a@b.co", "secret-123")],
    ["requestPasswordReset", () => requestPasswordReset("a@b.co")],
    ["confirmPasswordReset", () => confirmPasswordReset("tok", "secret-123")],
    ["updateProfile", () => updateProfile("Ana")],
    ["changePassword", () => changePassword("old", "new-secret")],
    ["deleteAccount", () => deleteAccount("secret")],
    ["completeOnboarding", () => completeOnboarding()],
  ];

  it.each(DOMAIN_CALLS)(
    "%s hands a 400 domain code back as data",
    async (_name, call) => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ status: "error", error: "rate_limited" }, 400),
      );
      await expect(call()).resolves.toMatchObject({ error: "rate_limited" });
    },
  );

  it.each(DOMAIN_CALLS)(
    "%s still throws on a 500, which carries no domain code",
    async (_name, call) => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ status: "error", error: "server_error" }, 500),
      );
      await expect(call()).rejects.toBeInstanceOf(ApiError);
    },
  );

  // #9: purchase deliberately opts into NOTHING, so PlanSection reads
  // err.code off the thrown ApiError and resolves plan_not_upgradable /
  // invalid_plan through its own catalog.
  it("purchase throws on a 400 rather than returning the code as data", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ status: "error", error: "plan_not_upgradable" }, 400),
    );
    const err = await purchase("subscribe", "atelier").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("plan_not_upgradable");
  });

  // PAYWALL = [402], opted into by exactly the routes that can charge.
  const PAYWALL_CALLS: [string, () => Promise<unknown>][] = [
    ["generate", () => generate("p1", "uma blusa")],
    ["graduate", () => graduate("p1", ["P"])],
    ["resolveConflict", () => resolveConflict("p1", "fix")],
  ];

  it.each(PAYWALL_CALLS)(
    "%s hands the 402 paywall body back as data",
    async (_name, call) => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          { status: "insufficient_credits", required: 6, balance: 1 },
          402,
        ),
      );
      await expect(call()).resolves.toMatchObject({ required: 6, balance: 1 });
    },
  );

  it.each(PAYWALL_CALLS)(
    "%s does not also swallow a 404 for a pattern that is gone",
    async (_name, call) => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ status: "not_found", error: "pattern_not_found" }, 404),
      );
      await expect(call()).rejects.toBeInstanceOf(ApiError);
    },
  );

  // The void helpers are where a swallowed failure is least visible: they
  // return nothing, so "it resolved" is the only signal the caller has.
  it.each([
    ["renamePattern", () => renamePattern("gone", "x")],
    ["deletePattern", () => deletePattern("gone")],
    ["fetchPattern", () => fetchPattern("gone")],
    ["listVersions", () => listVersions("gone")],
    ["restoreVersion", () => restoreVersion("gone", "v1")],
    ["deleteSizeChart", () => deleteSizeChart("gone")],
    ["activateSizeChart", () => activateSizeChart("gone")],
    ["duplicateSizeChart", () => duplicateSizeChart("gone")],
    ["renameSloper", () => renameSloper("gone", "x")],
    ["deleteSloper", () => deleteSloper("gone")],
    ["createSloper", () => createSloper("gone", "Base")],
  ] as [string, () => Promise<unknown>][])(
    "%s throws ApiError carrying the 404's own wire code",
    async (_name, call) => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ status: "not_found", error: "pattern_not_found" }, 404),
      );
      const err = await call().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
      expect((err as ApiError).code).toBe("pattern_not_found");
    },
  );

  // The code fallback: an error body carrying no usable `error` string must
  // not produce `code: undefined`, which every catch block feeds to
  // t("errors." + code) and which would render as a literal key path.
  it.each([
    ["a body with no error key", () => jsonResponse({ status: "error" }, 400)],
    ["a non-string error value", () => jsonResponse({ error: 42 }, 400)],
    ["a JSON array body", () => jsonResponse([1, 2], 400)],
    ["a bare JSON null body", () => jsonResponse(null, 400)],
  ] as [string, () => Response][])(
    "falls back to request_failed for %s",
    async (_name, res) => {
      vi.mocked(fetch).mockResolvedValue(res());
      const err = await fetchPattern("p1").catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.code).toBe("request_failed");
    },
  );

  // A 204 answers with an empty body, so res.json() rejects on a SUCCESS.
  // request() has to tolerate that instead of turning a fine response into a
  // throw -- every void helper rides on it.
  it("resolves a 204 with no body instead of throwing", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deletePattern("p1")).resolves.toBeUndefined();
    await expect(activateSizeChart("sc1")).resolves.toBeUndefined();
    await expect(renameSloper("sl1", "Base")).resolves.toBeUndefined();
  });
});
