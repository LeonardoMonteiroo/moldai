# Ferramentas de canvas do editor (cursor + medir)

## Problema

Hoje a toolbar flutuante (`FloatingToolbar`) mostra quatro botões — `medir`,
`cortar`, `girar`, `marcar` — que apenas mudam `activeTool` no store; **nenhum
tem comportamento real**. O `PatternCanvas` renderiza um SVG estático com
`viewBox` fixo em `0 0 w h`, sem pan nem zoom, e o único gesto é clicar numa peça
para selecioná-la. O usuário não consegue navegar num molde grande nem conferir
medidas.

Queremos criar a base extensível de ferramentas de canvas e entregar as duas
primeiras com comportamento real: **cursor** (mexer a tela e dar zoom) e
**medir** (aferir distâncias em cm).

## Escopo

- **Ferramenta cursor**: scroll dá zoom apontando para o cursor; arrastar faz
  pan; clique sem arrastar seleciona peça (comportamento atual). Widget de zoom
  (`+` / `−` / ajustar à tela) no canto inferior-direito do canvas.
- **Ferramenta medir**: dois cliques definem uma medição (ponto A → ponto B),
  desenhando linha + rótulo em cm. Snap magnético nos vértices das peças.
  Medições são **persistentes** (várias na tela ao mesmo tempo); há controle para
  limpar todas e é possível remover uma clicando nela.
- **Zoom por scroll** funciona em ambas as ferramentas; **pan por arrasto** é
  exclusivo do cursor.
- A toolbar passa a ter **apenas** cursor + medir; os outros três botões são
  removidos por enquanto.
- Default da ferramenta ativa passa de `medir` para **`cursor`**.

## Fora de escopo

- As ferramentas `cortar`, `girar`, `marcar` (removidas por ora; voltam quando
  tiverem comportamento).
- Persistir viewport ou medições além da sessão do cliente (some no reset /
  regeneração, como todo o resto do mock).
- Medir ângulos, curvas ou perímetros — só distância reta ponto-a-ponto.
- Snap em pontos que não sejam vértices do contorno (grainline, dart, guia) —
  fácil de estender depois, mas fora do v1.
- Rótulos de medição com fundo/edição de texto — só o valor em cm.

## Modelo de coordenadas

Tudo no SVG está em **px**, com `SCALE = 4` px/cm (`lib/draft/core.ts`). Os
`outlineCm` de cada peça são convertidos por `PX()` e o `viewBox` nasce em
`(0,0)`. Logo:

- Distância em cm entre dois pontos SVG `a` e `b` = `dist_px(a,b) / SCALE`.
- Conversão tela→SVG usa `svg.getScreenCTM().inverse()` aplicado a um
  `DOMPoint`, robusto a `viewBox`, `preserveAspectRatio` e resize. Tanto o
  zoom-ao-cursor quanto os cliques de medição usam essa mesma conversão, então
  snap e zoom vivem no mesmo espaço de coordenadas das peças.

## Arquitetura

Duas preocupações separadas com donos distintos:

1. **Viewport** (pan/zoom) — estado efêmero e de alta frequência → hook local na
   subárvore do canvas, fora do store.
2. **Medições** — anotações de edição UI-only, semi-persistentes → slice no
   store Zustand, seguindo a convenção "um store para estado de UI".

O `activeTool` continua no store (já existe).

### 1. Tipos (`lib/types.ts`)

```ts
export interface Point {
  x: number;
  y: number;
} // px no espaço do SVG

export interface Measurement {
  id: string;
  a: Point; // px
  b: Point; // px
}
```

`Piece` ganha `vertices?: Point[]` — os pontos de âncora do contorno em px, para
o snap. (Os endpoints das curvas Bézier são os próprios `outlineCm`, então o
mesmo conjunto serve para contorno reto e curvo.)

### 2. Camada de vértices para snap (`lib/draft/core.ts`)

`place()` passa a anexar `piece.vertices` derivado de `dp.outlineCm` já traduzido
para px pelo mesmo `(dxPx, dyPx)` usado no outline:

```ts
piece.vertices = dp.outlineCm.map(([x, y]) => ({
  x: PX(x) + dxPx,
  y: PX(y) + dyPx,
}));
```

Nenhum drafter individual (`corpo`, `manga`, `saia`) é tocado — a mudança é só no
ponto de montagem compartilhado.

### 3. Math puro do viewport (`lib/canvas/viewport.ts`)

Tipos e funções puras (sem DOM, testáveis):

```ts
export interface Viewport { x: number; y: number; w: number; h: number } // px

// zoom ao redor de um ponto-foco (em coords SVG), respeitando limites de escala
zoomAt(vp: Viewport, focus: Point, factor: number, natural: {w:number;h:number}): Viewport

// viewBox natural da peça com padding (usado por "ajustar à tela")
fit(natural: {w:number;h:number}, padPx?: number): Viewport

// escala atual relativa ao natural (para clamp e para o rótulo "x%")
scaleOf(vp: Viewport, natural: {w:number;h:number}): number
```

