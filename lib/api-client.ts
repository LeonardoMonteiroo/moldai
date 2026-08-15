import { EditorState } from "./types";

export type GenerateResult =
  | { status: "ok" | "conflict" | "error" | "declined"; state: EditorState }
  | { status: "insufficient_credits"; required: number; balance: number };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export async function fetchPattern(): Promise<EditorState> {
  const res = await fetch("/api/pattern");
  return (await res.json()) as EditorState;
}

export function generate(message: string): Promise<GenerateResult> {
  return postJson<GenerateResult>("/api/pattern/generate", { message });
}

export function resetPattern(): Promise<{ status: "ok"; state: EditorState }> {
  return postJson<{ status: "ok"; state: EditorState }>("/api/pattern/reset", {});
}

export function graduate(sizes: string[]): Promise<GenerateResult> {
  return postJson<GenerateResult>("/api/pattern/graduate", { sizes });
}

export function resolveConflict(action: "fix" | "ignore"): Promise<GenerateResult> {
  return postJson<GenerateResult>("/api/pattern/conflict/resolve", { action });
}

export function purchase(type: "topup" | "subscribe"): Promise<GenerateResult> {
  return postJson<GenerateResult>("/api/billing/purchase", { type });
}
