# Subsistema 1 — Tooling & Quality Gates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabelecer Prettier (autoridade única de formatação), ESLint a11y strict, Husky/lint-staged e CI (GitHub Actions) como portões de qualidade, com um baseline de formatação isolado — tudo aditivo, sem tocar lógica de produto.

**Architecture:** Ferramentas puramente aditivas em cima do stack existente (Next 16 / flat-config ESLint / Vitest). Prettier formata; ESLint só linta (regras de formatação desligadas por `eslint-config-prettier`). Hooks locais (Husky) dão feedback rápido; o CI é o gate real. Typecheck é `next build` (nunca `tsc --noEmit`, que dá falso-positivo `LayoutProps` no Next 16).

**Tech Stack:** Prettier + `prettier-plugin-tailwindcss` + `eslint-config-prettier`, `eslint-plugin-jsx-a11y` (strict), Husky v9 + lint-staged, GitHub Actions, `.editorconfig`.

## Global Constraints

- **Não tocar lógica de produto, contrato da IA (`lib/ai.ts`) nem persistência (`lib/db/*`)** — este subsistema é só tooling. A única mudança de código-fonte permitida é a formatação do Prettier e correções pontuais que o `jsx-a11y` strict exigir.
- **Typecheck = `next build`.** NUNCA `tsc --noEmit` (falso-positivo `LayoutProps` em `app/layout.tsx` no Next 16).
- **Lint escopado em `app lib components`** no pre-push e no CI — bare `eslint` na raiz varre `.claude/worktrees` e dá falso-alarme.
- **Novos devDeps instalados com `--legacy-peer-deps`** (peer-deps do Auth.js beta vs Next 16). O CI usa `npm ci --legacy-peer-deps`.
- **`AGENTS.md` NÃO é reformatado** (auto-gerado pelo `next dev`) → entra no `.prettierignore`.
- **Prettier defaults** (sem overrides de estilo além do plugin Tailwind).
- **`smoke` fora do CI base** por ora (exige Docker + segredos + Postgres).
- **Baseline do Prettier em commit isolado** (`style:`), sem misturar com config.
- Mensagens de commit terminam com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Config de formatação (Prettier + editorconfig)

**Files:**

- Modify: `package.json` (devDeps + scripts `format`/`format:check`)
- Create: `.prettierrc`
- Create: `.prettierignore`
- Create: `.editorconfig`

**Interfaces:**

- Produces: scripts `npm run format` (`prettier --write .`) e `npm run format:check` (`prettier --check .`), consumidos pelo baseline (Task 2), lint-staged (Task 4) e CI (Task 5).

- [ ] **Step 1: Instalar devDeps do Prettier**

Run:

```bash
npm install -D --legacy-peer-deps prettier prettier-plugin-tailwindcss eslint-config-prettier
```

Expected: instala sem erro; `package.json` ganha as 3 devDeps; `package-lock.json` atualizado.

- [ ] **Step 2: Criar `.prettierrc`**

```json
{
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 3: Criar `.prettierignore`**

```
.next/
node_modules/
build/
out/
coverage/
prisma/migrations/
.claude/
AGENTS.md
package-lock.json
```

- [ ] **Step 4: Criar `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 5: Adicionar scripts `format`/`format:check` ao `package.json`**

No bloco `"scripts"`, adicionar:

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 6: Verificar que o Prettier roda (esperado: ACUSA arquivos não formatados)**

Run: `npm run format:check`
Expected: sai com código ≠ 0 e lista arquivos com "Code style issues found" — **isto é esperado nesta task** (a formatação real é a Task 2). O que se prova aqui é que a ferramenta está configurada e executa, incluindo o plugin do Tailwind sem erro de carregamento.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .prettierrc .prettierignore .editorconfig
git commit -m "chore(tooling): configura Prettier (autoridade de formatação) + editorconfig

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Baseline de formatação (commit isolado)

**Files:**

- Modify: todo o repo formatável (saída mecânica do `prettier --write`) — **sem mudança de lógica**.

**Interfaces:**

- Consumes: scripts `format`/`format:check` (Task 1).
- Produces: um repo 100% formatado; `format:check` limpo — pré-requisito pro subsistema 2 (rename) assentar por cima sem diff-ruído.

- [ ] **Step 1: Aplicar o Prettier ao repo inteiro**

Run: `npm run format`
Expected: reescreve os arquivos não conformes. É um diff GRANDE porém **puramente de formatação** (espaçamento, aspas, quebras) — nenhuma alteração de identificador, string ou lógica.

- [ ] **Step 2: Confirmar que a formatação está limpa**

Run: `npm run format:check`
Expected: "All matched files use Prettier code style!" (código 0).