Limites de escala ~`[0.25, 10]`; fator de zoom por notch ~`1.1`. `zoomAt`
recalcula `x,y` para manter `focus` sob o cursor após escalar.

### 4. Hook do viewport (`lib/canvas/useCanvasViewport.ts`)

`useCanvasViewport(natural, patternVersion)` retorna `{ viewport, zoomAtScreen,
panBy, fitToScreen, zoomIn, zoomOut, scale }`. Mantém `viewport` em estado local
(`useState`), reseta para `fit(natural)` quando `patternVersion` muda (efeito).
As funções de tela convertem via `getScreenCTM` e delegam para o math puro.

### 5. Math puro de medição (`lib/canvas/measure.ts`)

```ts
// vértice mais próximo dentro do limiar (em px SVG); null se nenhum
nearestSnap(p: Point, vertices: Point[], thresholdPx: number): Point | null

distanceCm(a: Point, b: Point, scale: number): number // dist_px / scale
```

O limiar em px-SVG é derivado de ~10px de tela ÷ escala atual do viewport, para
o snap "sentir" constante em qualquer zoom.

### 6. Store (`lib/store.ts`)

- `EditorTool` passa a ser `"cursor" | "medir"`; default `"cursor"` (no estado
  inicial e no `resetPattern`).
- Novo slice:
  ```ts
  measurements: Measurement[];
  addMeasurement: (m: Measurement) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;
  ```
- `measurements` é zerado no `resetPattern` e sempre que uma geração aplica novas
  peças (em `sendMessage`, no ramo que dá `applyState` com pieces novas), porque
  as coordenadas mudam e as medições antigas perdem sentido.

### 7. Toolbar (`components/editor/FloatingToolbar.tsx`)

`TOOLS` passa a listar só `cursor` (ícone de seta, ex. `↖`) e `medir` (`↔`).

### 8. Widget de zoom (`components/editor/ZoomControls.tsx`)

Componente novo, posicionado `absolute` no canto **inferior-direito** do slot do
canvas (não conflita com o slot superior-direito dos painéis de detalhe/conflito
nem com a toolbar superior-esquerda). Botões `−`, rótulo de `x%`, `+`, e "ajustar
à tela". Recebe callbacks do hook de viewport.

### 9. Camada de medição (`components/editor/MeasureLayer.tsx`)

Renderiza, dentro do SVG (mesmo espaço px das peças):

- Cada `Measurement` como linha + ticks nas pontas + rótulo `"{cm} cm"`.
- Enquanto há ponto A pendente: linha-fantasma de A até o cursor (com snap).
- Realce do vértice sob o cursor quando há snap ativo.
- Linhas usam `vector-effect="non-scaling-stroke"` e os rótulos têm `font-size`
  dividido pela escala do viewport, para manter peso visual constante em
  qualquer zoom.

### 10. Canvas (`components/editor/PatternCanvas.tsx`)

- Passa a receber `viewport`, `activeTool`, handlers e `measurements`.
- `viewBox` vem do `viewport` (`{x} {y} {w} {h}`), não mais do `pattern.viewBox`
  fixo.
- Handler de `wheel`: sempre zoom-ao-cursor (ambas as ferramentas).
- Handler de ponteiro depende de `activeTool`:
  - **cursor**: `pointerdown`+arrasto = pan; clique sem arrasto (movimento
    abaixo de um limiar) = `onSelectPiece` (comportamento atual).
  - **medir**: `pointermove` calcula snap/preview; clique adiciona ponto — 1º
    vira A pendente, 2º finaliza `addMeasurement(A→B)`; clicar numa medição
    existente chama `removeMeasurement`. `Esc` cancela o A pendente.
- Seleção de peça (`<g onClick>`) só dispara na ferramenta cursor.

### 11. Fiação (`components/editor/CanvasArea.tsx`)

- Instancia `useCanvasViewport(pattern.viewBox ?? default, pattern.version)`.
- Passa viewport/tool/medições para `PatternCanvas`.
- Renderiza `ZoomControls` (inferior-direito) e o controle "limpar medições"
  (aparece quando `measurements.length > 0`), ambos dentro do bloco
  `activeTab === "molde2d"` e sob a guarda `!isGenerating`.
- Estado de "ponto A pendente" e de snap vive local no `CanvasArea`/`PatternCanvas`
  (efêmero, não vai pro store).

## Testes

Foco nos helpers puros (vitest, como o resto do projeto):

- `lib/canvas/viewport.test.ts`: `zoomAt` mantém o foco sob o cursor; `fit`
  centraliza com padding; escala respeita os limites (clamp).
- `lib/canvas/measure.test.ts`: `nearestSnap` acha o vértice certo dentro do
  limiar e retorna `null` fora dele; `distanceCm` = px/scale.
- `lib/draft/core.test.ts` (adição): `place`/`autoLayout` anexam `vertices`
  alinhados aos cantos do outline.

Interação de ponteiro (pan, zoom-ao-cursor, cliques de medição) é verificada
rodando o app (`npm run dev`), fora do escopo de teste unitário.
