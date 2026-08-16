# Subsistema 2 — Rename total para inglês (design)

**Data:** 2026-08-16
**Contexto maior:** faxina de qualidade em 3 subsistemas — 1 (tooling ✅, em main) → **2 (rename total p/ inglês)** → 3 (i18n pt-BR). Ver [[repo-quality-faxina-roadmap]].
**Status:** design aprovado

## Objetivo

Padronizar **todo o código** em inglês: identificadores (arquivos, funções, variáveis, tipos), **chaves do contrato de wire** (`GarmentSpec`/`EditorState`/`Measurements`…) e **valores de enum de domínio** (`"blusa"`→`"blouse"`). O produto é brasileiro: **texto de exibição e o idioma da IA seguem em pt-BR**. Isso é pré-requisito de manutenção antes do subsistema 3 (i18n).

## Escopo

**Dentro:**

- Renomear identificadores PT→EN em `app/`, `lib/`, `components/`, `prisma/seed.ts`, `scripts/`.
- Renomear as **chaves do wire** e os **valores de enum** que trafegam entre IA ↔ servidor ↔ cliente ↔ blob persistido.
- Atualizar o schema da tool e o system prompt em `lib/ai.ts` (o texto do prompt segue pt-BR, mas passa a referenciar os tokens EN).
- Adicionar mapa(s) de **rótulo PT** onde um valor de enum é exibido cru na UI (hoje só `FichaTecnicaTab`).
- Migração Prisma que **reseta os moldes** (o shape do blob muda).
- Reescrever o CLAUDE.md (hoje repleto de identificadores PT).
- Renomear arquivos e mover os testes junto; atualizar todos os valores PT dentro dos testes.

**Fora (não fazer nesta fase):**

- Traduzir texto de exibição / chat / labels de aba → **fica pt-BR** (subsistema 3, i18n).
- Traduzir o system prompt ou as respostas da IA → **seguem pt-BR**.
- Qualquer mudança de comportamento, geometria, fluxo de créditos ou lógica.

## Fronteira (o que muda vs. o que fica)

| Vira inglês                                                  | Fica pt-BR                                                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Nomes de arquivo, função, variável, tipo                     | Texto de exibição: `name` de peça ("Manga"), labels de Chip/`detailRows`, chat, labels de aba ("Ficha técnica", "Plano de corte") |
| Chaves do wire (`tipo`→`type`, `busto`→`bust`)               | Idioma do system prompt e das respostas da IA (`assistantMessage`)                                                                |
| Valores de enum (`"blusa"`→`"blouse"`, `"evase"`→`"a-line"`) | Rótulos exibidos derivados de enum (via mapa PT novo)                                                                             |

**Guard de display:** onde um valor de enum aparece cru na tela, adicionar um mapa PT. Hoje é só `components/editor/FichaTecnicaTab.tsx:35` (`value={pattern.spec.tipo}` → precisa de `GARMENT_TYPE_LABELS_PT[type]`). O `sexo` na linha 38 já usa um ternário PT — manter esse padrão. Piece `name` continua sendo string PT de display; só o `id` da peça vira EN.

## Glossário canônico (PT → EN) — confirmado com o usuário

### Enums (tipo → valores)

- `GarmentType`: `blusa`→`blouse`, `vestido`→`dress`, `saia`→`skirt`, `camiseta`→`tshirt`
- `Sexo`→`Gender` (campo `sexo`→`gender`): `fem`→`female`, `masc`→`male`
- `Decote`→`Neckline` (campo `decote`→`neckline`): `reto`→`straight`, `V`→`V`, `redondo`→`round`
- `MangaLen`→`SleeveLength` (campo `manga`→`sleeve`): `sem`→`none`, `curta`→`short`, `longa`→`long`
- `SaiaSilhueta`→`SkirtSilhouette` (campo `saia`→`skirt`): `reta`→`straight`, `evase`→`a-line`, `gode`→`gore`, `meia-roda`→`half-circle`, `circulo`→`circle`

### GarmentSpec / GarmentStyle

- `tipo`→`type`, `sexo`→`gender`
- `decoteProfundidadeCm`→`necklineDepthCm`, `compSaiaCm`→`skirtLengthCm`
- `pences`→`darts`, `folgaCosturaCm`→`seamAllowanceCm`
- `cavaAjusteCm`→`armholeDeepenCm`, `mangaRefit`→`sleeveRefit`
- (`measurementOverrides`, `style` já EN)

### Measurements

- `busto`→`bust`, `cintura`→`waist`, `quadril`→`hip`, `alturaQuadril`→`hipHeight`
- `comprimentoCostas`→`backLength`, `ombro`→`shoulder`
- `compSaia`→`skirtLength`, `compMangaCurta`→`shortSleeveLength`, `compMangaLonga`→`longSleeveLength`
- Consts: `SIZE_TABLE` (fem, mantém nome), `SIZE_TABLE_MASC`→`SIZE_TABLE_MALE`, `MEASUREMENT_RANGES` (mantém), `resolveMeasurements(size, overrides, gender = "female")`

### Arquivos / funções / ids de peça

- `lib/draft/corpo.ts`→`body.ts`, `manga.ts`→`sleeve.ts`, `saia.ts`→`skirt.ts` (+ os `.test.ts` correspondentes)
- `draftCorpo`→`draftBody`, `draftManga`→`draftSleeve`, `draftSaia`→`draftSkirt`, `refitManga`→`refitSleeve`
- ids de peça: `frente`→`front`, `costas`→`back`, `manga`→`sleeve`, `corpo`→`body`, `saia`→`skirt`

_(Este glossário é a fonte da verdade do rename; o plano o cita verbatim.)_

