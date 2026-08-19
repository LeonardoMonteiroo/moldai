# Editor AI Prompt + Module Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the editor's AI layer (`lib/ai.ts` → `lib/ai/`) with a sectioned system prompt that quotes the validator's real limits, a tool schema derived from the same shared constants, normalized chat history, and a refund-instead-of-default-blouse guard.

**Architecture:** `lib/draft/garment.ts` exports its enum catalogs plus a new `STYLE_LIMITS` const that `validateSpec` itself clamps with; the new `lib/ai/` modules (`schema.ts`, `history.ts`, `decision.ts`, `prompt.ts`, `index.ts`) all derive from those constants so prompt, schema, and validator cannot drift. `proposeGarment` keeps its exact signature and import path (`@/lib/ai` resolves to the folder index), so the generate route and its test are untouched.

**Tech Stack:** Next.js 16 / TypeScript, `@anthropic-ai/sdk` (forced tool-use), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-editor-ai-prompt-restructure-design.md`

## Global Constraints

- Code identifiers/comments in English; commits in English, Conventional Commits (`type(scope): summary`).
- No behavior change to the generate route's wire shapes or statuses (`ok`/`clarify`/`declined`/`conflict`/`error`, 402); no persisted-blob shape change.
- Model id stays `claude-sonnet-5`, `max_tokens` stays `1024`, the server-side `answering` guard stays.
- No new dependencies. No prompt caching (static prefix is under Sonnet's 1024-token cacheable minimum).
- Verify with `npm test` and `npm run build` — never bare `tsc` (spurious `app/layout.tsx` LayoutProps error in Next 16).
- Don't hand-edit `AGENTS.md`; if `next dev` regenerates it, commit it as-is.
- Run a single test file with `npx vitest run <path>`.

---

### Task 1: Export shared limits from the validator

**Files:**

- Modify: `lib/draft/garment.ts` (the const block at the top, ~lines 22–41, and `validateSpec`)
- Test: `lib/draft/garment.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces (all from `@/lib/draft/garment`, used by Tasks 2 and 5):
  - `export const TYPES: GarmentType[]`, `GENDERS: Gender[]`, `NECKLINES: Neckline[]`, `SLEEVES: SleeveLength[]`, `SKIRTS: SkirtSilhouette[]` (existing private consts, now exported, values unchanged)
  - `export const STYLE_LIMITS: { necklineDepthCm: {min:0;max:15}; skirtLengthCm: {min:25;max:120}; seamAllowanceCm: {min:0;max:4}; armholeDeepenCm: {min:0;max:6} }`

- [ ] **Step 1: Write the failing test**

Add to the `describe("validateSpec", ...)` block in `lib/draft/garment.test.ts`, and add `STYLE_LIMITS` to the existing `from "./garment"` import list:

```ts
it("clamps numeric style fields to the exported STYLE_LIMITS bounds", () => {
  const s = validateSpec({
    type: "dress",
    gender: "female",
    measurementOverrides: {},
    style: {
      necklineDepthCm: 999,
      skirtLengthCm: 0,
      seamAllowanceCm: 99,
      armholeDeepenCm: 99,
    },
  });
  expect(s.style.necklineDepthCm).toBe(STYLE_LIMITS.necklineDepthCm.max);
  expect(s.style.skirtLengthCm).toBe(STYLE_LIMITS.skirtLengthCm.min);
  expect(s.style.seamAllowanceCm).toBe(STYLE_LIMITS.seamAllowanceCm.max);
  expect(s.style.armholeDeepenCm).toBe(STYLE_LIMITS.armholeDeepenCm.max);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/draft/garment.test.ts`
Expected: FAIL — `"./garment"` has no exported member `STYLE_LIMITS`.

- [ ] **Step 3: Implement**

In `lib/draft/garment.ts`, add `export` to the five existing const arrays (values unchanged):

