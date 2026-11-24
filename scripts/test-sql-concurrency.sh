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

# Recorrências concorrentes devem gerar cada ocorrência planejada uma única vez.
recurrence_id="70000000-0000-4000-8000-000000000001"
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.recurrence_rules(
    id,user_id,name,kind,amount,frequency,interval_count,starts_on,ends_on,
    next_occurrence_on,account_id,payment_method,is_active
  ) values (
    '$recurrence_id','$user_id','Recorrência concorrente','expense',5.00,
    'daily',1,current_date,current_date+2,current_date,'$account_id','cash',true
  );
"
for suffix in a b; do
  psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/recurrence-$suffix.out" <<SQL &
begin;
set local role service_role;
select * from public.recurrence_generate_due(current_date+2,100);
select pg_sleep(1);
commit;
SQL
  eval "recurrence_pid_$suffix=$!"
done
wait "$recurrence_pid_a"
wait "$recurrence_pid_b"
recurrence_count="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.transactions where user_id='$user_id' and recurrence_id='$recurrence_id' and source='recurrence' and status='planned'")"
recurrence_state="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select is_active::text || ':' || next_occurrence_on::text from public.recurrence_rules where id='$recurrence_id' and user_id='$user_id'")"
expected_recurrence_date="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select current_date+3")"
expected_recurrence_state="false:$expected_recurrence_date"
if [[ "$recurrence_count" != "3" || "$recurrence_state" != "$expected_recurrence_state" ]]; then
  echo "Falha: recorrência concorrente gerou $recurrence_count itens e estado=$recurrence_state; esperado 3 e $expected_recurrence_state."
  cat "$tmp_dir"/recurrence-*.out
  exit 1
fi


# Checkpoint durável do Radar: lease exclusivo, retomada do cursor e fencing.
radar_worker_key="radar-alerts:CHECK1"
radar_claim="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select reservation_status || '|' || fencing_token::text from public.radar_worker_claim('$radar_worker_key',180)")"
radar_status="${radar_claim%%|*}"
radar_token="${radar_claim#*|}"
if [[ "$radar_status" != "reserved" || -z "$radar_token" ]]; then
  echo "Falha: Radar não reservou checkpoint inicial: $radar_claim"; exit 1
fi
radar_busy="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select reservation_status from public.radar_worker_claim('$radar_worker_key',180)")"
if [[ "$radar_busy" != "busy" ]]; then
  echo "Falha: Radar permitiu duas reservas simultâneas: $radar_busy"; exit 1
fi
radar_cursor_id="60000000-0000-4000-8000-000000000001"
radar_cursor_time="2026-11-24T12:00:00Z"
radar_checkpoint="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select public.radar_worker_checkpoint('$radar_worker_key','$radar_token','$radar_cursor_time','$radar_cursor_id',false)")"
if [[ "$radar_checkpoint" != "t" ]]; then
  echo "Falha: Radar não persistiu cursor: $radar_checkpoint"; exit 1
fi
radar_claim2="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select reservation_status || '|' || coalesce(cursor_id::text,'') from public.radar_worker_claim('$radar_worker_key',180)")"
if [[ "$radar_claim2" != "reserved|$radar_cursor_id" ]]; then
  echo "Falha: Radar não retomou cursor persistido: $radar_claim2"; exit 1
fi
radar_token2="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select lease_token::text from public.radar_worker_state where worker_key='$radar_worker_key'")"
radar_stale="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select public.radar_worker_checkpoint('$radar_worker_key','$radar_token','$radar_cursor_time','$radar_cursor_id',false)")"
if [[ "$radar_stale" != "f" ]]; then
  echo "Falha: token antigo conseguiu alterar checkpoint Radar: $radar_stale"; exit 1
fi
radar_complete="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select public.radar_worker_checkpoint('$radar_worker_key','$radar_token2',null,null,true)")"
if [[ "$radar_complete" != "t" ]]; then
  echo "Falha: Radar não finalizou ciclo: $radar_complete"; exit 1
fi

