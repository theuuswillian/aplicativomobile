#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL precisa apontar para PostgreSQL isolado}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/bootstrap.sql
for migration in supabase/migrations/00[1-8]_*.sql; do
  echo "Aplicando $migration"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rls_schema_assertions.sql
bash scripts/test-sql-concurrency.sh
