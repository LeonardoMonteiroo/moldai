import type { PatternState } from "@/lib/types";
import { staticSectionsFor, buildDynamicSection } from "./prompt";
import { buildHistory } from "./history";
import { toolFor, parseRawToolInput } from "./schema";
import { resolveDecision, type AiDecision } from "./decision";
import type { ProposeImage, ProposeOptions } from "./options";
import { engineFor } from "@/lib/draft/engine/capability";
import { getProvider } from "./provider/registry";
import { LlmProposeError, type LlmCallResult } from "./provider/types";
import {
  traceProposeGarment,
  isTraceContentEnabled,
} from "@/lib/observability/langfuse";

// ProposeImage was declared here before ProposeOptions needed it too (see
// options.ts on the cycle) -- re-exported so no importer has to know it
// moved.
export type { AiDecision, ProposeImage, ProposeOptions };

const DEFAULT_MAX_TOKENS = 1024;

// #269 provider facade: this file used to construct the Anthropic client
// and own the whole request/repair loop directly. Both now live behind
// lib/ai/provider/{types,registry}.ts, the same split
// lib/draft/engine/facade.ts already established for the drafting engine --
// getProvider() reads LLM_PROVIDER (default "anthropic") and every provider
// implements the identical LlmProvider.propose() contract, repair retry
// included. Nothing below is provider-specific any more: no SDK import, no
// cache_control, no tool_use/tool_call parsing.
export async function proposeGarment(
  state: PatternState,
  opts: ProposeOptions,
): Promise<AiDecision> {
  // #267: reads the pattern's own FROZEN engine (absent -> the default) --
  // never a bare default -- so the prompt/tool never disagree with what
  // will actually draft the spec this call produces.
  const engine = engineFor(state.pattern.engine);
  const provider = getProvider();
  const systemDynamic = buildDynamicSection(state, opts);
  const messages = buildHistory(state.chat);

  // #276: this whole function is the one seam that covers both the
  // production Anthropic path and the eval-harness/local-vLLM path -- see
  // docs/architecture/ai-provider.md. `result`/`decision`/`caughtError` are
  // read from the `finally` block below to build one Langfuse trace per
  // call, whether it succeeded or threw. traceProposeGarment itself is
  // synchronous/fire-and-forget (lib/observability/langfuse.ts): calling it
  // here adds no await, so a caller running inside
  // withPatternAndWallet's transaction (lib/db/pattern-wallet.ts) never
  // waits on it.
  const startedAt = Date.now();
  let result: LlmCallResult | undefined;
  let decision: AiDecision | undefined;
  let caughtError: unknown;
  try {
    result = await provider.propose({
      systemStatic: staticSectionsFor(engine),
      systemDynamic,
      tool: toolFor(engine),
      toolChoice: "propose_garment",
      messages,
      images: opts.images,
      maxTokens: DEFAULT_MAX_TOKENS,
    });

    decision = resolveDecision(
      parseRawToolInput(result.toolInput),
      opts.answering,
    );
    return decision;
  } catch (err) {
    caughtError = err;
    throw err;
  } finally {
    traceProposeGarment({
      provider: provider.id,
      model: provider.model(),
      source: opts.evalRun ? "eval" : "app",
      decision: decision?.decision,
      startedAt,
      finishedAt: Date.now(),
      // #276: when the one repair attempt (#261) also fails, propose()
      // throws instead of returning an LlmCallResult -- but both attempts
      // were still real, billed calls. Each provider carries that usage on
      // a thrown LlmProposeError (lib/ai/provider/types.ts) for exactly
      // this case, so the trace stays honest instead of recording
      // usage: undefined for a call that was actually charged twice.
      repaired:
        result?.repaired ??
        (caughtError instanceof LlmProposeError ? caughtError.repaired : false),
      usage:
        result?.usage ??
        (caughtError instanceof LlmProposeError
          ? caughtError.usage
          : undefined),
      adjustments: decision?.adjustments,
      error:
        caughtError instanceof Error
          ? caughtError.message
          : caughtError !== undefined
            ? String(caughtError)
            : undefined,
      // #276 LGPD opt-in: chat text is user personal data -- only ever built
      // (never merely read) when the flag is on, so an unconfigured
      // environment never even holds a reference to this content past the
      // call it already needed it for. opts.images (attached reference
      // photos) are never included here regardless of this flag -- only
      // their surrounding prompt text travels, never image binaries.
      ...(isTraceContentEnabled()
        ? {
            content: {
              systemDynamic,
              messages,
              assistantMessage: decision?.assistantMessage,
            },
          }
        : {}),
    });
  }
}
