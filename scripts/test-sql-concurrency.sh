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



# Pagamentos concorrentes da mesma fatura devem ser serializados no banco:
# fatura de R$ 100,00; duas tentativas simultâneas de R$ 60,00 => só uma aceita.
card_id="90000000-0000-4000-8000-000000000001"
invoice_transaction_id="90000000-0000-4000-8000-000000000002"
bank_balance_before_card="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select coalesce(sum(l.debit-l.credit),0)
    from private.journal_lines l
    join private.ledger_accounts a on a.id=l.ledger_account_id and a.user_id=l.user_id
    join private.journal_entries j on j.id=l.journal_entry_id and j.user_id=l.user_id
   where l.user_id='$user_id' and a.source_account_id='$account_id'
     and a.account_kind in ('bank','cash') and j.status='posted'
")"
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.cards(
    id,user_id,name,institution_name,last_four,credit_limit,closing_day,due_day
  ) values (
    '$card_id','$user_id','Cartão concorrente','Fixture','1234',1000,10,20
  );
  insert into public.transactions(
    id,user_id,kind,status,amount,transaction_date,description,card_id,settled_amount,settled_at,source
  ) values (
    '$invoice_transaction_id','$user_id','expense','paid',100.00,'2026-11-05',
    'Compra da fatura concorrente','$card_id',100.00,'2026-11-05','manual'
  );
"
bank_balance_after_card="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select coalesce(sum(l.debit-l.credit),0)
    from private.journal_lines l
    join private.ledger_accounts a on a.id=l.ledger_account_id and a.user_id=l.user_id
    join private.journal_entries j on j.id=l.journal_entry_id and j.user_id=l.user_id
   where l.user_id='$user_id' and a.source_account_id='$account_id'
     and a.account_kind in ('bank','cash') and j.status='posted'
")"
if [[ "$bank_balance_before_card" != "$bank_balance_after_card" ]]; then
  echo "Falha: compra no crédito alterou o saldo bancário ($bank_balance_before_card -> $bank_balance_after_card)."
  exit 1
fi
for suffix in a b; do
  psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/invoice-$suffix.out" 2>&1 <<SQL &
begin;
insert into public.card_invoice_payments(
  user_id,card_id,account_id,invoice_closing_date,amount,payment_date
) values (
  '$user_id','$card_id','$account_id','2026-11-10',60.00,current_date
);
select pg_sleep(1);
commit;
SQL
  eval "invoice_pid_$suffix=$!"
done

invoice_successes=0
for suffix in a b; do
  if eval "wait \"\$invoice_pid_$suffix\""; then
    invoice_successes=$((invoice_successes + 1))
  fi
done
invoice_payment_count="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select count(*) from public.card_invoice_payments where user_id='$user_id' and card_id='$card_id' and invoice_closing_date='2026-11-10'")"
invoice_paid_total="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select coalesce(sum(amount),0) from public.card_invoice_payments where user_id='$user_id' and card_id='$card_id' and invoice_closing_date='2026-11-10'")"
if [[ "$invoice_successes" != "1" || "$invoice_payment_count" != "1" || "$invoice_paid_total" != "60.00" ]]; then
  echo "Falha: pagamentos concorrentes tiveram $invoice_successes sucessos, $invoice_payment_count registros e total $invoice_paid_total; esperado 1, 1 e 60.00."
  cat "$tmp_dir"/invoice-*.out
  exit 1
fi

# Também rejeita pagamentos acima do saldo em uma única operação e datas futuras.
if psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.card_invoice_payments(
    user_id,card_id,account_id,invoice_closing_date,amount,payment_date
  ) values ('$user_id','$card_id','$account_id','2026-11-10',50.00,current_date)
" >"$tmp_dir/invoice-overpay.out" 2>&1; then
  echo "Falha: banco aceitou pagamento que ultrapassa o saldo da fatura."
  exit 1
fi
if psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.card_invoice_payments(
    user_id,card_id,account_id,invoice_closing_date,amount,payment_date
  ) values ('$user_id','$card_id','$account_id','2026-11-10',1.00,current_date+1)
" >"$tmp_dir/invoice-future.out" 2>&1; then
  echo "Falha: banco aceitou pagamento com data futura."
  exit 1
fi


# Regras contábeis de firewall, empréstimos, horas extras e parcelas exatas.
export PGOPTIONS="-c request.jwt.claim.sub=$user_id"
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select set_config('request.jwt.claim.sub','$user_id',false)" >/dev/null
investment_account_id="50000000-0000-4000-8000-000000000002"
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.accounts(id,user_id,name,account_type,opening_balance,opening_balance_date)
  values ('$investment_account_id','$user_id','Corretora protegida','investment',500.00,current_date);
