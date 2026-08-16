# Subsistema 1 — Tooling & Quality Gates (design)

**Data:** 2026-08-16
**Contexto maior:** faxina de qualidade do repo em 3 subsistemas independentes — **1 (tooling)** → 2 (rename total p/ inglês) → 3 (i18n pt-BR). Cada um com seu ciclo spec→plano→SDD.
**Status:** design aprovado

## Objetivo

Estabelecer as ferramentas de qualidade e os portões (gates) do repositório **antes** do rename total (subsistema 2), de modo que a formatação esteja settada e o diff do rename fique limpo. Puramente aditivo: **não toca lógica de produto, contrato da IA, nem persistência.**

## Escopo

**Dentro:**
- **Prettier** como autoridade única de formatação, integrado ao ESLint (sem conflito de regras) e com ordenação de classes Tailwind v4.
- **ESLint** mais rígido em acessibilidade (jsx-a11y strict) sobre a base do `eslint-config-next` (que já traz TS/React/hooks/a11y).
- **Husky + lint-staged** com split pre-commit (rápido) / pre-push (pesado).
- **CI (GitHub Actions)** como gate real: format-check + lint + `next build` (typecheck) + testes.
- **`.editorconfig`**, script `format`/`format:check`, script `typecheck` (= `next build`).
- Um **commit de baseline** que aplica o Prettier a todo o repo (antes de ligar os hooks).

**Fora (não fazer neste subsistema):**
- Rename de arquivos/identificadores/valores para inglês → **subsistema 2**.
- i18n / extração de strings → **subsistema 3**.
- `commitlint`/conventional-commits e threshold de cobertura Vitest → opcionais, deixados de fora (podem virar follow-up).
- `smoke:prod` dentro do CI → **fora por ora** (exige Docker + segredos reais + Postgres no runner). Fica como job opcional/deferido; documentar como rodar localmente.

## Decisões (confirmadas com o usuário)

1. **Prettier é a única autoridade de formatação;** ESLint não formata (regras de estilo desligadas via `eslint-config-prettier`).
2. **Typecheck NUNCA via `tsc --noEmit`** — dá falso-positivo `LayoutProps` em `app/layout.tsx` no Next 16. O typecheck confiável é `next build`, que roda no CI (lento demais p/ hook).
3. **`smoke` fora do CI base** por ora (evita exigir segredos/Docker no runner).
4. **Novos devDeps entram com `--legacy-peer-deps`** (faixa de peer-deps do Auth.js beta vs Next 16).
5. **Split de hooks:** pre-commit roda só sobre arquivos staged e testes relacionados; a suíte cheia e o lint escopado ficam no pre-push.

## Ferramentas e configuração

### Prettier
- Deps (dev): `prettier`, `eslint-config-prettier`, `prettier-plugin-tailwindcss`.
- **`.prettierrc`** (raiz), explícito e mínimo — os defaults do Prettier + o plugin do Tailwind:
  ```json
  {
    "plugins": ["prettier-plugin-tailwindcss"]
  }
  ```
  (Sem overrides de estilo além do plugin: adotar os defaults do Prettier reduz bikeshedding.)
- **`.prettierignore`:** `.next/`, `node_modules/`, `prisma/migrations/`, `.claude/`, `*.md` gerados que não queremos reflow (avaliar; a princípio formatar `.md` também), `AGENTS.md` (auto-gerado pelo `next dev` — **não** reformatar, senão briga com o regenerador).
- Scripts:
  - `"format": "prettier --write ."`
  - `"format:check": "prettier --check ."`

### ESLint (endurecimento a11y)
- Dep (dev): `eslint-plugin-jsx-a11y`.
- No `eslint.config.mjs` (flat config já existente):
  - Adicionar o preset **`jsx-a11y` strict** (via `plugin.flatConfigs.strict` do pacote).
  - **`eslint-config-prettier` por ÚLTIMO** no array (desliga regras de formatação que conflitem).
  - Manter o override atual de `no-unused-vars` (`^_`).
- Sem mudar o comando `lint` (bare `eslint`) — mas o **pre-push e o CI usam `eslint app lib components`** (escopado), porque bare `eslint` na raiz varre `.claude/worktrees` e dá falso-alarme.

### Husky + lint-staged
- Deps (dev): `husky`, `lint-staged`.
- `husky init` cria `.husky/`; `"prepare": "husky"` no package.json.
- **`.husky/pre-commit`** → `npx lint-staged`.
- **`lint-staged`** (config no `package.json` ou `.lintstagedrc`) — cada glob aparece **uma vez**, com array de comandos rodados em ordem:
  ```json
  {
    "*.{ts,tsx}": ["prettier --write", "eslint --fix", "vitest related --run"],
    "*.{js,mjs,cjs,json,css,md}": "prettier --write"
  }
  ```
  (`.tsx`/`.ts` levam formatação + lint-fix + testes relacionados; os demais só formatação. `vitest related --run` recebe os arquivos staged e roda apenas os testes que os importam.)
