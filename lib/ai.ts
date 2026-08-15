import Anthropic from "@anthropic-ai/sdk";
import { EditorState } from "./types";
import { PIECE_PARAM_SCHEMA } from "./geometry";

export interface PieceChange {
  pieceId: string;
  params: Record<string, number>;
}

export interface AiConflict {
  pieceAId: string;
  pieceBId: string;
  diffCm: number;
  title: string;
  description: string;
  suggestion: string;
}

export interface AiDecision {
  decision: "apply" | "conflict" | "decline";
  pieceChanges: PieceChange[];
  conflict?: AiConflict;
  declineReason?: string;
  assistantMessage: string;
}

const TOOL: Anthropic.Tool = {
  name: "propose_pattern_change",
  description:
    "Decide como o pedido do usuário altera o molde. Escolha SEMPRE uma decisão e escreva assistantMessage em português do Brasil.",
  input_schema: {
    type: "object",
    properties: {
      decision: {
        type: "string",
        enum: ["apply", "conflict", "decline"],
        description:
          "apply = ajuste válido sem conflito; conflict = o ajuste faz duas peças não fecharem na costura; decline = o pedido não é um ajuste de molde mapeável.",
      },
      pieceChanges: {
        type: "array",
        description:
          "Peças a alterar e os DELTAS de parâmetros (em px, relativos ao valor atual). Vazio se decision=decline.",
        items: {
          type: "object",
          properties: {
            pieceId: { type: "string", enum: ["frente", "costas", "manga"] },
            params: { type: "object", additionalProperties: { type: "number" } },
          },
          required: ["pieceId", "params"],
        },
      },
      conflict: {
        type: "object",
        description: "Preencha SOMENTE quando decision=conflict.",
        properties: {
          pieceAId: { type: "string", enum: ["frente", "costas", "manga"] },
          pieceBId: { type: "string", enum: ["frente", "costas", "manga"] },
          diffCm: { type: "number" },
          title: { type: "string" },
          description: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["pieceAId", "pieceBId", "diffCm", "title", "description", "suggestion"],
      },
      declineReason: { type: "string", description: "Preencha SOMENTE quando decision=decline." },
      assistantMessage: {
        type: "string",
        description: "Resposta curta ao usuário no chat, em português, descrevendo o que foi feito ou por que não.",
      },
    },
    required: ["decision", "pieceChanges", "assistantMessage"],
  },
};

function buildSystem(state: EditorState): string {
  const current = state.pattern.pieces.map((p) => ({ pieceId: p.id, name: p.name, params: p.params }));
  const isEmpty = current.length === 0;
  return [
    "Você é o motor de modelagem da MoldAI. Recebe pedidos em linguagem natural sobre um molde de vestuário e traduz em ALTERAÇÕES DE PARÂMETROS das peças.",
    "O modelo só conhece três peças: frente, costas e manga. Você só pode criar/alterar essas peças.",
    "Todos os parâmetros são DELTAS em pixels, relativos ao valor ATUAL da peça (positivo aumenta, negativo diminui). Devolva apenas os parâmetros que mudam. Para uma peça que ainda não existe, o valor atual é a forma base (tudo 0), então os deltas são medidos a partir de 0.",
    "Convenções: caseDepth = profundidade da cava; necklineDepth (só frente) = decote em V (0 = sem decote); length = comprimento; sleeveLength = comprimento da manga; seamAllowance = folga de costura; dartSize = pence; shoulderWidth/hemWidth/sleeveWidth = larguras.",
    isEmpty
      ? "ESTADO ATUAL: molde EM BRANCO, nenhuma peça criada ainda. Este é um pedido do zero: GERE as peças que a roupa pedida precisa (escolha entre frente, costas e manga) definindo os parâmetros necessários em pieceChanges, e use decision=apply. Ex.: um vestido/blusa com manga => crie frente, costas e manga; uma peça sem manga => crie apenas frente e costas. Uma peça recém-criada com params vazios já sai na forma base — só inclua deltas para o que o pedido pede explicitamente."
      : "As peças abaixo já existem: ajuste os parâmetros delas conforme o pedido (ou crie uma peça que ainda falte, se o pedido pedir).",
    "Regra de conflito: a cava (caseDepth) da frente e da manga precisam casar. Se um ajuste fizer a diferença passar de ~1 cm entre as peças que se costuram, use decision=conflict, explique e sugira a correção. 1 cm ≈ 5 px.",
    "Se o pedido não for um ajuste de molde mapeável nesses parâmetros (ex.: pergunta genérica, pedido impossível), use decision=decline e explique gentilmente em assistantMessage.",
    "",
    "Esquema de parâmetros (name, min, max em px) por peça:",
    JSON.stringify(PIECE_PARAM_SCHEMA),
    "",
    "Estado atual das peças (params atuais):",
    JSON.stringify(current),
  ].join("\n");
}

export async function proposePatternChange(state: EditorState): Promise<AiDecision> {
  const client = new Anthropic();
  const history = state.chat.slice(-10).map((m) => ({
    role: m.author === "user" ? ("user" as const) : ("assistant" as const),
    content: m.text,
  }));

  const resp = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: buildSystem(state),
    tools: [TOOL],
    tool_choice: { type: "tool", name: "propose_pattern_change" },
    messages: history,
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Model did not return a tool_use block");
  }
  return block.input as AiDecision;
}
