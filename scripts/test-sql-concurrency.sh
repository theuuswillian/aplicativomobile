#!/usr/bin/env bash
set -euo pipefail

: "$DATABASE_URL" || { echo "DATABASE_URL precisa apontar para PostgreSQL isolado"; exit 1; }

user_id="20000000-0000-4000-8000-000000000001"
tmp_dir="$(mktemp -d)"
cleanup() {
  psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "delete from auth.users where id='$user_id'" >/dev/null 2>&1 || true
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into auth.users(id,email) values ('$user_id','gv-concurrency@example.invalid')
  on conflict (id) do nothing;
"

# Duas transações concorrem pela única reserva disponível. A primeira mantém
# o lock transacional por 1s para forçar a segunda a disputar o mesmo caminho.
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/ai-a.out" <<SQL &
begin;
select public.ai_usage_reserve('$user_id', 'phrase', 1, 1);
select pg_sleep(1);
commit;
SQL
pid_a=$!

psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/ai-b.out" <<SQL &
begin;
select public.ai_usage_reserve('$user_id', 'phrase', 1, 1);
select pg_sleep(1);
commit;
SQL
pid_b=$!

wait "$pid_a"
wait "$pid_b"

reservation_ids="$(grep -hE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' "$tmp_dir"/ai-*.out || true)"
reservation_count="$(printf '%s\n' "$reservation_ids" | sed '/^$/d' | wc -l | tr -d ' ')"
if [[ "$reservation_count" != "1" ]]; then
  echo "Falha: esperada exatamente 1 reserva de IA concorrente; recebidas $reservation_count."
  cat "$tmp_dir"/ai-*.out
  exit 1
fi

reservation_id="$(printf '%s\n' "$reservation_ids" | sed -n '1p')"
finalized="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select public.ai_usage_finalize('$reservation_id', true)")"
if [[ "$finalized" != "t" ]]; then
  echo "Falha: não foi possível finalizar a reserva concorrente."
  exit 1
fi

usage_count="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.ai_usage where user_id='$user_id' and usage_kind='phrase' and count=1")"
if [[ "$usage_count" != "1" ]]; then
  echo "Falha: a concorrência gerou uso de IA inconsistente."
  exit 1
fi

# O upsert do rate limit também deve permitir apenas uma chamada concorrente.
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/limit-a.out" <<SQL &
begin;
select public.rate_limit_allow('$user_id', 'parallel-test', 20261122, 1);
select pg_sleep(1);
commit;
SQL
limit_a=$!

psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/limit-b.out" <<SQL &
begin;
select public.rate_limit_allow('$user_id', 'parallel-test', 20261122, 1);
select pg_sleep(1);
commit;
SQL
limit_b=$!

wait "$limit_a"
wait "$limit_b"

allowed_count="$(grep -hxc 't' "$tmp_dir"/limit-*.out | awk '{sum += $1} END {print sum+0}')"
if [[ "$allowed_count" != "1" ]]; then
  echo "Falha: rate limit concorrente permitiu $allowed_count chamadas; esperado 1."
  cat "$tmp_dir"/limit-*.out
  exit 1
fi

echo "Concorrência PostgreSQL validada: quota de IA e rate limit aceitaram somente uma operação."
