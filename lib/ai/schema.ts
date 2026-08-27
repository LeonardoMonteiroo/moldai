import type Anthropic from "@anthropic-ai/sdk";
import {
  TYPES,
  GENDERS,
  NECKLINES,
  SLEEVES,
  SKIRTS,
  COLLARS,
  CUFFS,
  WAISTBANDS,
  STYLE_LIMITS,
  FIT_CLASSES,
  STRETCH_CLASSES,
} from "@/lib/draft/garment";
import { MEASUREMENT_RANGES } from "@/lib/measurements";

// Raw shape as returned by the model's tool_use block, before validation —
// `spec` here is untrusted/unknown-shaped input, not yet a GarmentSpec.
export interface RawToolInput {
  decision: "apply" | "decline" | "ask" | "explain";
  spec?: unknown;
  questions?: unknown;
  declineReason?: string;
  assistantMessage: string;
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

// The enums and numeric bounds all derive from the same constants
// validateSpec clamps with (lib/draft/garment.ts) — schema, prompt, and
// validator cannot drift.
export const TOOL: Anthropic.Tool = {
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
          type: { type: "string", enum: [...TYPES] },
          gender: { type: "string", enum: [...GENDERS] },
          measurementOverrides: {
            type: "object",
            description:
              "Body-measurement overrides in cm — only what the request explicitly adjusts.",
            properties: Object.fromEntries(
              Object.entries(MEASUREMENT_RANGES).map(([k, r]) => [
                k,
                bounded(r),
              ]),
            ),
            additionalProperties: false,
          },
          style: {
            type: "object",
            properties: {
              neckline: { type: "string", enum: [...NECKLINES] },
              necklineDepthCm: bounded(STYLE_LIMITS.necklineDepthCm),
              sleeve: { type: "string", enum: [...SLEEVES] },
              skirt: { type: "string", enum: [...SKIRTS] },
              skirtLengthCm: bounded(STYLE_LIMITS.skirtLengthCm),
              darts: { type: "boolean" },
              seamAllowanceCm: bounded(STYLE_LIMITS.seamAllowanceCm),
              fit: { type: "string", enum: [...FIT_CLASSES] },
              stretch: { type: "string", enum: [...STRETCH_CLASSES] },
              armholeDeepenCm: bounded(STYLE_LIMITS.armholeDeepenCm),
              collar: { type: "string", enum: [...COLLARS] },
              cuff: { type: "string", enum: [...CUFFS] },
              waistband: { type: "string", enum: [...WAISTBANDS] },
            },
          },
        },
        required: ["type", "gender", "measurementOverrides", "style"],
      },
      questions: {
        type: "array",
        description:
          "Only when decision=ask: 1 to 4 objective single-choice questions.",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
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
      assistantMessage: {
        type: "string",
        description:
          "Short chat reply, in the user's own language. When decision=explain this carries the entire answer.",
      },
    },
    required: ["decision", "assistantMessage"],
  },
};
