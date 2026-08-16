# Export do molde — Fase 3: serializer PDF (tiling A4 + folha única)

> Fase 3 (final) do feature de export. Spec-mãe (arquitetura do núcleo e
> faseamento): `docs/superpowers/specs/2026-08-16-export-molde-design.md`
> (seção 7). Fases 1 (núcleo + SVG) e 2 (DXF geometria) já estão mergeadas em
> `main`.

## Problema

O `ExportModel` já entrega geometria vetorial 1:1, e SVG/DXF cobrem plotter e
CAD. Falta a saída de **impressão caseira**: a peça real fatiada em folhas A4
que a pessoa imprime na impressora de casa, recorta e cola — em escala 1:1
verificável. E uma saída de **folha única** (tamanho real do molde) pra quem tem
plotter/rolo ou manda pra copiadora grande.

## Decisões (travadas no brainstorming)

- **Biblioteca:** `pdf-lib` — a **única dependência runtime nova** do feature
  inteiro (SVG e DXF são zero-dep). PDF é binário (xref/streams/fontes) e
  escrevê-lo à mão é frágil demais; `pdf-lib` é pura JS, roda no cliente, e traz
  as fontes padrão (Helvetica) sem embutir arquivo.
- **Dois modos, dois itens de menu:**
  - `PDF · A4 (colar em casa)` — fatiado em A4 retrato, **sobreposição + colagem**.
  - `PDF · folha única (plotter)` — **uma página** do tamanho exato do molde.
- **Montagem A4:** sobreposição de colagem (cada folha repete ~1 cm da vizinha);
  recorta na margem, sobrepõe e cola (estilo Molde.me). Marcas de colagem +
  numeração linha/coluna.
- **Régua de calibração:** régua de **10 cm** com marcações de 1 cm + rótulo
  "10 cm — confira a escala", na 1ª folha (A4) e num canto (folha única).
- **`toPdf` é assíncrono** (`Promise<Uint8Array>`) — `pdf-lib`'s `save()` é
  async. (Ajuste consciente vs. a assinatura sync da spec-mãe.)
- **Só tamanho base**, linha líquida (net line), client-side puro.

## Fora de escopo

- Offset de margem de costura (linha de corte deslocada).
- Graduação multi-tamanho no arquivo.
- Clipping analítico por segmento nas bordas do tile — confia-se no recorte pela
  MediaBox da página (padrão de poster-tiling; a impressão sai correta).
- Fontes customizadas / embutidas — Helvetica padrão do `pdf-lib`.
- Páginas A0 fixas com tiling — "folha única" cobre o caso plotter; A0 rígido
  cortaria moldes largos.

## Arquitetura

Um serializer novo `lib/export/pdf.ts` consumindo o `ExportModel` intacto, mais
dois helpers puros testáveis. Reusa o `flattenCubic` da Fase 2 via um helper de
achatamento de contorno compartilhado por DXF e PDF.

```
ExportModel ─▶ toPdf(model, opts) ─▶ Promise<Uint8Array> ─▶ downloadFile ─▶ .pdf
                 usa planTiles (grade de páginas) + flattenOutlineCm + pdf-lib
```

### 1. Geometria compartilhada — `flattenOutlineCm`

Hoje o `toDxf` (Fase 2) constrói o contorno achatado inline (loop sobre
`outline.segs`, `flattenCubic` nos `cubic`, dedup do vértice final igual ao
inicial). PDF precisa exatamente do mesmo. Extrair:

```ts
// lib/export/dxf.ts (ou lib/export/geometry.ts) — exportado
export function flattenOutlineCm(
  outline: { start: ExPt; segs: ExSeg[] },
  tolCm: number,
): ExPt[];   // pontos em cm, contorno fechado, sem o vértice final duplicado
```

`toDxf` passa a chamar `flattenOutlineCm` no lugar do loop inline (refatoração
sem mudança de comportamento — os testes de DXF, que checam a contagem de
vértices código 90, guardam a paridade). `toPdf` usa o mesmo helper.

### 2. Grade de páginas — `planTiles` (helper puro)

```ts
export type PdfMode = "a4" | "single";
export interface TilePlan {
  pageWcm: number;   // dimensão da página (cm)
  pageHcm: number;
  marginCm: number;
  overlapCm: number; // 0 em "single"
  cols: number;
  rows: number;
  pages: { row: number; col: number; originCm: ExPt }[]; // janela no sheet
}
export function planTiles(sheetWcm: number, sheetHcm: number, mode: PdfMode): TilePlan;
```

- **`a4`:** `pageWcm = 21`, `pageHcm = 29.7`, `marginCm = 0.8`, `overlapCm = 1`.
  `printableW = pageWcm - 2*marginCm`; `stepW = printableW - overlapCm`;
  `cols = max(1, ceil((sheetWcm - overlapCm) / stepW))` (idem linhas/altura).
  `pages` em ordem linha-maior; `originCm = { x: col*stepW, y: row*stepH }`.
- **`single`:** `pageWcm = sheetWcm + 2*marginCm`, `pageHcm = sheetHcm + 2*marginCm`,
  `overlapCm = 0`, `cols = rows = 1`, uma página com `originCm = { x: 0, y: 0 }`.

### 3. Serializer — `toPdf`

```ts
export function toPdf(model: ExportModel, mode: PdfMode): Promise<Uint8Array>;
```

