# syntax=docker/dockerfile:1

# ---- deps: installs node_modules (+ prisma generate via postinstall) ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps

# ---- prod-deps: production-only node_modules for the runner stage ----
# #102: the runner stage used to copy node_modules straight from `build`,
# which inherited it from `deps` above -- the full devDependency tree
# (tsx, vitest, jsdom, eslint, prettier, typescript...), shipped to
# production verbatim. `prisma` and `tsx` are real runtime dependencies
# here (docker-entrypoint.sh's `prisma migrate deploy`, the cron
# service's `tsx scripts/cron-renew.ts`), so they live in
# package.json's "dependencies", not "devDependencies" -- --omit=dev
# keeps them and drops everything that's actually dev-only.
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
# --ignore-scripts: package.json's root "prepare" script (husky) still runs
# on a plain `npm ci --omit=dev` even though husky itself is a
# devDependency and gets omitted -- the install failed outright ("husky:
# command not found") the first time this was tried. Skipping all
# lifecycle scripts means "postinstall" (prisma generate) is skipped too,
# so it's invoked explicitly afterward.
RUN npm ci --omit=dev --ignore-scripts --legacy-peer-deps && npx prisma generate

# ---- dev: hot reload; code comes in via bind mount at runtime ----
FROM node:22-alpine AS dev
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl postgresql-client
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

# ---- build: generates the production .next ----
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: production (next start + toolchain for migrate/seed) ----
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl postgresql-client
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# #102: from prod-deps, not build -- the full devDependency tree (tsx,
# vitest, jsdom, eslint, prettier, typescript...) never reaches the image
# that actually serves requests.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/prisma ./prisma
# lib/ is needed by prisma/seed.ts (imports ../lib/auth/hash) in the entrypoint
COPY --from=build /app/lib ./lib
# scripts/ is needed by the cron service (scripts/cron-renew.ts)
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# #73: the cron service's prod override points its entrypoint at this
# instead -- same Postgres-readiness wait, no migrate step, so only the app
# container ever applies migrations.
COPY docker-entrypoint-cron.sh /usr/local/bin/docker-entrypoint-cron.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-entrypoint-cron.sh
# #102: next start (and the cron loop) used to run as root -- any RCE or
# path-traversal in a dependency had the run of the container, including
# postgresql-client and DATABASE_URL sitting right there for a straight
# psql dump. node:22-alpine already ships an unprivileged "node" user;
# chown has to happen before the switch, since USER changes who every
# instruction after it (and the eventual ENTRYPOINT/CMD) runs as.
RUN chown -R node:node /app
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]
