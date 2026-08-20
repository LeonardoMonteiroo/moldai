import type { GarmentSpec, ClarifyQuestion } from "@/lib/types";
import { validateSpec, validateQuestions } from "@/lib/draft/garment";
import type { RawToolInput } from "./schema";

export interface AiDecision {
  decision: "apply" | "decline" | "ask";
  spec: GarmentSpec;
  questions?: ClarifyQuestion[];
  declineReason?: string;
  assistantMessage: string;
}

// Pure post-processing of the model's raw tool payload. Normalizes ask→apply
// when there are no usable questions or the user is answering (redundant
// guard for the prompt rule: when answering, never ask again), and
// validates/clamps the untrusted spec. Throws when the model wants to apply
// but sent no spec object: validateSpec(undefined) would fabricate a default
// blouse, whereas throwing makes the generate route refund the credit.
export function resolveDecision(
  input: RawToolInput,
  answering: boolean,
): AiDecision {
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
  }
  const decision = input.decision === "ask" ? "apply" : input.decision;
  if (
    decision === "apply" &&
    (typeof input.spec !== "object" || input.spec === null)
  ) {
    throw new Error("decision=apply without a spec object");
  }
  return {
    decision,
    spec: validateSpec(input.spec),
    declineReason: input.declineReason,
    assistantMessage: input.assistantMessage,
  };
}
