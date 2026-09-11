import type { LlmTool } from "./provider/types";
import { GENDERS } from "@/lib/draft/garment";
import { MEASUREMENT_RANGES } from "@/lib/measurements";
import { CLARIFY_QUESTION_FIELDS } from "@/lib/types";
import { ENGINE_IDS } from "@/lib/draft/engine/capability";
import type {
  EngineId,
  EngineCapability,
  StyleEnums,
} from "@/lib/draft/engine/capability";
import { getEngine } from "@/lib/draft/engine/registry";

// Raw shape as returned by the model's tool_use block, before validation —
// `spec` here is untrusted/unknown-shaped input, not yet a GarmentSpec.
export interface RawToolInput {
  decision: "apply" | "decline" | "ask" | "explain";
  spec?: unknown;
  questions?: unknown;
  declineReason?: string;
  assistantMessage: string;
  // #138: only meaningful alongside decision=explain -- true when
  // assistantMessage narrates the sewing/assembly order from the "Assembly
  // order" structure in the system prompt (lib/ai/prompt.ts). Lets the
  // route (app/api/patterns/[id]/generate) tag the persisted ChatMessage so
  // the client can attach the catalog-sourced "AI-generated guidance, not
  // verified construction advice" disclaimer -- chrome that must come from
  // the catalog (#138 decision), not from the model's own prose, so it
  // needs a structured signal rather than sniffing assistantMessage's text.
  assemblyOrder?: boolean;
}

// #53: block.input from the Anthropic SDK is typed `unknown` — the call
// site used to `as RawToolInput` it, a compile-time-only assertion that
// checks nothing at runtime. A malformed tool_use.input (null, an array, a
// primitive — e.g. a response truncated or reshaped in a way the SDK's own
// parsing tolerates) would reach property access as if every field were
// guaranteed present, rather than throwing a clear, catchable error the
// route's existing catch turns into a refund. This only guards the
// object-shape assumption resolveDecision relies on; it does not itself
// check `decision`'s enum membership (resolveDecision already does that,
// #99) or clamp spec/questions (validateSpec/validateQuestions do that
// downstream, and must keep clamping rather than rejecting).
export function parseRawToolInput(input: unknown): RawToolInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("propose_garment tool_use.input was not an object");
  }
  return input as RawToolInput;
}

const bounded = (r: { min: number; max: number }) => ({
  type: "number" as const,
  minimum: r.min,
  maximum: r.max,
});

// #267: MEASUREMENT_RANGES stays app-level -- see lib/ai/prompt.ts's own
// measurementLines for why -- but which KEYS get a property at all is
// scoped to the given engine's own declared vocabulary.
function measurementProperties(capability: EngineCapability) {
  return Object.fromEntries(
    [
      ...capability.measurements.required,
      ...capability.measurements.optional,
    ].map((k) => [k, bounded(MEASUREMENT_RANGES[k])]),
  );
}

// #269: a JSON Schema `enum` is one flat list -- it cannot express "valid
// values differ by the sibling `type` field" the way lib/ai/prompt.ts's own
// styleEnumLine prose can. This renders the UNION across every type the
// engine supports (a "shirt collar" is a syntactically valid tool call
// regardless of type), deliberately coarser than the prompt's own per-type
// guidance: the schema's job is shape validation (reject "collar: gnorf"
// outright), not the nuanced per-type constraint -- checkEngineSupport
// stays the real, final gate that would report a type-specific mismatch
// (e.g. "sleeve: short" for a freesewing blouse) even though the schema
// itself allowed the tool call through.
function styleEnumUnion(
  capability: EngineCapability,
  field: keyof StyleEnums,
): string[] {
  const seen = new Set<string>();
  for (const type of capability.types) {
    for (const value of capability.styleEnumsByType[type][field]) {
      seen.add(value);
    }
  }
  return [...seen];
}