- Unidades: `PT_POR_CM = 72 / 2.54 ≈ 28.3465` (1:1 físico). Eixo Y invertido
  (PDF tem origem inferior-esquerda, +Y pra cima — mesma inversão do DXF):
  o ponto de página `Y` para uma coord de sheet `ys` (cm) numa página com janela
  `originCm` é `((pageHcm - marginCm) - (ys - origin.y)) * PT_POR_CM` (o desenho
  ocupa a área útil, com a margem embaixo/cima). A translação por `-originCm`
  posiciona o tile; o que vaza é recortado pela MediaBox.
- `doc = await PDFDocument.create()`; `font = await doc.embedFont(Helvetica)`.
- Para cada `page` de `planTiles`:
  - `p = doc.addPage([pageWcm*PT_POR_CM, pageHcm*PT_POR_CM])`.
  - Por peça do model (transladada por `originCm - piece.originCm`... na prática:
    coord de sheet da peça = `piece.originCm + ponto_local`; subtrai a janela do
    tile): desenha contorno (polilinha achatada de `flattenOutlineCm`, via
    `drawLine` por segmento ou um path), fio (`drawLine` tracejado), dart
    (polilinha fechada), rótulo (`drawText` `NOME · Nx`).
  - **A4:** retângulo tracejado da área útil (linha de corte/colagem) + rótulo
    `Linha {row+1} · Coluna {col+1} de {rows}×{cols}` no rodapé da margem.
  - **1ª página (a4) / canto (single):** régua de 10 cm com ticks de 1 cm +
    texto "10 cm — confira a escala".
- `return await doc.save();`

### 4. Régua — `rulerTicksCm` (helper puro)

```ts
export function rulerTicksCm(lengthCm: number): number[]; // [0,1,...,lengthCm]
```

Posições dos ticks em cm; o desenho (linhas verticais + baseline + rótulo) fica
no `toPdf`. Isolado pra testar sem PDF.

### 5. Fachada + UI

`lib/export/index.ts`:

```ts
export type ExportFormat = "svg" | "dxf" | "pdf-a4" | "pdf-single";

export function exportPattern(pattern: Pattern, format: ExportFormat): void {
  if (!pattern.spec || pattern.pieces.length === 0) return;
  const model = buildExportModel(pattern);
  const base = `${slug(pattern.name)}-${model.size}`;
  switch (format) {
    case "svg":  downloadFile(`${base}.svg`, "image/svg+xml", toSvg(model)); return;
    case "dxf":  downloadFile(`${base}.dxf`, "image/vnd.dxf", toDxf(model)); return;
    case "pdf-a4":
      toPdf(model, "a4").then((b) => downloadFile(`${base}-a4.pdf`, "application/pdf", b)).catch(() => {});
      return;
    case "pdf-single":
      toPdf(model, "single").then((b) => downloadFile(`${base}-folha.pdf`, "application/pdf", b)).catch(() => {});
      return;
    default: { const _exhaustive: never = format; return _exhaustive; }
  }
}
```

`exportPattern` continua `void` (os cases PDF são fire-and-forget). O
`switch`/`never` segue exaustivo.

`components/editor/Footer.tsx`: `FORMATS` ganha
`{ id: "pdf-a4", label: "PDF · A4 (colar em casa)" }` e
`{ id: "pdf-single", label: "PDF · folha única (plotter)" }`. Nada mais muda.

## Tratamento de erros / casos de borda

- **Molde em branco / conflito / sem spec** → botão já desabilitado (Fase 1); a
  fachada também retorna cedo.
- **Falha do `pdf-lib`** → `.catch(() => {})` no fire-and-forget; nada é baixado
  (sem estado a reverter, sem crédito).
- **Sheet menor que uma página (a4)** → `cols = rows = 1`, uma folha só.
- **Contorno < 3 pontos** → `flattenOutlineCm` cai na polilinha de retas (mesmo
  fallback herdado do `outlineSegments`/`flattenCubic`).

## Testes (vitest, node — `pdf-lib` roda em node, sem DOM)

- **`planTiles`**: `single` → 1 página com `pageWcm = sheetWcm + 2*margin`;
  `a4` de um sheet pequeno (< área útil) → `cols = rows = 1`; `a4` de um sheet
  grande → `cols/rows` = o `ceil` esperado com o overlap, e `pages.length =
  cols*rows`; `originCm` crescente com passo `printable - overlap`.
- **`flattenOutlineCm`**: contorno só de retas → mesmos vértices (dedup do final);
  contorno com `cubic` → mais vértices que segs (achatamento).
- **`rulerTicksCm`**: `rulerTicksCm(10)` → `[0..10]` (11 ticks).
- **`toPdf`**: `a4` → os bytes começam com `%PDF`; recarregando via
  `PDFDocument.load(bytes)`, `getPageCount()` == `planTiles(...).pages.length`.
  `single` → 1 página, e `getPage(0).getSize()` ≈ `(sheetWcm+2*margin)*PT_POR_CM`
  × `(sheetHcm+2*margin)*PT_POR_CM` (prova 1:1, com tolerância numérica).
- **`toDxf`** (regressão): a suíte existente da Fase 2 deve continuar verde após
  a extração do `flattenOutlineCm` (contagem de vértices código 90 inalterada).
- `download.ts` (DOM) e o menu do `Footer` (componente) seguem sem teste
  unitário — o projeto não tem jsdom.

## Verificação manual

`npm run dev` → gerar um molde → "Exportar" → **PDF · A4**. Imprimir em A4 (escala
100%, sem "ajustar à página") e **medir a régua: o traço de 10 cm tem de medir
10 cm**. Montar duas folhas pela sobreposição e conferir que o contorno casa.
Depois **PDF · folha única**: abrir e conferir que a página tem o tamanho real do
molde e a régua mede 10 cm. Com conflito ativo ou molde em branco, os itens ficam
desabilitados.
