#!/bin/sh
set -e

# #73: the cron container ran through docker-entrypoint.sh like `app` does,
# so it applied migrations too -- racing the app container's own
# `prisma migrate deploy` on the same database via Prisma's advisory lock,
# on every stack start. Only the app container should ever migrate; this
# keeps the same Postgres-readiness wait (the loop otherwise starts before
# Postgres does) and drops the migrate step entirely.
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint-cron] waiting for Postgres..."
  DB_URL_NOQ="${DATABASE_URL%%\?*}"
  until pg_isready -d "$DB_URL_NOQ" >/dev/null 2>&1; do
    sleep 1
  done
  echo "[entrypoint-cron] Postgres ready."
fi

echo "[entrypoint-cron] starting: $*"
exec "$@"