"

liquid_before_card="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select get_financial_summary()->>'liquid_balance_brl'")"
card_liability="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select coalesce(sum(l.credit-l.debit),0)
    from private.journal_lines l
    join private.ledger_accounts a on a.id=l.ledger_account_id and a.user_id=l.user_id
    join private.journal_entries j on j.id=l.journal_entry_id and j.user_id=l.user_id
   where l.user_id='$user_id' and j.status='posted' and a.account_kind='card_liability'
")"
if [[ "$card_liability" != "40.00" ]]; then
  echo "Falha: compra no cartão menos pagamento deveria deixar R$ 40,00 de obrigação, encontrado $card_liability."
  exit 1
fi
if psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.transactions(user_id,kind,status,amount,transaction_date,description,card_id,settled_amount,settled_at)
  values ('$user_id','expense','paid',961.00,current_date,'Tentativa acima do limite','$card_id',961.00,current_date)
" >"$tmp_dir/card-overlimit.out" 2>&1; then
  echo "Falha: banco aceitou compra acima do limite disponível do cartão."
  exit 1
fi
investment_cash_before="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select coalesce(sum(l.debit-l.credit),0)
    from private.journal_lines l
    join private.ledger_accounts a on a.id=l.ledger_account_id and a.user_id=l.user_id
    join private.journal_entries j on j.id=l.journal_entry_id and j.user_id=l.user_id
   where l.user_id='$user_id' and j.status='posted' and a.account_kind='investment_cash'
")"
if [[ "$investment_cash_before" != "500.00" ]]; then
  echo "Falha: saldo investido inicial deveria permanecer R$ 500,00; encontrado $investment_cash_before."
  exit 1
fi

# Uma despesa PIX no banco não altera o caixa de investimentos.
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.transactions(user_id,kind,status,amount,transaction_date,description,account_id,payment_method,settled_amount,settled_at)
  values ('$user_id','expense','paid',5.00,current_date,'Despesa PIX de teste','$account_id','pix',5.00,current_date)
"
investment_cash_after_pix="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select coalesce(sum(l.debit-l.credit),0)
    from private.journal_lines l
    join private.ledger_accounts a on a.id=l.ledger_account_id and a.user_id=l.user_id
    join private.journal_entries j on j.id=l.journal_entry_id and j.user_id=l.user_id
   where l.user_id='$user_id' and j.status='posted' and a.account_kind='investment_cash'
")"
if [[ "$investment_cash_after_pix" != "500.00" ]]; then
  echo "Falha: despesa PIX alterou o saldo investido ($investment_cash_before -> $investment_cash_after_pix)."
  exit 1
fi

# Resgate acima do caixa da corretora é bloqueado; resgate e aporte válidos atualizam ambos os lados.
if psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.transactions(user_id,kind,status,amount,transaction_date,description,transfer_from_account_id,transfer_to_account_id)
  values ('$user_id','transfer','paid',600.00,current_date,'Resgate acima do saldo','$investment_account_id','$account_id')
" >"$tmp_dir/investment-over-redemption.out" 2>&1; then
  echo "Falha: banco aceitou resgate acima do caixa de investimentos."
  exit 1
fi
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.transactions(user_id,kind,status,amount,transaction_date,description,transfer_from_account_id,transfer_to_account_id)
  values ('$user_id','transfer','paid',200.00,current_date,'Resgate válido','$investment_account_id','$account_id');
  insert into public.transactions(user_id,kind,status,amount,transaction_date,description,transfer_from_account_id,transfer_to_account_id)
  values ('$user_id','transfer','paid',50.00,current_date,'Aporte válido','$account_id','$investment_account_id');
"
investment_cash_after_bridge="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select coalesce(sum(l.debit-l.credit),0)
    from private.journal_lines l
    join private.ledger_accounts a on a.id=l.ledger_account_id and a.user_id=l.user_id
    join private.journal_entries j on j.id=l.journal_entry_id and j.user_id=l.user_id
   where l.user_id='$user_id' and j.status='posted' and a.account_kind='investment_cash'
