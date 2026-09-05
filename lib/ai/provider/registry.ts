import type { LlmProvider } from "./types";
import { anthropicProvider } from "./anthropic";
import { openaiCompatProvider } from "./openaiCompat";

// Mirrors lib/draft/engine/registry.ts: a flat map, one lookup function.
export const PROVIDER_IDS = ["anthropic", "local"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const DEFAULT_PROVIDER_ID: ProviderId = "anthropic";

const PROVIDERS: Record<ProviderId, LlmProvider> = {
  anthropic: anthropicProvider,
  local: openaiCompatProvider,
};

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

// Reads LLM_PROVIDER at CALL time, not at module load -- so a test can set
// process.env.LLM_PROVIDER before invoking proposeGarment, the same reason
// engineFor(state.pattern.engine) resolves its input at call time rather
// than caching a default once. An unset or unrecognized value falls back to
// the default rather than throwing: production never sets LLM_PROVIDER at
// all today, and it must keep working unchanged.
export function getProvider(): LlmProvider {
  const raw = process.env.LLM_PROVIDER;
  if (raw && isProviderId(raw)) return PROVIDERS[raw];
  return PROVIDERS[DEFAULT_PROVIDER_ID];
}
