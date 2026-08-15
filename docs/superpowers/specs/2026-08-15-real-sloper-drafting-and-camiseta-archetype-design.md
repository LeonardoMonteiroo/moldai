# Modelagem por slopers reais + arquétipo camiseta — Design

**Data:** 2026-08-15
**Status:** aprovado para plano

## Problema

O motor de modelagem por medidas (recém-mergeado) produz peças que parecem
"balões": ombros em bico, laterais e barra estufadas, sem nenhuma reta. Ao
pedir uma "blusa masculina", o usuário recebeu três blobs arredondados em vez
de peças de molde reconhecíveis. A referência que o usuário espera é um molde
profissional de camiseta masculina (export Audaces `.adsx`/`.plt`): peças com
centro reto, decote levemente curvo, ombro reto com caimento, cava curva
(scye), lateral reta, barra reta e comprimento até o quadril.

Duas causas de raiz:

1. **Suavização do contorno inteiro.** `autoLayout(..., curvedIds=[...])` faz
   `place()` rodar `smoothPath(outline, closed)` sobre o polígono fechado
   inteiro — Catmull-Rom arredonda *todos* os vértices, inclusive os que
   deveriam ser retos (ombro, lateral, barra, centro). Num molde real só o
   decote e a cava são curvos.
2. **Geometria de bloco ingênua.** `bodice()` traça ~8 pontos que vão do ombro
   direto ao ponto de cava na largura cheia do busto (sem curva de cava, sem
   trecho reto de lateral), sem caimento de ombro, e a peça termina na cintura
   (`comprimentoCostas` ≈ 41 cm) — ou seja, um corpo *cropped*, não uma peça
   que vai até o quadril. Curto + largo + suavizado = o blob.

Além disso há descasamento de arquétipo: a referência é uma **camiseta
masculina** (malha, gola redonda, sem pences, manga montada, comprimento até o
quadril), mas o tipo `blusa` atual desenha um corpo feminino com pences até a
cintura, e a tabela de medidas é feminina.

## Objetivo

Elevar a fidelidade do motor a "sloper real": blocos frente/costas e manga
construídos por regras reais de modelagem plana, com curvas só onde molde de
verdade tem curva. Adicionar um arquétipo `camiseta` e uma tabela de medidas
masculina selecionável por `sexo`, casando com a referência. O sloper real se
aplica também a `blusa`/`vestido` (compartilham `corpo.ts`), não só à camiseta.

Fora de escopo: graduação re-desenhando por tamanho, arquétipos além de
blusa/vestido/saia/camiseta, motor de conflito ativo (segue no-op), calças.

## Princípio central: a IA nunca é confiada para geometria

Inalterado. A IA devolve `GarmentSpec`; o servidor **sempre** roda
`validateSpec` (whitelist de enums + clamp numérico) antes de desenhar. Este
design só amplia os enums (`camiseta`, `sexo`) e os campos validados; o
contrato de nunca confiar em coordenadas/px do modelo continua.

## Modelo de dados

### `lib/types.ts`

```ts
export type GarmentType = "blusa" | "vestido" | "saia" | "camiseta";
export type Sexo = "fem" | "masc";

export interface GarmentSpec {
  tipo: GarmentType;
  sexo: Sexo;                              // NOVO — default "fem"
  measurementOverrides: Record<string, number>;
  style: GarmentStyle;
}
```

`GarmentStyle`, `Decote`, `MangaLen`, `SaiaSilhueta`, `Piece`, `DetailRow`
ficam iguais.

### `lib/draft/core.ts` — contorno por segmentos

`DraftedPiece` deixa de depender do flag externo `curvedIds` e passa a declarar
quais trechos do próprio contorno são curvos:

