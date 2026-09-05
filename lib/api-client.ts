import {
  Credits,
  EditorState,
  GarmentType,
  GarmentSpec,
  SizeChartData,
  SizeChartListEntry,
  SizeChartRecord,
  LedgerHistoryEntry,
  SloperListItem,
} from "./types";
import type { Measurements } from "./measurements";
import type { SignupErrorCode } from "./account/signup";
import type { VerifyErrorCode, ResendErrorCode } from "./auth/verification";
import type {
  RequestResetErrorCode,
  ConfirmResetErrorCode,
} from "./auth/passwordReset";
import type { SharedErrorCode } from "./api/errors";
import type { PreparedAttachment } from "./editor/attachment";
import type { PaidPlanId } from "./billing/plans";
import type { ExportPreset } from "./export/preset";
import type { EngineId } from "./draft/engine/capability";

export type GenerateResult =
  | {
      status: "ok" | "conflict" | "error" | "declined" | "clarify" | "answered";
      state: EditorState;
    }
  | { status: "insufficient_credits"; required: number; balance: number };

// #161: under PAYMENT_PROVIDER=stripe, POST /api/billing/purchase never
// touches the wallet directly -- it answers {status:"redirect", url} (a
// hosted-checkout link) and crediting happens later, asynchronously, from
// POST /api/billing/webhook once Stripe confirms the payment. Every call
// site that reads PurchaseResult has to handle this third shape, not just
// the two mock-provider "ok" ones -- see lib/store.ts's purchase(),
// components/settings/UsageSection.tsx's buyTopup, and
// components/settings/PlanSection.tsx's subscribe.
export type PurchaseResult =
  | { status: "ok"; state: EditorState }
  | { status: "ok"; credits: Credits }
  | { status: "redirect"; url: string };

export type { SignupErrorCode };

export type SignupResult =
  { status: "ok" } | { status: "error"; error: SignupErrorCode };

export type { VerifyErrorCode, ResendErrorCode };

export type VerifyEmailResult =
  { status: "ok" } | { status: "error"; error: VerifyErrorCode };

export type ResendResult =
  { status: "ok" } | { status: "error"; error: ResendErrorCode };

export type { RequestResetErrorCode, ConfirmResetErrorCode };

export type RequestPasswordResetResult =
  { status: "ok" } | { status: "error"; error: RequestResetErrorCode };

export type ConfirmPasswordResetResult =
  { status: "ok" } | { status: "error"; error: ConfirmResetErrorCode };

export interface PatternListItem {
  id: string;
  name: string;
  garmentType: GarmentType | null;
  updatedAt: string;
  thumbnailSvg: string;
}

// #16: wire mirror of lib/db/patternVersion.ts's PatternVersionRecord --
// duplicated rather than imported, the PatternListItem precedent above (that
// one mirrors lib/db/pattern.ts's own PatternListItem the same way). Never
// carries drafted pieces: a version snapshot is the spec plus the frozen
// size snapshot, redrafted on demand client-side via draftGarment.
export type PatternVersionReason =
  "generate" | "adjust" | "graduate" | "conflict_fix" | "restore";

export interface PatternVersionEntry {
  id: string;
  version: number;
  spec: GarmentSpec;
  sizes: string[];
  baseSize: string;
  sizeTable: Record<string, Measurements>;
  sizeChartName: string | null;
  engine: string | null;
  reason: PatternVersionReason;
  cost: number;
  createdAt: string;
}

export interface RecentUsageEntry {
  reason: string | null;
  amount: number;
  createdAt: string;
}

export interface AccountSummary {
  credits: Credits;
  recentUsage: RecentUsageEntry[];
  checklist: {
    hasCustomSizeChart: boolean;
    hasExported: boolean;
    hasImported: boolean;
  };
}

export type AccountErrorCode =
  SharedErrorCode | "invalid_name" | "wrong_password" | "weak_password";

export interface AccountActionResult {
  status: "ok" | "error";
  error?: AccountErrorCode;
}

export type OnboardingErrorCode = SharedErrorCode | "invalid_work_style";

export type OnboardingResult =
  { status: "ok" } | { status: "error"; error: OnboardingErrorCode };

export interface UpdateProfileResult extends AccountActionResult {
  name?: string;
  email?: string;
}

