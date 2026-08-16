# Perguntas de esclarecimento no chat do editor

## Problema

Hoje um pedido vago no chat ("quero uma camiseta masculina") vai direto pro
`generate`: a IA preenche a `GarmentSpec` inteira com defaults e desenha o molde
na hora. O usuário não tem chance de dizer gola, manga, caimento, comprimento ou
tamanho antes — o resultado sai "chutado". Queremos que, **quando faltar detalhe
relevante**, a IA pare e faça perguntas objetivas de escolha dentro do chat
(estilo do card de perguntas do Claude) e só desenhe depois das respostas.

## Escopo

- Gatilho: a IA pergunta **sempre que faltar detalhe relevante** — tanto na
  criação de um molde novo quanto em ajustes de um molde existente. Quem julga a
  ambiguidade é a IA (não uma heurística no cliente).
- Custo: **perguntar é de graça.** Quando a IA responde com perguntas, o crédito
  debitado no início do request é estornado (mesmo padrão do `decline` atual). Só
  a geração final (depois das respostas) custa `COSTS.adjust` (1).
- Formato: um único card no chat com **1 a 4 perguntas**, cada uma de **escolha
  única** entre opções vindas do catálogo real de estilos, mais um campo **"outro"
  de texto livre** por pergunta. Um botão **"Gerar molde"** envia todas as
  respostas de uma vez; um atalho **"gerar assim mesmo"** pula e aceita os padrões.
- Envio das respostas: as escolhas viram uma **frase em linguagem natural** e
  passam pela IA de novo (segunda passada) com uma flag `answering=true` que
  **proíbe** a IA de perguntar outra vez — ela aplica com o melhor entendimento.

## Fora de escopo

- Payload estruturado de respostas (id→valor mapeado no servidor sem 2ª IA) —
  decidido contra; ficamos no round-trip em texto natural.
- Endpoint dedicado `/clarify` — reaproveitamos o único `generate`.
- Persistir perguntas/respostas além do store em memória (reset no restart do
  servidor, como todo o resto do mock).
- Multi-seleção por pergunta, ou mais de 4 perguntas.

## Arquitetura

Reaproveita o caminho único `sendMessage → POST /api/pattern/generate →
proposeGarment`. A decisão da IA ganha um terceiro valor `"ask"`; nesse caso
nenhum molde é desenhado, o crédito é estornado e as perguntas voltam anexadas à
mensagem de chat da IA. Responder o card compõe as escolhas numa mensagem normal
e reentra no mesmo fluxo com `answering=true`.

### 1. Tipos (`lib/types.ts`)

```ts
export interface ClarifyQuestion {
  id: string; // slug estável p/ key/rótulo, ex.: "gola"
  label: string; // pergunta curta em pt-BR
  options: string[]; // 2–6 opções de escolha única
  allowOther: boolean; // mostra campo "outro" de texto livre
}
```

`ChatMessage` ganha `questions?: ClarifyQuestion[]`. Uma bolha da IA que carrega
`questions` é renderizada como card interativo.

### 2. Camada de IA (`lib/ai.ts`)

- `AiDecision.decision`: `"apply" | "decline" | "ask"`.
- `AiDecision` ganha `questions?: ClarifyQuestion[]` (preenchido só quando `ask`).
- Tool schema (`propose_garment`): enum de `decision` ganha `"ask"`; novo campo
  `questions` (array de objetos `{ label, options[], allowOther }`).
- `proposeGarment(state, answering: boolean)`:
  - `buildSystem` recebe `answering`. Instrução nova: _"Se faltar detalhe
    relevante pra modelar corretamente (gola, manga, caimento, comprimento,
    tamanho…), use `decision=ask` com 1 a 4 perguntas objetivas de escolha única,
    com opções do catálogo válido; não invente medidas nem desenhe."_ Quando
    `answering=true`: _"O usuário já respondeu às perguntas; NÃO pergunte de novo
    — use `apply` (ou `decline` se for fora de escopo) com o melhor entendimento."_
  - O histórico enviado à IA continua sendo `state.chat` (as respostas já entraram
    como mensagem do usuário antes do request, como hoje).
- **Trust boundary:** a saída da IA nunca é confiada crua. Um `validateQuestions`
  (em `lib/ai.ts` ou `lib/draft/garment.ts`, junto de `validateSpec`) clampa:
  no máx. 4 perguntas; cada uma com `label` string não-vazia, `options` de 2 a 6
  strings não-vazias, `allowOther` booleano; descarta perguntas inválidas; se
  sobrar zero pergunta válida, a decisão degrada para `apply` (não trava o fluxo).
  `id` é derivado no servidor (slug do label + índice), não vem da IA.

### 3. Rota (`app/api/pattern/generate/route.ts`)

