import {
  Credits,
  EditorState,
  GarmentType,
  SizeChartData,
  SizeChartListEntry,
  SizeChartRecord,
  LedgerHistoryEntry,
  SloperListItem,
} from "./types";
import type { SignupErrorCode } from "./account/signup";
import type { VerifyErrorCode, ResendErrorCode } from "./auth/verification";
import type {
  RequestResetErrorCode,
  ConfirmResetErrorCode,
} from "./auth/passwordReset";
import type { SharedErrorCode } from "./api/errors";
import type { PreparedAttachment } from "./editor/attachment";

export type GenerateResult =
  | {
      status: "ok" | "conflict" | "error" | "declined" | "clarify" | "answered";
      state: EditorState;
    }
  | { status: "insufficient_credits"; required: number; balance: number };

export type PurchaseResult =
  { status: "ok"; state: EditorState } | { status: "ok"; credits: Credits };

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

export interface RecentUsageEntry {
  reason: string | null;
  amount: number;
  createdAt: string;
}

export interface AccountSummary {
  credits: Credits;
  recentUsage: RecentUsageEntry[];
}

export type AccountErrorCode =
  SharedErrorCode | "invalid_name" | "wrong_password" | "weak_password";

export interface AccountActionResult {
  status: "ok" | "error";
  error?: AccountErrorCode;
}

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
  method: "PATCH" | "DELETE",
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

export function createPattern(sloperId?: string): Promise<{ id: string }> {
  // JSON.stringify drops an undefined value, so the blank case still posts {}.
  return postJson<{ id: string }>("/api/patterns", { sloperId });
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

export function generate(
  patternId: string,
  message: string,
  answering?: boolean,
  image?: PreparedAttachment,
): Promise<GenerateResult> {
  return postJson<GenerateResult>(
    `/api/patterns/${patternId}/generate`,
    {
      message,
      answering,
      // #18: the wire field is `data`, matching Anthropic's own
      // Base64ImageSource -- PreparedAttachment's `base64` is a client-local
      // name (JSON.stringify drops the key entirely when image is absent).
      image: image
        ? { mediaType: image.mediaType, data: image.base64 }
        : undefined,
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
  patternId?: string,
): Promise<PurchaseResult> {
  return postJson<PurchaseResult>("/api/billing/purchase", { type, patternId });
}

export function getAccountSummary(): Promise<AccountSummary> {
  return getJson<AccountSummary>("/api/account/summary");
}

export function getLedgerHistory(): Promise<{ ledger: LedgerHistoryEntry[] }> {
  return getJson<{ ledger: LedgerHistoryEntry[] }>("/api/account/ledger");
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
  currentPassword: string,
  newPassword: string,
): Promise<AccountActionResult> {
  return postJson<AccountActionResult>(
    "/api/account/password",
    { currentPassword, newPassword },
    DOMAIN_ERRORS,
  );
}

export function deleteAccount(password: string): Promise<AccountActionResult> {
  return sendJson<AccountActionResult>(
    "/api/account",
    "DELETE",
    { password },
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