```ts
export const TYPES: GarmentType[] = ["blouse", "dress", "skirt", "tshirt"];
export const GENDERS: Gender[] = ["female", "male"];
export const NECKLINES: Neckline[] = ["straight", "V", "round"];
export const SLEEVES: SleeveLength[] = ["none", "short", "long"];
export const SKIRTS: SkirtSilhouette[] = [
  "straight",
  "a-line",
  "gore",
  "half-circle",
  "circle",
];

// Clamp bounds validateSpec applies to numeric style fields. Exported so the
// AI layer (lib/ai) quotes the same numbers in its prompt and tool schema —
// they must never drift from what actually gets enforced here.
export const STYLE_LIMITS = {
  necklineDepthCm: { min: 0, max: 15 },
  skirtLengthCm: { min: 25, max: 120 },
  seamAllowanceCm: { min: 0, max: 4 },
  armholeDeepenCm: { min: 0, max: 6 },
} as const;
```

Then replace the hardcoded bounds inside `validateSpec`'s `outStyle` with the constants (same numbers — no behavior change):

```ts
const outStyle: GarmentStyle = {
  neckline:
    style.neckline !== undefined
      ? pick(style.neckline, NECKLINES, "straight")
      : undefined,
  sleeve:
    style.sleeve !== undefined
      ? pick(style.sleeve, SLEEVES, "none")
      : undefined,
  skirt:
    style.skirt !== undefined
      ? pick(style.skirt, SKIRTS, "straight")
      : undefined,
  necklineDepthCm:
    style.necklineDepthCm !== undefined
      ? clamp(
          num(style.necklineDepthCm, 0),
          STYLE_LIMITS.necklineDepthCm.min,
          STYLE_LIMITS.necklineDepthCm.max,
        )
      : undefined,
  skirtLengthCm:
    style.skirtLengthCm !== undefined
      ? clamp(
          num(style.skirtLengthCm, 60),
          STYLE_LIMITS.skirtLengthCm.min,
          STYLE_LIMITS.skirtLengthCm.max,
        )
      : undefined,
  seamAllowanceCm:
    style.seamAllowanceCm !== undefined
      ? clamp(
          num(style.seamAllowanceCm, 1),
          STYLE_LIMITS.seamAllowanceCm.min,
          STYLE_LIMITS.seamAllowanceCm.max,
        )
      : undefined,
  darts: typeof style.darts === "boolean" ? style.darts : undefined,
  armholeDeepenCm:
    style.armholeDeepenCm !== undefined
      ? clamp(
          num(style.armholeDeepenCm, 0),
          STYLE_LIMITS.armholeDeepenCm.min,
          STYLE_LIMITS.armholeDeepenCm.max,
        )
      : undefined,
  // sleeveRefit is internal (only the conflict resolver sets it); never comes from the AI.
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/draft/garment.test.ts`
Expected: PASS (all existing cases plus the new one).

- [ ] **Step 5: Commit**

```bash
git add lib/draft/garment.ts lib/draft/garment.test.ts
git commit -m "refactor(draft): export style limits and enum catalogs from validateSpec"
```

---

### Task 2: Tool schema derived from the shared limits (`lib/ai/schema.ts`)

**Files:**

