import {
  Credits,
  EditorState,
  GarmentType,
  SizeChartData,
  SizeChartListEntry,
  SizeChartRecord,
  LedgerHistoryEntry,
} from "./types";
import type { SignupErrorCode } from "./account/signup";
import type { VerifyErrorCode, ResendErrorCode } from "./auth/verification";
import type { SharedErrorCode } from "./api/errors";

export type GenerateResult =
  | {
      status: "ok" | "conflict" | "error" | "declined" | "clarify";
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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export function listPatterns(): Promise<PatternListItem[]> {
  return getJson<PatternListItem[]>("/api/patterns");
}

export async function createPattern(): Promise<{ id: string }> {
  const res = await fetch("/api/patterns", { method: "POST" });
  return (await res.json()) as { id: string };
}

export function fetchPattern(patternId: string): Promise<EditorState> {
  return getJson<EditorState>(`/api/patterns/${patternId}`);
}

export async function renamePattern(
  patternId: string,
  name: string,
): Promise<void> {
  await fetch(`/api/patterns/${patternId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deletePattern(patternId: string): Promise<void> {
  await fetch(`/api/patterns/${patternId}`, { method: "DELETE" });
}

export function generate(
  patternId: string,
  message: string,
  answering?: boolean,
): Promise<GenerateResult> {
  return postJson<GenerateResult>(`/api/patterns/${patternId}/generate`, {
    message,
    answering,
  });
}

export function graduate(
  patternId: string,
  sizes: string[],
): Promise<GenerateResult> {
  return postJson<GenerateResult>(`/api/patterns/${patternId}/graduate`, {
    sizes,
  });
}

export function resolveConflict(
  patternId: string,
  action: "fix" | "ignore",
): Promise<GenerateResult> {
  return postJson<GenerateResult>(
    `/api/patterns/${patternId}/conflict/resolve`,
    {
      action,
    },
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

export async function updateProfile(
  name: string,
): Promise<UpdateProfileResult> {
  const res = await fetch("/api/account/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as UpdateProfileResult;
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AccountActionResult> {
  return postJson<AccountActionResult>("/api/account/password", {
    currentPassword,
    newPassword,
  });
}

export async function deleteAccount(
  password: string,
): Promise<AccountActionResult> {
  const res = await fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return (await res.json()) as AccountActionResult;
}

export function signUp(
  name: string,
  email: string,
  password: string,
): Promise<SignupResult> {
  return postJson<SignupResult>("/api/signup", { name, email, password });
}

export function verifyEmail(token: string): Promise<VerifyEmailResult> {
  return postJson<VerifyEmailResult>("/api/verify-email", { token });
}

export function resendVerification(
  email: string,
  password: string,
): Promise<ResendResult> {
  return postJson<ResendResult>("/api/verify-email/resend", {
    email,
    password,
  });
}

export function listSizeCharts(): Promise<SizeChartListEntry[]> {
  return getJson<SizeChartListEntry[]>("/api/size-charts");
}

export async function createSizeChart(
  sourceId?: string,
): Promise<SizeChartRecord> {
  const res = await fetch("/api/size-charts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId }),
  });
  return (await res.json()) as SizeChartRecord;
}

export async function updateSizeChart(
  sizeChartId: string,
  patch: Partial<SizeChartData>,
): Promise<SizeChartRecord> {
  const res = await fetch(`/api/size-charts/${sizeChartId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return (await res.json()) as SizeChartRecord;
}

export async function deleteSizeChart(sizeChartId: string): Promise<void> {
  await fetch(`/api/size-charts/${sizeChartId}`, { method: "DELETE" });
}

export async function duplicateSizeChart(
  sizeChartId: string,
): Promise<SizeChartRecord> {
  const res = await fetch(`/api/size-charts/${sizeChartId}/duplicate`, {
    method: "POST",
  });
  return (await res.json()) as SizeChartRecord;
}

export async function activateSizeChart(sizeChartId: string): Promise<void> {
  await fetch(`/api/size-charts/${sizeChartId}/activate`, { method: "POST" });
}
