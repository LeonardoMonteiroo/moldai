import type { GarmentSpec, ClarifyQuestion } from "@/lib/types";
import { validateSpec, validateQuestions } from "@/lib/draft/garment";
import type { RawToolInput } from "./schema";

export type Decision = "apply" | "decline" | "ask" | "explain";
const DECISIONS: Decision[] = ["apply", "decline", "ask", "explain"];

export interface AiDecision {
  decision: Decision;
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
  // #99: `input` is only asserted to be RawToolInput (`as RawToolInput` at
  // the call site), never actually checked — a truncated or malformed
  // tool_use.input can carry `decision: undefined` or an unrecognized
  // string. Without this guard neither throw below fires (both test for
  // specific values), so it fell through to validateSpec(undefined),
  // fabricating and silently applying a default blouse over whatever the
  // user actually had, and charging for it.
  if (!DECISIONS.includes(input.decision)) {
    throw new Error(`unrecognized decision: ${String(input.decision)}`);
  }
  // #53: RawToolInput types this as `string`, but that's only ever asserted
  // at the SDK boundary (lib/ai/index.ts), never checked — an absent or
  // non-string assistantMessage must not reach the persisted chat bubble as
  // `text: decision.assistantMessage`, which the route writes verbatim.
  // Computed once, used by both return sites below (the second one used to
  // return the unchecked `input.assistantMessage` instead of this).
  const message =
    typeof input.assistantMessage === "string" ? input.assistantMessage : "";
  if (input.decision === "ask" && !answering) {
    const questions = validateQuestions(input.questions);
    if (questions.length > 0) {
      return {
        decision: "ask",
        spec: validateSpec(input.spec),
        questions,
        assistantMessage: message,
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
  if (decision === "explain" && message.trim() === "") {
    throw new Error("decision=explain without an assistantMessage");
  }
  return {
    decision,
    spec: validateSpec(input.spec),
    declineReason: input.declineReason,
    assistantMessage: message,
  };
}