- Create: `lib/ai/schema.ts` (note: `lib/ai.ts` still exists and keeps winning the `@/lib/ai` resolution until Task 6 — that's fine, nothing imports the folder yet)
- Test: `lib/ai/schema.test.ts`

**Interfaces:**

- Consumes: `TYPES`, `GENDERS`, `NECKLINES`, `SLEEVES`, `SKIRTS`, `STYLE_LIMITS` from `@/lib/draft/garment` (Task 1); `MEASUREMENT_RANGES` from `@/lib/measurements`.
- Produces (used by Tasks 4 and 6):
  - `export interface RawToolInput { decision: "apply" | "decline" | "ask"; spec?: unknown; questions?: unknown; declineReason?: string; assistantMessage: string }`
  - `export const TOOL: Anthropic.Tool` — the `propose_garment` tool.

- [ ] **Step 1: Write the failing test**

Create `lib/ai/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TOOL } from "./schema";
import {
  NECKLINES,
  SLEEVES,
  SKIRTS,
  TYPES,
  GENDERS,
  STYLE_LIMITS,
} from "@/lib/draft/garment";
import { MEASUREMENT_RANGES } from "@/lib/measurements";

interface Prop {
  enum?: string[];
  minimum?: number;
  maximum?: number;
  properties?: Record<string, Prop>;
}

const input = TOOL.input_schema as unknown as {
  properties: Record<string, Prop>;
};
const spec = input.properties.spec.properties!;
const style = spec.style.properties!;

describe("propose_garment tool schema", () => {
  it("bounds every numeric style field with STYLE_LIMITS", () => {
    for (const k of Object.keys(
      STYLE_LIMITS,
    ) as (keyof typeof STYLE_LIMITS)[]) {
      expect(style[k].minimum).toBe(STYLE_LIMITS[k].min);
      expect(style[k].maximum).toBe(STYLE_LIMITS[k].max);
    }
  });

  it("bounds every measurement override with MEASUREMENT_RANGES", () => {
    const overrides = spec.measurementOverrides.properties!;
    for (const [k, r] of Object.entries(MEASUREMENT_RANGES)) {
      expect(overrides[k].minimum).toBe(r.min);
      expect(overrides[k].maximum).toBe(r.max);
    }
  });

  it("enums match the validator's catalogs", () => {
    expect(spec.type.enum).toEqual(TYPES);
    expect(spec.gender.enum).toEqual(GENDERS);
    expect(style.neckline.enum).toEqual(NECKLINES);
    expect(style.sleeve.enum).toEqual(SLEEVES);
    expect(style.skirt.enum).toEqual(SKIRTS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ai/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Implement**

Create `lib/ai/schema.ts`. Descriptions are trimmed to what the system prompt (Task 5) doesn't already state; the two behavior-critical ones (COMPLETE spec, questions-only-when-ask) stay:

```ts
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
  decision: "apply" | "decline" | "ask";
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
      decision: { type: "string", enum: ["apply", "decline", "ask"] },
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
        description: "Short chat reply, in the user's own language.",
      },
    },
    required: ["decision", "assistantMessage"],
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ai/schema.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/schema.ts lib/ai/schema.test.ts
git commit -m "feat(ai): derive propose_garment tool schema from validator limits"
```

---

### Task 3: Normalized chat history (`lib/ai/history.ts`)

**Files:**

- Create: `lib/ai/history.ts`
- Test: `lib/ai/history.test.ts`

**Interfaces:**

- Consumes: `ChatMessage` from `@/lib/types` (`{ id; author: "user" | "ai"; text; questions?: ClarifyQuestion[]; createdAt; ... }`).
- Produces (used by Task 6):
  - `export interface HistoryTurn { role: "user" | "assistant"; content: string }`
  - `export function buildHistory(chat: ChatMessage[]): HistoryTurn[]`

- [ ] **Step 1: Write the failing test**

Create `lib/ai/history.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildHistory } from "./history";
import type { ChatMessage } from "@/lib/types";

let seq = 0;
function msg(
  author: "user" | "ai",
  text: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  seq += 1;
  return { id: `m${seq}`, author, text, createdAt: seq, ...extra };
}

