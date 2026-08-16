# Export real do molde no editor

## Problema

O botão "Exportar" no `Footer` é mock — não gera arquivo nenhum. O molde
drafado (geometria real das peças em cm, já no store) nunca sai da tela. Uma
ferramenta de modelagem que não exporta não fecha o ciclo: o objetivo é
transformar o molde numa saída **em escala 1:1 real** que plotter, CAD e
impressora consumam de verdade.

## Escopo

- **Formatos de mercado, faseados numa única spec/plano:**
  1. **SVG 1:1** (fase 1) — vetor em mm, escala real; abre em Inkscape/Illustrator
     e vai direto pra maioria dos plotters. Baseline que prova o pipeline.
  2. **DXF (AAMA/ASTM)** (fase 2) — padrão CAD da indústria; importa no
     Audaces/Gerber/Lectra.
  3. **PDF com tiling** (fase 3) — peça real fatiada em A4 com marcas de colagem
     e régua de calibração, estilo Molde.me.
- **Geometria exportada = linha de costura líquida (net line)**, exatamente como
  é desenhada hoje. A folga de costura NÃO é deslocada pra geometria (ela hoje é
  só um `detailRow`); vai apenas **anotada** no arquivo/metadados.
- **Tudo client-side.** A geometria já está no store; export não tem custo de
  crédito nem entrada de IA, então não há rota nova nem mutação de estado.
- **Escala física real.** O arquivo abre no tamanho verdadeiro da peça (um lado
  de 10 cm mede 100 mm no arquivo).
- Respeita o bloqueio de export existente (conflito ativo) e desabilita também
  com molde em branco.

## Fora de escopo

- **Offset de margem de costura** (calcular a linha de corte = contorno + folga
  deslocada com tratamento de canto/curva). Recurso de geometria à parte.
- **Graduação multi-tamanho no arquivo** (nest AAMA graduado). A graduação ainda
  é mock; exporta só o tamanho base atual.
- **PLT/HPGL.** Nicho; YAGNI por ora.
- Rota de servidor / persistência do arquivo. Download direto do navegador.

## Arquitetura

Os três formatos **compartilham um núcleo** e divergem só na serialização:

```
spec + tamanho ──▶ buildExportModel ──▶ ExportModel ──▶ svg.ts  ─▶ string ─┐
   (do store)      (lib/export/model)   (agnóstico)     dxf.ts  ─▶ string ─┤─▶ download.ts ─▶ arquivo
                                                        pdf.ts  ─▶ bytes  ─┘   (Blob + <a download>)
```

Cada unidade tem uma responsabilidade e é testável isolada. Os serializers são
funções puras `(ExportModel) => string | Uint8Array`, sem DOM.

### 1. Geometria em cm exatos (`lib/draft`)

O store guarda `Piece` em **px** (`SCALE = 4` px/cm, com `PX()` arredondando a
0.1px ≈ 0.025 cm). Pra não herdar esse arredondamento, o export **re-drafa em
cm** reusando os mesmos drafters. Hoje `draftGarment(spec, size)` monta
`DraftedPiece[]` em cm internamente e só então `autoLayout` converte pra px.

Expor o intermediário cm:

```ts
// lib/draft/garment.ts
export function draftPiecesCm(spec: GarmentSpec, size: SizeLabel): DraftedPiece[];
```

`draftGarment` passa a chamar `draftPiecesCm` internamente (refactor sem mudança
de comportamento observável — `autoLayout(draftPiecesCm(...))`). `DraftedPiece`
já existe em `lib/draft/core.ts` e carrega `outlineCm`, `curvedSpans`,
`guideCm?`, `grainlineCm?`, `dartCm?`, `qty`, `name`, `id`, `detailRows`.

### 2. Núcleo — `ExportModel` (`lib/export/model.ts`)