```ts
export interface DraftedPiece {
  id: string;
  name: string;
  qty: number;
  outlineCm: Pt[];
  curvedSpans?: [number, number][]; // NOVO: faixas [iníc,fim] de índices de vértice desenhadas como curva; resto = reta
  guideCm?: Pt[];
  grainlineCm?: [Pt, Pt];
  dartCm?: Pt[];
  detailRows: DetailRow[];
  armholeLenCm?: number;
}
```

Novo construtor de path (substitui o uso de `smoothPath` em `place`):

```ts
// Constrói o `d` de um contorno fechado desenhando reta em cada aresta,
// exceto nas arestas cobertas por um curvedSpan, onde emite Catmull-Rom->Bézier
// com as tangentes travadas nas bordas do span (não puxa para os pontos retos vizinhos).
export function outlinePath(ptsCm: Pt[], curvedSpans: [number, number][]): PieceOutline
```

Regras:
- Uma aresta `i -> i+1` (índices módulo n) é curva sse existe um span `[a,b]`
  com `a <= i` e `i+1 <= b` (ambos os vértices dentro do mesmo span).
- Aresta curva: cubic Catmull-Rom usando vizinhos, com clamp igual ao fix de
  curva aberta já existente — nas bordas do span (`i == a` ou `i+1 == b`) o
  ponto de controle externo usa o próprio extremo do span, não o vértice reto
  vizinho. Isso garante tangente suave dentro do span sem estufar a reta.
- Aresta não-curva: `L`.
- Fecha com `Z`.

`smoothPath` atual é generalizado/renomeado para `outlinePath`; o
comportamento "curva o contorno todo" some. `polyPath` continua para peças sem
curvas. `autoLayout` **perde** o parâmetro `curvedIds` — cada peça carrega seus
próprios `curvedSpans`, e `place()` chama `outlinePath(dp.outlineCm,
dp.curvedSpans ?? [])`.

## Medidas: `lib/measurements.ts`

`Measurements` mantém os campos atuais. Reinterpretação registrada:
`ombro` = **meia-largura do centro à ponta do ombro** (distância horizontal),
não "largura de um ombro" solta. `busto` = circunferência de tórax/peito
(serve fem e masc).

Duas tabelas:

```ts
export const SIZE_TABLE: Record<SizeLabel, Measurements> = { /* feminina, ombro recalibrado */ };
export const SIZE_TABLE_MASC: Record<SizeLabel, Measurements> = { /* masculina */ };
```

Valores (feminina — `ombro` recalibrado para meia-largura; demais mantidos):

| tam | busto | cintura | quadril | altQuadril | compCostas | ombro |
|-----|-------|---------|---------|------------|------------|-------|
| PP  | 84    | 66      | 92      | 20.0       | 40.0       | 17.5  |
| P   | 88    | 70      | 96      | 20.3       | 40.5       | 18.0  |
| M   | 92    | 74      | 100     | 20.6       | 41.0       | 18.5  |
| G   | 96    | 78      | 104     | 21.0       | 41.5       | 19.0  |
| GG  | 100   | 82      | 108     | 21.3       | 42.0       | 19.5  |

Valores (masculina):

| tam | busto | cintura | quadril | altQuadril | compCostas | ombro |
|-----|-------|---------|---------|------------|------------|-------|
| PP  | 92    | 80      | 92      | 21.0       | 43.0       | 21.0  |
| P   | 96    | 84      | 96      | 21.3       | 43.5       | 21.5  |
| M   | 100   | 88      | 100     | 21.6       | 44.0       | 22.0  |
| G   | 104   | 92      | 104     | 22.0       | 44.5       | 22.5  |
| GG  | 108   | 96      | 108     | 22.3       | 45.0       | 23.0  |

`compSaia`, `compMangaCurta`, `compMangaLonga` iguais nas duas tabelas
(18/58/60), exceto masc manga curta 22, manga longa 62 (braço mais longo).

`MEASUREMENT_RANGES`: ampliar `ombro` para `{ min: 14, max: 26 }` (nova
semântica de meia-largura); `comprimentoCostas` para `{ min: 34, max: 50 }`
(mantém). Demais iguais.

