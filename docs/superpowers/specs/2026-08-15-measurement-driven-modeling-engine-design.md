# Motor de modelagem por medidas reais — design

## Contexto

Hoje o "motor de modelagem" da MoldAI é ilustrativo: cada peça guarda `params: Record<string, number>` (deltas em px) e `lib/geometry.ts` tem uma função hardcoded por peça (`frenteGeometry`, `costasGeometry`, `mangaGeometry`) que aplica esses deltas a uma forma-base desenhada à mão, em posições fixas dentro de um viewBox 620×380. A IA (`lib/ai.ts`) só conhece três ids de peça (`frente`/`costas`/`manga`) via `enum`, e por isso recusa qualquer vestuário que não seja blusa/vestido (ex.: uma saia godê é recusada porque não há peça de saia nem parâmetros para ela).

O objetivo desta mudança é substituir esse motor ilustrativo por um **engine de drafting por medidas reais** (modelagem plana): a geometria da peça é **traçada a partir de medidas do corpo em cm**, usando fórmulas reais de modelagem, em vez de deltas sobre formas prontas. Isso permite gerar diversos tipos de peça de forma coerente e abre caminho para graduação real por tabela de medidas.

Este design substitui, na prática, todo o miolo de `lib/geometry.ts` e o contrato da IA em `lib/ai.ts`, e muda como a peça guarda dados em `lib/types.ts`/`lib/mock-data.ts`.

## Decisões confirmadas (com o usuário)

1. **Fidelidade:** modelagem por medidas reais (engine de drafting), não mais deltas sobre forma pronta.
2. **Primeiro corte de peças:** saia (reta / evasê / godê / meia-roda / círculo) **+ refazer frente/costas/manga por medidas**, tudo no mesmo engine (nada de dois motores convivendo).
3. **Fonte das medidas:** tabela padrão por tamanho (PP–GG, base ABNT) preenche o default; o usuário/IA pode **sobrescrever medidas específicas pelo chat**.
4. **Operação da IA:** **spec-based re-draft** — a IA sempre devolve a _especificação desejada_ (tipo + overrides de medida + estilo) e o engine re-traça tudo. Ajustes são uma nova spec derivada da spec atual + pedido. (Delta-based foi rejeitado.)

## Escopo

**Dentro:** blocos de drafting `corpo-frente`, `corpo-costas`, `manga`, `saia`; estilos de saia reta/evasê/godê/meia-roda/círculo; decote reto/V/redondo; manga sem/curta/longa; tabela de medidas PP–GG; override de medidas via chat; contrato de IA spec-based; auto-layout do canvas; ficha de detalhes flexível; graduação re-traçando por linha da tabela; check de costura (cava × copa) no servidor.

**Fora (próximas specs):** calça (o gancho é o mais difícil de acertar); variações avançadas de manga (bufante, raglã); decotes/modelagens complexas; encaixe real (nesting) no plano de corte; upload/importação de medidas.

**Explicitamente inalterado:** paywall e fluxo de créditos (`lib/store.ts` retry-thunk); rotas `billing/purchase`; overlay de geração; append otimista/cancel no `sendMessage`.

## 1. Modelo de dados (`lib/types.ts`)

### Measurements (nível do pattern — um corpo por molde)

```ts
interface Measurements {
  busto: number; // circunferência do busto (cm)
  cintura: number; // circunferência da cintura (cm)
  quadril: number; // circunferência do quadril (cm)
  alturaQuadril: number; // cintura → quadril (cm)
  comprimentoCostas: number; // nuca → cintura (cm)
  ombro: number; // largura do ombro (cm)
  compSaia: number; // comprimento default da saia (cm)
  compMangaCurta: number; // (cm)
  compMangaLonga: number; // (cm)
}
```

### GarmentSpec (o que a IA controla e o que o pattern guarda)

```ts
type GarmentType = "blusa" | "vestido" | "saia";
type Decote = "reto" | "V" | "redondo";
type MangaLen = "sem" | "curta" | "longa";
type SaiaSilhueta = "reta" | "evase" | "gode" | "meia-roda" | "circulo";

interface GarmentStyle {
  decote?: Decote;
  decoteProfundidadeCm?: number; // clampado por bloco
  manga?: MangaLen;
  saia?: SaiaSilhueta;
  compSaiaCm?: number; // override do comprimento da saia
  pences?: boolean;
  folgaCosturaCm?: number;
}

interface GarmentSpec {
  tipo: GarmentType;
  measurementOverrides: Partial<Measurements>; // medidas citadas no chat
  style: GarmentStyle;
}
```

