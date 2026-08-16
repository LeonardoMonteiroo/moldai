# Editor Canvas Tools (cursor + medir) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar comportamento real às ferramentas de canvas do editor — `cursor` (pan + zoom) e `medir` (distâncias em cm com snap nos vértices) — substituindo a toolbar decorativa atual.

**Architecture:** Duas preocupações com donos distintos. O **viewport** (pan/zoom) é estado efêmero de alta frequência num hook local (`useCanvasViewport`), fora do store. As **medições** são anotações UI-only num slice novo do Zustand. Toda geometria vive em helpers puros e testáveis (`lib/canvas/viewport.ts`, `lib/canvas/measure.ts`); os componentes React só fazem fiação de eventos e conversão tela→SVG via `getScreenCTM`.

**Tech Stack:** Next.js 16, React 19, Zustand 5, TypeScript, Vitest (node env, sem React Testing Library — só lógica pura e o store são unit-testados; hook/componentes são verificados por `npx tsc --noEmit` + app rodando).

## Global Constraints

- Coordenadas do SVG estão em **px**, com `SCALE = 4` px/cm (`lib/draft/core.ts`). Distância em cm = `dist_px / SCALE`.
- O `viewBox` do SVG passa a ser dirigido pelo viewport `{x, y, w, h}` (px), não mais `0 0 w h` fixo.
- Componentes nunca chamam `fetch` direto; toda chamada de servidor vai por `lib/api-client.ts` (não há chamadas novas neste plano).
- Estado UI-only mora no store Zustand único (`lib/store.ts`); viewport é a exceção deliberada (hook local, efêmero).
- Reutilizar tokens de cor existentes (`bg-surface`, `border-border`, `rounded-item`, `shadow-card`, `text-muted-2`, `bg-surface-alt`, `stroke-olive`, `fill-olive`, `fill-ink`, `fill-muted`); não hardcodar hex.
- Textos de UI em pt-BR.
- Cada tarefa termina com build/testes verdes: `npm test` (unit) e, nas tarefas de componente, `npx tsc --noEmit`.

---

## File Structure

**Criados:**

- `lib/canvas/viewport.ts` — math puro do viewport (zoom-ao-ponto, fit, clamp, pan).
- `lib/canvas/viewport.test.ts` — testes do math do viewport.
- `lib/canvas/measure.ts` — math puro de medição (snap, distância cm).
- `lib/canvas/measure.test.ts` — testes do math de medição.
- `lib/canvas/useCanvasViewport.ts` — hook React que segura o viewport e converte tela→SVG.
- `lib/store.test.ts` — testes do slice de medições e do default de ferramenta.
- `components/editor/ZoomControls.tsx` — widget `−` / `%` / `+` / ajustar (inferior-direito).
- `components/editor/MeasureLayer.tsx` — camada SVG de medições/preview/snap.

**Modificados:**

- `lib/types.ts` — `Point`, `Measurement`, `Piece.vertices?`.
- `lib/draft/core.ts` — `place()` anexa `piece.vertices`.
- `lib/draft/core.test.ts` — teste de `vertices`.
- `lib/store.ts` — `EditorTool = "cursor" | "medir"`, default `cursor`, slice de medições, limpeza no reset/geração.
- `components/editor/FloatingToolbar.tsx` — só cursor + medir.
- `components/editor/PatternCanvas.tsx` — viewBox do viewport, eventos de ponteiro/roda, snap, camada de medição, seleção só no cursor.
- `components/editor/CanvasArea.tsx` — instancia o hook, passa props, renderiza ZoomControls e "limpar medições".

---

## Task 1: Tipos + vértices de snap no draft

**Files:**

- Modify: `lib/types.ts` (após a linha 7, e no `interface Piece`)
- Modify: `lib/draft/core.ts` (dentro de `place`, ~linha 83-90)
- Test: `lib/draft/core.test.ts`

**Interfaces:**

- Produces: `interface Point { x: number; y: number }`, `interface Measurement { id: string; a: Point; b: Point }`, campo `Piece.vertices?: Point[]`.

- [ ] **Step 1: Write the failing test**

Adicionar ao final do `describe("core drafting", ...)` em `lib/draft/core.test.ts` (antes do fechamento do describe na linha 52):

```ts
it("autoLayout anexa vertices alinhados aos cantos do outline", () => {
  const { pieces } = autoLayout([rect("a", 10, 20)], 5);
  const p = pieces[0];
  expect(p.vertices).toBeDefined();
  expect(p.vertices).toHaveLength(4);
  // primeiro vértice = primeiro par "x,y" do polygon
  const [px, py] = (p.outline as { points: string }).points
    .split(" ")[0]
    .split(",")
    .map(Number);
  expect(p.vertices![0].x).toBeCloseTo(px, 1);
  expect(p.vertices![0].y).toBeCloseTo(py, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- core.test`
Expected: FAIL — `p.vertices` é `undefined` (`expect(received).toBeDefined()`).

- [ ] **Step 3: Add the types**

Em `lib/types.ts`, após a definição de `PieceOutline` (linha 7), adicionar:

