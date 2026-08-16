# Perguntas de esclarecimento no chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando um pedido no chat do editor vier sem detalhe relevante, a IA para e faz 1–4 perguntas de escolha única (com "outro" de texto livre) num card dentro do chat; só depois das respostas o molde é desenhado.

**Architecture:** Reaproveita o caminho único `sendMessage → POST /api/pattern/generate → proposeGarment`. A decisão da IA ganha um terceiro valor `"ask"`: nada é desenhado, o crédito debitado é estornado (igual ao `decline`), e as perguntas voltam anexadas à mensagem de chat da IA (`ChatMessage.questions`). Responder o card compõe as escolhas numa frase em pt-BR e reentra no mesmo fluxo com `answering=true`, flag que proíbe a IA de perguntar de novo (guard no prompt + guard redundante no servidor).

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript, Zustand, `@anthropic-ai/sdk` (`claude-sonnet-5`, forced tool-use), Vitest (env node).

## Global Constraints

- Model id é EXATAMENTE `claude-sonnet-5` — não alterar em `lib/ai.ts`.
- `ANTHROPIC_API_KEY` só em `.env.local` (git-ignored); nunca commitar/imprimir.
- Saída da IA NUNCA é confiada crua: `validateSpec` e o novo `validateQuestions` re-validam/clampam tudo no servidor antes de usar.
- Fluxo de crédito intocado: `debitCredits(cost)` no início; `ask`/`decline`/erro estornam com `refundCredits(cost)`; 402 quando `balance < cost` (sem débito, sem IA). `cost = COSTS.adjust` (1).
- Todo texto de UI/prompt em português do Brasil.
- Sem cor/token novo. Amber = crédito/conflito; olive = ação/estado ativo. O card usa surface/border/olive/olive-tint existentes.
- Não usar Playwright/MCP de browser em nenhuma verificação.

---

## File Structure

- `lib/types.ts` — **Modify.** Novo `ClarifyQuestion`; campo `questions?` em `ChatMessage`.
- `lib/draft/garment.ts` — **Modify.** Novo `validateQuestions` (vizinho de `validateSpec`, sem import de Anthropic → testável isolado).
- `lib/draft/garment.test.ts` — **Modify.** Testes de `validateQuestions`.
- `lib/ai.ts` — **Modify.** `AiDecision` (+`"ask"`, +`questions?`); tool schema (+`"ask"`, +`questions`); `buildSystem(state, answering)`; `proposeGarment(state, answering)` com mapeamento + guard redundante + degradação.
- `lib/ai.test.ts` — **Create.** Testes de `proposeGarment` com o SDK mockado.
- `app/api/pattern/generate/route.ts` — **Modify.** Body `{ message, answering? }`; caminho `ask` (estorna + `status:"clarify"`, sem draft/version bump).
- `vitest.config.ts` — **Modify.** Incluir `app/**/*.test.ts` no glob de testes.
- `app/api/pattern/generate/route.test.ts` — **Create.** Testa refund/clarify com `@/lib/ai` mockado.
- `lib/api-client.ts` — **Modify.** `generate(message, answering?)`; `GenerateResult` +`"clarify"`.
- `lib/store.ts` — **Modify.** `sendMessage(message, opts?)`; tratamento de `"clarify"`; `answering` no retry do paywall.
- `lib/store.test.ts` — **Create.** Testa `sendMessage` (repasse de `answering`, `clarify` não vira erro).
- `components/editor/ClarifyCard.tsx` — **Create.** Card interativo.
- `components/editor/ChatBubble.tsx` — **Modify.** Renderiza `ClarifyCard` quando `message.questions` e `active`.
- `components/editor/ChatPanel.tsx` — **Modify.** Passa `active` (é a última mensagem e não está gerando) pro `ChatBubble`.
- `CLAUDE.md` — **Modify.** Documenta o caminho `ask`.

---

## Task 1: Tipos + `validateQuestions` (trust boundary)

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/draft/garment.ts`
- Test: `lib/draft/garment.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface ClarifyQuestion { id: string; label: string; options: string[]; allowOther: boolean }` (em `lib/types.ts`).
  - `ChatMessage.questions?: ClarifyQuestion[]`.
  - `validateQuestions(raw: unknown): ClarifyQuestion[]` (em `lib/draft/garment.ts`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `lib/draft/garment.test.ts`:

```ts
import { validateQuestions } from "./garment";