```ts
export type ExPt = { x: number; y: number };        // cm, origem no canto da peça
export type ExSeg =
  | { kind: "line"; to: ExPt }
  | { kind: "cubic"; c1: ExPt; c2: ExPt; to: ExPt };

export interface ExportPiece {
  id: string;
  name: string;
  qty: number;
  widthCm: number;
  heightCm: number;                       // bbox da peça
  outline: { start: ExPt; segs: ExSeg[] }; // contorno fechado; preserva Bézier
  grainline?: [ExPt, ExPt];
  dart?: ExPt[];
  originCm: ExPt;                          // canto sup-esq da peça no sheet
}

export interface ExportModel {
  patternName: string;
  size: SizeLabel;
  unit: "cm";
  seamAllowanceCm: number | null;         // só anotação (net line exportada)
  sheetWidthCm: number;
  sheetHeightCm: number;
  pieces: ExportPiece[];
}

export function buildExportModel(pattern: Pattern): ExportModel;
```

`buildExportModel`:
- Lê `pattern.spec` e `pattern.baseSize`, chama `draftPiecesCm`.
- Converte cada `DraftedPiece`:
  - `outline` via `outlineSegments(outlineCm, curvedSpans)` (ver abaixo).
  - `grainline`/`dart` copiados em cm (polilinha).
  - `widthCm`/`heightCm`/`originCm` de um layout em cm (peças lado a lado,
    `pad = 6` cm, `gap = 8` cm — espelha os valores do `autoLayout`, mas em cm).
- `seamAllowanceCm = spec.style.folgaCosturaCm ?? 1` (anotação).
- Pré-condição: chamado só quando há `spec` e `pieces.length > 0` (a UI garante).

`outlineSegments(ptsCm, curvedSpans)` — espelha a matemática do `outlinePath`
atual (`lib/draft/core.ts`), mas em cm e devolvendo `{ start, segs }` tipado em
vez de string SVG. Aresta fora de span → `line`; dentro de span → `cubic` com as
mesmas tangentes Catmull-Rom travadas nas bordas do span. `< 3` pontos → cai pra
polilinha de `line`s (mesmo fallback do `outlinePath`).

### 3. Serializer SVG (`lib/export/svg.ts`) — fase 1

```ts
export function toSvg(model: ExportModel): string;
```

- Escala física: `MM = 10` (cm→mm). `width="{sheetWidthCm*MM}mm"`,
  `height="{sheetHeightCm*MM}mm"`, `viewBox="0 0 {sheetWidthCm*MM} {sheetHeightCm*MM}"`.
  Todas as coordenadas em mm ⇒ abre 1:1.
- Por peça (transladada por `originCm*MM`):
  - `<path d=...>` do contorno (`M`, `L`, `C` a partir de `outline.start`/`segs`,
    fechado com `Z`), `fill="none" stroke="#000" stroke-width="0.3"`.
  - fio: `<line>` tracejado, se houver.
  - dart: `<polyline>`/`<path>` fechado, se houver.
  - `<text>` com `NOME · Nx`.
- Cabeçalho `<!-- MoldAI · {patternName} · tam {size} · folga {seamAllowanceCm}cm (net line) -->`.
- String pura, sem dependência.

### 4. Download (`lib/export/download.ts`)

```ts
export function downloadFile(filename: string, mime: string, data: string | Uint8Array): void;
```

`Blob` + `URL.createObjectURL` + `<a download>` sintético + `revokeObjectURL`.
Único ponto com DOM; sem teste unitário (shim fino). Nome do arquivo:
`slug(patternName)-{size}.{ext}`.

### 5. Fachada + UI

`lib/export/index.ts`:

```ts
export type ExportFormat = "svg" | "dxf" | "pdf";
export function exportPattern(pattern: Pattern, format: ExportFormat): void;
// buildExportModel → serializa conforme o formato → downloadFile
```

`Footer.tsx`: o botão "Exportar" vira um disparador de **menu de formato**
(fase 1 lista só SVG; DXF e PDF entram nas fases 2 e 3). Estado local do
aberto/fechado (sem store). Item clicado → `exportPattern(pattern, format)`.
- Desabilitado quando `exportBlocked` (conflito, comportamento atual) **ou**
  `pattern.pieces.length === 0` (molde em branco).