### Piece — deixa de ter `params`

Passa a guardar a geometria **traçada** (`outline`, `guideOutline?`, `grainline?`, `dart?`, `label`) e as medidas resolvidas que a geraram. `PieceDetails` deixa de ser fixo:

```ts
type PieceDetails = { rows: { label: string; value: string }[] };
```

(A saia reporta comprimento/roda/cós; o corpo reporta cava/pence/decote — cada bloco decide suas linhas.)

### Pattern

Ganha `baseMeasurements: Measurements` (linha resolvida do tamanho-base + overrides) e `spec: GarmentSpec`. As peças são derivadas de `spec` + `baseMeasurements`.

## 2. Engine de drafting (`lib/blocks/*` + `lib/geometry.ts`)

Cada bloco é uma função pura `draft(m: Measurements, style: GarmentStyle) → DraftedPiece` que produz **pontos em cm** num sistema de coordenadas natural da peça (origem no canto sup. esq. da peça), além de guias/grainline/pence/rótulo e as `PieceDetails.rows`.

`lib/geometry.ts` deixa de ter geometria hardcoded e passa a ser a camada de **composição**:

- `draftGarment(spec, measurements) → Piece[]` — resolve o arquétipo do `tipo` (quais blocos), chama cada `draft`, converte cm→px (`PX_PER_CM`), e faz **auto-layout**: posiciona cada peça por bounding-box numa fileira com espaçamento fixo e calcula o `viewBox` resultante (largura = soma das larguras + gaps; altura = maior peça). Acaba a posição chumbada.
- Helpers de curva (Bézier a partir de pontos + tensão) para cava, decote e copa de manga.

### Fórmulas (das fontes pesquisadas)

As fórmulas abaixo são o alvo; valores exatos de folga/constantes serão fixados no plano com base nas fontes. `¼X` = X/4.

**Base do corpo (frente/costas)** — modelagem plana feminina (UDESC / Marlene Mukai):

- Largura do quarto: frente ≈ `¼busto + 1 + folga`; costas ≈ `¼busto − 1 + folga`.
- Altura total do corpo até a cintura = `comprimentoCostas`.
- Degolo (base do decote) = `1/6·comprimentoCostas + 0,5`; decote frente = `degolo + 1`.
- `decoteProfundidadeCm` adicional conforme `decote` (V/redondo aprofundam; reto = base).
- Ombro = `ombro` (largura), com caimento padrão.
- Altura de cava proporcional ao busto/comprimento de costas.
- Pence de cintura quando `pences` = `¼quadril − ¼cintura` distribuída.

**Manga** — traçada a partir do **comprimento da cava** do corpo (copa dimensionada pela cava), de modo que frente/manga casem por construção. Comprimento conforme `manga` (curta/longa) ou `sem` (não gera a peça).

**Saia reta** — retângulo largura = `¼quadril + folga`, altura = `compSaia`; linha de quadril em `alturaQuadril`; redução de cintura `(quadril − cintura)` dividida entre curva lateral (metade) e pences (restante); pence até a linha do quadril.

**Saia godê/círculo** (matemática real):

- raio da cintura `r = cintura / (2π)` (godê total / círculo); meia-roda `r = cintura / π`.
- raio externo `R = r + compSaia`.
- **evasê** = interpolação entre a saia reta e o godê (fator de amplitude).
- Peça desenhada como setor anelar (arco de cintura + arco de barra).

## 3. Tabela de medidas + graduação (`lib/measurements.ts`)

Tabela-semente (ABNT-based, passo ~4 cm em busto/cintura/quadril):

| Tam | BR  | Busto | Cintura | Quadril | Costas(nuca→cint.) | Cint→Quadril | Ombro |
| --- | --- | ----- | ------- | ------- | ------------------ | ------------ | ----- |
| PP  | 36  | 84    | 66      | 92      | 40,0               | 20,0         | 11,5  |
| P   | 38  | 88    | 70      | 96      | 40,5               | 20,3         | 11,8  |
| M   | 40  | 92    | 74      | 100     | 41,0               | 20,6         | 12,0  |
| G   | 42  | 96    | 78      | 104     | 41,5               | 21,0         | 12,3  |
| GG  | 44  | 100   | 82      | 108     | 42,0               | 21,3         | 12,5  |

