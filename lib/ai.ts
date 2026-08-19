import Anthropic from "@anthropic-ai/sdk";
import { PatternState, GarmentSpec, ClarifyQuestion } from "./types";
import { validateSpec, validateQuestions } from "@/lib/draft/garment";
import {
  MEASUREMENT_RANGES,
  SIZE_TABLE,
  SIZE_TABLE_MALE,
} from "@/lib/measurements";

export interface AiDecision {
  decision: "apply" | "decline" | "ask";
  spec: GarmentSpec;
  questions?: ClarifyQuestion[];
  declineReason?: string;
  assistantMessage: string;
}

// Raw shape as returned by the model's tool_use block, before validation —
// `spec` here is untrusted/unknown-shaped input, not yet a GarmentSpec.
interface RawToolInput {
  decision: "apply" | "decline" | "ask";
  spec?: unknown;
  questions?: unknown;
  declineReason?: string;
  assistantMessage: string;
}

const TOOL: Anthropic.Tool = {
  name: "propose_garment",
  description:
    "Decide how the user's request translates into a GarmentSpec (garment specification). Always choose a decision, and write assistantMessage in the same language the user wrote in.",
  input_schema: {
    type: "object",
    properties: {
      decision: {
        type: "string",
        enum: ["apply", "decline", "ask"],
        description:
          "apply = ready to draft now; decline = out of scope (pants, accessories…); ask = missing relevant detail, ask questions before drafting.",
      },
      spec: {
        type: "object",
        description:
          "The COMPLETE, UPDATED GarmentSpec (not just the delta). Always fill this in when decision=apply — include everything that already existed plus the requested changes.",
        properties: {
          type: {
            type: "string",
            enum: ["blouse", "dress", "skirt", "tshirt"],
          },
          gender: {
            type: "string",
            enum: ["female", "male"],
            description:
              "Gender / measurement base. Infer from cues like 'men's'/'women's'/'unisex' (in any language). Default female.",
          },
          measurementOverrides: {
            type: "object",
            description:
              "Numeric (cm) overrides of body measurements, by measurement name. Only include what the request explicitly asks to adjust; everything else comes from the size table.",
            properties: Object.fromEntries(
              Object.keys(MEASUREMENT_RANGES).map((k) => [
                k,
                { type: "number" },
              ]),
            ),
            additionalProperties: { type: "number" },
          },
          style: {
            type: "object",
            properties: {
              neckline: { type: "string", enum: ["straight", "V", "round"] },
              necklineDepthCm: { type: "number" },
              sleeve: { type: "string", enum: ["none", "short", "long"] },
              skirt: {
                type: "string",
                enum: ["straight", "a-line", "gore", "half-circle", "circle"],
              },
              skirtLengthCm: { type: "number" },
              darts: { type: "boolean" },
              seamAllowanceCm: { type: "number" },
              armholeDeepenCm: {
                type: "number",
                description:
                  "Deepens the body's armhole by X cm (0 to 6). Use when the user asks to increase/deepen/lower the armhole (e.g. 'add 2cm to the armhole'). Only affects the body — the sleeve may need adjusting afterward.",
              },
            },
          },
        },
        required: ["type", "gender", "measurementOverrides", "style"],
      },
      questions: {
        type: "array",
        description:
          "Fill in ONLY when decision=ask. 1 to 4 objective single-choice questions, with options drawn from the valid catalog. Don't invent measurements or draft.",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description:
                "Short question, written in the same language the user used (e.g. 'Neckline').",
            },
            options: {
              type: "array",
              items: { type: "string" },
              description: "2 to 6 single-choice options.",
            },
            allowOther: {
              type: "boolean",
              description: "true if a free-text 'other' field makes sense.",
            },
          },
          required: ["label", "options"],
        },
      },
      declineReason: {
        type: "string",
        description: "Fill in ONLY when decision=decline.",
      },
      assistantMessage: {
        type: "string",
        description:
          "Short reply to the user in chat, in the same language the user wrote in, describing what was done or why not.",
      },
    },
    required: ["decision", "assistantMessage"],
  },
};