describe("buildHistory", () => {
  it("maps authors to API roles", () => {
    const h = buildHistory([msg("user", "a t-shirt"), msg("ai", "done")]);
    expect(h).toEqual([
      { role: "user", content: "a t-shirt" },
      { role: "assistant", content: "done" },
    ]);
  });

  it("serializes an ai turn's questions into its content", () => {
    const h = buildHistory([
      msg("user", "a blouse"),
      msg("ai", "Tell me:", {
        questions: [
          {
            id: "q0",
            label: "Neckline",
            options: ["round", "V"],
            allowOther: false,
          },
        ],
      }),
      msg("user", "round"),
    ]);
    expect(h[1].content).toBe("Tell me:\n- Neckline: round | V");
  });

  it("merges consecutive same-role turns (error-orphaned user message)", () => {
    const h = buildHistory([
      msg("user", "a dress"),
      msg("user", "a long dress"),
    ]);
    expect(h).toEqual([{ role: "user", content: "a dress\n\na long dress" }]);
  });

  it("drops a leading assistant turn so history starts with user", () => {
    const h = buildHistory([msg("ai", "done"), msg("user", "shorter")]);
    expect(h).toEqual([{ role: "user", content: "shorter" }]);
  });

  it("keeps only the last 10 messages", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "ai", `t${i}`),
    );
    const h = buildHistory(many);
    expect(h).toHaveLength(10);
    expect(h[0]).toEqual({ role: "user", content: "t2" });
  });

  it("skips blank messages", () => {
    const h = buildHistory([msg("user", "hi"), msg("ai", "  ")]);
    expect(h).toEqual([{ role: "user", content: "hi" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ai/history.test.ts`
Expected: FAIL — cannot resolve `./history`.

- [ ] **Step 3: Implement**

Create `lib/ai/history.ts`:

```ts
import type { ChatMessage } from "@/lib/types";

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

const HISTORY_WINDOW = 10;

// Renders an ai turn's clarifying questions into its history text so the
// user's next message ("round, short") has visible referents for the model.
function renderMessage(m: ChatMessage): string {
  const questions = (m.questions ?? [])
    .map((q) => `- ${q.label}: ${q.options.join(" | ")}`)
    .join("\n");
  return questions ? `${m.text}\n${questions}` : m.text;
}

// The Messages API requires strictly alternating roles starting with "user".
// The persisted chat can violate both (an API error leaves an orphaned user
// message; the 10-message window can open on an ai message), so normalize:
// merge consecutive same-role turns, drop leading assistant turns.
export function buildHistory(chat: ChatMessage[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (const m of chat.slice(-HISTORY_WINDOW)) {
    const role =
      m.author === "user" ? ("user" as const) : ("assistant" as const);
    const content = renderMessage(m);
    if (!content.trim()) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n\n${content}`;
    } else {
      turns.push({ role, content });
    }
  }
  while (turns.length > 0 && turns[0].role === "assistant") turns.shift();
  return turns;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ai/history.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/history.ts lib/ai/history.test.ts
git commit -m "feat(ai): normalize chat history for the Messages API"
```

---

### Task 4: Pure decision post-processing (`lib/ai/decision.ts`)

**Files:**

- Create: `lib/ai/decision.ts`
- Test: `lib/ai/decision.test.ts`

**Interfaces:**

- Consumes: `RawToolInput` from `./schema` (Task 2); `validateSpec`, `validateQuestions` from `@/lib/draft/garment`; `GarmentSpec`, `ClarifyQuestion` from `@/lib/types`.
- Produces (used by Task 6):
  - `export interface AiDecision { decision: "apply" | "decline" | "ask"; spec: GarmentSpec; questions?: ClarifyQuestion[]; declineReason?: string; assistantMessage: string }` (moved verbatim from `lib/ai.ts`)
  - `export function resolveDecision(input: RawToolInput, answering: boolean): AiDecision` — throws `Error` when the final decision is `apply` and `input.spec` is not a non-null object.

- [ ] **Step 1: Write the failing test**

Create `lib/ai/decision.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveDecision } from "./decision";

const SPEC = {
  type: "tshirt",
  gender: "male",
  measurementOverrides: {},
  style: {},
};

describe("resolveDecision", () => {
  it("keeps ask with validated questions", () => {
    const d = resolveDecision(
      {
        decision: "ask",
        assistantMessage: "Tell me:",
        questions: [{ label: "Neckline", options: ["round", "V"] }],
      },
      false,
    );
    expect(d.decision).toBe("ask");
    expect(d.questions).toHaveLength(1);
    expect(d.questions![0].id).toBe("q0");
  });

  it("degrades ask without usable questions to apply when a spec came along", () => {
    const d = resolveDecision(
      { decision: "ask", assistantMessage: "x", questions: [], spec: SPEC },
      false,
    );
    expect(d.decision).toBe("apply");
    expect(d.spec.type).toBe("tshirt");
  });

  it("forces apply when answering, even if the model asks again", () => {
    const d = resolveDecision(
      {
        decision: "ask",
        assistantMessage: "x",
        questions: [{ label: "Neckline", options: ["a", "b"] }],
        spec: SPEC,
      },
      true,
    );
    expect(d.decision).toBe("apply");
    expect(d.questions).toBeUndefined();
  });

  it("throws on apply without a spec object instead of fabricating a default", () => {
    expect(() =>
      resolveDecision({ decision: "apply", assistantMessage: "done" }, false),
    ).toThrow(/spec/);
  });

  it("passes decline through without requiring a spec", () => {
    const d = resolveDecision(
      { decision: "decline", declineReason: "pants", assistantMessage: "no" },
      false,
    );
    expect(d.decision).toBe("decline");
    expect(d.declineReason).toBe("pants");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ai/decision.test.ts`
Expected: FAIL — cannot resolve `./decision`.

- [ ] **Step 3: Implement**

Create `lib/ai/decision.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ai/decision.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/decision.ts lib/ai/decision.test.ts
git commit -m "feat(ai): extract pure decision post-processing with missing-spec guard"
```

---

### Task 5: Sectioned system prompt with explicit ranges (`lib/ai/prompt.ts`)

**Files:**

- Create: `lib/ai/prompt.ts`
- Test: `lib/ai/prompt.test.ts`

**Interfaces:**

- Consumes: `TYPES`, `GENDERS`, `NECKLINES`, `SLEEVES`, `SKIRTS`, `STYLE_LIMITS` from `@/lib/draft/garment`; `MEASUREMENT_RANGES` from `@/lib/measurements`; `PatternState` from `@/lib/types`.
- Produces (used by Task 6):
  - `export function buildSystem(state: PatternState, answering: boolean): string`

- [ ] **Step 1: Write the failing test**

Create `lib/ai/prompt.test.ts` (ranges use an en dash `–`, matching `fmtRange` in the implementation):

```ts
import { describe, it, expect } from "vitest";
import { buildSystem } from "./prompt";
import type { PatternState } from "@/lib/types";
import { STYLE_LIMITS } from "@/lib/draft/garment";
import { MEASUREMENT_RANGES } from "@/lib/measurements";

function state(pieces: number, spec?: object): PatternState {
  return {
    pattern: {
      pieces: Array.from({ length: pieces }, (_, i) => ({ id: `p${i}` })),
      spec,
      sizeTable: { M: { bust: 88 } },
    },
    chat: [],
    conflict: null,
  } as unknown as PatternState;
}

describe("buildSystem", () => {
  it("quotes the validator's real bounds", () => {
    const s = buildSystem(state(0), false);
    const a = STYLE_LIMITS.armholeDeepenCm;
    expect(s).toContain(`armholeDeepenCm: ${a.min}–${a.max} cm`);
    const b = MEASUREMENT_RANGES.bust;
    expect(s).toContain(`bust: ${b.min}–${b.max} cm`);
  });

  it("tells the model to clamp out-of-range values and say so", () => {
    expect(buildSystem(state(0), false)).toContain("# Out-of-range values");
  });

  it("blank pattern gets the from-scratch/underspecified rule", () => {
    const s = buildSystem(state(0), false);
    expect(s).toContain("BLANK pattern");
    expect(s).not.toContain("already applied");
  });

  it("existing spec gets the full-updated-spec rule and embeds the spec JSON", () => {
    const s = buildSystem(state(3, { type: "tshirt" }), false);
    expect(s).toContain("already applied");
    expect(s).not.toContain("BLANK pattern");
    expect(s).toContain('"type":"tshirt"');
  });

  it("answering adds the never-ask-again override", () => {
    expect(buildSystem(state(0), true)).toContain(
      "Do NOT use decision=ask again",
    );
    expect(buildSystem(state(0), false)).not.toContain(
      "Do NOT use decision=ask again",
    );
  });

  it("embeds the size table", () => {
    expect(buildSystem(state(0), false)).toContain('"bust":88');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ai/prompt.test.ts`
Expected: FAIL — cannot resolve `./prompt`.

- [ ] **Step 3: Implement**

Create `lib/ai/prompt.ts`. Every rule from the old flat prompt survives, reorganized into sections; the one new rule is "Out-of-range values". Ranges render from the shared constants:

```ts
import type { PatternState } from "@/lib/types";
import {
  TYPES,
  GENDERS,
  NECKLINES,
  SLEEVES,
  SKIRTS,
  STYLE_LIMITS,
} from "@/lib/draft/garment";
import { MEASUREMENT_RANGES } from "@/lib/measurements";

const fmtRange = (r: { min: number; max: number }) => `${r.min}–${r.max} cm`;

const MEASUREMENT_LINES = Object.entries(MEASUREMENT_RANGES)
  .map(([k, r]) => `  - ${k}: ${fmtRange(r)}`)
  .join("\n");

// Static sections first, per-pattern state last. All numeric bounds render
// from the same constants validateSpec clamps with — the model is never told
// a range the validator doesn't enforce.
const STATIC_SECTIONS = `# Role

You are MoldAI's pattern-drafting engine. You receive natural-language requests about a garment and translate them into a GarmentSpec via the propose_garment tool. You never draw — no SVG, no coordinates, only the spec.

# GarmentSpec

- type: ${TYPES.join(" | ")}. tshirt = knit garment (round neckline, short set-in sleeve, no darts by default); blouse = woven fabric (may have darts, any neckline). Choose tshirt for a t-shirt and blouse for a blouse/shirt.
- gender: ${GENDERS.join(" | ")} — the measurement base. Infer from cues like "men's"/"women's" in any language; no cue -> female.
- measurementOverrides: body measurements in cm that override the size table. Include ONLY what the request explicitly adjusts. Valid ranges:
${MEASUREMENT_LINES}
- style:
  - neckline: ${NECKLINES.join(" | ")}
  - necklineDepthCm: ${fmtRange(STYLE_LIMITS.necklineDepthCm)}
  - sleeve: ${SLEEVES.join(" | ")}
  - skirt (silhouette): ${SKIRTS.join(" | ")}
  - skirtLengthCm: ${fmtRange(STYLE_LIMITS.skirtLengthCm)}
  - darts: boolean
  - seamAllowanceCm: ${fmtRange(STYLE_LIMITS.seamAllowanceCm)}
  - armholeDeepenCm: ${fmtRange(STYLE_LIMITS.armholeDeepenCm)} — deepens the body's armhole; use when asked to increase/lower/deepen the armhole. It only affects the body, so the sleeve cap may stop matching and trigger a seam-conflict warning: that's expected, the user resolves it with the sleeve-fix action.

# Vocabulary mapping

Map the user's wording to catalog tokens regardless of language: neckline "straight"->straight, "V-neck"->V, "round/crew"->round; sleeve "short"->short, "long"->long, "sleeveless"->none; skirt "straight"->straight, "godet"->gore, "A-line"->a-line, "half circle"->half-circle, "full circle"->circle.

# Out-of-range values

If the user asks for a value outside its valid range, set the nearest bound in the spec and say in assistantMessage that the value was limited and to what. Never claim a value was applied when you set a different one.

# Decision policy

- apply: enough detail to draft now. Fill in the COMPLETE, UPDATED spec — never just the delta.
- ask: relevant detail is missing (neckline, sleeve, fit, length, size…). Ask 1 to 4 objective single-choice questions with options from the catalogs above; don't invent measurements or draft. Only use apply once you have enough.
- decline: not a garment this spec can represent (pants, accessories, requests unrelated to a draftable piece). Explain gently in assistantMessage; don't fill in spec.

# Language

Write assistantMessage, and any question labels/options, in the natural language of the user's most recent message — mirror it exactly, never default to a fixed language.`;

export function buildSystem(state: PatternState, answering: boolean): string {
  const isEmpty = state.pattern.pieces.length === 0;
  const lines = [
    "# Current state",
    "",
    isEmpty
      ? 'BLANK pattern, no piece created yet. This is a from-scratch request: build the entire GarmentSpec the garment needs. If the request already provides enough, use apply; but a generic request with only the piece type (e.g. "make a t-shirt" — no gender, size, neckline, sleeve, or fit) is UNDERSPECIFIED: use decision=ask before drafting.'
      : "A spec is already applied (below). Treat the request as an adjustment: start from the current spec and return the ENTIRE UPDATED spec with the requested changes.",
  ];
  if (answering) {
    lines.push(
      "",
      "The user just ANSWERED your clarifying questions (the answers are in their last message). Do NOT use decision=ask again — use apply (or decline if out of scope) with your best understanding of the answers.",
    );
  }
  lines.push(
    "",
    "Size table (cm) for this pattern's active size chart:",
    JSON.stringify(state.pattern.sizeTable),
    "",
    "Current pattern spec:",
    JSON.stringify(state.pattern.spec ?? null),
  );
  return `${STATIC_SECTIONS}\n\n${lines.join("\n")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ai/prompt.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/prompt.ts lib/ai/prompt.test.ts
git commit -m "feat(ai): rewrite system prompt with sections and explicit ranges"
```

---

### Task 6: Wire `proposeGarment` through the new modules; retire `lib/ai.ts`

**Files:**

- Create: `lib/ai/index.ts`
- Delete: `lib/ai.ts`
- Move: `lib/ai.test.ts` → `lib/ai/index.test.ts` (with two adjusted imports and one adjusted case)
- NOT modified: `app/api/patterns/[id]/generate/route.ts` and `route.test.ts` — `@/lib/ai` (import and `vi.mock` specifier alike) resolves to `lib/ai/index.ts` once `lib/ai.ts` is gone.

**Interfaces:**

- Consumes: `buildSystem` (Task 5), `buildHistory` (Task 3), `TOOL`/`RawToolInput` (Task 2), `resolveDecision`/`AiDecision` (Task 4).
- Produces: `export async function proposeGarment(state: PatternState, answering: boolean): Promise<AiDecision>` and `export type { AiDecision }` — the exact public surface `lib/ai.ts` had.

- [ ] **Step 1: Move and adjust the existing test**

```bash
git mv lib/ai.test.ts lib/ai/index.test.ts
```

Then apply three changes to `lib/ai/index.test.ts`:

1. `import type { EditorState } from "./types";` → `import type { EditorState } from "@/lib/types";`
2. `import { proposeGarment } from "./ai";` → `import { proposeGarment } from "./index";`
3. In the case `"answering=true forces apply even if the AI responds ask"`, add a spec to the mocked tool input (the new missing-spec guard makes a spec-less forced apply throw — which is the desired refund path, but this case is about the ask→apply override):

```ts
it("answering=true forces apply even if the AI responds ask", async () => {
  create.mockResolvedValue(
    toolResp({
      decision: "ask",
      assistantMessage: "x",
      questions: [{ label: "Neckline", options: ["a", "b"] }],
      spec: {
        type: "tshirt",
        gender: "male",
        style: {},
        measurementOverrides: {},
      },
    }),
  );
  const d = await proposeGarment(baseState, true);
  expect(d.decision).toBe("apply");
  expect(d.questions).toBeUndefined();
});
```

Also add one new integration-level case at the end of the `describe` (the guard seen through `proposeGarment`):

```ts
it("rejects apply without a spec object (route refunds via its catch)", async () => {
  create.mockResolvedValue(
    toolResp({ decision: "apply", assistantMessage: "done" }),
  );
  await expect(proposeGarment(baseState, false)).rejects.toThrow(/spec/);
});
```

- [ ] **Step 2: Run the moved test to verify it fails**

Run: `npx vitest run lib/ai/index.test.ts`
Expected: FAIL — cannot resolve `./index` (it doesn't exist yet).

- [ ] **Step 3: Create `lib/ai/index.ts` and delete `lib/ai.ts`**

Create `lib/ai/index.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { PatternState } from "@/lib/types";
import { buildSystem } from "./prompt";
import { buildHistory } from "./history";
import { TOOL, type RawToolInput } from "./schema";
import { resolveDecision, type AiDecision } from "./decision";

export type { AiDecision };

export async function proposeGarment(
  state: PatternState,
  answering: boolean,
): Promise<AiDecision> {
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: buildSystem(state, answering),
    tools: [TOOL],
    tool_choice: { type: "tool", name: "propose_garment" },
    messages: buildHistory(state.chat),
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Model did not return a tool_use block");
  }
  return resolveDecision(block.input as RawToolInput, answering);
}
```

Then:

```bash
git rm lib/ai.ts
```

- [ ] **Step 4: Run the moved test to verify it passes**

Run: `npx vitest run lib/ai/index.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Full suite + build**

Run: `npm test`
Expected: PASS — including `app/api/patterns/[id]/generate/route.test.ts`, whose `vi.mock("@/lib/ai")` now resolves to the folder index.

Run: `npm run build`
Expected: clean production build (this is also the TypeScript check — never bare `tsc`).

- [ ] **Step 6: Commit**

```bash
git add lib/ai/index.ts lib/ai/index.test.ts
git commit -m "refactor(ai): split lib/ai.ts into prompt/schema/history/decision modules"
```

(The `git mv`/`git rm` from Steps 1 and 3 are already staged; this commit carries the whole move.)