## Trust boundary preservada

`validateSpec`/`validateQuestions` (`lib/draft/garment.ts`) continuam sendo a fronteira: passam a validar/clampar os **enums EN** e as **chaves EN**. A IA nunca é confiada — só que agora emite tokens EN. O fluxo de crédito (débito→draft, refund em decline/clarify/erro, 402 sem débito/sem IA) fica **byte-idêntico em comportamento**; só nomes mudam. Model id segue **`claude-sonnet-5`** exato. Segredos nunca commitados.

## Migração do blob (reset)

Nova migração Prisma `reset_moldes_english`: `DELETE FROM "Molde";` (não dropar a tabela — só esvaziar). No deploy o `docker-entrypoint.sh` roda `prisma migrate deploy` e zera; no próximo acesso `withMolde`/`loadMolde` re-semeiam com o `seedState()` já no shape EN. O `EditorState` persistido muda de shape (chaves do spec/measurements em EN), por isso o reset — moldes antigos (PT) não desserializam no código novo.

## Estrutura / decomposição (espinha serial + camadas paralelas)

Um rename repo-wide não paraleliza livremente: renomear um símbolo exige atualizar todos os seus usos **atomicamente**, senão o build quebra. Estratégia:

1. **Espinha serial (base de tipos), um commit que atravessa o build:** `lib/types.ts` + `lib/measurements.ts` — renomeia tipos, chaves de `Measurements`, `GarmentSpec`/`GarmentStyle`, enums e seus valores, `SIZE_TABLE_MALE`, `resolveMeasurements`. Como isso é importado por quase tudo, o build ficará vermelho até as camadas consumidoras serem atualizadas — então este e os consumidores diretos entram **na mesma task** (drafters + `garment.ts` validateSpec/validateQuestions), fechando com build/verde.
2. **Camadas mais independentes, paralelizáveis por arquivos disjuntos** (cada uma com build/test verde no fim):
   - `lib/draft/*` (rename de arquivos corpo/manga/saia + funções) — acoplado à espinha, vai junto ou logo após.
   - `lib/ai.ts` (schema da tool + prompt PT→tokens EN) + `lib/ai.test.ts`.
   - `lib/editor/state.ts` (`refitManga`→`refitSleeve`, `getSpec`, conflito) + testes.
   - Rotas `app/api/*` + testes.
   - `lib/store.ts` + `lib/api-client.ts` + componentes (`components/editor/*`), incluindo o guard de display no `FichaTecnicaTab`.
   - `lib/export/*` (usa `spec`/`Measurements`/piece ids) + testes.
3. **Migração Prisma** (reset) — independente, qualquer ponto.
4. **CLAUDE.md** — reescrita, por último (reflete o estado final).

O plano define as tasks e quais podem correr em paralelo (revisão read-only sobrepondo o próximo implementer; nunca dois committers; a espinha de tipos é serial).

## Testes

- **Unit (Vitest):** os testes existentes migram junto — todo literal PT de enum/chave dentro deles vira EN (ex.: `tipo: "blusa"` → `type: "blouse"`, `busto: 90` → `bust: 90`). `validateSpec`/`validateQuestions` passam a ter casos com enums EN (inclusive rejeição de valor inválido). `applyGarmentSpec`/`refitSleeve`/conflito seguem cobertos. `lib/ai.test.ts` valida o parse do tool_use com tokens EN.
- **Rotas:** mocks de `@/lib/db/molde` e guard seguem; asserções de texto de chat (pt-BR) **inalteradas** (display não muda). Fluxo de crédito coberto como hoje.
- `npm test` continua sem exigir Postgres.
- **Gate:** `npm run format:check`, `npx eslint app lib components`, `npx vitest run`, `npm run build` — todos limpos (o subsistema 1 agora os garante).
- **E2E (Docker prod):** aplicar a migração de reset, gerar uma peça, `docker compose restart app` → persiste no shape EN; `npm run smoke:prod`.

## Limitações anotadas

- **Reset apaga moldes existentes** — aceito (dado dev, pré-produção; decisão do usuário). Em produção real isso seria uma migração de dados, não um reset.
- **Prompt PT referenciando tokens EN** — o system prompt segue em pt-BR mas mapeia o vocabulário do usuário (camiseta, masculina, gode) para os tokens EN (`tshirt`, `male`, `gore`); precisa de exemplos claros no prompt pra o modelo preencher os tokens certos. `validateSpec` é a rede se o modelo errar.
- **Texto de display fica PT** — mistura consciente (código EN + UI PT) até o subsistema 3 externalizar as strings.
- **Diff grande** — mitigado por: (a) subsistema 1 já formatou tudo (o rename não carrega ruído de formatação); (b) decomposição em tasks com build verde em cada fecho.

## Verificação (aceite)

1. `grep -rInE '\b(blusa|vestido|camiseta|saia|busto|cintura|quadril|ombro|decote|manga|pence|cava|corpo|frente|costas|evase|gode)\b' app lib components` retorna **só ocorrências de display pt-BR intencionais** (nomes de peça, labels), nenhuma chave/identificador/valor de enum.
2. `npm run build` + `eslint app lib components` + `vitest run` limpos.
3. Gerar peça pela IA (pedido em pt-BR "faça uma blusa feminina") → `validateSpec` produz `type: "blouse"`, `gender: "female"`; peças desenham; resposta da IA em pt-BR.
4. `FichaTecnicaTab` mostra "Blusa" (rótulo PT), não "blouse".
5. Migração de reset aplicada; molde persiste no shape EN após restart (Docker).
6. CLAUDE.md reflete os nomes EN.