```ts
export interface Point {
  x: number;
  y: number;
}

export interface Measurement {
  id: string;
  a: Point;
  b: Point;
}
```

E no `interface Piece` (linha 44-54), adicionar o campo opcional após `label`:

```ts
  vertices?: Point[]; // âncoras do outline em px, p/ snap da ferramenta medir
```

- [ ] **Step 4: Attach vertices in `place()`**

Em `lib/draft/core.ts`, dentro de `place()`, logo após o objeto `const piece: Piece = { ... };` (linha 90) e antes do `if (dp.guideCm)`:

```ts
piece.vertices = dp.outlineCm.map(([x, y]) => ({
  x: PX(x) + dxPx,
  y: PX(y) + dyPx,
}));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- core.test`
Expected: PASS (todos os testes de `core drafting`, incluindo o novo).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/draft/core.ts lib/draft/core.test.ts
git commit -m "feat(draft): expõe vertices das peças para snap de medição"
```

---

## Task 2: Math puro do viewport

**Files:**

- Create: `lib/canvas/viewport.ts`
- Test: `lib/canvas/viewport.test.ts`

**Interfaces:**

- Consumes: `Point` de `@/lib/types` (Task 1).
- Produces: `interface Viewport { x:number; y:number; w:number; h:number }`, `interface Size { w:number; h:number }`, consts `MIN_SCALE=0.25`, `MAX_SCALE=10`, `ZOOM_STEP=1.1`, e funções `scaleOf(vp,natural)`, `clampScale(s)`, `zoomAt(vp,focus,factor,natural)`, `zoomByCenter(vp,factor,natural)`, `panBy(vp,dxUser,dyUser)`, `fit(natural,padPx?)`.

- [ ] **Step 1: Write the failing test**

Criar `lib/canvas/viewport.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  zoomAt,
  fit,
  scaleOf,
  zoomByCenter,
  panBy,
  MAX_SCALE,
} from "./viewport";

const natural = { w: 100, h: 100 };