```ts
export function resolveMeasurements(size: SizeLabel, overrides: Partial<Measurements>, sexo: Sexo = "fem"): Measurements
```

Escolhe `SIZE_TABLE_MASC` quando `sexo === "masc"`, senão `SIZE_TABLE`, e
aplica overrides com clamp como hoje.

## Parâmetros de bloco

`draftGarment` deriva um `BlockOpts` a partir de `sexo` e `tipo` e passa aos
drafters:

```ts
interface BlockOpts {
  sexo: Sexo;
  knit: boolean;      // true para camiseta (malha) -> folga de vestir 0
  lengthCm: number;   // comprimento do corpo, em cm de HPS/ombro até a barra:
                      //   blusa/camiseta -> comprimentoCostas + alturaQuadril + 5 (quadril)
                      //   vestido        -> comprimentoCostas (linha da cintura; a saia continua abaixo)
}
```

Constantes derivadas dentro dos drafters (a partir de `BlockOpts.sexo`):
- `caimentoOmbro` (queda do ombro abaixo da HPS): fem 4.0 cm, masc 4.5 cm.
- `folgaVestir` no quarto de tórax: `knit ? 0 : 2` cm.
- `neckHalf` (meia-largura do decote): `busto / 14 + (sexo==="masc" ? 0.8 : 0)`.

## Bloco frente/costas: `lib/draft/corpo.ts`

Assinatura nova:

```ts
export function draftCorpo(m: Measurements, style: GarmentStyle, opts: BlockOpts): {
  frente: DraftedPiece; costas: DraftedPiece; armholeLenCm: number;
}
```

Construção da meia-peça (centro em `cx`, `y=0` na linha HPS/ombro), espelhada
para peça inteira. Pontos e formulas (valores de exemplo para masc M:
busto 100, ombro 22, compCostas 44, altQuadril 21.6):

| símbolo | fórmula | masc M |
|---------|---------|--------|
| `halfChest` | `busto/4 + folgaVestir` | 25 + 0 = 25 |
| `armholeDepth` (HPS→axila) | `busto/8 + (sexo==="masc" ? 10.5 : 9.5)` | 12.5 + 10.5 = 23 |
| `caimentoOmbro` | const por sexo | 4.5 |
| `neckHalf` | `busto/14 + (masc?0.8:0)` | 7.14 + 0.8 = 7.9 |
| `frontNeckDrop` | ver decote abaixo | — |
| `backNeckDrop` | `2.0` (fixo) | 2.0 |
| `lengthCm` | passado em opts | 44 + 21.6 + 5 = 70.6 |
| `hemHalf` | `quadril/4 + folgaVestir` | 25 + 0 = 25 |

Decote (profundidade do centro-frente a partir da HPS):
- `redondo`: `frontNeckDrop = neckHalf + (knit ? 2.0 : 1.0)`
- `V`: `frontNeckDrop = neckHalf + max(0, decoteProfundidadeCm ?? 6)`
- `reto`: `frontNeckDrop = neckHalf * 0.7`
Costas sempre `backNeckDrop = 2.0` (decote raso), independentemente do estilo.

Vértices da **meia-peça esquerda** da frente, no sentido do centro-decote →
ombro → cava → lateral → barra → centro-barra (índices para os spans):

```
0: [cx, frontNeckDrop]                 // centro-frente, base do decote
1: [cx - neckHalf*0.6, frontNeckDrop*0.55]  // ponto de controle do decote (curva)
2: [cx - neckHalf, 0]                   // base do pescoço / HPS
3: [cx - ombro, caimentoOmbro]          // ponta do ombro   (reta 2->3)
4: [cx - (ombro+halfChest)/2 + 1, caimentoOmbro + (armholeDepth-caimentoOmbro)*0.55] // controle da cava (curva)
5: [cx - halfChest, armholeDepth]       // axila
6: [cx - hemHalf, lengthCm]             // barra lateral    (reta 5->6)
7: [cx, lengthCm]                        // centro-barra     (reta 6->7)
```