- Sem mutação de estado, sem chamada de servidor — não passa por `api-client`
  nem por store action (é um side-effect client puro).

### 6. DXF (fase 2) — `lib/export/dxf.ts`

`export function toDxf(model: ExportModel): string;` — DXF-AAMA/ASTM mínimo:
- Achata cada `cubic` em polilinha por amostragem (N segmentos por curva).
- `LWPOLYLINE` fechada por contorno; unidade mm (coords × 10).
- Camadas por tipo de linha: contorno, grainline, texto/anotação.
- Cabeçalho `$INSUNITS = 4` (mm). Tamanho base só (sem grade).

### 7. PDF tiling (fase 3) — `lib/export/pdf.ts`

`export function toPdf(model: ExportModel): Uint8Array;` — dependência nova
`pdf-lib`:
- Fatia o sheet (mm) em páginas A4 retrato com sobreposição de colagem.
- Marcas de corte/colagem nas bordas + numeração de linha/coluna das folhas.
- Um quadrado-régua de calibração de 5 cm na primeira folha (confere escala na
  impressão).
- Desenha contorno (linhas + Bézier via `page.drawSvgPath` ou linhas), fio, dart,
  rótulos. Tamanho base só.

## Tratamento de erros / casos de borda

- **Molde em branco** (`pieces` vazio) → botão desabilitado; `buildExportModel`
  nunca é chamado sem peças.
- **Conflito ativo** → desabilitado (comportamento atual do `exportBlocked`).
- **`spec` ausente com peças presentes** (não deve ocorrer no fluxo normal) →
  a fachada trata como erro silencioso e não baixa nada; a UI mantém o botão
  desabilitado se `!pattern.spec`.
- **Contorno com < 3 pontos** → `outlineSegments` cai pra polilinha (mesmo
  fallback do `outlinePath`).

## Testes (vitest, node — sem DOM)

Fase 1:
- `draftPiecesCm`: retorna `DraftedPiece[]` com `outlineCm` em cm coerente com o
  tamanho (ex.: largura da frente ≈ derivada do busto); `draftGarment` continua
  produzindo o mesmo resultado px de antes (refactor sem regressão).
- `outlineSegments`: aresta fora de span → `line`; dentro de span → `cubic`;
  `< 3` pontos → só `line`s.
- `buildExportModel`: dimensões cm > 0 e coerentes; `outline` fechado começando
  em `start`; `seamAllowanceCm` reflete `style.folgaCosturaCm` (default 1);
  layout posiciona peças sem sobreposição (`originCm` crescente em x).
- `toSvg`: `width`/`height`/`viewBox` em mm; escala 1:1 (um segmento de 10 cm
  vira 100 unidades no path); um `<path>` de contorno por peça; comentário de
  cabeçalho com tamanho e folga.

Fases 2–3 (testam nas suas fases):
- `toDxf`: contém `LWPOLYLINE`, `$INSUNITS` mm, N vértices por curva achatada,
  camadas nomeadas.
- `toPdf`: retorna PDF válido (magic `%PDF`), nº de páginas = tiles esperados
  pro sheet, presença da régua de calibração.

O `download.ts` (side-effect de DOM) e o menu do `Footer` (componente) ficam sem
teste unitário — não há jsdom no projeto (vitest env node).

## Verificação manual

`npm run dev` → gerar um molde → "Exportar" → **SVG**. Abrir o `.svg` no Inkscape
(ou navegador) e medir: um lado conhecido (ex.: comprimento) bate em cm com a
régua/propriedades do documento (1:1). Conferir que todas as peças, fio, dart e
rótulos aparecem. Com conflito ativo, o botão fica desabilitado; com molde em
branco, idem. Nas fases seguintes: DXF importa no Audaces mantendo escala; PDF
imprime em A4 e o quadrado de calibração mede 5 cm.