/**
 * A request that failed in a way the caller was not expecting.
 *
 * Before this existed, none of the helpers below checked `res.ok`, so an error
 * body was handed back typed as the success shape: a 401 became an
 * "EditorState" with no pattern, the editor store wrote that into itself, and
 * the screen sat on its loading spinner forever with nothing logged. Throwing
 * makes the failure impossible to mistake for data.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
    this.name = "ApiError";
  }
}

/** ApiError carries the wire code; anything else (offline, parse) is generic. */
export function errorCode(err: unknown): string {
  return err instanceof ApiError ? err.code : "request_failed";
}

/**
 * `handled` lists the HTTP statuses whose *body* is part of the endpoint's
 * contract — a 402 the paywall reads, or a 400 carrying a domain code the
 * caller resolves through the catalog. Those come back as data. Every other
 * non-2xx throws ApiError. Enumerating them is deliberate: it keeps each
 * endpoint's failure contract visible at the call site.
 */
async function request<T>(
  url: string,
  init?: RequestInit,
  handled: number[] = [],
): Promise<T> {
  const res = await fetch(url, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // A 500 can answer with an HTML error page, and 204 with nothing at all.
  }
  if (!res.ok && !handled.includes(res.status)) {
    const code =
      typeof body === "object" &&
      body !== null &&
      typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "request_failed";
    throw new ApiError(res.status, code);
  }
  return body as T;
}

function getJson<T>(url: string, handled: number[] = []): Promise<T> {
  return request<T>(url, undefined, handled);
}

function postJson<T>(
  url: string,
  body?: unknown,
  handled: number[] = [],
): Promise<T> {
  return request<T>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    },
    handled,
  );
}

function sendJson<T>(
  url: string,
  method: "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  handled: number[] = [],
): Promise<T> {
  return request<T>(
    url,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    handled,
  );
}

/** Statuses whose body carries a domain code the calling screen renders. */
const DOMAIN_ERRORS = [400, 401, 404, 409, 429, 503];
/** generate/graduate answer 402 with the paywall's required/balance numbers. */
const PAYWALL = [402];

export function listPatterns(): Promise<PatternListItem[]> {
  return getJson<PatternListItem[]>("/api/patterns");
}

export function createPattern(opts?: {
  sloperId?: string;
  name?: string;
}): Promise<{ id: string }> {
  // JSON.stringify drops an undefined value, so the blank case still posts {}.
  return postJson<{ id: string }>("/api/patterns", {
    sloperId: opts?.sloperId,
    name: opts?.name,
  });
}

export function fetchPattern(patternId: string): Promise<EditorState> {
  return getJson<EditorState>(`/api/patterns/${patternId}`);
}

export async function renamePattern(
  patternId: string,
  name: string,
): Promise<void> {
  await sendJson(`/api/patterns/${patternId}`, "PATCH", { name });
}

export async function deletePattern(patternId: string): Promise<void> {
  await sendJson(`/api/patterns/${patternId}`, "DELETE");
}

export function listVersions(
  patternId: string,
): Promise<PatternVersionEntry[]> {
  return getJson<PatternVersionEntry[]>(`/api/patterns/${patternId}/versions`);
}

// Free -- restoring never carries a paywall, so no `handled` list is needed
// (unlike generate/graduate's PAYWALL).
export function restoreVersion(
  patternId: string,
  versionId: string,
): Promise<GenerateResult> {
  return postJson<GenerateResult>(
    `/api/patterns/${patternId}/versions/${versionId}/restore`,
  );
}

/**
 * Everything a generation request carries beyond the message. An options
 * object rather than five positional parameters: `formSpec` and `sizeChartId`
 * would have made this the fifth and sixth boolean-or-string in a row, which
 * is the same reasoning lib/ai's ProposeOptions records for its own call.
 */
export interface GenerateOptions {
  /** Answers a clarify card -- server-side this forces apply over another ask. */
  answering?: boolean;
  /** Prepared client-side; the bytes travel with this request only. */
  images?: PreparedAttachment[];
  /** The creation form's own explicit choices, re-applied over the model's spec. */
  formSpec?: GarmentSpec;
  /** The chart this molde is drafted from, chosen per molde. */
  sizeChartId?: string;
  /** Client-computed metadata from a DXF import reconstruction (#238). */
  importContext?: string;
  /**
   * #269 Fase 5: the new-pattern form's own engine choice, honored only on
   * this pattern's first-ever draft (the route silently ignores it once
   * `Pattern.engine` is already frozen) -- an `EngineId`, not a plain
   * `string`, since the form itself is the only caller and always sends a
   * value from its own fixed engine Select.
   */
  engine?: EngineId;
}