describe("validateQuestions", () => {
  it("mantém pergunta válida e deriva id estável", () => {
    const qs = validateQuestions([
      { label: "Gola", options: ["redonda", "V", "careca"], allowOther: true },
    ]);
    expect(qs).toHaveLength(1);
    expect(qs[0].id).toBe("q0");
    expect(qs[0].label).toBe("Gola");
    expect(qs[0].options).toEqual(["redonda", "V", "careca"]);
    expect(qs[0].allowOther).toBe(true);
  });
  it("limita a 4 perguntas", () => {
    const raw = Array.from({ length: 7 }, (_, i) => ({ label: `P${i}`, options: ["a", "b"] }));
    expect(validateQuestions(raw)).toHaveLength(4);
  });
  it("descarta pergunta com menos de 2 opções ou label vazio", () => {
    const qs = validateQuestions([
      { label: "", options: ["a", "b"] },
      { label: "Ok", options: ["só uma"] },
      { label: "Boa", options: ["a", "b"] },
    ]);
    expect(qs.map((q) => q.label)).toEqual(["Boa"]);
  });
  it("corta em 6 opções e limpa strings vazias/duplicadas", () => {
    const qs = validateQuestions([
      { label: "Muitas", options: ["a", "a", "", "b", "c", "d", "e", "f", "g"] },
    ]);
    expect(qs[0].options).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
  it("degrada para lista vazia quando nada é aproveitável", () => {
    expect(validateQuestions("lixo")).toEqual([]);
    expect(validateQuestions([{ label: "x", options: [] }])).toEqual([]);
  });
  it("allowOther default false quando ausente/inválido", () => {
    const qs = validateQuestions([{ label: "P", options: ["a", "b"] }]);
    expect(qs[0].allowOther).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/draft/garment.test.ts`
Expected: FAIL — `validateQuestions is not a function` / import não resolve.

- [ ] **Step 3: Adicionar os tipos em `lib/types.ts`**

Depois de `export type SaiaSilhueta = ...` (perto do topo dos tipos de estilo), adicionar:

```ts
export interface ClarifyQuestion {
  id: string;
  label: string;
  options: string[];
  allowOther: boolean;
}
```

E no `interface ChatMessage`, adicionar o campo opcional (depois de `chips?`):

```ts
  questions?: ClarifyQuestion[];
```

- [ ] **Step 4: Implementar `validateQuestions` em `lib/draft/garment.ts`**

Adicionar o import do tipo na linha de import de `@/lib/types` (incluir `ClarifyQuestion` na lista existente) e a função depois de `validateSpec`:

```ts
export function validateQuestions(raw: unknown): ClarifyQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ClarifyQuestion[] = [];
  for (const item of raw.slice(0, 4)) {
    const q = (item ?? {}) as Record<string, unknown>;
    const label = typeof q.label === "string" ? q.label.trim() : "";
    if (!label) continue;
    const optsRaw = Array.isArray(q.options) ? q.options : [];
    const options: string[] = [];
    for (const o of optsRaw) {
      const s = typeof o === "string" ? o.trim() : "";
      if (s && !options.includes(s)) options.push(s);
      if (options.length === 6) break;
    }
    if (options.length < 2) continue;
    out.push({ id: `q${out.length}`, label, options, allowOther: q.allowOther === true });
  }
  return out;
}
```

(Adicionar `ClarifyQuestion` ao import: `import { ..., ClarifyQuestion } from "@/lib/types";` — a linha de import atual traz `Decote, GarmentSpec, GarmentStyle, GarmentType, MangaLen, SaiaSilhueta, Sexo, SizeLabel`.)

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run lib/draft/garment.test.ts`
Expected: PASS (todos os `validateSpec`/`draftGarment`/`validateQuestions`).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/draft/garment.ts lib/draft/garment.test.ts
git commit -m "feat(types): ClarifyQuestion + validateQuestions (trust boundary)"
```

---

## Task 2: Camada de IA — decisão `ask`

**Files:**
- Modify: `lib/ai.ts`
- Test: `lib/ai.test.ts` (create)

**Interfaces:**
- Consumes: `validateQuestions` e `validateSpec` de `@/lib/draft/garment`; `ClarifyQuestion` de `@/lib/types`.
- Produces:
  - `AiDecision` agora: `{ decision: "apply" | "decline" | "ask"; spec: GarmentSpec; questions?: ClarifyQuestion[]; declineReason?: string; assistantMessage: string }`.
  - `proposeGarment(state: EditorState, answering: boolean): Promise<AiDecision>`.

- [ ] **Step 1: Escrever `lib/ai.test.ts` (falha)**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorState } from "./types";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  const Anthropic = vi.fn(() => ({ messages: { create } }));
  return { default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { proposeGarment } from "./ai";

// handle compartilhado do mock (a factory reusa a mesma fn create)
const create = (new (Anthropic as unknown as new () => { messages: { create: ReturnType<typeof vi.fn> } })()).messages.create;

function toolResp(input: unknown) {
  return { content: [{ type: "tool_use", name: "propose_garment", input }] };
}

const baseState = {
  pattern: { pieces: [], spec: undefined },
  chat: [{ author: "user", text: "quero uma camiseta" }],
} as unknown as EditorState;

describe("proposeGarment", () => {
  beforeEach(() => create.mockReset());

  it("mapeia decision=ask com perguntas validadas", async () => {
    create.mockResolvedValue(
      toolResp({
        decision: "ask",
        assistantMessage: "Me conta mais:",
        questions: [{ label: "Gola", options: ["redonda", "V"], allowOther: true }],
      }),
    );
    const d = await proposeGarment(baseState, false);
    expect(d.decision).toBe("ask");
    expect(d.questions).toHaveLength(1);
    expect(d.questions![0].id).toBe("q0");
  });

  it("degrada ask sem perguntas válidas para apply", async () => {
    create.mockResolvedValue(
      toolResp({ decision: "ask", assistantMessage: "x", questions: [], spec: { tipo: "camiseta", sexo: "masc", style: {}, measurementOverrides: {} } }),
    );
    const d = await proposeGarment(baseState, false);
    expect(d.decision).toBe("apply");
  });

  it("answering=true força apply mesmo se a IA responder ask", async () => {
    create.mockResolvedValue(
      toolResp({ decision: "ask", assistantMessage: "x", questions: [{ label: "Gola", options: ["a", "b"] }] }),
    );
    const d = await proposeGarment(baseState, true);
    expect(d.decision).toBe("apply");
    expect(d.questions).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/ai.test.ts`
Expected: FAIL — `proposeGarment` só aceita 1 arg / não retorna `ask`.

- [ ] **Step 3: Atualizar `AiDecision` e o import em `lib/ai.ts`**

Trocar a interface e o import de validação:

```ts
import { validateSpec, validateQuestions } from "@/lib/draft/garment";
import { EditorState, GarmentSpec, ClarifyQuestion } from "./types";

export interface AiDecision {
  decision: "apply" | "decline" | "ask";
  spec: GarmentSpec;
  questions?: ClarifyQuestion[];
  declineReason?: string;
  assistantMessage: string;
}
```

E em `RawToolInput`, ampliar:

```ts
interface RawToolInput {
  decision: "apply" | "decline" | "ask";
  spec?: unknown;
  questions?: unknown;
  declineReason?: string;
  assistantMessage: string;
}
```

- [ ] **Step 4: Atualizar o TOOL schema**

No `TOOL.input_schema.properties`, trocar o enum de `decision` e adicionar `questions`:

```ts
      decision: {
        type: "string",
        enum: ["apply", "decline", "ask"],
        description:
          "apply = dá pra modelar já; decline = fora do escopo (calça, acessório…); ask = falta detalhe relevante, faça perguntas antes de desenhar.",
      },
```

Adicionar, dentro de `properties` (depois de `spec`):

```ts
      questions: {
        type: "array",
        description:
          "Preencha SOMENTE quando decision=ask. 1 a 4 perguntas objetivas de escolha única, opções vindas do catálogo válido. Não invente medidas nem desenhe.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Pergunta curta em pt-BR (ex.: 'Gola')." },
            options: { type: "array", items: { type: "string" }, description: "2 a 6 opções de escolha única." },
            allowOther: { type: "boolean", description: "true se fizer sentido um campo 'outro' de texto livre." },
          },
          required: ["label", "options"],
        },
      },
```

- [ ] **Step 5: Atualizar `buildSystem` para receber `answering`**

Trocar a assinatura e acrescentar as instruções (perto do bloco de instruções, antes das tabelas):

```ts
function buildSystem(state: EditorState, answering: boolean): string {
```

Adicionar estas duas linhas ao array de instruções (antes da linha `"",` que precede as tabelas):

```ts
    answering
      ? "O usuário ACABOU de responder às suas perguntas (as respostas estão na última mensagem do usuário). NÃO use decision=ask de novo — use apply (ou decline se for fora de escopo) com o melhor entendimento das respostas."
      : "Se faltar detalhe relevante pra modelar corretamente (gola, manga, caimento, comprimento, tamanho…), use decision=ask com 1 a 4 perguntas objetivas de escolha única, opções do catálogo válido; não invente medidas nem desenhe nesse caso. Só use apply quando já tiver o suficiente.",
```

- [ ] **Step 6: Atualizar `proposeGarment`**

Trocar a assinatura, a chamada a `buildSystem`, e o mapeamento final:

```ts
export async function proposeGarment(state: EditorState, answering: boolean): Promise<AiDecision> {
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

  // Guard redundante à instrução do prompt: respondendo, nunca voltar a perguntar.
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
    // sem pergunta aproveitável → desenha com defaults
    return { decision: "apply", spec: validateSpec(input.spec), assistantMessage: input.assistantMessage };
  }

  const decision = input.decision === "ask" ? "apply" : input.decision;
  return {
    decision,
    spec: validateSpec(input.spec),
    declineReason: input.declineReason,
    assistantMessage: input.assistantMessage,
  };
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run lib/ai.test.ts`
Expected: PASS (3/3).

- [ ] **Step 8: Commit**

```bash
git add lib/ai.ts lib/ai.test.ts
git commit -m "feat(ai): decisão ask com perguntas validadas e guard answering"
```

---

## Task 3: Rota `generate` — caminho `ask` (estorno + clarify)

**Files:**
- Modify: `app/api/pattern/generate/route.ts`
- Modify: `vitest.config.ts`
- Test: `app/api/pattern/generate/route.test.ts` (create)

**Interfaces:**
- Consumes: `proposeGarment(state, answering)` de `@/lib/ai`; `resetState`, `getState` de `@/lib/mock-data`.
- Produces: resposta JSON `{ status: "clarify", state }` quando a IA pergunta; body de entrada aceita `answering?: boolean`.

- [ ] **Step 1: Incluir testes de `app/` no vitest**

Em `vitest.config.ts`, trocar o `include`:

```ts
  test: { environment: "node", include: ["lib/**/*.test.ts", "app/**/*.test.ts"] },
```

- [ ] **Step 2: Escrever `app/api/pattern/generate/route.test.ts` (falha)**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai", () => ({ proposeGarment: vi.fn() }));

import { POST } from "./route";
import { proposeGarment } from "@/lib/ai";
import { resetState, getState } from "@/lib/mock-data";

const mockPropose = proposeGarment as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://test/api/pattern/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/pattern/generate — ask", () => {
  beforeEach(() => {
    resetState();
    mockPropose.mockReset();
  });

  it("ask estorna o crédito, não desenha nem versiona, e devolve clarify", async () => {
    const balanceBefore = getState().credits.balance;
    const versionBefore = getState().pattern.version;
    mockPropose.mockResolvedValue({
      decision: "ask",
      spec: { tipo: "camiseta", sexo: "masc", style: {}, measurementOverrides: {} },
      questions: [{ id: "q0", label: "Gola", options: ["redonda", "V"], allowOther: true }],
      assistantMessage: "Me conta mais:",
    });

    const res = await POST(req({ message: "quero uma camiseta" }));
    const json = await res.json();

    expect(json.status).toBe("clarify");
    expect(getState().credits.balance).toBe(balanceBefore); // debitou e estornou
    expect(getState().pattern.version).toBe(versionBefore); // sem bump
    expect(getState().pattern.pieces).toHaveLength(0); // nada desenhado
    const last = getState().chat[getState().chat.length - 1];
    expect(last.author).toBe("ai");
    expect(last.questions).toHaveLength(1);
  });

  it("repassa answering ao proposeGarment", async () => {
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: { tipo: "camiseta", sexo: "masc", style: {}, measurementOverrides: {} },
      assistantMessage: "Pronto",
    });
    await POST(req({ message: "gola redonda, manga curta", answering: true }));
    expect(mockPropose).toHaveBeenCalledWith(expect.anything(), true);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run app/api/pattern/generate/route.test.ts`
Expected: FAIL — rota ainda não trata `ask` (status vem `error` ou `ok`), e `proposeGarment` é chamado com 1 arg.

- [ ] **Step 4: Atualizar a rota**

Substituir o corpo de `app/api/pattern/generate/route.ts`:

```ts
import { NextResponse } from "next/server";
import {
  addMessage,
  applyGarmentSpec,
  bumpVersion,
  debitCredits,
  getState,
  refundCredits,
} from "@/lib/mock-data";
import { COSTS } from "@/lib/types";
import { proposeGarment } from "@/lib/ai";

export async function POST(request: Request) {
  const { message, answering } = (await request.json()) as { message: string; answering?: boolean };
  const trimmed = message.trim();
  const state = getState();
  const cost = COSTS.adjust;

  if (state.credits.balance < cost) {
    return NextResponse.json(
      { status: "insufficient_credits", required: cost, balance: state.credits.balance },
      { status: 402 },
    );
  }

  addMessage({ id: `msg-${Date.now()}-u`, author: "user", text: trimmed, createdAt: Date.now() });
  debitCredits(cost);

  try {
    const decision = await proposeGarment(getState(), answering === true);

    if (decision.decision === "ask") {
      addMessage({
        id: `msg-${Date.now()}-ai`,
        author: "ai",
        text: decision.assistantMessage || "Pra acertar a modelagem, me responde:",
        questions: decision.questions,
        createdAt: Date.now(),
      });
      refundCredits(cost);
      return NextResponse.json({ status: "clarify", state: getState() });
    }

    if (decision.decision === "decline") {
      addMessage({
        id: `msg-${Date.now()}-ai`,
        author: "ai",
        text: decision.assistantMessage || decision.declineReason || "Não consegui aplicar esse pedido.",
        createdAt: Date.now(),
      });
      refundCredits(cost);
      return NextResponse.json({ status: "declined", state: getState() });
    }

    applyGarmentSpec(decision.spec);
    bumpVersion();
    addMessage({
      id: `msg-${Date.now()}-ai`,
      author: "ai",
      text: decision.assistantMessage,
      chips: [{ label: `−${cost} crédito`, tone: "credit" }],
      createdAt: Date.now(),
    });
    return NextResponse.json({ status: "ok", state: getState() });
  } catch {
    refundCredits(cost);
    return NextResponse.json({ status: "error", state: getState() });
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run app/api/pattern/generate/route.test.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts app/api/pattern/generate/route.ts app/api/pattern/generate/route.test.ts
git commit -m "feat(api): generate trata ask (estorno + clarify) e repassa answering"
```

---

## Task 4: Cliente — `api-client` + `store`

**Files:**
- Modify: `lib/api-client.ts`
- Modify: `lib/store.ts`
- Test: `lib/store.test.ts` (create)

**Interfaces:**
- Consumes: `POST /api/pattern/generate` com `{ message, answering }`; `status:"clarify"` na resposta.
- Produces:
  - `generate(message: string, answering?: boolean): Promise<GenerateResult>`.
  - `GenerateResult` inclui `status:"clarify"`.
  - `sendMessage(message: string, opts?: { answering?: boolean }): Promise<void>`.

- [ ] **Step 1: Escrever `lib/store.test.ts` (falha)**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorState } from "./types";

vi.mock("./api-client", () => ({
  fetchPattern: vi.fn(),
  generate: vi.fn(),
  resetPattern: vi.fn(),
  graduate: vi.fn(),
  resolveConflict: vi.fn(),
  purchase: vi.fn(),
}));

import * as api from "./api-client";
import { useEditorStore } from "./store";

const genMock = api.generate as unknown as ReturnType<typeof vi.fn>;

function emptyState(): EditorState {
  return {
    pattern: { id: "p", name: "Novo molde", version: 0, savedAgo: "", baseSize: "M", unit: "cm", sizesApplied: [], sizesPending: [], pieces: [] },
    chat: [{ id: "m1", author: "ai", text: "Me conta mais:", questions: [{ id: "q0", label: "Gola", options: ["a", "b"], allowOther: false }], createdAt: 1 }],
    credits: { plan: "atelier", planLabel: "Ateliê", balance: 100, total: 500, renewsInDays: 10 },
    conflict: null,
  };
}

describe("store.sendMessage", () => {
  beforeEach(() => {
    genMock.mockReset();
    useEditorStore.setState({ selectedPieceId: null, generationStatus: "idle" });
  });

  it("repassa answering e trata clarify sem erro nem seleção de peça", async () => {
    genMock.mockResolvedValue({ status: "clarify", state: emptyState() });
    await useEditorStore.getState().sendMessage("gola redonda", { answering: true });

    expect(genMock).toHaveBeenCalledWith("gola redonda", true);
    expect(useEditorStore.getState().generationStatus).toBe("idle");
    expect(useEditorStore.getState().selectedPieceId).toBeNull();
    const last = useEditorStore.getState().chat.at(-1)!;
    expect(last.questions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/store.test.ts`
Expected: FAIL — `generate` chamado com 1 arg / `sendMessage` não aceita `opts`.

- [ ] **Step 3: Atualizar `lib/api-client.ts`**

Trocar o tipo `GenerateResult` e a função `generate`:

```ts
export type GenerateResult =
  | { status: "ok" | "conflict" | "error" | "declined" | "clarify"; state: EditorState }
  | { status: "insufficient_credits"; required: number; balance: number };
```

```ts
export function generate(message: string, answering?: boolean): Promise<GenerateResult> {
  return postJson<GenerateResult>("/api/pattern/generate", { message, answering });
}
```

- [ ] **Step 4: Atualizar `sendMessage` em `lib/store.ts`**

Trocar a assinatura na interface `EditorStore`:

```ts
  sendMessage: (message: string, opts?: { answering?: boolean }) => Promise<void>;
```

Trocar a implementação de `sendMessage` (o `result` de `clarify` já traz o `state` com o card no chat; tratamos como sucesso sem selecionar peça):

```ts
  sendMessage: async (message: string, opts?: { answering?: boolean }) => {
    if (!message.trim()) return;
    const requestId = get().generationRequestId + 1;
    set((s) => ({
      generationStatus: "generating",
      generationStepIndex: 0,
      generationRequestId: requestId,
      chat: [
        ...s.chat,
        { id: `optimistic-${requestId}`, author: "user", text: message, createdAt: Date.now() },
      ],
    }));
    const stepTimer = setInterval(() => {
      set((s) => ({ generationStepIndex: Math.min(s.generationStepIndex + 1, GENERATION_STEPS.length - 1) }));
    }, 320);

    const result = await api.generate(message, opts?.answering);
    clearInterval(stepTimer);

    if (get().generationRequestId !== requestId) return; // canceled

    if (result.status === "insufficient_credits") {
      set((s) => ({
        generationStatus: "idle",
        chat: s.chat.filter((m) => !m.id.startsWith("optimistic-")),
        paywall: {
          open: true,
          required: result.required,
          balance: result.balance,
          actionLabel: "esse ajuste",
          retry: () => get().sendMessage(message, opts),
        },
      }));
      return;
    }

    applyState(set, result.state);
    const shouldSelectFirst = !get().selectedPieceId && result.state.pattern.pieces.length > 0;
    set({
      generationStatus: result.status === "error" ? "error" : "idle",
      ...(shouldSelectFirst ? { selectedPieceId: result.state.pattern.pieces[0].id } : {}),
    });
  },
```

(Observação: `clarify` cai no fluxo padrão — `applyState` aplica o chat com o card, `shouldSelectFirst` é falso porque `pieces` continua vazio, e `generationStatus` vira `idle`. O único ajuste funcional é passar `opts?.answering` e preservar `opts` no `retry`.)

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run lib/store.test.ts`
Expected: PASS (1/1).

- [ ] **Step 6: Commit**

```bash
git add lib/api-client.ts lib/store.ts lib/store.test.ts
git commit -m "feat(store): sendMessage aceita answering e trata clarify"
```

---

## Task 5: UI — `ClarifyCard` + integração no chat

**Files:**
- Create: `components/editor/ClarifyCard.tsx`
- Modify: `components/editor/ChatBubble.tsx`
- Modify: `components/editor/ChatPanel.tsx`

**Interfaces:**
- Consumes: `ChatMessage.questions` (Task 1); `sendMessage(message, { answering: true })` (Task 4).
- Produces: card interativo renderizado dentro da bolha da IA quando `message.questions` e a bolha é a ativa.

Sem teste unitário (ambiente vitest é `node`, sem jsdom; componentes do projeto não têm testes). Verificação por `build`/`lint`/manual.

- [ ] **Step 1: Criar `components/editor/ClarifyCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ClarifyQuestion } from "@/lib/types";
import { useEditorStore } from "@/lib/store";

const OTHER = "__other__";

export function ClarifyCard({ questions }: { questions: ClarifyQuestion[] }) {
  const sendMessage = useEditorStore((s) => s.sendMessage);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const answerFor = (q: ClarifyQuestion): string | null => {
    const c = choice[q.id];
    if (!c) return null;
    if (c === OTHER) {
      const t = (other[q.id] ?? "").trim();
      return t ? t : null;
    }
    return c;
  };

  const allAnswered = questions.every((q) => answerFor(q) !== null);

  const gerar = () => {
    const frase = questions.map((q) => `${q.label}: ${answerFor(q)}`).join(", ");
    void sendMessage(frase, { answering: true });
  };

  const gerarAssimMesmo = () => void sendMessage("pode gerar com os padrões", { answering: true });

  return (
    <div className="max-w-[92%] bg-surface border border-border rounded-[12px_12px_12px_3px] p-[13px] flex flex-col gap-[14px]">
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-[7px]">
          <span className="text-[12.5px] font-semibold text-ink">{q.label}</span>
          <div className="flex flex-wrap gap-[6px]">
            {q.options.map((opt) => {
              const sel = choice[q.id] === opt;
              return (
                <button
                  key={opt}
                  onClick={() => setChoice((s) => ({ ...s, [q.id]: opt }))}
                  className={[
                    "text-[12px] px-[10px] py-[5px] rounded-pill border transition-colors",
                    sel ? "bg-olive-tint border-olive-border text-olive-dark" : "bg-surface border-border text-muted-2 hover:bg-surface-alt",
                  ].join(" ")}
                >
                  {opt}
                </button>
              );
            })}
            {q.allowOther && (
              <button
                onClick={() => setChoice((s) => ({ ...s, [q.id]: OTHER }))}
                className={[
                  "text-[12px] px-[10px] py-[5px] rounded-pill border transition-colors",
                  choice[q.id] === OTHER ? "bg-olive-tint border-olive-border text-olive-dark" : "bg-surface border-border text-muted-2 hover:bg-surface-alt",
                ].join(" ")}
              >
                outro
              </button>
            )}
          </div>
          {q.allowOther && choice[q.id] === OTHER && (
            <input
              autoFocus
              value={other[q.id] ?? ""}
              onChange={(e) => setOther((s) => ({ ...s, [q.id]: e.target.value }))}
              placeholder="descreva…"
              className="text-[12.5px] px-[9px] py-[6px] rounded-item border border-border bg-surface-alt outline-none focus:border-olive-border"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-[12px] pt-[2px]">
        <button
          disabled={!allAnswered}
          onClick={gerar}
          className={[
            "text-[13px] font-semibold px-[14px] py-[8px] rounded-btn transition-colors",
            allAnswered ? "bg-olive text-[#f7f7f2] hover:bg-olive-dark" : "bg-disabled-border text-disabled cursor-not-allowed",
          ].join(" ")}
        >
          Gerar molde
        </button>
        <button onClick={gerarAssimMesmo} className="text-[12px] text-muted hover:text-muted-2 underline underline-offset-2">
          gerar assim mesmo
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Renderizar o card no `ChatBubble`**

Em `components/editor/ChatBubble.tsx`, importar e ramificar. Trocar a assinatura e adicionar o ramo antes do render normal da bolha da IA:

```tsx
import { ChatMessage } from "@/lib/types";
import { ClarifyCard } from "./ClarifyCard";

export function ChatBubble({ message, active = false }: { message: ChatMessage; active?: boolean }) {
  if (message.author === "user") {
    return (
      <div className="self-end max-w-[88%] bg-olive text-[#f7f7f2] text-[13px] leading-[1.45] px-[13px] py-[10px] rounded-[12px_12px_3px_12px]">
        {message.text}
      </div>
    );
  }

  if (message.questions && message.questions.length > 0) {
    return (
      <div className="flex flex-col gap-[8px]">
        <div className="max-w-[92%] text-[13px] leading-[1.45] px-[13px] py-[10px] rounded-[12px_12px_12px_3px] border bg-paper border-border">
          {message.text}
        </div>
        {active ? (
          <ClarifyCard questions={message.questions} />
        ) : (
          <div className="max-w-[92%] text-[12px] text-muted italic px-[13px]">Perguntas respondidas.</div>
        )}
      </div>
    );
  }

  const isConflict = message.tone === "conflict";
  // ...restante inalterado
```

(Manter o resto do componente — bloco `isConflict`/chips — exatamente como está.)

- [ ] **Step 3: Passar `active` a partir do `ChatPanel`**

Em `components/editor/ChatPanel.tsx`, no `.map`, marcar como ativa apenas a última mensagem quando não está gerando:

```tsx
        {chat.map((message, i) => (
          <ChatBubble
            key={message.id}
            message={message}
            active={i === chat.length - 1 && generationStatus !== "generating"}
          />
        ))}
```

- [ ] **Step 4: Verificar build, lint e types**

Run: `npm run lint && npm run build`
Expected: sem erros de ESLint; build TypeScript verde.

- [ ] **Step 5: Verificação manual (registrar no relatório, não automatizar)**

`npm run dev`, abrir `http://localhost:3000`:
- "quero uma camiseta masculina" → aparece o card (sem debitar crédito); escolher opções habilita "Gerar molde"; gerar desenha o molde e debita 1.
- "gerar assim mesmo" → desenha com defaults.
- Pedido detalhado ("camiseta masculina M gola redonda manga curta") → desenha direto, sem card.

- [ ] **Step 6: Commit**

```bash
git add components/editor/ClarifyCard.tsx components/editor/ChatBubble.tsx components/editor/ChatPanel.tsx
git commit -m "feat(ui): ClarifyCard interativo no chat"
```

---

## Task 6: Docs + verificação final

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: documentação alinhada ao comportamento novo.

- [ ] **Step 1: Atualizar o parágrafo do `generate` no `CLAUDE.md`**

No parágrafo que começa em `- \`POST /api/pattern/generate\``, incorporar o terceiro caminho. Acrescentar, depois da frase que descreve `apply`/`decline`, algo como:

> `proposeGarment` agora também pode retornar `decision: "ask"`: quando o pedido está vago, a IA devolve `questions` (1–4 perguntas de escolha única, validadas/clampadas por `validateQuestions` em `lib/draft/garment.ts` — trust boundary, igual a `validateSpec`) em vez de desenhar; a rota anexa essas perguntas à mensagem de chat da IA (`ChatMessage.questions`), **estorna o crédito** (como o `decline`) e responde `status: "clarify"` — sem `applyGarmentSpec` nem `bumpVersion`. O cliente renderiza `ClarifyCard`; ao responder, `sendMessage(frase, { answering: true })` reenvia as escolhas em texto natural, e a flag `answering` (repassada até `proposeGarment` e reforçada por um guard no servidor) impede a IA de perguntar de novo.

- [ ] **Step 2: Suíte completa + lint + build**

Run: `npm test && npm run lint && npm run build`
Expected: todos os testes verdes (incluindo os novos de `validateQuestions`, `proposeGarment`, rota e store), lint 0 problemas, build limpo.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: caminho ask (perguntas de esclarecimento) no generate"
```

---

## Self-Review (autor do plano)

**Cobertura da spec:**
- Gatilho "sempre que faltar detalhe" (criação ou ajuste) → Task 2 (instrução do prompt, sem restrição a molde vazio). ✅
- Perguntar é de graça (estorno) → Task 3 (`refundCredits` no `ask`). ✅
- Card 1–4 perguntas, escolha única + "outro" + "Gerar molde"/"gerar assim mesmo" → Task 5. ✅
- Envio em texto natural com `answering=true` → Task 4 (compõe frase) + Task 2 (guard). ✅
- Trust boundary `validateQuestions` (≤4, 2–6 opções, degrada p/ apply) → Task 1 + Task 2. ✅
- Guard anti-loop no prompt e no servidor → Task 2. ✅
- Casos de borda (ask sem perguntas → apply; answering ignora ask; msg nova torna card inerte; crédito insuficiente na geração final; erro no ask) → Task 2 (degrada/guard), Task 5 (`active`), Task 4 (retry preserva `opts`), Task 3 (`catch` estorna). ✅
- Docs no CLAUDE.md → Task 6. ✅

**Placeholders:** nenhum — todo passo tem código/comando/saída esperada.

**Consistência de tipos:** `ClarifyQuestion`/`ChatMessage.questions` (T1) usados por `validateQuestions` (T1), `AiDecision.questions` (T2), rota (T3), `ClarifyCard`/`ChatBubble` (T5). `proposeGarment(state, answering)` definido em T2 e chamado em T3. `generate(message, answering?)`/`sendMessage(message, opts?)` definidos em T4 e usados em T5. `GenerateResult` +`"clarify"` (T4) consumido pelo fluxo padrão do `sendMessage`. Sem divergência de nomes.
