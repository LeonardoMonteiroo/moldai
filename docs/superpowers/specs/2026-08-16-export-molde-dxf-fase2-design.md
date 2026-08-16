# Export do molde — Fase 2: serializer DXF (geometria 1:1)

> Fase 2 do feature de export. Spec-mãe (arquitetura do núcleo e faseamento):
> `docs/superpowers/specs/2026-08-16-export-molde-design.md`. A Fase 1 (núcleo
> `ExportModel` + `toSvg`) já está mergeada em `main`.

## Problema

O `ExportModel` já existe e o SVG 1:1 já prova o pipeline. Falta um segundo
formato vetorial que a indústria consuma: **DXF**. O objetivo desta fase é um
serializer `toDxf(model) => string` que abra em qualquer leitor DXF
(LibreCAD/AutoCAD/Illustrator) e entre no Audaces como vetor real na escala
certa (1:1 em mm).

## Escopo e nomenclatura (decisão)

É um **DXF de geometria pragmático**, **não** o padrão AAMA/ASTM D6673 estrito.
A nomenclatura é honesta em toda a doc e na UI: **"DXF · geometria 1:1"** — nunca
"DXF-AAMA". O arquivo carrega a geometria vetorial das peças em escala real;
não carrega a semântica de produção (camadas numéricas do padrão, piques/notches
reconhecidos, regras de graduação) que faria o Audaces importar como peça de
produção pronta. O usuário posiciona/marca a peça no CAD.

- **Só tamanho base** (o `pattern.baseSize` atual), sem grade — igual SVG.
- **Linha líquida (net line)** — a folga de costura não é deslocada pra
  geometria; vai só anotada no comentário do arquivo, exatamente como no SVG.
- **Client-side puro** — sem rota, sem custo de crédito, sem mutação de estado.
- **Escala física real** — `$INSUNITS = 4` (mm) e todas as coordenadas × `MM=10`
  (um lado de 10 cm mede 100 unidades = 100 mm no arquivo). Mesma constante e
  mesma convenção do `toSvg`.
- Respeita o bloqueio de export existente (conflito ativo, molde em branco,
  `spec` ausente) — a UI já garante isso na Fase 1.

## Fora de escopo (permanece adiado)

- **AAMA/ASTM D6673 estrito** — camadas numéricas fixas, semântica de peça de
  produção reconhecida automaticamente pelo Audaces/Gerber/Lectra. Vira uma
  Fase 2.5 quando houver Audaces em mãos pra validar de verdade.
- **Piques/notches semânticos**, furos de pence (drill holes).
- **Graduação multi-tamanho** no arquivo (a graduação ainda é mock).
- **Offset de margem de costura** (linha de corte deslocada) — recurso de
  geometria à parte.
- Entidade `SPLINE` (Bézier exata no DXF) — a compatibilidade de import varia;
  achatamos em polilinha, que todo leitor consome.

## Arquitetura

Um serializer puro novo espelhando `toSvg`, mais um helper de achatamento
isolado e testável. Ambos consomem o `ExportModel` intacto da Fase 1
(`ExPt`, `ExSeg = line | cubic`, `ExportPiece`, `ExportModel`).

```
ExportModel ──▶ toDxf (lib/export/dxf.ts) ──▶ string ──▶ downloadFile ──▶ .dxf
                  usa flattenCubic p/ achatar cada `cubic`
```

### 1. Achatamento de Bézier — `flattenCubic`

Assinatura (em `lib/export/dxf.ts`):

```ts
export function flattenCubic(
  p0: ExPt, c1: ExPt, c2: ExPt, p3: ExPt, tolCm: number,
): ExPt[];
```

Subdivisão adaptativa de De Casteljau. A cúbica é "plana o suficiente" quando a
distância perpendicular de `c1` **e** de `c2` à corda `p0→p3` fica **abaixo de**
`tolCm`; nesse caso devolve `[p3]`. Senão, divide em `t = 0.5` (De Casteljau) e
recorre nas duas metades, concatenando.

- **Não repete `p0`** — devolve só os pontos on-curve depois de `p0` (o chamador
  já tem `p0` como vértice anterior da polilinha). Inclui `p3` no fim.
- Tolerância desta fase: `TOL_CM = 0.02` (0,2 mm).
- Guarda de recursão: profundidade máxima (ex.: 16) pra nunca estourar a pilha
  em casos degenerados — na prática a tolerância corta bem antes.
- Distância ponto→reta: se `p0` e `p3` coincidem (corda degenerada de
  comprimento ~0), usa a distância euclidiana de `c1`/`c2` a `p0` como métrica de
  planura (evita divisão por zero).

### 2. Serializer — `toDxf`

```ts
export function toDxf(model: ExportModel): string;
```

DXF ASCII mínimo, hand-written, zero-dependência (mesmo padrão de string pura do
`toSvg`, sem DOM). Constante `MM = 10` local (cm→mm, 1:1), e um formatador
numérico `f()` idêntico ao do `toSvg` (2 casas, sem zeros à toa).

Estrutura de seções DXF (grupos código/valor, uma por linha):

- **`SECTION HEADER`**: variável `$INSUNITS = 4` (milímetros) e
  `$MEASUREMENT = 1` (métrico).
