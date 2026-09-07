import { getProvider } from "./provider/registry";
import type { LlmTool } from "./provider/types";
import type { ProposeImage } from "./options";
import type { GarmentSpec } from "@/lib/types";

// #264: a small, forced-tool-use call, mirroring the shape (not the size) of
// propose_garment's own tool (lib/ai/schema.ts) -- a `compare_reference`
// verdict is `{agrees, note?}`, nothing a GarmentSpec-sized schema would add
// value to.
const COMPARE_TOOL: LlmTool = {
  name: "compare_reference",
  description:
    "Report whether the just-drafted GarmentSpec still matches the attached reference image(s) -- a read-only consistency check, never a new draft.",
  input_schema: {
    type: "object",
    properties: {
      agrees: {
        type: "boolean",
        description:
          "true if the drafted spec's garment type, neckline, sleeve and skirt silhouette (whichever apply) plausibly match the image(s). A color, fabric, print, or fit/style nuance the spec has no field for never counts as a disagreement.",
      },
      note: {
        type: "string",
        description:
          "Required when agrees=false: one short sentence, in Brazilian Portuguese (pt-BR), naming ONLY the disagreement. Omit, or leave empty, when agrees=true.",
      },
    },
    required: ["agrees"],
  },
};

// Byte-identical across every call (no per-request interpolation), the same
// "cacheable static prefix" shape lib/ai/prompt.ts's own STATIC_SECTIONS
// follows -- passed as this call's systemStatic for the same reason, even
// though this call is rare enough that the cache hit rate matters far less.
const COMPARE_SYSTEM_STATIC = `You already drafted a GarmentSpec from a request that included one or more reference photos/sketches, and that draft has already been applied. This is a one-off consistency check on the FINAL spec against the SAME attached image(s) -- you are not drafting anything new, and must never propose an edit, a fix, or mention credits/price.

Call compare_reference exactly once. Set agrees=false only for a real disagreement about the garment's own type, neckline, sleeve, or skirt silhouette -- never for color, fabric, print, or a style nuance the spec simply has no field for.`;

// #264: bounds how long this best-effort follow-up can run, independent of
// whatever timeout the active provider's own propose() uses internally
// (ANTHROPIC_OPTIONS is 20s/8s-repair, sized for the FIRST call's own budget
// inside the 30s transaction -- see docs/architecture/ai-provider.md's "the
// self-hosted provider" entry and lib/ai/provider/anthropic.ts's own
// comments). A generation that already succeeded and already debited must
// never wait on this past a short, fixed ceiling; racing a timer against the
// call (rather than threading a per-call abort signal through
// LlmProvider.propose(), which every current and future provider would then
// have to support) keeps the provider facade itself untouched.
const COMPARE_TIMEOUT_MS = 8_000;

function parseCompareResult(
  input: unknown,
): { agrees: boolean; note?: string } | null {
  if (typeof input !== "object" || input === null) return null;
  const { agrees, note } = input as Record<string, unknown>;
  if (typeof agrees !== "boolean") return null;
  return { agrees, note: typeof note === "string" ? note : undefined };
}

function afterTimeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * #264: after a decision=apply turn that carried at least one reference
 * attachment, asks the active provider one more time whether the drafted
 * spec still agrees with the SAME image(s) it was drafted from --
 * Design2GarmentCode's own output-vs-input comparison (its section 7.2),
 * scoped down to "does this disagree" rather than "propose modification
 * suggestions": an auto-edit here would spend a second credit on the
 * model's own second guess, which this deliberately never does -- there is
 * no debitWallet call anywhere in this file, and the caller must never
 * treat a disagreement as anything more than an extra chat notice.
 *
 * MoldAI has no SVG-to-raster pipeline in this repo (lib/editor/thumbnail.ts
 * emits SVG markup, and the Anthropic Messages API's image content block
 * only accepts jpeg/png/webp/gif -- see lib/editor/attachment.ts's own
 * ImageMediaType) -- pulling one in for a single best-effort check is out of
 * scope for this issue. This compares the reference image(s) the model can
 * already see against a plain JSON summary of the drafted spec instead: the
 * same GarmentSpec shape the model just emitted via propose_garment, so it
 * reads it fluently without a second representation to build.
 *
 * Returns the model's short pt-BR disagreement note, or null when it
 * agrees, the call times out, or the response fails to parse -- this
 * function itself never throws. The caller still wraps its call in a
 * try/catch (a provider call can reject before ever reaching this file's
 * own Promise.race, e.g. on a network error), so a swallowed exception and
 * this function's own null both read as "no disagreement to report."
 */
export async function findReferenceDisagreement(
  spec: GarmentSpec,
  images: ProposeImage[],
): Promise<string | null> {
  const provider = getProvider();
  const providerCall = provider.propose({
    systemStatic: COMPARE_SYSTEM_STATIC,
    systemDynamic: `Drafted spec (already applied):\n${JSON.stringify(spec)}`,
    tool: COMPARE_TOOL,
    toolChoice: "compare_reference",
    messages: [
      {
        role: "user",
        content:
          "Compare the drafted spec above to the attached reference image(s).",
      },
    ],
    images,
    maxTokens: 200,
  });
  // providerCall can keep running well past COMPARE_TIMEOUT_MS (its own
  // worst case is ANTHROPIC_OPTIONS.timeout + the repair retry, ~28s -- see
  // lib/ai/provider/anthropic.ts) after the race below has already settled
  // on the timeout branch. A promise can have more than one subscriber, so
  // this extra, no-op .catch does not change what the race (or a caller
  // awaiting providerCall through it) observes -- it only stops a LATE
  // rejection, with nothing else listening for it any more, from surfacing
  // as an unhandled promise rejection and taking the process down.
  providerCall.catch(() => {});
  const result = await Promise.race([
    providerCall,
    afterTimeout(COMPARE_TIMEOUT_MS, null),
  ]);
  if (!result) return null;
  const parsed = parseCompareResult(result.toolInput);
  if (!parsed || parsed.agrees) return null;
  const note = parsed.note?.trim();
  return note ? note : null;
}
