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

allowed_count="$(awk '$0 == "t" { count++ } END { print count+0 }' "$tmp_dir"/limit-*.out)"
if [[ "$allowed_count" != "1" ]]; then
  echo "Falha: rate limit concorrente permitiu $allowed_count chamadas; esperado 1."
  cat "$tmp_dir"/limit-*.out
  exit 1
fi

# Reativação concorrente de um alerta só pode avançar uma geração.
alert_id="30000000-0000-4000-8000-000000000001"
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.radar_alerts(id,user_id,asset_class,symbol,condition_type,threshold,generation,is_enabled)
  values ('$alert_id','$user_id','stock','CONC1','above',10,1,false)
"
for suffix in a b; do
  psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/radar-$suffix.out" <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','$user_id',true);
select generation from public.radar_alert_set_enabled('$alert_id', true);
select pg_sleep(1);
commit;
SQL
  eval "radar_pid_$suffix=$!"
done
wait "$radar_pid_a"
wait "$radar_pid_b"

generation="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select generation from public.radar_alerts where id='$alert_id' and user_id='$user_id'")"
if [[ "$generation" != "2" ]]; then
  echo "Falha: reativação concorrente deveria deixar geração 2; recebida ${generation:-vazia}."
  cat "$tmp_dir"/radar-*.out
  exit 1
fi

# Contribuições concorrentes de uma meta devem preservar o histórico e somar
# os valores exatamente uma vez, sob lock da própria meta.
goal_id="40000000-0000-4000-8000-000000000001"
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.goals(id,user_id,name,target_amount)
  values ('$goal_id','$user_id','Meta concorrente',1000.00)
"
for suffix in a b; do
  psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/goal-$suffix.out" <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','$user_id',true);
select current_amount from public.add_goal_contribution('$goal_id',10.00,current_date);
select pg_sleep(1);
commit;
SQL
  eval "goal_pid_$suffix=$!"
done
wait "$goal_pid_a"
wait "$goal_pid_b"
goal_total="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select current_amount from public.goals where id='$goal_id' and user_id='$user_id'")"
goal_contributions="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.goal_contributions where goal_id='$goal_id' and user_id='$user_id'")"
if [[ "$goal_total" != "20.00" || "$goal_contributions" != "2" ]]; then
  echo "Falha: contribuições concorrentes deixaram total=$goal_total e histórico=$goal_contributions; esperado 20.00 e 2."
  cat "$tmp_dir"/goal-*.out
  exit 1
fi

# A confirmação de uma transação WhatsApp deve ser atômica e idempotente.
account_id="50000000-0000-4000-8000-000000000001"
pending_id="whatsapp-pending-concurrency-1"
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.accounts(id,user_id,name,account_type,opening_balance,opening_balance_date)
  values ('$account_id','$user_id','Conta WhatsApp','checking',0,current_date);
  insert into public.whatsapp_links(user_id,phone,weekly_summary_enabled)
  values ('$user_id','+5511999999999',false);
  insert into public.whatsapp_pending_transactions(id,user_id,phone,payload,source_message_id,expires_at)
  values ('$pending_id','$user_id','+5511999999999',
    jsonb_build_object('kind','expense','amount','12.34','transaction_date',current_date::text,
      'description','Teste WhatsApp','account_id','$account_id','card_id',null,'category_id',null),
    'whatsapp-message-concurrency-1',now()+interval '10 minutes');
"
for suffix in a b; do
  psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/whatsapp-$suffix.out" <<SQL &
begin;
set local role service_role;
select result from public.whatsapp_pending_confirm('$pending_id');
select pg_sleep(1);
commit;
SQL
  eval "whatsapp_pid_$suffix=$!"
done
wait "$whatsapp_pid_a"
wait "$whatsapp_pid_b"
whatsapp_count="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.transactions where user_id='$user_id' and source='whatsapp' and external_reference='whatsapp-message-concurrency-1'")"
whatsapp_status="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select status from public.whatsapp_pending_transactions where id='$pending_id' and user_id='$user_id'")"
if [[ "$whatsapp_count" != "1" || "$whatsapp_status" != "confirmed" ]]; then
  echo "Falha: confirmação WhatsApp concorrente criou $whatsapp_count transações e status=$whatsapp_status; esperado 1 e confirmed."
  cat "$tmp_dir"/whatsapp-*.out
  exit 1
fi

echo "Concorrência PostgreSQL validada: quota de IA, rate limit, geração Radar, metas e confirmação WhatsApp foram serializados."
