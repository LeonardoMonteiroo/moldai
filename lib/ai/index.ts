import type { PatternState } from "@/lib/types";
import { staticSectionsFor, buildDynamicSection } from "./prompt";
import { buildHistory } from "./history";
import { toolFor, parseRawToolInput } from "./schema";
import { resolveDecision, type AiDecision } from "./decision";
import type { ProposeImage, ProposeOptions } from "./options";
import { engineFor } from "@/lib/draft/engine/capability";
import { getProvider } from "./provider/registry";

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

  const result = await provider.propose({
    systemStatic: staticSectionsFor(engine),
    systemDynamic: buildDynamicSection(state, opts),
    tool: toolFor(engine),
    toolChoice: "propose_garment",
    messages: buildHistory(state.chat),
    images: opts.images,
    maxTokens: DEFAULT_MAX_TOKENS,
  });

  return resolveDecision(parseRawToolInput(result.toolInput), opts.answering);
}