")"
if [[ "$investment_cash_after_bridge" != "350.00" ]]; then
  echo "Falha: resgate de R$ 200,00 e aporte de R$ 50,00 deveriam deixar R$ 350,00; encontrado $investment_cash_after_bridge."
  psql "$DATABASE_URL" -x -v ON_ERROR_STOP=1 -c "
    select t.id,t.kind,t.status,t.amount,t.transfer_from_account_id,t.transfer_to_account_id,
           s.active_journal_id,j.status as journal_status,a.account_kind,
           coalesce(sum(l.debit-l.credit),0) as net_debit
      from public.transactions t
      left join private.ledger_source_state s on s.user_id=t.user_id and s.source_type='transaction' and s.source_id=t.id
      left join private.journal_entries j on j.user_id=s.user_id and j.id=s.active_journal_id
      left join private.journal_lines l on l.user_id=j.user_id and l.journal_entry_id=j.id
      left join private.ledger_accounts a on a.user_id=l.user_id and a.id=l.ledger_account_id
     where t.user_id='$user_id' and t.kind='transfer'
     group by t.id,s.active_journal_id,j.status,a.account_kind
  "
  psql "$DATABASE_URL" -x -v ON_ERROR_STOP=1 -c "
    select id,account_type,opening_balance_date from public.accounts
     where user_id='$user_id' and id in ('$investment_account_id','$account_id')
  "
  exit 1
fi

# Proventos BRL são liquidados atomicamente na conta bancária ou no caixa da corretora.
income_asset_id="90000000-0000-4000-8000-000000000003"
income_asset_usd_id="90000000-0000-4000-8000-000000000004"
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.investment_assets(id,user_id,symbol,name,asset_class,currency,quantity,average_cost)
  values
    ('$income_asset_id','$user_id','TST3','Ativo de teste BRL','stock','BRL',0,0),
    ('$income_asset_usd_id','$user_id','TSTU','Ativo de teste USD','stock','USD',0,0);
  insert into public.income_events(
    user_id,asset_id,event_type,reference_date,payment_date,announced_amount,received_amount,status,
    account_id,settlement_idempotency_key
  ) values (
    '$user_id','$income_asset_id','dividend',current_date,current_date,15.00,15.00,'received',
    '$account_id','income-bank-test-0001'
  );
  insert into public.income_events(
    user_id,asset_id,event_type,reference_date,payment_date,announced_amount,received_amount,status,
    account_id,settlement_idempotency_key
  ) values (
    '$user_id','$income_asset_id','dividend',current_date,current_date,20.00,20.00,'received',
    '$investment_account_id','income-broker-test-0001'
  );
"
income_settlements="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from public.income_events
   where user_id='$user_id' and asset_id='$income_asset_id'
     and settlement_state='settled' and transaction_id is not null
")"
if [[ "$income_settlements" != "2" ]]; then
  echo "Falha: os dois proventos deveriam gerar liquidações contábeis; encontrado $income_settlements."
  exit 1
fi
investment_cash_after_income="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select coalesce(sum(l.debit-l.credit),0)
    from private.journal_lines l
    join private.ledger_accounts a on a.id=l.ledger_account_id and a.user_id=l.user_id
    join private.journal_entries j on j.id=l.journal_entry_id and j.user_id=l.user_id
   where l.user_id='$user_id' and j.status='posted' and a.account_kind='investment_cash'
")"
if [[ "$investment_cash_after_income" != "370.00" ]]; then
  echo "Falha: provento reinvestido no caixa da corretora deveria elevar o saldo para R$ 370,00; encontrado $investment_cash_after_income."
  exit 1
fi
if psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.income_events(
    user_id,asset_id,event_type,reference_date,payment_date,announced_amount,received_amount,status,
    account_id,settlement_idempotency_key
  ) values (
    '$user_id','$income_asset_usd_id','dividend',current_date,current_date,5.00,5.00,'received',
    '$account_id','income-usd-test-0001'
  )
" >"$tmp_dir/income-usd.out" 2>&1; then
  echo "Falha: banco aceitou misturar provento USD com conta BRL."
  exit 1
fi
income_transaction_id="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select transaction_id from public.income_events
   where user_id='$user_id' and settlement_idempotency_key='income-bank-test-0001'
")"
if psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "delete from public.transactions where user_id='$user_id' and id='$income_transaction_id'" >"$tmp_dir/income-delete.out" 2>&1; then
  echo "Falha: banco permitiu apagar lançamento contábil originado de provento."
  exit 1
fi

if psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  update public.accounts set opening_balance=501.00 where user_id='$user_id' and id='$investment_account_id'
" >"$tmp_dir/opening-balance-update.out" 2>&1; then
  echo "Falha: banco permitiu alterar saldo inicial sem ajuste contábil."
  exit 1
fi

# Uma despesa não pode debitar a conta classificada como investimento.
if psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.transactions(user_id,kind,status,amount,transaction_date,description,account_id,settled_amount,settled_at)
  values ('$user_id','expense','paid',10.00,current_date,'Tentativa de gasto na corretora','$investment_account_id',10.00,current_date)
" >"$tmp_dir/investment-expense.out" 2>&1; then
  echo "Falha: despesa foi debitada de conta de investimentos."
  exit 1
fi

