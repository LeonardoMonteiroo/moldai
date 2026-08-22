import type Anthropic from "@anthropic-ai/sdk";
import {
  TYPES,
  GENDERS,
  NECKLINES,
  SLEEVES,
  SKIRTS,
  STYLE_LIMITS,
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
              armholeDeepenCm: bounded(STYLE_LIMITS.armholeDeepenCm),
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