- **`SECTION TABLES` → `TABLE LAYER`**: quatro layers nomeadas —
  `CONTORNO`, `INTERNO`, `GRAINLINE`, `TEXTO` (cor 7 = preto/padrão; linha
  contínua). Nomes descritivos, não numéricos.
- **`SECTION ENTITIES`**, por peça (todos os pontos transladados por
  `originCm` e multiplicados por `MM`):
  - **contorno** → uma `LWPOLYLINE` **fechada** (flag 70 = 1) na layer
    `CONTORNO`. Vértices: começa em `outline.start`; cada `seg`:
    - `line` → 1 vértice (`seg.to`);
    - `cubic` → os pontos de `flattenCubic(anterior, c1, c2, to, TOL_CM)`.
    - O contador de vértices (código 90) reflete o total achatado.
  - **fio** → `LINE` na layer `GRAINLINE` (se `grainline` existir).
  - **dart** → `LWPOLYLINE` fechada na layer `INTERNO` (se `dart` com ≥ 3 pts).
  - **rótulo** → `TEXT` (`NOME · Nx`, maiúsculas) na layer `TEXTO`, altura ~6 mm,
    posicionado como no SVG (início do contorno, base em `heightCm`).
- Cabeçalho de metadados via par **código `999`** (comentário DXF nativo — não
  tem o problema do `--` do comentário XML): `MoldAI · {nome} · tam {size} ·
  folga {seamAllowanceCm ?? 0}cm (net line)`.
- Fecha com `ENDSEC` de cada seção e `EOF`.

### 3. Fachada + UI

`lib/export/index.ts`:

```ts
export type ExportFormat = "svg" | "dxf";

export function exportPattern(pattern: Pattern, format: ExportFormat): void {
  if (!pattern.spec || pattern.pieces.length === 0) return;
  const model = buildExportModel(pattern);
  const filename = `${slug(pattern.name)}-${model.size}.${format}`;
  switch (format) {
    case "svg":
      downloadFile(filename, "image/svg+xml", toSvg(model));
      return;
    case "dxf":
      downloadFile(filename, "image/vnd.dxf", toDxf(model));
      return;
    default: {
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}
```

O `switch`/`never` exaustivo substitui o `if (format === "svg")` da Fase 1 —
**resolve o Minor herdado** (formato não tratado deixa de ser no-op silencioso e
passa a ser erro de compilação).

`components/editor/Footer.tsx`: o array `FORMATS` ganha
`{ id: "dxf", label: "DXF · geometria 1:1" }`. Nada mais muda — o menu, o estado
de aberto/fechado e as condições de desabilitado (conflito / molde em branco /
sem spec) já existem da Fase 1.

## Tratamento de erros / casos de borda

- **Contorno com < 3 pontos** → `outlineSegments` (Fase 1) já cai pra polilinha
  de `line`s; `toDxf` emite uma `LWPOLYLINE` com esses vértices normalmente.
- **Corda degenerada** (`p0 == p3`) no achatamento → métrica de planura usa
  distância a `p0` (ver §1), sem divisão por zero.
- **Sem grainline / sem dart** → as entidades correspondentes simplesmente não
  são emitidas (mesma lógica condicional do `toSvg`).
- **`seamAllowanceCm === null`** → `?? 0` no comentário `999`, igual ao SVG.

## Testes (vitest, node — sem DOM)

- **`flattenCubic`**:
  - cúbica praticamente reta (control points sobre a corda) → devolve `[p3]`
    (1 ponto);
  - cúbica curva → devolve > 1 ponto, e **todos** os pontos ficam a ≤ `TOL_CM`
    (com folga numérica) da curva verdadeira amostrada densamente;
  - o último ponto é exatamente `p3`.
- **`toDxf`**:
  - contém `$INSUNITS` seguido do valor `4`;
  - contém as quatro layers nomeadas (`CONTORNO`, `INTERNO`, `GRAINLINE`,
    `TEXTO`);
  - uma `LWPOLYLINE` por contorno de peça (contagem = nº de peças do model);
  - a contagem de vértices (código 90) de um contorno com `cubic` é maior que o
    número de `segs` (prova que o achatamento inseriu pontos);
  - contém `LINE` (grainline) e `TEXT` com o nome da peça em maiúsculas;
  - escala 1:1: um vértice conhecido cai no valor esperado em mm (× `MM`).
- `download.ts` (side-effect DOM) e o menu do `Footer` (componente) seguem sem
  teste unitário — o projeto não tem jsdom (vitest env node), igual à Fase 1.

## Verificação manual

`npm run dev` → gerar um molde → "Exportar" → **DXF · geometria 1:1**. Abrir o
`.dxf` num leitor (LibreCAD, ou o visualizador online de DXF) e conferir: todas
as peças aparecem, as curvas (decote/cava/copa) estão suaves, o fio e o dart
aparecem nas suas layers, e um lado conhecido mede em mm o valor real em cm
(1:1). Com conflito ativo ou molde em branco, o item fica desabilitado. Quando
houver Audaces disponível, importar e confirmar que a escala se mantém (Fase 2.5
cuida do reconhecimento como peça de produção).
