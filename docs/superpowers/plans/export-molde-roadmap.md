# Export do molde — roadmap / checklist de fases

Feature: export real do molde no editor. Spec:
`docs/superpowers/specs/2026-08-16-export-molde-design.md`.
Cada fase é shippable e revisável sozinha; o `ExportModel` e a fachada
`exportPattern` já foram desenhados pra receber as fases 2/3 sem refactor.

---

## ✅ Fase 1 — Núcleo + SVG 1:1 (mergeada em `main`, cc2b9b0)

- [x] `draftPiecesCm(spec, size)` exposto em `lib/draft/garment.ts` (cm exatos, sem regressão no `draftGarment`)
- [x] `ExportModel` + `outlineSegments` + `buildExportModel` (`lib/export/model.ts`)
- [x] Serializer `toSvg` 1:1 em mm (`lib/export/svg.ts`, `MM=10`)
- [x] `download.ts` + fachada `exportPattern` (`lib/export/index.ts`)
- [x] Menu de formato no `Footer` (SVG), desabilitado em conflito/vazio/sem-spec
- [x] Doc no `CLAUDE.md`
- [x] Review de branch inteira (opus): Ready to merge = Yes; suíte 72/72

### Pendências herdadas da Fase 1 (não bloqueiam — dobrar na Fase 2 ou fazer avulso)

- [ ] **Verificação manual (Step 3 da Task 6):** `npm run dev` → gerar molde → "Exportar" → SVG → abrir no Inkscape e confirmar 1:1 (aresta conhecida bate em cm)
- [ ] Minor: `escapeXml` não neutraliza `--` dentro do comentário `<!-- -->` (patternName com `--` gera XML de comentário tecnicamente malformado). Fix: mover a anotação pra `<title>`/`<desc>` (já cobertos por `escapeXml`) ou colapsar `-` no comentário
- [ ] Minor: caminho `seamAllowanceCm === null` (`?? 0` no header do SVG) não coberto por teste (inalcançável em produção, código defensivo)
- [ ] Minor: reclicar o gatilho "Exportar" com o menu aberto fecha via backdrop em vez de alternar (UX cosmética)
- [x] Minor: `exportPattern` no-op silencioso para formato não tratado — resolvido na Fase 2 (Task 3): `switch`/`never` exaustivo em `lib/export/index.ts`

---

## ✅ Fase 2 — DXF geometria 1:1 (CAD) (mergeada em `main`, 177bcf5)

Spec: `docs/superpowers/specs/2026-08-16-export-molde-dxf-fase2-design.md`.
Plano: `docs/superpowers/plans/2026-08-16-export-molde-dxf-fase2.md`.
DXF **de geometria pragmático** (não AAMA/ASTM estrito) — abre 1:1 em qualquer
leitor DXF e entra no Audaces como vetor real na escala certa.

- [x] Spec + plano (brainstorm → writing-plans)
- [x] `flattenCubic` — De Casteljau **adaptativo** por tolerância (0,2mm), helper testável isolado (`lib/export/dxf.ts`)
- [x] `toDxf`: `LWPOLYLINE` fechada por contorno + `LINE` (fio) + `TEXT` (rótulo); mm (coords × 10); `$INSUNITS=4` + `$ACADVER=AC1014`; **Y invertido** (eixo +Y do DXF)
- [x] Camadas nomeadas: `CONTORNO` / `INTERNO` (dart) / `GRAINLINE` / `TEXTO`
- [x] `"dxf"` em `ExportFormat` e no menu do `Footer`; dispatch `switch`/`never` (resolveu o Minor da Fase 1)
- [x] Testes: `flattenCubic` (erro curva→polilinha ≤ tol) + `toDxf` ($INSUNITS/$ACADVER, 4 layers, LWPOLYLINE/LINE/TEXT, 1:1, achatamento insere vértices); suíte 80/80
- [x] Doc no `CLAUDE.md`; review de branch inteira (opus) = Ready to merge

### Pendências herdadas da Fase 2 (não bloqueiam)

