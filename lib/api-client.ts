import { Credits, EditorState, GarmentType } from "./types";

export type GenerateResult =
  | {
      status: "ok" | "conflict" | "error" | "declined" | "clarify";
      state: EditorState;
    }
  | { status: "insufficient_credits"; required: number; balance: number };

export type PurchaseResult =
  { status: "ok"; state: EditorState } | { status: "ok"; credits: Credits };

export interface MoldeListItem {
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

export function listMoldes(): Promise<MoldeListItem[]> {
  return getJson<MoldeListItem[]>("/api/moldes");
}

export async function createMolde(): Promise<{ id: string }> {
  const res = await fetch("/api/moldes", { method: "POST" });
  return (await res.json()) as { id: string };
}

export function fetchMolde(moldeId: string): Promise<EditorState> {
  return getJson<EditorState>(`/api/moldes/${moldeId}`);
}

export async function renameMolde(
  moldeId: string,
  name: string,
): Promise<void> {
  await fetch(`/api/moldes/${moldeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteMolde(moldeId: string): Promise<void> {
  await fetch(`/api/moldes/${moldeId}`, { method: "DELETE" });
}

export function generate(
  moldeId: string,
  message: string,
  answering?: boolean,
): Promise<GenerateResult> {
  return postJson<GenerateResult>(`/api/moldes/${moldeId}/generate`, {
    message,
    answering,
  });
}

export function graduate(
  moldeId: string,
  sizes: string[],
): Promise<GenerateResult> {
  return postJson<GenerateResult>(`/api/moldes/${moldeId}/graduate`, {
    sizes,
  });
}

export function resolveConflict(
  moldeId: string,
  action: "fix" | "ignore",
): Promise<GenerateResult> {
  return postJson<GenerateResult>(`/api/moldes/${moldeId}/conflict/resolve`, {
    action,
  });
}

export function purchase(
  type: "topup" | "subscribe",
  moldeId?: string,
): Promise<PurchaseResult> {
  return postJson<PurchaseResult>("/api/billing/purchase", { type, moldeId });
}

export function getAccountSummary(): Promise<AccountSummary> {
  return getJson<AccountSummary>("/api/account/summary");
}
