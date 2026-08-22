import type { GarmentSpec, ClarifyQuestion } from "@/lib/types";
import { validateSpec, validateQuestions } from "@/lib/draft/garment";
import type { RawToolInput } from "./schema";

export interface AiDecision {
  decision: "apply" | "decline" | "ask" | "explain";
  spec: GarmentSpec;
  questions?: ClarifyQuestion[];
  declineReason?: string;
  assistantMessage: string;
}

// Pure post-processing of the model's raw tool payload. Normalizes ask→apply
// when there are no usable questions or the user is answering (redundant
// guard for the prompt rule: when answering, never ask again), and
// validates/clamps the untrusted spec. Throws when the model wants to apply
// but sent no usable spec object (missing, null, or an array): validateSpec
// would fabricate a default blouse from any of those, whereas throwing makes
// the generate route refund the credit. Throws the same way for an explain
// carrying no message, for the same reason.
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
    (typeof input.spec !== "object" ||
      input.spec === null ||
      Array.isArray(input.spec))
  ) {
    throw new Error("decision=apply without a spec object");
  }
  // For explain the message IS the payload, so an empty one is unusable.
  // Throwing puts it through the route's catch (refund + error) rather than
  // charging a credit for an empty bubble.
  const message =
    typeof input.assistantMessage === "string" ? input.assistantMessage : "";
  if (decision === "explain" && message.trim() === "") {
    throw new Error("decision=explain without an assistantMessage");
  }
  return {
    decision,
    spec: validateSpec(input.spec),
    declineReason: input.declineReason,
    assistantMessage: input.assistantMessage,
  };
}