# Push por assinatura: falha segura pode ser repetida sem reenviar para dispositivos concluídos.
push_subscription_id="80000000-0000-4000-8000-000000000001"
push_claim="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select reservation_status || '|' || fencing_token::text from public.push_delivery_reserve('$user_id','radar:test','$push_subscription_id',60)")"
push_status="${push_claim%%|*}"
push_token="${push_claim#*|}"
if [[ "$push_status" != "reserved" || -z "$push_token" ]]; then
  echo "Falha: push não foi reservado: $push_claim"; exit 1
fi
push_finalize="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select public.push_delivery_finalize('$user_id','radar:test','$push_subscription_id','$push_token','failed_safe','HTTP 429 de teste')")"
if [[ "$push_finalize" != "t" ]]; then
  echo "Falha: não foi possível registrar falha segura push: $push_finalize"; exit 1
fi
push_retry="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select reservation_status || '|' || fencing_token::text from public.push_delivery_reserve('$user_id','radar:test','$push_subscription_id',60)")"
push_retry_status="${push_retry%%|*}"
push_retry_token="${push_retry#*|}"
if [[ "$push_retry_status" != "reserved" || -z "$push_retry_token" ]]; then
  echo "Falha: push não permitiu retry seguro: $push_retry"; exit 1
fi
push_sent="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select public.push_delivery_finalize('$user_id','radar:test','$push_subscription_id','$push_retry_token','sent',null)")"
push_duplicate="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select reservation_status from public.push_delivery_reserve('$user_id','radar:test','$push_subscription_id',60)")"
if [[ "$push_sent" != "t" || "$push_duplicate" != "sent" ]]; then
  echo "Falha: push concluído não ficou idempotente: sent=$push_sent status=$push_duplicate"; exit 1
fi

# Resumo WhatsApp: payload persistido, lease exclusivo e finalização com fencing.
week_start="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select current_date")"
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.settings(user_id,whatsapp_weekly_summary)
  values ('$user_id',true)
  on conflict (user_id) do update set whatsapp_weekly_summary=true;
  update public.whatsapp_links set weekly_summary_enabled=true,last_summary_week=null
   where user_id='$user_id';
"
enqueue="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select public.whatsapp_summary_job_enqueue('$user_id','$week_start','+5511999999999','Resumo semanal de teste')")"
if [[ "$enqueue" != "t" ]]; then
  echo "Falha: não foi possível persistir o resumo WhatsApp: $enqueue"; exit 1
fi
summary_claim="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select reservation_status || '|' || fencing_token::text from public.whatsapp_summary_job_claim('$user_id','$week_start',180)")"
summary_status="${summary_claim%%|*}"
summary_token="${summary_claim#*|}"
if [[ "$summary_status" != "reserved" || -z "$summary_token" ]]; then
  echo "Falha: resumo WhatsApp não foi reservado: $summary_claim"; exit 1
fi
summary_busy="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select reservation_status from public.whatsapp_summary_job_claim('$user_id','$week_start',180)")"
if [[ "$summary_busy" != "busy" ]]; then
  echo "Falha: resumo WhatsApp permitiu duas reservas: $summary_busy"; exit 1
fi
summary_finalize="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select public.whatsapp_summary_job_finalize('$user_id','$week_start','$summary_token','pending','falha segura de teste')")"
if [[ "$summary_finalize" != "t" ]]; then
  echo "Falha: não foi possível liberar retry seguro do resumo: $summary_finalize"; exit 1
fi
summary_retry="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select reservation_status || '|' || fencing_token::text from public.whatsapp_summary_job_claim('$user_id','$week_start',180)")"
summary_retry_status="${summary_retry%%|*}"
summary_retry_token="${summary_retry#*|}"
if [[ "$summary_retry_status" != "reserved" || -z "$summary_retry_token" ]]; then
  echo "Falha: resumo WhatsApp não permitiu retry: $summary_retry"; exit 1
fi
summary_sent="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select public.whatsapp_summary_job_finalize('$user_id','$week_start','$summary_retry_token','sent',null)")"
summary_week="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select last_summary_week::text from public.whatsapp_links where user_id='$user_id'")"
if [[ "$summary_sent" != "t" || "$summary_week" != "$week_start" ]]; then
  echo "Falha: resumo enviado não foi finalizado: sent=$summary_sent week=$summary_week"; exit 1
fi

echo "Concorrência PostgreSQL validada: quota de IA, rate limit, Radar, metas, WhatsApp e recorrências foram serializados e os novos checkpoints/resumos foram testados."