Comprimentos default (constantes): `compSaia` midi = 60; `compMangaCurta` = 18; `compMangaLonga` = 58.

- `resolveMeasurements(size, overrides) → Measurements` — pega a linha do tamanho e aplica os overrides.
- Graduação: re-traça na linha de outro tamanho (graduação real), mantendo a UI de tamanhos aplicados/pendentes.

## 4. Contrato da IA (`lib/ai.ts`)

Tool nova, forçada (`tool_choice`): a IA devolve

```ts
{ decision: "apply" | "decline"; spec?: GarmentSpec; declineReason?: string; assistantMessage: string }
```

- O **system prompt** recebe: a tabela de medidas, a `spec` atual (para ajustes), e o catálogo de estilos válidos (enums de `tipo`/`decote`/`manga`/`saia`).
- Ajustes ("deixa a saia mais rodada", "aprofunda o decote") = a IA devolve a `spec` inteira atualizada; o engine re-traça.
- **Servidor valida/clampa** `spec` (tipo/estilos ∈ enums; medidas e profundidades dentro de faixas por bloco) antes de traçar. A IA nunca emite geometria/px.
- Ids de peça deixam de ser enum fixo na tool — vêm do arquétipo resolvido no servidor.
- `decision: "decline"` (pedido não mapeável, ex.: peça fora do escopo) devolve a mensagem e **estorna o crédito**, como hoje.

## 5. Conflito, componentes e migração

**Conflito:** com drafting real a cava do corpo e a copa da manga casam por construção, então o conflito raramente dispara. Mantém-se um **check no servidor** após o traçado (comprimento da cava vs comprimento da copa, tolerância ~1 cm) que só vira `ConflictInfo` se um override de estilo quebrar o casamento. Os `markers` passam a ser **computados dos pontos reais da cava** traçada, não de `LANDMARKS` chumbados. A UI de conflito (card + Export desabilitado) é preservada.

**Componentes:**

- `PatternCanvas` — usa o `viewBox` dinâmico do auto-layout.
- `PieceDetailsPanel` e `FichaTecnicaTab` — renderizam `PieceDetails.rows` (label/valor) em vez das colunas fixas atuais (cava/pence/…).
- `PlanoCorteTab`/consumo — derivam da área traçada da peça.

**Migração:** removem-se `frenteGeometry`/`costasGeometry`/`mangaGeometry`, `PIECE_PARAM_SCHEMA`, `clampParams`/`defaultParams` de deltas, `LANDMARKS`, `PIECE_META`/`updatePieceParams` (create/merge de deltas). Blusa/vestido passam a sair do mesmo engine que a saia. `seedPattern` continua **em branco** (molde novo = v0, sem peças) — a primeira geração cria a `spec` e traça as peças.

## 6. Riscos assumidos

- É modelagem **simplificada e ilustrativa em fidelidade de curvas**: cava/decote/copa plausíveis, não industriais. Sem validação de um modelista, algumas curvas podem sair "toscas". O objetivo é _coerente e derivado de medidas reais_, não pronto para produção.
- As constantes de folga/proporção das fórmulas serão fixadas no plano a partir das fontes; pequenos ajustes visuais podem ser necessários após ver o resultado renderizado.

## Fontes

- [Marlene Mukai — tabelas de medidas baseadas nas normas ABNT](https://marlenemukai.com.br/novas-tabelas-de-medidas-baseada-nas-normas-da-abnt/)
- [UDESC — Apostila de Modelagem Básica do Vestuário Feminino (2017)](https://www.udesc.br/arquivos/ceart/id_cpmenu/3787/Apostila_Modelagem_B_sica_Feminina___2017_15206211994746_3787.pdf)
- [The Creative Curator — How to draft a skirt sloper](https://www.thecreativecurator.com/how-to-make-skirt-pattern-tutorial/)
- [My Golden Thimble — Basic skirt block](https://www.mygoldenthimble.com/how-to-draft-a-basic-skirt-block-pattern/)
- [Moldes & Costuras & Cia — cálculo da saia godê (raio = cintura / 6,28)](http://moldescosturascia.blogspot.com/2018/01/saia-gode-com-calculo-do-pi-assim-como.html)

## Follow-up

Ao concluir, atualizar o `CLAUDE.md`: a seção "Pieces are parametric and computed" e o fluxo do `generate` passam a descrever o engine por medidas (measurements + GarmentSpec + drafting), não mais deltas/`PIECE_PARAM_SCHEMA`.
