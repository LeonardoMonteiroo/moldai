#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] waiting for Postgres..."
  # pg_isready rejects the query string (?schema=public) in DATABASE_URL — its
  # URI parser doesn't accept that parameter. Prisma does accept it; so only the
  # readiness check uses the URL without the query.
  DB_URL_NOQ="${DATABASE_URL%%\?*}"
  until pg_isready -d "$DB_URL_NOQ" >/dev/null 2>&1; do
    sleep 1
  done
  echo "[entrypoint] Postgres ready."
fi

echo "[entrypoint] applying migrations (prisma migrate deploy)..."
npx prisma migrate deploy

if [ "$NODE_ENV" != "production" ]; then
  echo "[entrypoint] seed (idempotent)..."
  npx prisma db seed || echo "[entrypoint] warning: seed failed, continuing anyway"
else
  echo "[entrypoint] production: skipping dev seed."
fi

echo "[entrypoint] starting: $*"
exec "$@"