- [ ] **Step 3: Provar que nada de lógica quebrou — testes**

Run: `npx vitest run`
Expected: os 144 testes atuais passam (o baseline não muda comportamento).

- [ ] **Step 4: Provar que compila/typecheck — build**

Run: `npm run build`
Expected: build verde. (Se falhar transitoriamente buscando `next/font/google`, é retry — caveat de rede conhecido.)

- [ ] **Step 5: Commit isolado (só formatação)**

```bash
git add -A
git commit -m "style: aplica Prettier ao repositório (baseline de formatação)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Nota ao revisor: este commit é 100% saída do `prettier --write`; a verificação é `format:check` limpo + testes/build verdes, não leitura linha-a-linha do diff.

---

### Task 3: Endurecer ESLint (jsx-a11y strict + eslint-config-prettier)

**Files:**

- Modify: `eslint.config.mjs`
- Modify: `package.json` (adicionar `eslint-plugin-jsx-a11y` como devDep explícito)
- Modify: arquivos em `app/`/`components/` que o a11y strict acusar (correções reais)

**Interfaces:**

- Consumes: flat-config existente (`eslint-config-next/core-web-vitals` + `typescript`).
- Produces: `npx eslint app lib components` limpo com a11y strict — base pro pre-push (Task 4) e CI (Task 5).

- [ ] **Step 1: Adicionar `eslint-plugin-jsx-a11y` como devDep explícito**

Run: `npm install -D --legacy-peer-deps eslint-plugin-jsx-a11y`
Expected: instala sem erro (já vinha transitivo via `eslint-config-next`; agora é dependência direta, com `flatConfigs.strict` disponível — confirme com `node -e "console.log(Object.keys(require('eslint-plugin-jsx-a11y').flatConfigs))"` → deve incluir `strict`).

- [ ] **Step 2: Atualizar `eslint.config.mjs`**

Adicionar o import do plugin e do config-prettier, inserir o preset **strict** depois dos configs do Next, e o **`eslint-config-prettier` por ÚLTIMO** (desliga regras de formatação conflitantes). Preservar o override de `no-unused-vars`.

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  jsxA11y.flatConfigs.strict,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  eslintConfigPrettier,
]);

export default eslintConfig;
```

**Caveat de integração (provável):** `eslint-config-next/core-web-vitals` já registra o plugin `jsx-a11y` (no nível `recommended`). Espalhar `jsxA11y.flatConfigs.strict` — que re-registra `plugins: { "jsx-a11y": ... }` — pode disparar `ConfigError: Config … Cannot redefine plugin "jsx-a11y"` no ESLint 9. Se isso ocorrer no Step 3, **não** espalhar o preset inteiro; em vez disso adicionar um config-object que só sobe as REGRAS strict sem re-registrar o plugin, ex.:

```js
{
  rules: jsxA11y.flatConfigs.strict.rules;
}
```

(pega apenas o mapa de regras do preset strict, reusando o plugin já registrado pelo Next). Verificar com o Step 3 que passa a valer o nível strict.

- [ ] **Step 3: Rodar o lint escopado e enumerar achados**

Run: `npx eslint app lib components`
Expected: pode acusar violações reais de a11y (ex.: `label` sem controle associado, `img` sem `alt`, handler sem role/teclado). **Anote cada achado.**

- [ ] **Step 4: Corrigir os achados reais**

Para cada achado: corrigir no componente (adicionar `alt`, associar `label`/`htmlFor`, `type="button"` em `<button>`, par teclado/mouse handler, etc.). Uma regra genuinamente inaplicável ao projeto é **rebaixada pontualmente** com comentário justificando (`// eslint-disable-next-line jsx-a11y/... — motivo`), **nunca** desligando o preset inteiro. Após editar, rodar `npm run format` nos arquivos alterados (o `eslint --fix` não formata).

- [ ] **Step 5: Verificar lint limpo**

Run: `npx eslint app lib components`
Expected: 0 erros (warnings de `no-unused-vars` `^_` toleráveis se houver).

- [ ] **Step 6: Verificar que testes e build seguem verdes**

Run: `npx vitest run && npm run build`
Expected: testes passam; build verde (correções a11y não mudam lógica).

- [ ] **Step 7: Commit**