function buildSystem(state: PatternState, answering: boolean): string {
  const currentSpec = state.pattern.spec;
  const isEmpty = state.pattern.pieces.length === 0;
  return [
    "You are MoldAI's pattern-drafting engine. You receive natural-language requests about a garment and translate them into a GarmentSpec (type + measurements + style).",
    "The GarmentSpec has: type (blouse | dress | skirt | tshirt); gender (female | male); measurementOverrides (body measurements in cm, override the size table); style (neckline, necklineDepthCm, sleeve, skirt, skirtLengthCm, darts, seamAllowanceCm, armholeDeepenCm).",
    "armholeDeepenCm deepens the body's armhole (0 to 6 cm): use it when asked to increase/lower the armhole. Since it only affects the body, the sleeve cap may end up mismatched and trigger a seam-conflict warning — that's expected, the user resolves it with the sleeve-fix action.",
    "tshirt = knit garment (round neckline, short set-in sleeve by default, no darts, fitted); blouse = woven fabric (may have darts, any neckline). Choose tshirt for a t-shirt and blouse for a blouse/shirt.",
    "Valid style catalog: neckline in straight|V|round; sleeve in none|short|long; skirt (silhouette) in straight|a-line|gore|half-circle|circle.",
    "Map the user's vocabulary to these tokens regardless of what language they wrote in — e.g. neckline 'straight'->straight, 'V-neck'->V, 'round'->round; sleeve 'short'->short, 'long'->long, 'sleeveless'->none; skirt 'straight'->straight, 'godet'->gore, 'A-line'->a-line, 'half circle'->half-circle, 'circle'->circle.",
    "Infer gender from the request ('men's'->male, 'women's'->female, no cue->female).",
    "Always write assistantMessage, and any question labels/options, in the same natural language the user's most recent message was written in — mirror it exactly, never default to a fixed language.",
    isEmpty
      ? "CURRENT STATE: BLANK pattern, no piece created yet. This is a from-scratch request: build the entire GarmentSpec the garment needs. If the request already provides enough, use apply; but a generic request with only the piece type (e.g. 'make a t-shirt', no gender, size, neckline, sleeve, or fit) is UNDERSPECIFIED — in that case use decision=ask before drafting."
      : "A spec is already applied (below). An adjustment request should return the ENTIRE UPDATED SPEC (not just the delta): start from the current spec and apply the requested changes.",
    "If the request isn't a garment this spec can represent (e.g. pants, accessories, a generic request unrelated to a draftable piece), use decision=decline and explain gently in assistantMessage. Don't fill in spec in that case.",
    answering
      ? "The user just ANSWERED your questions (the answers are in the last user message). Do NOT use decision=ask again — use apply (or decline if out of scope) with your best understanding of the answers."
      : "If relevant detail is missing to draft correctly (neckline, sleeve, fit, length, size…), use decision=ask with 1 to 4 objective single-choice questions, options from the valid catalog; don't invent measurements or draft in that case. Only use apply once you have enough.",
    "",
    "Female size table (cm):",
    JSON.stringify(SIZE_TABLE),
    "Male size table (cm):",
    JSON.stringify(SIZE_TABLE_MALE),
    "",
    "Current pattern spec:",
    JSON.stringify(currentSpec ?? null),
  ].join("\n");
}

export async function proposeGarment(
  state: PatternState,
  answering: boolean,
): Promise<AiDecision> {
  const client = new Anthropic();
  const history = state.chat.slice(-10).map((m) => ({
    role: m.author === "user" ? ("user" as const) : ("assistant" as const),
    content: m.text,
  }));

  const resp = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: buildSystem(state, answering),
    tools: [TOOL],
    tool_choice: { type: "tool", name: "propose_garment" },
    messages: history,
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Model did not return a tool_use block");
  }
  const input = block.input as RawToolInput;

  // Redundant guard for the prompt instruction: when answering, never ask again.
  if (input.decision === "ask" && !answering) {
    const questions = validateQuestions(input.questions);
    if (questions.length > 0) {
      return {
        decision: "ask",
        spec: validateSpec(input.spec),
        questions,
        assistantMessage: input.assistantMessage,
      };
    }
    // no usable question → draft with defaults
    return {
      decision: "apply",
      spec: validateSpec(input.spec),
      assistantMessage: input.assistantMessage,
    };
  }

  const decision = input.decision === "ask" ? "apply" : input.decision;
  return {
    decision,
    spec: validateSpec(input.spec),
    declineReason: input.declineReason,
    assistantMessage: input.assistantMessage,
  };
}