# Empréstimo cria ativo a receber, reduz liquidez e não gera despesa pessoal.
loan_result="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select (public.create_receivable_loan(
    'Pessoa de teste',30.00,current_date,current_date+30,
    '$account_id','Teste de contabilização','loan-ledger-test-0001'
  )).id
")"
loan_id="$loan_result"
loan_receivable="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select coalesce(sum(l.debit-l.credit),0)
    from private.journal_lines l
    join private.ledger_accounts a on a.id=l.ledger_account_id and a.user_id=l.user_id
    join private.journal_entries j on j.id=l.journal_entry_id and j.user_id=l.user_id
   where l.user_id='$user_id' and j.status='posted' and a.account_kind='receivable_asset'
")"
if [[ "$loan_receivable" != "30.00" ]]; then
  echo "Falha: empréstimo deveria criar R$ 30,00 em valores a receber; encontrado $loan_receivable."
  exit 1
fi
loan_expense_postings="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from private.journal_entries
   where user_id='$user_id' and source_type='receivable_loan' and status='posted'
")"
if [[ "$loan_expense_postings" != "1" ]]; then
  echo "Falha: lançamento contábil do empréstimo ausente."
  exit 1
fi

# Devolução parcial volta ao banco e reduz o título, sem registrar salário.
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select public.register_receivable_repayment(
    '$loan_id','$account_id',10.00,current_date,'loan-repayment-test-0001'
  );
" >/dev/null
loan_remaining="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select principal_amount-coalesce((select sum(amount) from public.receivable_repayments where loan_id=receivable_loans.id),0)
    from public.receivable_loans where id='$loan_id' and user_id='$user_id'
")"
if [[ "$loan_remaining" != "20.00" ]]; then
  echo "Falha: devolução parcial deveria deixar R$ 20,00 em aberto; encontrado $loan_remaining."
  exit 1
fi
repayment_income_postings="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from private.journal_entries
   where user_id='$user_id' and source_type='receivable_repayment' and status='posted'
")"
if [[ "$repayment_income_postings" != "1" ]]; then
  echo "Falha: recebimento de empréstimo não foi contabilizado como retorno de ativo."
  exit 1
fi

# Horas extras ficam como previsão até conversão explícita.
overtime_id="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select (public.record_overtime_entry(
    current_date,2.00,50.00,50.00,'Plantão de teste','overtime-ledger-test-0001'
  )).id
")"
forecast_before="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select get_financial_summary()->>'overtime_forecast_brl'")"
if [[ "$forecast_before" != "150.00" ]]; then
  echo "Falha: previsão de hora extra deveria ser R$ 150,00; encontrado $forecast_before."
  exit 1
fi
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select public.convert_overtime_to_receipt(
    array['$overtime_id']::uuid[],'$account_id',current_date,'overtime-convert-test-0001'
  );
" >/dev/null
forecast_after="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "select get_financial_summary()->>'overtime_forecast_brl'")"
overtime_journals="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from private.journal_entries
   where user_id='$user_id' and source_type='overtime_conversion' and status='posted'
")"
if [[ "$forecast_after" != "0.00" || "$overtime_journals" != "1" ]]; then
  echo "Falha: conversão de hora extra não zerou previsão ou não gerou diário."
  exit 1
fi

# Compra parcelada soma exatamente o total em centavos e deixa o resíduo na primeira.
installment_tx_id="90000000-0000-4000-8000-000000000003"
installment_group_id="90000000-0000-4000-8000-000000000004"
psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  insert into public.transactions(
    id,user_id,kind,status,amount,transaction_date,description,card_id,
    installment_group_id,installment_number,installment_count,settled_amount,settled_at,source
  ) values (
    '$installment_tx_id','$user_id','expense','paid',100.01,current_date,
    'Compra parcelada de teste','$card_id','$installment_group_id',1,3,100.01,current_date,'manual'
  );
"
installment_total="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select coalesce(sum(amount),0) from public.card_invoice_installments
   where user_id='$user_id' and transaction_id='$installment_tx_id'
")"
installment_first="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select amount from public.card_invoice_installments
   where user_id='$user_id' and transaction_id='$installment_tx_id' and installment_number=1
")"
installment_count="$(psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from public.card_invoice_installments
   where user_id='$user_id' and transaction_id='$installment_tx_id'
")"
if [[ "$installment_total" != "100.01" || "$installment_first" != "33.35" || "$installment_count" != "3" ]]; then
  echo "Falha: parcelamento de R$ 100,01 em 3x gerou total=$installment_total, primeira=$installment_first, parcelas=$installment_count."
  exit 1
fi

echo "Concorrência PostgreSQL validada: quota de IA, rate limit, Radar, metas, WhatsApp, recorrências, pagamentos de fatura, ledger, firewall de investimentos, empréstimos, horas extras e parcelas foram testados."
