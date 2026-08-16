import Anthropic from "@anthropic-ai/sdk";
import { EditorState, GarmentSpec, ClarifyQuestion } from "./types";
import { validateSpec, validateQuestions } from "@/lib/draft/garment";
import {
  MEASUREMENT_RANGES,
  SIZE_TABLE,
  SIZE_TABLE_MASC,
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
    "Decide como o pedido do usuário se traduz em uma GarmentSpec (especificação da peça de roupa). Escolha SEMPRE uma decisão e escreva assistantMessage em português do Brasil.",
  input_schema: {
    type: "object",
    properties: {
      decision: {
        type: "string",
        enum: ["apply", "decline", "ask"],
        description:
          "apply = dá pra modelar já; decline = fora do escopo (calça, acessório…); ask = falta detalhe relevante, faça perguntas antes de desenhar.",
      },
      spec: {
        type: "object",
        description:
          "A GarmentSpec COMPLETA e ATUALIZADA (não só o delta). Preencha SEMPRE que decision=apply — inclua tudo que já existia mais as mudanças pedidas.",
        properties: {
          tipo: {
            type: "string",
            enum: ["blusa", "vestido", "saia", "camiseta"],
          },
          sexo: {
            type: "string",
            enum: ["fem", "masc"],
            description:
              "Sexo/base de medidas. Infira de pistas como 'masculina'/'feminina'/'unissex'. Default fem.",
          },
          measurementOverrides: {
            type: "object",
            description:
              "Overrides numéricos (cm) de medidas do corpo, por nome de medida. Só inclua o que o pedido pede explicitamente ajustar; o resto vem da tabela de tamanhos.",
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
              decote: { type: "string", enum: ["reto", "V", "redondo"] },
              decoteProfundidadeCm: { type: "number" },
              manga: { type: "string", enum: ["sem", "curta", "longa"] },
              saia: {
                type: "string",
                enum: ["reta", "evase", "gode", "meia-roda", "circulo"],
              },
              compSaiaCm: { type: "number" },
              pences: { type: "boolean" },
              folgaCosturaCm: { type: "number" },
              cavaAjusteCm: {
                type: "number",
                description:
                  "Aprofundar a cava do corpo em X cm (0 a 6). Use quando o usuário pedir para aumentar/aprofundar/baixar a cava (ex.: 'aumenta 2cm na cava'). Mexe só no corpo — a manga pode precisar de ajuste depois.",
              },
            },
          },
        },
        required: ["tipo", "sexo", "measurementOverrides", "style"],
      },
      questions: {
        type: "array",
        description:
          "Preencha SOMENTE quando decision=ask. 1 a 4 perguntas objetivas de escolha única, opções vindas do catálogo válido. Não invente medidas nem desenhe.",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Pergunta curta em pt-BR (ex.: 'Gola').",
            },
            options: {
              type: "array",
              items: { type: "string" },
              description: "2 a 6 opções de escolha única.",
            },
            allowOther: {
              type: "boolean",
              description:
                "true se fizer sentido um campo 'outro' de texto livre.",
            },
          },
          required: ["label", "options"],
        },
      },
      declineReason: {
        type: "string",
        description: "Preencha SOMENTE quando decision=decline.",
      },
      assistantMessage: {
        type: "string",
        description:
          "Resposta curta ao usuário no chat, em português, descrevendo o que foi feito ou por que não.",
      },
    },
    required: ["decision", "assistantMessage"],
  },
};

function buildSystem(state: EditorState, answering: boolean): string {
  const currentSpec = state.pattern.spec;
  const isEmpty = state.pattern.pieces.length === 0;
  return [
    "Você é o motor de modelagem da MoldAI. Recebe pedidos em linguagem natural sobre uma peça de roupa e traduz em uma GarmentSpec (tipo + medidas + estilo).",
    "A GarmentSpec tem: tipo (blusa | vestido | saia | camiseta); sexo (fem | masc); measurementOverrides (medidas do corpo em cm, sobrepõem a tabela de tamanhos); style (decote, decoteProfundidadeCm, manga, saia, compSaiaCm, pences, folgaCosturaCm, cavaAjusteCm).",
    "cavaAjusteCm aprofunda a cava do corpo (0 a 6 cm): use quando pedirem para aumentar/baixar a cava. Como mexe só no corpo, a copa da manga pode ficar diferente e gerar um aviso de costura — isso é esperado, o usuário resolve com 'Corrigir manga'.",
    "camiseta = peça de malha (gola redonda, manga montada curta por padrão, sem pences, caimento justo); blusa = tecido plano (pode ter pences, decote reto/V/redondo). Escolha camiseta para t-shirt/camiseta e blusa para blusa/camisa social.",
    "Catálogo de estilos válidos: decote em reto|V|redondo; manga em sem|curta|longa; saia (silhueta) em reta|evase|gode|meia-roda|circulo.",
    "Infira sexo do pedido ('masculina'->masc, 'feminina'->fem, sem pista->fem).",
    isEmpty
      ? "ESTADO ATUAL: molde EM BRANCO, nenhuma peça criada ainda. Este é um pedido do zero: monte a GarmentSpec inteira que a roupa precisa. Se o pedido já trouxer o suficiente, use apply; mas um pedido genérico só com o tipo da peça (ex.: 'faça uma camiseta', sem sexo, tamanho, gola, manga nem caimento) está SUBESPECIFICADO — nesse caso use decision=ask antes de desenhar."
      : "Já existe uma spec aplicada (abaixo). Um pedido de ajuste deve devolver a SPEC INTEIRA ATUALIZADA (não só o delta): parta da spec atual e aplique as mudanças pedidas.",
    "Se o pedido não for uma peça de roupa que esta spec consegue representar (ex.: calça, acessório, pedido genérico sem relação com uma peça modelável), use decision=decline e explique gentilmente em assistantMessage. Não preencha spec nesse caso.",
    answering
      ? "O usuário ACABOU de responder às suas perguntas (as respostas estão na última mensagem do usuário). NÃO use decision=ask de novo — use apply (ou decline se for fora de escopo) com o melhor entendimento das respostas."
      : "Se faltar detalhe relevante pra modelar corretamente (gola, manga, caimento, comprimento, tamanho…), use decision=ask com 1 a 4 perguntas objetivas de escolha única, opções do catálogo válido; não invente medidas nem desenhe nesse caso. Só use apply quando já tiver o suficiente.",
    "",
    "Tabela de tamanhos feminina (cm):",
    JSON.stringify(SIZE_TABLE),
    "Tabela de tamanhos masculina (cm):",
    JSON.stringify(SIZE_TABLE_MASC),
    "",
    "Spec atual do molde:",
    JSON.stringify(currentSpec ?? null),
  ].join("\n");
}

export async function proposeGarment(
  state: EditorState,
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