```bash
git add eslint.config.mjs package.json package-lock.json app components lib
git commit -m "chore(lint): ativa jsx-a11y strict + eslint-config-prettier e corrige achados

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Husky + lint-staged (pre-commit / pre-push)

**Files:**

- Modify: `package.json` (devDeps `husky`/`lint-staged`, script `prepare`, bloco `lint-staged`)
- Create: `.husky/pre-commit`
- Create: `.husky/pre-push`
- Modify: `.gitattributes` (força LF nos hooks)

**Interfaces:**

- Consumes: scripts/configs das Tasks 1–3 (`prettier`, `eslint`, `vitest`).
- Produces: hooks locais de pre-commit (rápido, staged) e pre-push (pesado).

- [ ] **Step 1: Instalar Husky + lint-staged e inicializar**

Run:

```bash
npm install -D --legacy-peer-deps husky lint-staged
npx husky init
```

Expected: cria `.husky/` (com um `pre-commit` placeholder) e adiciona `"prepare": "husky"` em `scripts`. (Se o `husky init` sobrescrever/mexer em outros scripts, reverter essas mudanças não intencionais.)

- [ ] **Step 2: Adicionar o bloco `lint-staged` ao `package.json`**

```json
"lint-staged": {
  "*.{ts,tsx}": ["prettier --write", "eslint --fix", "vitest related --run"],
  "*.{js,mjs,cjs,json,css,md}": "prettier --write"
}
```

- [ ] **Step 3: Escrever `.husky/pre-commit`**

Conteúdo (Husky v9 — script direto, sem shebang de sourcing):

```sh
npx lint-staged
```

- [ ] **Step 4: Escrever `.husky/pre-push`**

```sh
npm run test
npx eslint app lib components
```

- [ ] **Step 5: Forçar LF nos hooks via `.gitattributes`**

Adicionar ao `.gitattributes` (hooks não têm extensão `.sh`, então a regra atual não os cobre — CRLF quebraria a execução):

```
.husky/* text eol=lf
```

- [ ] **Step 6: Provar o pre-commit — bloqueia erro e formata**

Teste manual:

1. Introduzir num arquivo `.tsx` sob `components/` um erro de lint deliberado (ex.: `<img>` sem `alt`) e desformatar uma linha.
2. `git add` desse arquivo e tentar `git commit -m "teste"`.
   Expected: o hook roda `lint-staged`, o Prettier reformata, e o `eslint --fix`/regra a11y **bloqueia o commit** (código ≠ 0). Desfazer o erro deliberado; confirmar que aí o commit passa (e o arquivo saiu formatado). Confirmar que `git commit --no-verify` burla (documentado: gate real é o CI).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .husky .gitattributes
git commit -m "chore(tooling): Husky + lint-staged (pre-commit rápido / pre-push suíte cheia)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: CI (GitHub Actions) + script typecheck

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (script `typecheck`)

**Interfaces:**

- Consumes: `format:check`, `eslint`, `vitest`, `build` das tasks anteriores.
- Produces: gate de CI em push/PR.

- [ ] **Step 1: Adicionar script `typecheck` ao `package.json`**

```json
"typecheck": "next build"
```

- [ ] **Step 2: Criar `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci --legacy-peer-deps
      - run: npm run format:check
      - run: npx eslint app lib components
      - run: npx vitest run
      - name: Build (typecheck)
        run: npm run build
        env:
          # Dummies não-secretos: o build importa rotas que instanciam PrismaClient
          # (lib/db/prisma.ts) e o NextAuth, que exigem estas envs no import — mas o
          # build NÃO conecta em nada. Nunca colocar segredos reais aqui.
          DATABASE_URL: "postgresql://user:pass@localhost:5432/db?schema=public"
          AUTH_SECRET: "ci-dummy-not-a-real-secret"
          ANTHROPIC_API_KEY: "sk-ci-dummy"
```

- [ ] **Step 3: Validar o YAML localmente (sintaxe)**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(!/jobs:\s/.test(y)) throw new Error('yaml sem jobs'); console.log('ci.yml ok, bytes:', y.length)"`
Expected: imprime "ci.yml ok, bytes: N" sem lançar. (Validação completa é o próprio runner do GitHub ao subir a branch.)

- [ ] **Step 4: Confirmar que os comandos do CI passam localmente**

Run: `npm run format:check && npx eslint app lib components && npx vitest run`
Expected: os três verdes. (`npm run build` já foi provado nas tasks anteriores; não repetir aqui pra não pagar o custo de rede das fontes.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci: workflow de qualidade (format-check, eslint escopado, vitest, next build)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verificação final (após todas as tasks)

1. `npm run format:check` → limpo.
2. `npx eslint app lib components` → 0 erros.
3. `npm run build` → verde (typecheck).
4. `npx vitest run` → 144/144.
5. Hooks: um commit de teste dispara o pre-commit; um push dispara o pre-push — ambos observados.
6. Push da branch `chore/tooling-quality-gates` → workflow de CI verde no GitHub.
7. Baseline do Prettier num commit `style:` isolado, pronto pro subsistema 2.
