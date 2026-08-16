# Dockerizar a aplicação completa (app + db) — design

**Data:** 2026-08-16
**Status:** aprovado (brainstorming)
**Contexto:** Hoje o `docker-compose.yml` sobe só o Postgres; o app Next.js roda com `npm run dev` na máquina. Objetivo: subir **app + db juntos com um comando** (`docker compose up`), sem separar. Next.js 16, Prisma v6, Auth.js v5; Fase A (auth) já mergeada em main.

## 1. Escopo e princípio

- Um `docker compose up` sobe **`db`** (Postgres, inalterado) **e** um novo serviço **`app`** (Next.js), ligados na rede do compose.
- **Aditivo, não substituto:** o fluxo host atual (`npm run dev` + Prisma CLI em `localhost:5433`, `npm test`) continua funcionando sem mudança.
- **Dois modos:** dev (padrão, hot reload) e produção (override opcional).

### Fora de escopo

- Deploy em nuvem / registry / orquestração. Continua local-real.
- Mudar a lógica do app, auth, crédito ou o mock in-memory (Fase B/C intocadas).

## 2. Arquivos

| Arquivo                   | Responsabilidade                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`              | Multi-stage `node:22-alpine`: `deps` (npm ci + prisma generate) → `dev` target (hot reload, source bind-montado) / `build` (next build) → `runner` target (prod: `.next` + node_modules + `next start`) |
| `docker-entrypoint.sh`    | Espera o db, roda `prisma migrate deploy` + seed (idempotente), depois `exec` no CMD                                                                                                                    |
| `docker-compose.yml`      | Padrão = dev: `db` (com healthcheck `pg_isready`) + `app` (target dev, bind mount, volumes anônimos p/ node_modules e .next, `depends_on` db healthy, porta 3000)                                       |
| `docker-compose.prod.yml` | Override: `app` builda o target `runner`, sem bind mount, `next start`                                                                                                                                  |
| `.dockerignore`           | Exclui `node_modules`, `.next`, `.git`, `.env*`, `.superpowers`, `docs`, etc. (contexto enxuto; segredos nunca em camadas de imagem)                                                                    |
| `package.json`            | Scripts `docker:up` e `docker:prod`                                                                                                                                                                     |
| `CLAUDE.md`               | Documenta o workflow dockerizado                                                                                                                                                                        |

## 3. Dockerfile (multi-stage)

- `base`/`deps`: copia `package*.json` + `prisma/`, `npm ci` (o `postinstall` roda `prisma generate` — schema já presente).
- `dev` (target): imagem com deps + Prisma CLI. O código-fonte vem por **bind mount** em runtime → hot reload. CMD roda o entrypoint e depois `npm run dev`.
- `build` (stage): `next build`. Não precisa de segredos nem de DB em build (rotas são dinâmicas: `app/page.tsx` chama `auth()` em request-time). Se o build reclamar de `DATABASE_URL`/`AUTH_SECRET`, passar valores placeholder só no build.
- `runner` (target): copia `node_modules` (completo, do `deps`), `.next`, `public`, `package.json`, `next.config.ts` e `prisma/`; roda o entrypoint e depois `next start`. O toolchain completo (Prisma CLI + `tsx` + `bcryptjs`) fica na imagem para o entrypoint rodar migrate+seed — por isso não usamos `output: standalone` (a minimalidade seria anulada). Imagem maior porém robusta; aceitável para local-real. Otimização futura: separar migrate/seed do runtime.

## 4. docker-entrypoint.sh (turnkey)

Compartilhado por dev e prod. Passos:

1. Espera o Postgres aceitar conexão (loop `pg_isready`/tentativa de conexão — o `depends_on: condition: service_healthy` já cobre, o wait é cinto-e-suspensório).
2. `prisma migrate deploy` (aplica as migrações commitadas — NÃO `migrate dev`, que é interativo/cria migração).
3. Roda o seed (`prisma db seed`), **idempotente** (`upsert` por email → sem duplicar, sem quebrar em re-run).
4. `exec "$@"` (o CMD: dev = `next dev --hostname 0.0.0.0`; prod = `next start --hostname 0.0.0.0`).

Efeito: `docker compose up` deixa o banco criado, migrado e semeado, sem passo manual.

## 5. Segredos e DATABASE_URL (a única sutileza)

- O serviço `app` lê segredos via **`env_file: .env.local`** (`ANTHROPIC_API_KEY`, `AUTH_SECRET`).
- Mas **sobrescreve** `DATABASE_URL` via `environment:` do compose para
  `postgresql://moldai:moldai@db:5432/moldai?schema=public`
  (dentro da rede o app fala com `db:5432`, não `localhost:5433`).
- Compose aplica `environment` **depois** de `env_file`, e Next.js/Prisma honram a env var real acima de arquivos `.env` → o host (`localhost:5433`) e o container (`db:5432`) coexistem sem conflito.
- Nenhum segredo é copiado para a imagem (`.env*` no `.dockerignore`; segredos só em runtime via `env_file`).

## 6. Hot reload no Windows

Bind mount Windows→container tem file-watching instável. O serviço dev seta `WATCHPACK_POLLING=true` e `CHOKIDAR_USEPOLLING=true` para o Turbopack pegar as edições. Volumes anônimos em `/app/node_modules` e `/app/.next` evitam que o bind mount do host sobrescreva o que foi instalado/gerado no container.

## 7. Portas

- `app`: `3000:3000`.
- `db`: mantém `5433:5432` no host (para o Prisma CLI/host dev); dentro da rede o app usa `db:5432`.

## 8. Scripts (package.json)

- `"docker:up": "docker compose up --build"`
- `"docker:prod": "docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build"`

## 9. Verificação

- `docker compose up --build` (ou `npm run docker:up`): app em `http://localhost:3000`, redireciona p/ `/login`; login `dev@moldai.local` / `moldai-dev` funciona (migrate+seed rodaram no container); editar um arquivo faz hot reload no container.
- `npm run docker:prod`: imagem de produção serve o mesmo em `localhost:3000`.
- Host inalterado: `npm test` verde, `npm run dev` na máquina ainda funciona apontando p/ `localhost:5433`.
- Nenhum `.env*` presente nas camadas da imagem (`docker history` / build context enxuto).

## 10. Doc (CLAUDE.md)

Acrescentar uma nota curta na seção de comandos: `npm run docker:up` sobe app+db juntos (dev, hot reload); `npm run docker:prod` sobe a imagem de produção. Continua valendo o fluxo host (`npm run dev` + `docker compose up -d` só do db) para quem preferir.