- **Spans curvos da meia-peça:** decote `[0,2]`, cava `[3,5]`.
- Peça inteira: espelhar índices 0..7 para o lado direito (x' = 2*cx - x) na
  ordem inversa, concatenar, dedup dos pontos de centro (0 e 7 aparecem uma
  vez). Recalcular os spans para o contorno inteiro (decote e cava aparecem dos
  dois lados). O construtor de índices do espelho é responsabilidade do
  drafter, testado por ordem de vértices.
- Costas: idêntico com `frontNeckDrop → backNeckDrop`; sem controle de decote
  profundo (span de decote costas ainda existe mas raso).
- `armholeLenCm`: comprimento aproximado do arco de cava por lado =
  `hypot(halfChest-ombro, armholeDepth-caimentoOmbro) * 1.08` (fator para a
  curva vs. corda). Exposto para a manga casar.
- **Pences** (só quando `style.pences`, tipicamente blusa/vestido feminino,
  nunca camiseta): entra na lateral entre axila e barra (afunila na cintura) —
  `hemHalf` na cintura reduz `(quadril/4 - cintura/4)*0.5`, criando trecho
  lateral em 2 retas (axila→cintura, cintura→barra). Sem pences, lateral é
  uma reta única axila→barra. Mantém `dartCm` opcional para pence de busto como
  hoje.
- `detailRows` por peça: folga, largura (tórax), comprimento, cava, decote,
  fio; pence quando houver.

## Manga: `lib/draft/manga.ts`

Assinatura nova:

```ts
export function draftManga(m: Measurements, style: GarmentStyle, armholeLenCm: number, opts: BlockOpts): DraftedPiece | null
```

`null` quando `style.manga === "sem"`. Copa em sino acoplada à cava:
- `bicep = armholeLenCm * 0.9` (largura do topo; mantém acoplamento p/ costura
  casar por construção — `seamCheck` segue no-op).
- `capH = armholeLenCm / 3` (altura da copa).
- `len = style.manga === "longa" ? m.compMangaLonga : m.compMangaCurta`.
- `hemHalf = (bicep/2) * (style.manga === "longa" ? 0.7 : 0.9)`.

Vértices (centro `cxTop = bicep/2`, y para baixo):

```
0: [0, capH]                         // axila esq
1: [bicep*0.20, capH*0.30]           // controle costas (côncavo)
2: [cxTop, 0]                        // topo da copa
3: [bicep*0.80, capH*0.30]           // controle frente (convexo)
4: [bicep, capH]                     // axila dir
5: [cxTop + hemHalf, capH + len]     // barra dir  (reta 4->5)
6: [cxTop - hemHalf, capH + len]     // barra esq  (reta 5->6, e 6->0 reta)
```

- **Span curvo:** copa `[0,4]` (axila-esq → topo → axila-dir). Laterais e
  barra retas.
- `grainline` central; `detailRows`: tipo, comprimento, cava (copa), fio.

## Saia: `lib/draft/saia.ts`

Compatibilidade obrigatória com o novo modelo (`autoLayout` sem `curvedIds`,
`DraftedPiece.curvedSpans`). A saia radial passa a marcar cintura e barra como
`curvedSpans` em vez de depender de polilinha densa; silhuetas reta/evasê
seguem retas. Correções de fidelidade da saia (godê ≠ círculo, evasê
interpolado) permanecem follow-ups já registrados e **não** entram neste
escopo — só o necessário para compilar e para a saia não regredir visualmente.

## Orquestração: `lib/draft/garment.ts`

- `validateSpec`: `TIPOS` ganha `"camiseta"`; validar `sexo` com
  `pick(r.sexo, ["fem","masc"], "fem")`. Overrides e clamps de estilo iguais.
- `draftGarment(spec, size)`:
  - `resolveMeasurements(size, overrides, spec.sexo)`.
  - Deriva `BlockOpts`: `knit = spec.tipo === "camiseta"`; `lengthCm` =
    `vestido ? comprimentoCostas : comprimentoCostas + alturaQuadril + 5`.
  - `blusa`/`camiseta`: `draftCorpo` + `draftManga`. Camiseta força decote
    `redondo` e `pences: false` (defaults do arquétipo, ainda sobrepostos por
    validação de estilo se a IA pedir).
  - `vestido`: `draftCorpo` (lengthCm = `comprimentoCostas`, corpo até a
    cintura) + `draftManga` + `draftSaia`.
  - `saia`: `draftSaia`.
  - `autoLayout(drafted, 8)` — sem `curvedIds`.

## IA: `lib/ai.ts`

- Ferramenta `propose_garment`: schema do `spec` ganha `tipo` com `camiseta` e
  o campo `sexo` (`"fem"|"masc"`).
- Prompt do sistema: descreve `camiseta` (malha, gola redonda, manga montada,
  sem pences) vs `blusa` (tecido plano), e instrui a inferir `sexo` de pistas
  como "masculina/feminino/unissex" (default `fem`). Inclui as duas tabelas de
  medida no contexto.
- `validateSpec` continua sendo a fronteira de confiança.

## Mock e estado: `lib/mock-data.ts`

- `seedPattern`: `spec` inicial ganha `sexo: "fem"`. `baseMeasurements` via
  `resolveMeasurements(size, {}, "fem")`.
- `applyGarmentSpec`: sem mudança de fluxo (drafta e guarda). Conflito segue
  `null`.

## Testes (Vitest)

Novos/atualizados em `lib/**/*.test.ts`:

1. **core — `outlinePath`:** dado um quadrado com `curvedSpans` vazio, o `d`
   contém só comandos `L` (nenhum `C`); com um span, as arestas do span viram
   `C` e as de fora seguem `L`. Vértice de reta preservado exatamente.
2. **corpo — estrutura do sloper:** ombro tem caimento (`y` da ponta do ombro
   > `y` da HPS); lateral do não-fitted é reta (x da axila ≈ x da barra dentro
   de tolerância quando `quadril≈busto`); comprimento chega ao quadril
   (`maxY ≈ compCostas + altQuadril + 5`).
3. **corpo — decote:** `frontNeckDrop` (frente) > `backNeckDrop` (costas) para
   todo decote; `V` mais fundo que `redondo` mais fundo que `reto`.
4. **corpo — cava:** o span de cava produz arestas `C`; `armholeLenCm` > corda
   reta ombro→axila.
5. **manga — acoplamento:** `bicep` e `capH` derivam de `armholeLenCm`; copa é
   `curvedSpan`; barra reta.
6. **garment — camiseta:** `tipo:"camiseta"` gera frente/costas/manga, sem
   pence, decote redondo; `sexo:"masc"` usa `SIZE_TABLE_MASC` (largura maior
   que a fem no mesmo tamanho).
7. **validateSpec:** aceita `camiseta` e `sexo`; rejeita `sexo` inválido →
   `"fem"`; mantém clamps existentes (incluindo o fix de `0` válido).
8. **measurements:** `resolveMeasurements(..., "masc")` lê a tabela masculina;
   override de `ombro` respeita a nova faixa `[14,26]`.

## Verificação manual

`npm run dev`, pedir no chat "camiseta masculina M": esperado frente/costas com
centro reto, decote redondo raso, ombro reto com leve caimento, cava curva,
lateral reta, barra reta, comprimento até o quadril; manga curta com copa em
sino. Pedir "blusa feminina com pences": corpo afunila na cintura, decote
conforme estilo. `npm test`, `npm run lint`, `npm run build` limpos.
