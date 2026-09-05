import { describe, it, expect, afterEach } from "vitest";
import {
  PROVIDER_IDS,
  DEFAULT_PROVIDER_ID,
  isProviderId,
  getProvider,
} from "./registry";
import { anthropicProvider } from "./anthropic";
import { openaiCompatProvider } from "./openaiCompat";

const ORIGINAL_LLM_PROVIDER = process.env.LLM_PROVIDER;

afterEach(() => {
  if (ORIGINAL_LLM_PROVIDER === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = ORIGINAL_LLM_PROVIDER;
});

describe("isProviderId", () => {
  it("accepts every id in PROVIDER_IDS", () => {
    for (const id of PROVIDER_IDS) expect(isProviderId(id)).toBe(true);
  });

  it("rejects an unrecognized value", () => {
    expect(isProviderId("openai")).toBe(false);
    expect(isProviderId("")).toBe(false);
  });
});

describe("getProvider", () => {
  it("falls back to the default provider when LLM_PROVIDER is unset", () => {
    delete process.env.LLM_PROVIDER;
    expect(getProvider()).toBe(anthropicProvider);
    expect(DEFAULT_PROVIDER_ID).toBe("anthropic");
  });

  it("falls back to the default provider when LLM_PROVIDER is unrecognized", () => {
    process.env.LLM_PROVIDER = "openai";
    expect(getProvider()).toBe(anthropicProvider);
  });

  it("resolves to the local provider when LLM_PROVIDER=local", () => {
    process.env.LLM_PROVIDER = "local";
    expect(getProvider()).toBe(openaiCompatProvider);
  });

  it("resolves to the anthropic provider when LLM_PROVIDER=anthropic", () => {
    process.env.LLM_PROVIDER = "anthropic";
    expect(getProvider()).toBe(anthropicProvider);
  });

  it("reads the env var at call time, not at module load", () => {
    delete process.env.LLM_PROVIDER;
    expect(getProvider()).toBe(anthropicProvider);
    process.env.LLM_PROVIDER = "local";
    expect(getProvider()).toBe(openaiCompatProvider);
  });
});