// The enums and numeric bounds all derive from the ACTIVE ENGINE's own
// declared capability (lib/draft/engine/capability.ts) — schema, prompt,
// and validator cannot drift. #267: this used to read module-level
// TYPES/STYLE_LIMITS constants directly; now scoped per engine.
function buildTool(capability: EngineCapability): LlmTool {
  return {
    name: "propose_garment",
    description:
      "Report your decision for the user's request as a GarmentSpec. The decision policy, catalogs, and valid ranges are in the system prompt.",
    input_schema: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          enum: ["apply", "decline", "ask", "explain"],
        },
        spec: {
          type: "object",
          description:
            "The COMPLETE, UPDATED GarmentSpec (not just the delta). Required when decision=apply — include everything that already existed plus the requested changes.",
          properties: {
            type: { type: "string", enum: [...capability.types] },
            gender: { type: "string", enum: [...GENDERS] },
            measurementOverrides: {
              type: "object",
              description:
                "Body-measurement overrides in cm — only what the request explicitly adjusts.",
              properties: measurementProperties(capability),
              additionalProperties: false,
            },
            style: {
              type: "object",
              properties: {
                neckline: {
                  type: "string",
                  enum: styleEnumUnion(capability, "neckline"),
                },
                necklineDepthCm: bounded(
                  capability.styleLimits.necklineDepthCm,
                ),
                sleeve: {
                  type: "string",
                  enum: styleEnumUnion(capability, "sleeve"),
                },
                skirt: {
                  type: "string",
                  enum: styleEnumUnion(capability, "skirt"),
                },
                skirtLengthCm: bounded(capability.styleLimits.skirtLengthCm),
                darts: { type: "boolean" },
                seamAllowanceCm: bounded(
                  capability.styleLimits.seamAllowanceCm,
                ),
                fit: {
                  type: "string",
                  enum: styleEnumUnion(capability, "fit"),
                },
                stretch: {
                  type: "string",
                  enum: styleEnumUnion(capability, "stretch"),
                },
                armholeDeepenCm: bounded(
                  capability.styleLimits.armholeDeepenCm,
                ),
                collar: {
                  type: "string",
                  enum: styleEnumUnion(capability, "collar"),
                },
                cuff: {
                  type: "string",
                  enum: styleEnumUnion(capability, "cuff"),
                },
                waistband: {
                  type: "string",
                  enum: styleEnumUnion(capability, "waistband"),
                },
                frontClosure: {
                  type: "string",
                  enum: styleEnumUnion(capability, "frontClosure"),
                },
                trouserLengthCm: bounded(
                  capability.styleLimits.trouserLengthCm,
                ),
                pleats: {
                  type: "string",
                  enum: styleEnumUnion(capability, "pleats"),
                },
              },
            },
          },
          required: ["type", "gender", "measurementOverrides", "style"],
        },
        questions: {
          type: "array",
          description:
            'Only when decision=ask: 1 to 4 objective single-choice questions. Set `field` when the question is about one of the style catalogs in GarmentSpec above (neckline/sleeve/skirt/collar/cuff/waistband) and give `options` as the EXACT catalog tokens for that field (e.g. "round"/"V"/"straight" for neckline) — the client renders each token\'s own localized label rather than your literal text, and any token that isn\'t a real value of that catalog is dropped. Leave `field` unset, and write plain option text in the user\'s own language, for anything with no catalog (a measurement, a free-length choice).',
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              field: {
                type: "string",
                enum: [...CLARIFY_QUESTION_FIELDS],
              },
              options: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 6,
              },
              allowOther: { type: "boolean" },
            },
            required: ["label", "options"],
          },
        },
        declineReason: {
          type: "string",
          description: "Only when decision=decline.",
        },
        assemblyOrder: {
          type: "boolean",
          description:
            "Only when decision=explain: set true when assistantMessage narrates the sewing/assembly order from the 'Assembly order' structure in the system prompt. Otherwise omit or false.",
        },
        assistantMessage: {
          type: "string",
          description:
            "Short chat reply, in the user's own language. When decision=explain this carries the entire answer.",
        },
      },
      required: ["decision", "assistantMessage"],
    },
  };
}

// #267: built EAGERLY, once per registered engine, at module load -- see
// lib/ai/prompt.ts's STATIC_SECTIONS_BY_ENGINE for the full reasoning
// (byte-identity across requests is what the prompt cache needs; this eager
// build is for provability and cost, not correctness).
export const TOOL_BY_ENGINE: Record<EngineId, LlmTool> = Object.fromEntries(
  ENGINE_IDS.map((id) => [id, buildTool(getEngine(id).capability)]),
) as Record<EngineId, LlmTool>;

export function toolFor(id: EngineId): LlmTool {
  return TOOL_BY_ENGINE[id];
}