- Body: `{ message: string; answering?: boolean }`.
- Fluxo: debita `COSTS.adjust`, chama `proposeGarment(getState(), answering)`.
  - `decision === "ask"`: adiciona mensagem da IA com `questions` (via
    `addMessage`), **estorna o crédito**, retorna `{ status: "clarify", state }`.
    Não faz `applyGarmentSpec`, não faz `bumpVersion`.
  - `apply` / `decline` / `error` / `insufficient_credits`: inalterados.

### 4. Cliente (`lib/api-client.ts`, `lib/store.ts`)

- `api-client`: `generate(message, answering?: boolean)` manda `{ message,
answering }`. `GenerateResult` ganha o status `"clarify"` (carrega `state`).
- `store.sendMessage(message: string, opts?: { answering?: boolean })`:
  - Repassa `opts.answering` pro `api.generate`.
  - `"clarify"` é tratado como sucesso silencioso: aplica `state` (o card já vem
    no chat), `generationStatus: "idle"`, **não** seleciona peça nem trata como
    erro. Nenhuma peça nova é esperada.
  - `retry` do paywall preserva o `answering` original (se o crédito faltar bem
    na hora de gerar de verdade).

### 5. UI (`components/editor/ClarifyCard.tsx` + `ChatBubble.tsx`)

- `ChatBubble`: quando `message.questions` existe **e** essa é a última mensagem
  do chat **e** não há geração em curso, renderiza `<ClarifyCard/>`. Caso
  contrário (card superado por um turno novo, ou gerando), renderiza inerte
  (somente leitura, sem botões ativos).
- `ClarifyCard`:
  - Estado local: escolha selecionada por pergunta + texto "outro" por pergunta.
  - Layout conforme o preview aprovado: rótulo + radios; se `allowOther`, um radio
    "outro" com input de texto ao lado; rodapé com **"Gerar molde"** (primário,
    olive) e **"gerar assim mesmo"** (link fantasma).
  - "Gerar molde": compõe `"<label>: <escolha>"` de cada pergunta numa frase
    (juntando as respostas; usa o texto do "outro" quando essa opção estiver
    marcada) e chama `sendMessage(frase, { answering: true })`.
  - "gerar assim mesmo": `sendMessage("pode gerar com os padrões", { answering:
true })`.
  - Só habilita "Gerar molde" quando toda pergunta tem resposta (ou "outro"
    preenchido); "gerar assim mesmo" está sempre disponível.
- O card usa os mesmos tokens do design (surface/border/olive/olive-tint); não
  introduz cor nova. Amber continua reservado a crédito/conflito.

### 6. Docs (`CLAUDE.md`)

Atualizar o parágrafo que descreve o `POST /api/pattern/generate` e o
`proposeGarment` para incluir o terceiro caminho `ask` (perguntas + estorno, sem
draft/version bump), o campo `questions` em `ChatMessage`, e a flag `answering`
que impede novo loop de perguntas.

## Tratamento de erros / casos de borda

- IA devolve `ask` sem perguntas válidas → `validateQuestions` degrada para
  `apply` (desenha com defaults) em vez de travar.
- IA devolve `ask` mesmo com `answering=true` (desobedecendo) → o servidor
  ignora e força `apply` quando `answering=true` (guard redundante à instrução).
- Usuário digita uma mensagem nova em vez de responder o card → é um turno normal;
  o card antigo deixa de ser o último e renderiza inerte.
- Crédito insuficiente na geração final → paywall normal, com `retry` que reenvia
  a frase composta com `answering=true`.
- Erro/parse da IA no caminho `ask` → mesmo `catch` de hoje: estorna e
  `status: "error"`.

## Testes (vitest)

- `validateQuestions`: clampa >4 perguntas; descarta pergunta com <2 ou >6
  opções, label vazio; degrada p/ `apply` quando zero pergunta válida.
- `proposeGarment` (com Anthropic mockado): mapeia `decision=ask` → `AiDecision`
  com `questions` validadas; `answering=true` não retorna `ask`.
- Rota `generate`: `ask` estorna o crédito (saldo volta ao inicial), não faz
  `bumpVersion`, não cria peças, retorna `status: "clarify"`, e a última mensagem
  do chat carrega `questions`.
- Store `sendMessage`: `opts.answering=true` chega ao `api.generate`; `"clarify"`
  não seta `error` nem seleciona peça.

## Verificação manual

`npm run dev` → "quero uma camiseta masculina" deve abrir o card (gola/manga/
caimento/tamanho) sem debitar crédito; escolher opções + "Gerar molde" desenha o
molde e debita 1; "gerar assim mesmo" desenha com defaults; um pedido já
detalhado ("camiseta masculina M gola redonda manga curta") desenha direto sem
card.
