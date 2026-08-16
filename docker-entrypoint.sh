#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] aguardando o Postgres..."
  # pg_isready rejeita a query string (?schema=public) do DATABASE_URL — o
  # parser de URI dele não aceita esse parâmetro. Prisma aceita; então só o
  # readiness check usa a URL sem a query.
  DB_URL_NOQ="${DATABASE_URL%%\?*}"
  until pg_isready -d "$DB_URL_NOQ" >/dev/null 2>&1; do
    sleep 1
  done
  echo "[entrypoint] Postgres pronto."
fi

echo "[entrypoint] aplicando migrações (prisma migrate deploy)..."
npx prisma migrate deploy

echo "[entrypoint] seed (idempotente)..."
npx prisma db seed || echo "[entrypoint] aviso: seed falhou, seguindo mesmo assim"

echo "[entrypoint] iniciando: $*"
exec "$@"