export function generate(
  patternId: string,
  message: string,
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  return postJson<GenerateResult>(
    `/api/patterns/${patternId}/generate`,
    {
      message,
      // Every optional field below is simply left undefined when unset, and
      // JSON.stringify drops an undefined value -- so an absent option means
      // an absent body key rather than an explicit null the route would then
      // have to tolerate.
      answering: opts?.answering,
      // #18: the wire field is `data`, matching Anthropic's own
      // Base64ImageSource -- PreparedAttachment's `base64` is a client-local
      // name. An EMPTY list is treated as "no attachment" and omits the key
      // entirely: the route refuses `images: []` outright (a caller that
      // meant to attach something and sent nothing), so producing it here
      // would turn a photo-less form submit into a 400.
      images: opts?.images?.length
        ? opts.images.map((image) => ({
            mediaType: image.mediaType,
            data: image.base64,
          }))
        : undefined,
      formSpec: opts?.formSpec,
      sizeChartId: opts?.sizeChartId,
      importContext: opts?.importContext,
      engine: opts?.engine,
    },
    PAYWALL,
  );
}

export function graduate(
  patternId: string,
  sizes: string[],
): Promise<GenerateResult> {
  return postJson<GenerateResult>(
    `/api/patterns/${patternId}/graduate`,
    { sizes },
    PAYWALL,
  );
}

export function resolveConflict(
  patternId: string,
  action: "fix" | "ignore",
): Promise<GenerateResult> {
  return postJson<GenerateResult>(
    `/api/patterns/${patternId}/conflict/resolve`,
    { action },
    PAYWALL,
  );
}

export function purchase(
  type: "topup" | "subscribe",
  plan?: PaidPlanId,
  patternId?: string,
  interval?: "month" | "year",
): Promise<PurchaseResult> {
  // #9: no `handled` array -- a 400 (invalid_plan, plan_not_upgradable)
  // must keep throwing ApiError so PlanSection can read err.code and
  // resolve it through the catalog, the same reasoning PAYWALL/
  // DOMAIN_ERRORS documents for every other opted-in status. JSON.stringify
  // drops `plan` entirely for a topup (undefined), the same trick already
  // used for `patternId`.
  return postJson<PurchaseResult>("/api/billing/purchase", {
    type,
    plan,
    patternId,
    // Defaults to monthly when omitted -- every pre-existing call site
    // (PaywallModal, the editor store's retry thunk) subscribes monthly
    // only and never passes this.
    interval: type === "subscribe" ? (interval ?? "month") : undefined,
  });
}

export function getAccountSummary(): Promise<AccountSummary> {
  return getJson<AccountSummary>("/api/account/summary");
}

// #232: best-effort ping backing the dashboard onboarding checklist's
// export/import steps -- callers (lib/export/index.ts, lib/importStore.ts)
// swallow a rejection themselves; this function does not do it for them,
// so a call site that forgets to .catch() fails loudly in its own tests.
export function recordChecklistEvent(
  event: "exported" | "imported",
): Promise<void> {
  return postJson<void>("/api/account/checklist-progress", { event });
}

export function getLedgerHistory(): Promise<{ ledger: LedgerHistoryEntry[] }> {
  return getJson<{ ledger: LedgerHistoryEntry[] }>("/api/account/ledger");
}

// #17: the export screen's "Salvar preset" -- account-level, not
// pattern-scoped, matching where the export screen's own state lives
// (lib/export/preset.ts's ExportPreset has no patternId). `preset: null`
// means the account has never saved one.
export function getExportPreset(): Promise<{ preset: ExportPreset | null }> {
  return getJson<{ preset: ExportPreset | null }>("/api/account/export-preset");
}

export function saveExportPreset(
  preset: ExportPreset,
): Promise<{ preset: ExportPreset }> {
  return sendJson<{ preset: ExportPreset }>(
    "/api/account/export-preset",
    "PUT",
    preset,
  );
}