describe("viewport math", () => {
  it("fit centraliza com padding", () => {
    expect(fit({ w: 100, h: 50 }, 24)).toEqual({
      x: -24,
      y: -24,
      w: 148,
      h: 98,
    });
  });

  it("scaleOf: viewport natural = escala 1; menor = zoom maior", () => {
    expect(scaleOf({ x: 0, y: 0, w: 100, h: 100 }, natural)).toBeCloseTo(1, 5);
    expect(scaleOf({ x: 0, y: 0, w: 50, h: 50 }, natural)).toBeCloseTo(2, 5);
  });

  it("zoomAt mantém o ponto-foco fixo (mesma fração do viewBox)", () => {
    const vp = { x: 0, y: 0, w: 100, h: 100 };
    const focus = { x: 30, y: 70 };
    const out = zoomAt(vp, focus, 2, natural);
    const fxBefore = (focus.x - vp.x) / vp.w;
    const fxAfter = (focus.x - out.x) / out.w;
    expect(fxAfter).toBeCloseTo(fxBefore, 6);
    expect(scaleOf(out, natural)).toBeCloseTo(2, 5);
  });

  it("zoomAt respeita o clamp de escala máxima", () => {
    let vp = { x: 0, y: 0, w: 100, h: 100 };
    for (let i = 0; i < 100; i++) vp = zoomByCenter(vp, 2, natural);
    expect(scaleOf(vp, natural)).toBeLessThanOrEqual(MAX_SCALE + 1e-9);
  });

  it("panBy desloca o viewBox no sentido oposto ao arrasto", () => {
    expect(panBy({ x: 10, y: 10, w: 100, h: 100 }, 5, -3)).toEqual({
      x: 5,
      y: 13,
      w: 100,
      h: 100,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- viewport.test`
Expected: FAIL — módulo `./viewport` não existe.

- [ ] **Step 3: Write the implementation**

Criar `lib/canvas/viewport.ts`:

```ts
import type { Point } from "@/lib/types";

export interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 10;
export const ZOOM_STEP = 1.1;

// escala = razão entre tamanho natural e o do viewport (viewport menor => mais zoom)
export function scaleOf(vp: Viewport, natural: Size): number {
  return natural.w / vp.w;
}

export function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

// zoom ao redor de `focus` (coords SVG), mantendo o ponto sob o cursor fixo
export function zoomAt(
  vp: Viewport,
  focus: Point,
  factor: number,
  natural: Size,
): Viewport {
  const current = scaleOf(vp, natural);
  const target = clampScale(current * factor);
  const applied = target / current; // fator efetivo após clamp
  const w = vp.w / applied;
  const h = vp.h / applied;
  const x = focus.x - (focus.x - vp.x) / applied;
  const y = focus.y - (focus.y - vp.y) / applied;
  return { x, y, w, h };
}

export function zoomByCenter(
  vp: Viewport,
  factor: number,
  natural: Size,
): Viewport {
  return zoomAt(
    vp,
    { x: vp.x + vp.w / 2, y: vp.y + vp.h / 2 },
    factor,
    natural,
  );
}

// desloca o viewBox no sentido oposto ao arrasto (conteúdo segue o cursor)
export function panBy(vp: Viewport, dxUser: number, dyUser: number): Viewport {
  return { ...vp, x: vp.x - dxUser, y: vp.y - dyUser };
}

// viewBox natural da peça com padding (usado por "ajustar à tela")
export function fit(natural: Size, padPx = 24): Viewport {
  return {
    x: -padPx,
    y: -padPx,
    w: natural.w + padPx * 2,
    h: natural.h + padPx * 2,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- viewport.test`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/viewport.ts lib/canvas/viewport.test.ts
git commit -m "feat(canvas): math puro de viewport (zoom-ao-ponto, fit, pan, clamp)"
```

---

## Task 3: Math puro de medição

**Files:**

- Create: `lib/canvas/measure.ts`
- Test: `lib/canvas/measure.test.ts`

**Interfaces:**

- Consumes: `Point` de `@/lib/types` (Task 1); `SCALE` de `@/lib/draft/core`.
- Produces: `distancePx(a,b)`, `distanceCm(a,b)`, `nearestSnap(p, vertices, thresholdPx)`.

- [ ] **Step 1: Write the failing test**

Criar `lib/canvas/measure.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { distanceCm, nearestSnap } from "./measure";

describe("measure math", () => {
  it("distanceCm converte px->cm (4px = 1cm)", () => {
    expect(distanceCm({ x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(1, 5);
    expect(distanceCm({ x: 0, y: 0 }, { x: 12, y: 16 })).toBeCloseTo(5, 5); // hipotenusa 20px
  });

  it("nearestSnap acha o vértice mais próximo dentro do limiar", () => {
    const verts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(nearestSnap({ x: 96, y: 3 }, verts, 10)).toEqual({ x: 100, y: 0 });
  });

  it("nearestSnap retorna null fora do limiar", () => {
    const verts = [{ x: 0, y: 0 }];
    expect(nearestSnap({ x: 50, y: 50 }, verts, 10)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- measure.test`
Expected: FAIL — módulo `./measure` não existe.

- [ ] **Step 3: Write the implementation**

Criar `lib/canvas/measure.ts`:

```ts
import type { Point } from "@/lib/types";
import { SCALE } from "@/lib/draft/core";

export function distancePx(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distanceCm(a: Point, b: Point): number {
  return distancePx(a, b) / SCALE;
}

// vértice mais próximo de `p` dentro de `thresholdPx`; null se nenhum
export function nearestSnap(
  p: Point,
  vertices: Point[],
  thresholdPx: number,
): Point | null {
  let best: Point | null = null;
  let bestD = thresholdPx;
  for (const v of vertices) {
    const d = distancePx(p, v);
    if (d <= bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- measure.test`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/measure.ts lib/canvas/measure.test.ts
git commit -m "feat(canvas): math puro de medição (snap ao vértice, distância cm)"
```

---

## Task 4: Store (ferramenta + medições) + FloatingToolbar

Mudança do union `EditorTool` e a `FloatingToolbar` andam juntas para o build não quebrar.

**Files:**

- Modify: `lib/store.ts`
- Modify: `components/editor/FloatingToolbar.tsx`
- Test: `lib/store.test.ts` (criar)

**Interfaces:**

- Consumes: `Measurement` de `@/lib/types` (Task 1).
- Produces: `EditorTool = "cursor" | "medir"`; store expõe `measurements: Measurement[]`, `addMeasurement(m)`, `removeMeasurement(id)`, `clearMeasurements()`.

- [ ] **Step 1: Write the failing test**

Criar `lib/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "./store";

describe("editor store — ferramenta e medições", () => {
  beforeEach(() => {
    useEditorStore.setState({ measurements: [], activeTool: "cursor" });
  });

  it("default de ferramenta é cursor", () => {
    expect(useEditorStore.getState().activeTool).toBe("cursor");
  });

  it("addMeasurement acrescenta", () => {
    useEditorStore
      .getState()
      .addMeasurement({ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    expect(useEditorStore.getState().measurements).toHaveLength(1);
  });

  it("removeMeasurement remove pelo id", () => {
    const s = useEditorStore.getState();
    s.addMeasurement({ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    s.addMeasurement({ id: "m2", a: { x: 0, y: 0 }, b: { x: 8, y: 0 } });
    useEditorStore.getState().removeMeasurement("m1");
    expect(useEditorStore.getState().measurements.map((m) => m.id)).toEqual([
      "m2",
    ]);
  });

  it("clearMeasurements esvazia", () => {
    useEditorStore
      .getState()
      .addMeasurement({ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    useEditorStore.getState().clearMeasurements();
    expect(useEditorStore.getState().measurements).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- store.test`
Expected: FAIL — `activeTool` inicial é `"medir"` e `addMeasurement` não existe.

- [ ] **Step 3: Update the store**

Em `lib/store.ts`:

(a) Trocar o import de tipos (linha 3) para incluir `Measurement`:

```ts
import {
  ChatMessage,
  Credits,
  EditorState,
  GenerationStatus,
  Pattern,
  ConflictInfo,
  COSTS,
  Measurement,
} from "./types";
```

(b) Trocar o tipo `EditorTool` (linha 6):

```ts
export type EditorTool = "cursor" | "medir";
```

(c) No `interface EditorStore`, adicionar após `activeTool: EditorTool;` (linha 33):

```ts
  measurements: Measurement[];
```

e adicionar, junto aos outros setters (após `setActiveTool` na linha 53):

```ts
  addMeasurement: (m: Measurement) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;
```

(d) No estado inicial, trocar `activeTool: "medir",` (linha 75) por:

```ts
  activeTool: "cursor",
  measurements: [],
```

(e) Em `sendMessage`, no ramo de sucesso (linhas 125-130), capturar a versão anterior e limpar medições quando a peça for regerada. Substituir:

```ts
applyState(set, result.state);
const shouldSelectFirst =
  !get().selectedPieceId && result.state.pattern.pieces.length > 0;
set({
  generationStatus: result.status === "error" ? "error" : "idle",
  ...(shouldSelectFirst
    ? { selectedPieceId: result.state.pattern.pieces[0].id }
    : {}),
});
```

por:

```ts
const prevVersion = get().pattern?.version;
applyState(set, result.state);
const shouldSelectFirst =
  !get().selectedPieceId && result.state.pattern.pieces.length > 0;
set({
  generationStatus: result.status === "error" ? "error" : "idle",
  ...(shouldSelectFirst
    ? { selectedPieceId: result.state.pattern.pieces[0].id }
    : {}),
  ...(result.state.pattern.version !== prevVersion ? { measurements: [] } : {}),
});
```

(f) Em `resetPattern`, no `set({...})` (linhas 148-156), trocar `activeTool: "medir",` por `activeTool: "cursor",` e acrescentar `measurements: [],`.

(g) Adicionar as ações junto aos outros setters no fim do store (após `setActiveTool` na linha 195):

```ts
  addMeasurement: (m) => set((s) => ({ measurements: [...s.measurements, m] })),
  removeMeasurement: (id) => set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),
  clearMeasurements: () => set({ measurements: [] }),
```

- [ ] **Step 4: Update FloatingToolbar**

Substituir todo `components/editor/FloatingToolbar.tsx` pelo conteúdo:

```tsx
import { EditorTool } from "@/lib/store";

const TOOLS: { id: EditorTool; icon: string; label: string }[] = [
  { id: "cursor", icon: "↖", label: "Cursor (mover e zoom)" },
  { id: "medir", icon: "↔", label: "Medir" },
];

export function FloatingToolbar({
  activeTool,
  onSelect,
}: {
  activeTool: EditorTool;
  onSelect: (tool: EditorTool) => void;
}) {
  return (
    <div className="bg-surface border-border rounded-item shadow-card absolute top-5 left-5 flex flex-col gap-1 border p-[7px]">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          title={tool.label}
          onClick={() => onSelect(tool.id)}
          className={[
            "flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-[14px] transition-colors",
            tool.id === activeTool
              ? "bg-olive-tint text-olive"
              : "text-muted-2 hover:bg-surface-alt",
          ].join(" ")}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run unit tests + typecheck**

Run: `npm test -- store.test`
Expected: PASS (4 testes).

Run: `npx tsc --noEmit`
Expected: sem erros (o union novo é consistente entre store, FloatingToolbar e CanvasArea).

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS (todos os testes, incl. os das Tasks 1-3).

- [ ] **Step 7: Commit**

```bash
git add lib/store.ts lib/store.test.ts components/editor/FloatingToolbar.tsx
git commit -m "feat(store): ferramenta cursor|medir + slice de medições; toolbar enxuta"
```

---

## Task 5: Hook do viewport

**Files:**

- Create: `lib/canvas/useCanvasViewport.ts`

**Interfaces:**

- Consumes: `Point` (`@/lib/types`); `Viewport`, `Size`, `fit`, `zoomAt`, `zoomByCenter`, `panBy`, `scaleOf`, `ZOOM_STEP` (`./viewport`).
- Produces: `useCanvasViewport(svgRef, natural, patternVersion)` → `{ viewport, zoomAtScreen(clientX,clientY,factor), panByScreen(dxScreen,dyScreen), zoomIn(), zoomOut(), fitToScreen(), scale, screenToUser(clientX,clientY): Point }`.

- [ ] **Step 1: Write the hook**

Criar `lib/canvas/useCanvasViewport.ts`:

```ts
import { RefObject, useCallback, useEffect, useState } from "react";
import type { Point } from "@/lib/types";
import {
  Viewport,
  Size,
  fit,
  zoomAt,
  zoomByCenter,
  panBy,
  scaleOf,
  ZOOM_STEP,
} from "./viewport";

function toUser(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export function useCanvasViewport(
  svgRef: RefObject<SVGSVGElement | null>,
  natural: Size,
  patternVersion: number,
) {
  const [viewport, setViewport] = useState<Viewport>(() => fit(natural));

  // reseta o enquadramento sempre que a peça muda (nova geração / reset)
  useEffect(() => {
    setViewport(fit(natural));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternVersion]);

  const zoomAtScreen = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const focus = toUser(svg, clientX, clientY);
      setViewport((vp) => zoomAt(vp, focus, factor, natural));
    },
    [svgRef, natural],
  );

  const panByScreen = useCallback(
    (dxScreen: number, dyScreen: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const ctm = svg.getScreenCTM();
      const s = ctm && ctm.a ? ctm.a : 1; // px de tela por unidade de usuário
      setViewport((vp) => panBy(vp, dxScreen / s, dyScreen / s));
    },
    [svgRef],
  );

  const zoomIn = useCallback(
    () => setViewport((vp) => zoomByCenter(vp, ZOOM_STEP, natural)),
    [natural],
  );
  const zoomOut = useCallback(
    () => setViewport((vp) => zoomByCenter(vp, 1 / ZOOM_STEP, natural)),
    [natural],
  );
  const fitToScreen = useCallback(() => setViewport(fit(natural)), [natural]);

  const screenToUser = useCallback(
    (clientX: number, clientY: number): Point => {
      const svg = svgRef.current;
      return svg ? toUser(svg, clientX, clientY) : { x: 0, y: 0 };
    },
    [svgRef],
  );

  return {
    viewport,
    zoomAtScreen,
    panByScreen,
    zoomIn,
    zoomOut,
    fitToScreen,
    scale: scaleOf(viewport, natural),
    screenToUser,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/canvas/useCanvasViewport.ts
git commit -m "feat(canvas): hook useCanvasViewport (tela<->SVG, zoom/pan/fit)"
```

---

## Task 6: Widget de zoom

**Files:**

- Create: `components/editor/ZoomControls.tsx`

**Interfaces:**

- Produces: `ZoomControls({ scale, onZoomIn, onZoomOut, onFit })`.

- [ ] **Step 1: Write the component**

Criar `components/editor/ZoomControls.tsx`:

```tsx
export function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  return (
    <div className="bg-surface border-border rounded-item shadow-card absolute right-5 bottom-5 flex items-center gap-1 border p-[7px]">
      <button
        title="Diminuir zoom"
        onClick={onZoomOut}
        className="text-muted-2 hover:bg-surface-alt flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-[16px] transition-colors"
      >
        −
      </button>
      <button
        title="Ajustar à tela"
        onClick={onFit}
        className="text-muted-2 hover:bg-surface-alt flex h-[30px] min-w-[54px] items-center justify-center rounded-[7px] px-2 text-[12px] tabular-nums transition-colors"
      >
        {Math.round(scale * 100)}%
      </button>
      <button
        title="Aumentar zoom"
        onClick={onZoomIn}
        className="text-muted-2 hover:bg-surface-alt flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-[16px] transition-colors"
      >
        +
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/editor/ZoomControls.tsx
git commit -m "feat(canvas): widget de zoom (- / % / + / ajustar)"
```

---

## Task 7: Camada de medição

**Files:**

- Create: `components/editor/MeasureLayer.tsx`

**Interfaces:**

- Consumes: `Measurement`, `Point` (`@/lib/types`); `distanceCm` (`@/lib/canvas/measure`).
- Produces: `MeasureLayer({ measurements, pending, cursor, snap, scale, onRemove })`.

- [ ] **Step 1: Write the component**

Criar `components/editor/MeasureLayer.tsx`:

```tsx
import type { Measurement, Point } from "@/lib/types";
import { distanceCm } from "@/lib/canvas/measure";

function label(a: Point, b: Point): string {
  return `${distanceCm(a, b).toFixed(1)} cm`;
}

export function MeasureLayer({
  measurements,
  pending,
  cursor,
  snap,
  scale,
  onRemove,
}: {
  measurements: Measurement[];
  pending: Point | null;
  cursor: Point | null;
  snap: Point | null;
  scale: number;
  onRemove: (id: string) => void;
}) {
  const fs = 12 / scale; // font-size constante em tela
  const r = 3 / scale; // raio dos ticks constante em tela
  const mid = (a: Point, b: Point) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });

  return (
    <g>
      {measurements.map((m) => {
        const c = mid(m.a, m.b);
        return (
          <g
            key={m.id}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(m.id);
            }}
            className="cursor-pointer"
          >
            <line
              x1={m.a.x}
              y1={m.a.y}
              x2={m.b.x}
              y2={m.b.y}
              className="stroke-olive"
              style={{ strokeWidth: 1.4 }}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={m.a.x} cy={m.a.y} r={r} className="fill-olive" />
            <circle cx={m.b.x} cy={m.b.y} r={r} className="fill-olive" />
            <text
              x={c.x}
              y={c.y - fs * 0.4}
              textAnchor="middle"
              className="fill-ink"
              style={{ fontSize: fs }}
            >
              {label(m.a, m.b)}
            </text>
          </g>
        );
      })}

      {pending && cursor && (
        <g>
          <line
            x1={pending.x}
            y1={pending.y}
            x2={cursor.x}
            y2={cursor.y}
            className="stroke-olive"
            style={{ strokeWidth: 1.2, strokeDasharray: "5 4" }}
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={pending.x} cy={pending.y} r={r} className="fill-olive" />
          <text
            x={(pending.x + cursor.x) / 2}
            y={(pending.y + cursor.y) / 2 - fs * 0.4}
            textAnchor="middle"
            className="fill-muted"
            style={{ fontSize: fs }}
          >
            {label(pending, cursor)}
          </text>
        </g>
      )}

      {snap && (
        <circle
          cx={snap.x}
          cy={snap.y}
          r={5 / scale}
          className="stroke-olive fill-none"
          style={{ strokeWidth: 1.5 }}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/editor/MeasureLayer.tsx
git commit -m "feat(canvas): camada SVG de medições (linhas, rótulos cm, preview, snap)"
```

---

## Task 8: Integração — PatternCanvas + CanvasArea

Rewrite do `PatternCanvas` e fiação no `CanvasArea` andam juntos (contrato de props). Ao fim, verificação no app rodando.

**Files:**

- Modify: `components/editor/PatternCanvas.tsx` (rewrite)
- Modify: `components/editor/CanvasArea.tsx`

**Interfaces:**

- Consumes: `Viewport` (`@/lib/canvas/viewport`); `nearestSnap` (`@/lib/canvas/measure`); `ZOOM_STEP` (`@/lib/canvas/viewport`); `useCanvasViewport` (`@/lib/canvas/useCanvasViewport`); `ZoomControls`, `MeasureLayer`; store `measurements`/`addMeasurement`/`removeMeasurement`/`clearMeasurements`; `Point`, `Measurement`, `Piece`, `ConflictInfo` (`@/lib/types`); `EditorTool` (`@/lib/store`).

- [ ] **Step 1: Rewrite PatternCanvas**

Substituir todo `components/editor/PatternCanvas.tsx` por:

```tsx
import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  ConflictInfo,
  Piece,
  PieceOutline,
  Point,
  Measurement,
} from "@/lib/types";
import { EditorTool } from "@/lib/store";
import { Viewport, ZOOM_STEP } from "@/lib/canvas/viewport";
import { nearestSnap } from "@/lib/canvas/measure";
import { MeasureLayer } from "./MeasureLayer";

function OutlineShape({
  outline,
  className,
  style,
}: {
  outline: PieceOutline;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (outline.kind === "polygon") {
    return (
      <polygon points={outline.points} className={className} style={style} />
    );
  }
  return <path d={outline.d} className={className} style={style} />;
}

export function PatternCanvas({
  pieces,
  selectedPieceId,
  conflict,
  dimmed,
  viewport,
  scale,
  activeTool,
  measurements,
  svgRef,
  onSelectPiece,
  onWheelZoom,
  onPan,
  screenToUser,
  onAddMeasurement,
  onRemoveMeasurement,
}: {
  pieces: Piece[];
  selectedPieceId: string | null;
  conflict: ConflictInfo | null;
  dimmed?: boolean;
  viewport: Viewport;
  scale: number;
  activeTool: EditorTool;
  measurements: Measurement[];
  svgRef: RefObject<SVGSVGElement | null>;
  onSelectPiece: (id: string) => void;
  onWheelZoom: (clientX: number, clientY: number, factor: number) => void;
  onPan: (dxScreen: number, dyScreen: number) => void;
  screenToUser: (clientX: number, clientY: number) => Point;
  onAddMeasurement: (a: Point, b: Point) => void;
  onRemoveMeasurement: (id: string) => void;
}) {
  const [pending, setPending] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snap, setSnap] = useState<Point | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const snapPoints = useMemo(
    () => pieces.flatMap((p) => p.vertices ?? []),
    [pieces],
  );

  // limiar de snap ~10px de tela convertido p/ unidades de usuário
  const thresholdUser = () => {
    const svg = svgRef.current;
    const w = svg?.clientWidth ?? 0;
    return w ? (10 * viewport.w) / w : 10;
  };

  // roda do mouse = zoom-ao-cursor (ambas as ferramentas); listener não-passivo p/ preventDefault
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      onWheelZoom(e.clientX, e.clientY, factor);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svgRef, onWheelZoom]);

  // trocar de ferramenta limpa preview; Esc cancela o ponto pendente na medição
  useEffect(() => {
    setPending(null);
    setSnap(null);
    setCursor(null);
    if (activeTool !== "medir") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPending(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool !== "cursor") return;
    drag.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeTool === "cursor") {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      onPan(dx, dy);
      drag.current = { x: e.clientX, y: e.clientY };
      return;
    }
    // medir: preview + snap
    const u = screenToUser(e.clientX, e.clientY);
    const s = nearestSnap(u, snapPoints, thresholdUser());
    setSnap(s);
    setCursor(s ?? u);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeTool === "cursor") {
      drag.current = null;
      svgRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  // clique no fundo do SVG: na medição, coloca/finaliza pontos
  const handleClick = (e: React.MouseEvent) => {
    if (activeTool !== "medir") return;
    const u = screenToUser(e.clientX, e.clientY);
    const s = nearestSnap(u, snapPoints, thresholdUser());
    const point = s ?? u;
    if (!pending) {
      setPending(point);
    } else {
      onAddMeasurement(pending, point);
      setPending(null);
    }
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`}
      className="h-full w-full transition-opacity duration-300"
      style={{
        opacity: dimmed ? 0.4 : 1,
        cursor: activeTool === "medir" ? "crosshair" : "grab",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    >
      {pieces.map((piece) => {
        const isSelected = piece.id === selectedPieceId;
        return (
          <g
            key={piece.id}
            onClick={() => {
              if (activeTool === "cursor" && !moved.current)
                onSelectPiece(piece.id);
            }}
            className={activeTool === "cursor" ? "cursor-pointer" : undefined}
          >
            {piece.guideOutline && (
              <OutlineShape
                outline={piece.guideOutline}
                className="stroke-pattern-guide fill-none"
                style={{ strokeWidth: 1.1, strokeDasharray: "5 4" }}
              />
            )}
            <OutlineShape
              outline={piece.outline}
              className={
                isSelected
                  ? "fill-olive-tint stroke-ink"
                  : "stroke-ink fill-white"
              }
              style={{ strokeWidth: 1.7 }}
            />
            {piece.grainline && (
              <line
                x1={piece.grainline.x1}
                y1={piece.grainline.y1}
                x2={piece.grainline.x2}
                y2={piece.grainline.y2}
                className="stroke-olive"
                style={{ strokeWidth: 1.2, strokeDasharray: "7 5" }}
              />
            )}
            {piece.dart && (
              <path
                d={piece.dart.d}
                className="stroke-olive fill-none"
                style={{ strokeWidth: 1.2 }}
              />
            )}
            <text
              x={piece.label.x}
              y={piece.label.y}
              className="fill-muted"
              style={{ fontSize: 11 }}
            >
              {piece.name.toUpperCase()} · {piece.qty}×
            </text>
          </g>
        );
      })}

      {conflict &&
        conflict.markers.map((marker, i) => (
          <circle
            key={i}
            cx={marker.cx}
            cy={marker.cy}
            r={marker.r}
            className="stroke-alert fill-none"
            style={{ strokeWidth: 2, strokeDasharray: "4 3" }}
          />
        ))}

      <MeasureLayer
        measurements={measurements}
        pending={pending}
        cursor={cursor}
        snap={snap}
        scale={scale}
        onRemove={onRemoveMeasurement}
      />
    </svg>
  );
}
```

- [ ] **Step 2: Wire CanvasArea**

Substituir todo `components/editor/CanvasArea.tsx` por:

```tsx
"use client";

import { useMemo, useRef } from "react";
import { useEditorStore } from "@/lib/store";
import { useCanvasViewport } from "@/lib/canvas/useCanvasViewport";
import { TabBar } from "./TabBar";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { PatternCanvas } from "./PatternCanvas";
import { FloatingToolbar } from "./FloatingToolbar";
import { ZoomControls } from "./ZoomControls";
import { PieceDetailsPanel } from "./PieceDetailsPanel";
import { ConflictInfoCard } from "./ConflictInfoCard";
import { FichaTecnicaTab } from "./FichaTecnicaTab";
import { PlanoCorteTab } from "./PlanoCorteTab";
import { Prova3DTab } from "./Prova3DTab";

export function CanvasArea() {
  const pattern = useEditorStore((s) => s.pattern);
  const conflict = useEditorStore((s) => s.conflict);
  const activeTab = useEditorStore((s) => s.activeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const selectedPieceId = useEditorStore((s) => s.selectedPieceId);
  const selectPiece = useEditorStore((s) => s.selectPiece);
  const detailsPanelOpen = useEditorStore((s) => s.detailsPanelOpen);
  const toggleDetailsPanel = useEditorStore((s) => s.toggleDetailsPanel);
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const generationStatus = useEditorStore((s) => s.generationStatus);
  const generationStepIndex = useEditorStore((s) => s.generationStepIndex);
  const cancelGeneration = useEditorStore((s) => s.cancelGeneration);
  const graduateSizes = useEditorStore((s) => s.graduateSizes);
  const measurements = useEditorStore((s) => s.measurements);
  const addMeasurement = useEditorStore((s) => s.addMeasurement);
  const removeMeasurement = useEditorStore((s) => s.removeMeasurement);
  const clearMeasurements = useEditorStore((s) => s.clearMeasurements);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const vbW = pattern?.viewBox?.w;
  const vbH = pattern?.viewBox?.h;
  const natural = useMemo(() => ({ w: vbW ?? 620, h: vbH ?? 380 }), [vbW, vbH]);
  const version = pattern?.version ?? 0;
  const vp = useCanvasViewport(svgRef, natural, version);

  if (!pattern) return null;
  const isGenerating = generationStatus === "generating";
  const selectedPiece =
    pattern.pieces.find((p) => p.id === selectedPieceId) ?? null;
  const hasPieces = pattern.pieces.length > 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {isGenerating ? (
        <GeneratingOverlay
          stepIndex={generationStepIndex}
          onCancel={cancelGeneration}
        />
      ) : (
        <TabBar
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          baseSize={pattern.baseSize}
          detailsOpen={detailsPanelOpen}
          onToggleDetails={toggleDetailsPanel}
          hasSelectedPiece={selectedPiece !== null && !conflict}
        />
      )}

      {activeTab === "molde2d" && (
        <div className="pattern-grid bg-paper relative min-h-[300px] flex-1 overflow-hidden p-[22px]">
          <PatternCanvas
            pieces={pattern.pieces}
            selectedPieceId={selectedPieceId}
            conflict={conflict}
            dimmed={isGenerating}
            viewport={vp.viewport}
            scale={vp.scale}
            activeTool={activeTool}
            measurements={measurements}
            svgRef={svgRef}
            onSelectPiece={selectPiece}
            onWheelZoom={vp.zoomAtScreen}
            onPan={vp.panByScreen}
            screenToUser={vp.screenToUser}
            onAddMeasurement={(a, b) =>
              addMeasurement({ id: crypto.randomUUID(), a, b })
            }
            onRemoveMeasurement={removeMeasurement}
          />
          {!isGenerating && !hasPieces && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <span className="font-display text-muted-2 text-[18px] font-semibold">
                Molde em branco
              </span>
              <span className="text-muted max-w-[300px] text-[12.5px]">
                Descreva a peça que você quer no chat ao lado — a IA gera seu
                primeiro molde do zero.
              </span>
            </div>
          )}
          {!isGenerating && hasPieces && (
            <FloatingToolbar activeTool={activeTool} onSelect={setActiveTool} />
          )}
          {!isGenerating && hasPieces && (
            <ZoomControls
              scale={vp.scale}
              onZoomIn={vp.zoomIn}
              onZoomOut={vp.zoomOut}
              onFit={vp.fitToScreen}
            />
          )}
          {!isGenerating && hasPieces && measurements.length > 0 && (
            <button
              onClick={clearMeasurements}
              className="bg-surface border-border rounded-item text-muted-2 hover:bg-surface-alt shadow-card absolute bottom-5 left-5 h-[34px] border px-3 text-[12px] transition-colors"
            >
              Limpar medições
            </button>
          )}
          {!isGenerating && conflict && (
            <ConflictInfoCard conflict={conflict} />
          )}
          {!isGenerating && !conflict && detailsPanelOpen && selectedPiece && (
            <PieceDetailsPanel
              piece={selectedPiece}
              pattern={pattern}
              onClose={toggleDetailsPanel}
              onGraduate={graduateSizes}
            />
          )}
        </div>
      )}
      {activeTab === "prova3d" && <Prova3DTab />}
      {activeTab === "ficha" && <FichaTecnicaTab pattern={pattern} />}
      {activeTab === "corte" && <PlanoCorteTab pattern={pattern} />}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + unit tests**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm test`
Expected: PASS (toda a suíte).

- [ ] **Step 4: Verify in the running app**

Run: `npm run dev` e abrir `http://localhost:3000`.

Verificar manualmente:

1. Gerar um molde pelo chat (ex.: "blusa feminina tamanho M"). A toolbar mostra só **cursor** e **medir**; cursor é a ferramenta inicial.
2. **Cursor**: roda do mouse dá zoom apontando pro cursor; arrastar move a tela; clicar (sem arrastar) numa peça abre os detalhes; o widget inferior-direito mostra `%` e os botões `−`/`+`/`ajustar à tela` funcionam.
3. **Medir**: cursor vira cruz; passar perto de um vértice mostra o realce (snap); 1º clique fixa o ponto A (linha-fantasma segue o cursor com a distância em cm); 2º clique grava a medição. Várias medições coexistem. `Esc` cancela um ponto A pendente.
4. Clicar numa medição existente a remove; o botão **"Limpar medições"** (inferior-esquerdo) some todas.
5. Gerar outra peça: as medições anteriores somem e o enquadramento reseta (ajustado à nova peça).

- [ ] **Step 5: Commit**

```bash
git add components/editor/PatternCanvas.tsx components/editor/CanvasArea.tsx
git commit -m "feat(canvas): pan/zoom no cursor e medição com snap no PatternCanvas"
```

---

## Self-Review

**Spec coverage:**

- Modelo de coordenadas (px, `/SCALE`) → Task 3 (`distanceCm`), Global Constraints.
- Cursor: scroll-zoom-ao-cursor, pan-arrasto, clique-seleciona, widget fit/reset → Tasks 2, 5, 6, 8.
- Medir: 2 cliques, cm, snap nos vértices, persistente, limpar/remover, Esc → Tasks 1, 3, 4, 7, 8.
- Zoom em ambas as ferramentas; pan só no cursor → Task 8 (wheel listener sempre; pan guardado por `activeTool === "cursor"`).
- Toolbar só cursor+medir; default cursor → Task 4.
- Viewport em hook local; medições no store; limpeza no reset/geração → Tasks 4, 5, 8.
- Vértices anexados sem tocar drafters individuais → Task 1.

**Placeholder scan:** nenhum TBD/TODO; todo passo com código completo.

**Type consistency:** `Viewport {x,y,w,h}`, `Point {x,y}`, `Measurement {id,a,b}`, `EditorTool "cursor"|"medir"` usados de forma idêntica entre tasks. Nomes do hook (`zoomAtScreen`, `panByScreen`, `zoomIn`, `zoomOut`, `fitToScreen`, `screenToUser`, `scale`, `viewport`) batem com o consumo no `CanvasArea` (Task 8). `nearestSnap(p, vertices, thresholdPx)` e `distanceCm(a,b)` batem entre Tasks 3, 7 e 8.
