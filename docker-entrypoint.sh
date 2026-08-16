#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] aguardando o Postgres..."
  until pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; do
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