- **`.husky/pre-push`** (mais pesado, não por-arquivo):
  ```sh
  npm run test        # vitest run — suíte cheia
  npx eslint app lib components
  ```
  `next build` **não** entra no pre-push (lento + o build de fontes pode flakar sem rede); typecheck fica no CI.

### CI — GitHub Actions
- Arquivo: `.github/workflows/ci.yml`.
- Dispara em `push` e `pull_request`.
- Node 20 (alinha com `@types/node ^20`); `npm ci --legacy-peer-deps`.
- Passos (um job `quality`):
  1. `npm run format:check`
  2. `npx eslint app lib components`
  3. `npx vitest run`
  4. `npm run build` (é o typecheck confiável; **não** usar `tsc --noEmit`).
- **`next build` no CI:** não precisa de Postgres (o `postinstall`/`prisma generate` só lê o schema). Se o build acusar env obrigatória, injetar placeholders dummy não-secretos via `env:` do step (ex.: `AUTH_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY` com valores fake) — **nunca** segredos reais no YAML; o build não conecta em nada.
- **`smoke` NÃO entra** neste workflow (ver decisão 3). Documentar no spec/README que o smoke roda local via `npm run smoke:prod`.
- Caveat de fontes: `next build` busca Bricolage/Archivo via `next/font/google` pela rede — o runner tem rede, então ok; se flakar, é retry (já documentado no workflow do Docker).

### Extras
- **`.editorconfig`** (raiz): `charset=utf-8`, `end_of_line=lf`, `insert_final_newline=true`, `indent_style=space`, `indent_size=2`; override `*.sh` → `end_of_line=lf` (coerente com `.gitattributes` que já trava isso).
- Script **`"typecheck": "next build"`** — pra CI e uso manual, deixando explícito que é o typecheck do projeto.

## Ordem de execução (dentro do subsistema)

1. Instalar Prettier + config + ignore + scripts.
2. **Commit de baseline**: `npm run format` sobre todo o repo, num commit isolado `style: aplica Prettier ao repositório` (sem misturar com outra mudança). Isso precisa entrar antes do subsistema 2.
3. Endurecer ESLint (jsx-a11y strict + `eslint-config-prettier`), corrigir o que a11y strict acusar.
4. `.editorconfig` + script `typecheck`.
5. Husky + lint-staged (pre-commit + pre-push).
6. CI workflow.

## Testes / verificação

Este subsistema é tooling — a "verificação" é operacional, não unit:
- `npm run format:check` limpo após o baseline.
- `npx eslint app lib components` sem erros (a11y strict pode acusar itens reais → corrigir no próprio subsistema; se algum for inviável agora, rebaixar aquela regra específica com justificativa inline, não desligar o preset).
- `npm run build` verde (typecheck).
- `npx vitest run` verde (os 144 testes atuais seguem passando — o tooling não muda lógica).
- **Hooks provados na prática:** um commit de teste dispara pre-commit (formata + lint + testes relacionados); um push dispara pre-push (suíte cheia + lint escopado). Provar que o pre-commit **bloqueia** um commit com erro de lint e que `--no-verify` o burla (documentar que o gate real é o CI).
- CI: abrir um PR de teste (ou push numa branch) e ver o workflow verde.

## Limitações anotadas

- **Husky é burlável** (`--no-verify`) — por isso o CI é o gate real; o hook é conveniência/feedback rápido.
- **`vitest related` depende do grafo de import do Vitest** — em casos raros pode não pegar um teste afetado indiretamente; a rede de segurança é o pre-push (suíte cheia) + CI.
- **a11y strict pode gerar ruído inicial** — a primeira passada corrige os achados reais; regras genuinamente inaplicáveis ao projeto são rebaixadas pontualmente com comentário, nunca desligando o preset inteiro.
- **`smoke` ausente do CI** — regressão tipo `trustHost`/UntrustedHost não é pega pelo CI base; continua dependendo do `npm run smoke:prod` local. Candidato a job de CI futuro (precisa de service Postgres + segredos).

## Aceite

1. `npm run format:check`, `npx eslint app lib components`, `npm run build`, `npx vitest run` — todos limpos.
2. Commit dispara pre-commit; push dispara pre-push; ambos observados funcionando.
3. Workflow de CI verde num push/PR de teste.
4. Baseline do Prettier commitado isoladamente, pronto p/ o subsistema 2 assentar por cima.