export function updateProfile(name: string): Promise<UpdateProfileResult> {
  return sendJson<UpdateProfileResult>(
    "/api/account/profile",
    "PATCH",
    { name },
    DOMAIN_ERRORS,
  );
}

export function changePassword(
  currentPassword: string | undefined,
  newPassword: string,
): Promise<AccountActionResult> {
  return postJson<AccountActionResult>(
    "/api/account/password",
    { currentPassword, newPassword },
    DOMAIN_ERRORS,
  );
}

export function deleteAccount(
  password: string | undefined,
): Promise<AccountActionResult> {
  return sendJson<AccountActionResult>(
    "/api/account",
    "DELETE",
    { password },
    DOMAIN_ERRORS,
  );
}

/** #14: stamps the post-signup onboarding wizard as seen -- "Pular por
 * agora" calls this with no argument, step 3's successful submit passes the
 * chosen work style. */
export function completeOnboarding(
  workStyle?: string,
): Promise<OnboardingResult> {
  return postJson<OnboardingResult>(
    "/api/account/onboarding",
    { workStyle },
    DOMAIN_ERRORS,
  );
}

export function signUp(
  name: string,
  email: string,
  password: string,
): Promise<SignupResult> {
  return postJson<SignupResult>(
    "/api/signup",
    { name, email, password },
    DOMAIN_ERRORS,
  );
}

export function verifyEmail(token: string): Promise<VerifyEmailResult> {
  return postJson<VerifyEmailResult>(
    "/api/verify-email",
    { token },
    DOMAIN_ERRORS,
  );
}

export function resendVerification(
  email: string,
  password: string,
): Promise<ResendResult> {
  return postJson<ResendResult>(
    "/api/verify-email/resend",
    { email, password },
    DOMAIN_ERRORS,
  );
}

export function requestPasswordReset(
  email: string,
): Promise<RequestPasswordResetResult> {
  return postJson<RequestPasswordResetResult>(
    "/api/password-reset/request",
    { email },
    DOMAIN_ERRORS,
  );
}

export function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<ConfirmPasswordResetResult> {
  return postJson<ConfirmPasswordResetResult>(
    "/api/password-reset/confirm",
    { token, newPassword },
    DOMAIN_ERRORS,
  );
}

export function listSizeCharts(): Promise<SizeChartListEntry[]> {
  return getJson<SizeChartListEntry[]>("/api/size-charts");
}

export function createSizeChart(sourceId?: string): Promise<SizeChartRecord> {
  return postJson<SizeChartRecord>("/api/size-charts", { sourceId });
}

export function updateSizeChart(
  sizeChartId: string,
  patch: Partial<SizeChartData>,
): Promise<SizeChartRecord> {
  return sendJson<SizeChartRecord>(
    `/api/size-charts/${sizeChartId}`,
    "PATCH",
    patch,
  );
}

export async function deleteSizeChart(sizeChartId: string): Promise<void> {
  await sendJson(`/api/size-charts/${sizeChartId}`, "DELETE");
}

export function duplicateSizeChart(
  sizeChartId: string,
): Promise<SizeChartRecord> {
  return postJson<SizeChartRecord>(`/api/size-charts/${sizeChartId}/duplicate`);
}

// #12: the parsed-and-reviewed candidate from ImportSizeChartDialog. The
// server re-validates it through validateSizeChartPatch before persisting --
// this call carries no more trust than sourceId-based creation does.
export function importSizeChart(
  chart: SizeChartData,
): Promise<SizeChartRecord> {
  return postJson<SizeChartRecord>("/api/size-charts", { chart });
}

export async function activateSizeChart(sizeChartId: string): Promise<void> {
  await postJson(`/api/size-charts/${sizeChartId}/activate`);
}

export function listSlopers(): Promise<SloperListItem[]> {
  return getJson<SloperListItem[]>("/api/slopers");
}

export function createSloper(
  patternId: string,
  name: string,
): Promise<SloperListItem> {
  return postJson<SloperListItem>("/api/slopers", { patternId, name });
}

export async function renameSloper(
  sloperId: string,
  name: string,
): Promise<void> {
  await sendJson(`/api/slopers/${sloperId}`, "PATCH", { name });
}

export async function deleteSloper(sloperId: string): Promise<void> {
  await sendJson(`/api/slopers/${sloperId}`, "DELETE");
}