- [ ] **Verificação manual:** `npm run dev` → gerar molde → "Exportar" → DXF → abrir no LibreCAD e conferir 1:1, orientação (não espelhada), curvas suaves, layers
- [ ] Minor: sem teste dedicado pro fallback de corda degenerada (`p0≈p3`) em `flattenCubic` (path defensivo)
- [ ] Minor: `·` (U+00B7) em `TEXT`/`999` herdado do SVG — validar charset ao importar no Audaces (Fase 2.5)

---

## ⬜ Fase 2.5 — DXF AAMA/ASTM D6673 estrito (quando houver Audaces pra validar)

Objetivo: camadas numéricas do padrão + semântica de peça de produção
(piques/notches, grain reconhecido) que o Audaces/Gerber/Lectra importam como
peça pronta — não só geometria. Requer o Audaces em mãos pra verificar de verdade.

- [ ] Brainstorm/spec do mapeamento de camadas numéricas (ASTM D6673) e entidades exigidas
- [ ] Plano + implementação (novo serializer ou modo do `toDxf`)
- [ ] Piques/notches semânticos; grain como entidade reconhecida
- [ ] Verificação manual: importar no Audaces como peça de produção
- [ ] Review + merge

---

## ✅ Fase 3 — PDF tiling (impressão caseira + folha única) (mergeada em `main`, cac2662)

Spec: `docs/superpowers/specs/2026-08-16-export-molde-pdf-fase3-design.md`.
Plano: `docs/superpowers/plans/2026-08-16-export-molde-pdf-fase3.md`.
PDF 1:1 em **dois modos**: `PDF · A4 (colar em casa)` (fatiado) e
`PDF · folha única (plotter)` (uma página do tamanho do molde).

- [x] Spec + plano (brainstorm → writing-plans)
- [x] Dep `pdf-lib` (única dep runtime nova), via `import()` dinâmico dentro de `toPdf` (code-split)
- [x] `planTiles` — grade A4 (sobreposição de colagem 1cm, numeração linha/coluna) ou folha única; helper puro testável
- [x] `flattenOutlineCm` — extraído de `toDxf` (DRY DXF/PDF), refatoração behavior-preserving
- [x] `toPdf(model, mode)` async — contorno/fio/dart/rótulo 1:1, Y invertido, régua de calibração **10cm** na 1ª folha
- [x] `"pdf-a4"`/`"pdf-single"` em `ExportFormat` e no menu do `Footer`; dispatch `switch`/`never` (4 formatos, cases PDF fire-and-forget)
- [x] Testes: `planTiles`/`rulerTicksCm`/`flattenOutlineCm` + `toPdf` (magic `%PDF`, nº de páginas via `PDFDocument.load`, folha única 1:1); suíte 88/88
- [x] Doc no `CLAUDE.md`; review de branch inteira (opus) = Ready to merge = Yes

### Pendências herdadas da Fase 3 (não bloqueiam)

- [ ] **Verificação manual:** `npm run dev` → gerar molde → Exportar → PDF · A4 → imprimir a 100% e medir a régua (10cm = 10cm); montar 2 folhas pela sobreposição; conferir folha única no tamanho real
- [ ] Minor: caixa da régua tem largura fixa (10,6cm); num `single` mais estreito que ~9,9cm vaza pela direita — clampar a largura da caixa a `pageWcm − 2·margem`
- [ ] Minor: `TOL_CM` redeclarado em `pdf.ts` — importar de `./dxf` (DRY)
- [ ] Melhoria: `.catch(() => {})` engole falha do PDF sem feedback — futuro toast/erro inline (alinha com a convenção "limitações na UI" do CLAUDE.md)

---

## Fora de escopo (do feature de export como um todo)

- Offset de margem de costura (linha de corte = contorno + folga deslocada com tratamento de canto/curva) — recurso de geometria à parte
- Graduação multi-tamanho no arquivo (nest AAMA graduado) — depende de a graduação virar real primeiro
- PLT/HPGL — nicho, YAGNI
- Rota de servidor / persistência do arquivo — download client-side basta
