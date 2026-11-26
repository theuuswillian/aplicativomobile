-- Assertions de segurança para executar após as migrations em Supabase/PostgreSQL isolado.
-- Executar como postgres/superuser. Tudo é revertido ao final.
begin;

do $assert_manual_price_source$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='investment_assets'
      and column_name='price_source' and data_type='text'
  ) then
    raise exception 'Origem do preço de referência não foi criada';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.investment_assets'::regclass
      and conname='investment_assets_price_source_check'
  ) then
    raise exception 'Restrição da origem do preço de referência ausente';
  end if;
end
$assert_manual_price_source$;

do $$
declare
  v_missing text;
begin
  select string_agg(expected.table_name, ', ' order by expected.table_name)
    into v_missing
  from (values
    ('profiles'),('settings'),('categories'),
    ('accounts'),('cards'),('recurrence_rules'),('import_batches'),('transactions'),
    ('budgets'),('goals'),('goal_contributions'),('tangible_assets'),('liabilities'),
    ('net_worth_snapshots'),('receivables'),('import_items'),('receipt_files'),
    ('investment_assets'),('investment_operations'),('income_events'),('quote_cache'),('market_data_usage'),('market_data_cursor'),
    ('radar_alerts'),('radar_fires'),('push_subscriptions'),('push_deliveries'),
    ('ai_usage'),('ai_usage_reservations'),('rate_limit_buckets'),('function_errors'),
    ('whatsapp_links'),('whatsapp_link_codes'),('whatsapp_link_attempts'),
    ('whatsapp_pending_transactions'),('whatsapp_inbox'),('whatsapp_outbox'),
      ('receivable_loans'),('receivable_repayments'),('overtime_conversion_batches'),
      ('overtime_entries'),('card_invoice_installments'),
      ('card_invoice_payments'),
      ('card_invoice_payments')
  ) expected(table_name)
  left join information_schema.tables actual
    on actual.table_schema='public' and actual.table_name=expected.table_name
  where actual.table_name is null;

  if v_missing is not null then
    raise exception 'Tabelas esperadas ausentes: %', v_missing;
  end if;

  if exists (
    select 1
    from (values
      ('profiles'),('settings'),('categories'),
      ('accounts'),('cards'),('recurrence_rules'),('import_batches'),('transactions'),
      ('budgets'),('goals'),('goal_contributions'),('tangible_assets'),('liabilities'),
      ('net_worth_snapshots'),('receivables'),('import_items'),('receipt_files'),
      ('investment_assets'),('investment_operations'),('income_events'),('quote_cache'),('market_data_usage'),('market_data_cursor'),
      ('radar_alerts'),('radar_fires'),('push_subscriptions'),('push_deliveries'),
      ('ai_usage'),('ai_usage_reservations'),('rate_limit_buckets'),('function_errors'),
      ('whatsapp_links'),('whatsapp_link_codes'),('whatsapp_link_attempts'),
      ('whatsapp_pending_transactions'),('whatsapp_inbox'),('whatsapp_outbox')
    ) expected(table_name)
    join pg_class c on c.oid = format('public.%I', expected.table_name)::regclass
    where c.relrowsecurity is not true
  ) then
    raise exception 'Existe tabela do GranaViva sem RLS habilitado';
  end if;
end $$;

do $$
begin
  if has_table_privilege('anon','public.quote_cache','select')
     or has_table_privilege('authenticated','public.quote_cache','select')
     or has_table_privilege('anon','public.market_data_usage','select')
     or has_table_privilege('authenticated','public.market_data_usage','select')
     or has_table_privilege('anon','public.market_data_cursor','select')
     or has_table_privilege('authenticated','public.market_data_cursor','select')
     or has_table_privilege('anon','public.ai_usage','select')
     or has_table_privilege('authenticated','public.ai_usage','select')
     or has_table_privilege('anon','public.ai_usage_reservations','select')
     or has_table_privilege('authenticated','public.ai_usage_reservations','select')
     or has_table_privilege('anon','public.rate_limit_buckets','select')
     or has_table_privilege('authenticated','public.rate_limit_buckets','select')
     or has_table_privilege('anon','public.function_errors','select')
     or has_table_privilege('authenticated','public.function_errors','select')
     or has_table_privilege('anon','public.whatsapp_inbox','select')
     or has_table_privilege('authenticated','public.whatsapp_inbox','select')
     or has_table_privilege('anon','public.whatsapp_outbox','select')
     or has_table_privilege('authenticated','public.whatsapp_outbox','select')
     or has_table_privilege('anon','public.whatsapp_link_codes','select')
     or has_table_privilege('authenticated','public.whatsapp_link_codes','select')
     or has_table_privilege('anon','public.whatsapp_pending_transactions','select')
     or has_table_privilege('authenticated','public.whatsapp_pending_transactions','select')
     or has_sequence_privilege('anon','public.function_errors_id_seq','usage')
     or has_sequence_privilege('authenticated','public.function_errors_id_seq','usage') then
    raise exception 'Tabela interna concedeu acesso de leitura a anon/authenticated';
  end if;

  if not exists (select 1 from storage.buckets where id='receipt-files' and public=false and file_size_limit=5242880) then
    raise exception 'Bucket privado de comprovantes ausente ou com limites incorretos';
  end if;
  if (select relrowsecurity from pg_class where oid='storage.objects'::regclass) is not true then
    raise exception 'Storage objects precisa manter RLS habilitado';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='receipt_files_insert_own_transaction')
     or not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='receipt_files_select_own_transaction')
     or not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='receipt_files_delete_own_transaction') then
    raise exception 'Policies de Storage privado de comprovantes incompletas';
  end if;
  if (select column_default from information_schema.columns
       where table_schema='public' and table_name='settings' and column_name='whatsapp_weekly_summary') <> 'false' then
    raise exception 'Consentimento WhatsApp deve iniciar desativado';
  end if;

  if exists (select 1 from pg_policies where schemaname='public' and tablename='quote_cache') then
    raise exception 'quote_cache deve permanecer sem policies (somente backend)';
  end if;
end $$;

do $$
declare
  v_fn regprocedure;
begin
  foreach v_fn in array array[
    'public.ai_usage_reserve(uuid,text,integer,integer)'::regprocedure,
    'public.ai_usage_finalize(uuid,boolean)'::regprocedure,
    'public.rate_limit_allow(uuid,text,bigint,integer)'::regprocedure,
    'public.record_function_error(text,text,text,text)'::regprocedure,
    'public.whatsapp_link_attempt_allow(text)'::regprocedure,
    'public.whatsapp_link_consume(text,text)'::regprocedure,
    'public.whatsapp_inbox_reserve(text,jsonb,integer)'::regprocedure,
    'public.whatsapp_inbox_finalize(text,uuid,boolean,text)'::regprocedure,
    'public.whatsapp_outbox_reserve(text,text,jsonb,integer)'::regprocedure,
    'public.whatsapp_outbox_finalize(text,uuid,text,text,text)'::regprocedure,
    'public.whatsapp_summary_reserve(uuid,date)'::regprocedure,
    'public.whatsapp_pending_confirm(text)'::regprocedure,
    'public.recurrence_next_date(text,integer,date,smallint,smallint)'::regprocedure,
    'public.recurrence_generate_due(date,integer)'::regprocedure,
    'public.market_data_reserve(text,text,integer)'::regprocedure,
    'public.enforce_card_invoice_payment_balance()'::regprocedure
  ] loop
    if not (select p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public']
            from pg_proc p where p.oid = v_fn) then
      raise exception 'Função privilegiada sem SECURITY DEFINER/search_path fixo: %', v_fn;
    end if;
    if has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'Grants incorretos para função privilegiada: %', v_fn;
    end if;
  end loop;
end $$;

do $assert_radar_rpc_grants$
declare
  v_fn regprocedure := 'public.radar_alert_set_enabled(uuid,boolean)'::regprocedure;
begin
  if has_function_privilege('anon', v_fn, 'EXECUTE')
     or not has_function_privilege('authenticated', v_fn, 'EXECUTE')
     or has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'Grants incorretos para RPC de geração do Radar';
  end if;
  if (select p.prosecdef from pg_proc p where p.oid = v_fn) then
    raise exception 'RPC de Radar deve respeitar RLS como SECURITY INVOKER';
  end if;
end
$assert_radar_rpc_grants$;

do $assert_grants$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles','settings','categories','accounts','cards','recurrence_rules','import_batches','card_invoice_payments',
    'transactions','budgets','goals','goal_contributions','tangible_assets','liabilities',
    'receivable_loans','receivable_repayments','overtime_conversion_batches','overtime_entries','card_invoice_installments',
    'net_worth_snapshots','receivables','import_items','receipt_files',
    'investment_assets','investment_operations','income_events','radar_alerts','radar_fires',
    'push_subscriptions','push_deliveries','whatsapp_links'
  ] loop
    if has_table_privilege('anon', 'public.' || v_table, 'select')
       or not has_table_privilege('authenticated', 'public.' || v_table, 'select')
       or not has_table_privilege('service_role', 'public.' || v_table, 'select') then
      raise exception 'Grants de leitura incorretos para public.%', v_table;
    end if;
  end loop;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and not (coalesce(p.proconfig, array[]::text[]) @> array['search_path=pg_catalog, public'])
  ) then
    raise exception 'Existe SECURITY DEFINER sem search_path fixo em public';
  end if;
end $assert_grants$;

-- Cria duas identidades de fixture; o trigger da migration 001 cria profiles/settings.
insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','gv-rls-a@example.invalid','', '{}'::jsonb, '{}'::jsonb, now(), now()),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','gv-rls-b@example.invalid','', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.accounts(id,user_id,name,account_type,opening_balance,opening_balance_date)
values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Conta fixture A','checking',100,'2026-01-01'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Conta fixture B','checking',200,'2026-01-01');

insert into public.radar_alerts(id,user_id,asset_class,symbol,condition_type,threshold)
values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','stock','TEST3','above',10),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','stock','TEST4','below',5);

insert into public.transactions(
  id,user_id,kind,status,amount,transaction_date,description,account_id,settled_amount,settled_at,source
) values
 ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','expense','paid',10,'2026-01-01','Comprovante fixture A','40000000-0000-4000-8000-000000000001',10,'2026-01-01','manual'),
 ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','expense','paid',20,'2026-01-01','Comprovante fixture B','40000000-0000-4000-8000-000000000002',20,'2026-01-01','manual');


set local role authenticated;
do $assert_market_data_private$
begin
  begin
    perform 1 from public.market_data_usage;
    perform 1 from public.market_data_cursor;
    raise exception 'Usuário autenticado conseguiu ler a cota global do provedor';
  exception when insufficient_privilege then
    null;
  end;
end
$assert_market_data_private$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

do $assert_account_balances$
declare
  v_count integer;
  v_balance numeric(15,2);
  v_loan_id uuid;
  v_overtime_id uuid;
  v_public_definer boolean;
  v_private_definer boolean;
begin
  select count(*), max(balance)
    into v_count, v_balance
    from public.get_account_balances(date '2026-01-04');
  if v_count <> 1 or v_balance <> 90.00 then
    raise exception 'Saldo inicial + lançamento não foi calculado corretamente: count %, balance %', v_count, v_balance;
  end if;

  select id into v_loan_id
    from public.create_receivable_loan(
      'Pessoa fixture', 20.00, date '2026-01-02', null,
      '40000000-0000-4000-8000-000000000001', null, 'sql-loan-0001'
    );

  perform public.register_receivable_repayment(
    v_loan_id,
    '40000000-0000-4000-8000-000000000001',
    5.00,
    date '2026-01-03',
    'sql-repay-0001'
  );

  select id into v_overtime_id
    from public.record_overtime_entry(
      date '2026-01-02', 2.00, 10.00, 0.00,
      'Hora extra fixture', 'sql-overtime-01'
    );

  perform public.convert_overtime_to_receipt(
    array[v_overtime_id],
    '40000000-0000-4000-8000-000000000001',
    date '2026-01-04',
    'sql-overtime-batch-01'
  );

  select balance into v_balance
    from public.get_account_balances(date '2026-01-04')
   where account_id = '40000000-0000-4000-8000-000000000001';

  if v_balance <> 95.00 then
    raise exception 'Saldo por conta não refletiu empréstimo, devolução e hora extra: esperado 95, recebido %', v_balance;
  end if;

  if has_function_privilege('anon','public.get_account_balances(date)','EXECUTE')
     or not has_function_privilege('authenticated','public.get_account_balances(date)','EXECUTE') then
    raise exception 'Grants incorretos para get_account_balances';
  end if;
  select prosecdef into v_public_definer
    from pg_proc where oid = 'public.get_account_balances(date)'::regprocedure;
  select prosecdef into v_private_definer
    from pg_proc where oid = 'private_api.get_account_balances(date)'::regprocedure;
  if v_public_definer is distinct from false or v_private_definer is distinct from true then
    raise exception 'Camadas de segurança incorretas para get_account_balances';
  end if;

  if has_schema_privilege('anon','private_api','USAGE')
     or not has_schema_privilege('authenticated','private_api','USAGE')
     or has_function_privilege('anon','private_api.get_account_balances(date)','EXECUTE')
     or not has_function_privilege('authenticated','private_api.get_account_balances(date)','EXECUTE') then
    raise exception 'Privilégios incorretos para a função interna de saldos';
  end if;
end
$assert_account_balances$;

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.accounts;
  if v_count <> 1 then
    raise exception 'RLS de accounts vazou dados entre usuários: esperado 1, recebido %', v_count;
  end if;

  insert into storage.objects(bucket_id,name)
  values ('receipt-files','10000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/receipt.pdf');
  select count(*) into v_count from storage.objects where bucket_id='receipt-files';
  if v_count <> 1 then
    raise exception 'Storage não permitiu acesso ao comprovante próprio';
  end if;
  begin
    insert into storage.objects(bucket_id,name)
    values ('receipt-files','10000000-0000-4000-8000-000000000002/60000000-0000-4000-8000-000000000002/receipt.pdf');
    raise exception 'Storage permitiu inserir comprovante de outro usuário';
  exception when insufficient_privilege then
    null;
  end;
  delete from storage.objects
   where bucket_id='receipt-files'
     and name='10000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/receipt.pdf';

  begin
    insert into public.accounts(user_id,name,account_type,opening_balance,opening_balance_date)
    values ('10000000-0000-4000-8000-000000000002','INSERT cruzado','checking',0,'2026-01-01');
    raise exception 'RLS permitiu INSERT de conta para outro usuário';
  exception when insufficient_privilege then
    null;
  end;

  update public.accounts
     set name='Tentativa de alteração cruzada'
   where user_id='10000000-0000-4000-8000-000000000002';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'RLS permitiu UPDATE de conta de outro usuário';
  end if;

  delete from public.accounts
   where user_id='10000000-0000-4000-8000-000000000002';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'RLS permitiu DELETE de conta de outro usuário';
  end if;
end $$;


do $assert_radar_generation$
declare
  v_id uuid;
  v_generation integer;
  v_enabled boolean;
begin
  -- Desativar preserva a geração; reativar avança exatamente uma vez.
  select id, generation, is_enabled into v_id, v_generation, v_enabled
    from public.radar_alert_set_enabled('20000000-0000-4000-8000-000000000001', false);
  if v_id is null or v_generation <> 1 or v_enabled then
    raise exception 'Desativação do Radar alterou geração ou falhou';
  end if;

  select generation into v_generation
    from public.radar_alert_set_enabled('20000000-0000-4000-8000-000000000001', true);
  if v_generation <> 2 then
    raise exception 'Reativação do Radar não incrementou geração';
  end if;

  select generation into v_generation
    from public.radar_alert_set_enabled('20000000-0000-4000-8000-000000000001', true);
  if v_generation <> 2 then
    raise exception 'Ativação repetida incrementou geração indevidamente';
  end if;

  if exists (
    select 1 from public.radar_alert_set_enabled(
      '20000000-0000-4000-8000-000000000002', false
    )
  ) then
    raise exception 'RPC do Radar permitiu alterar alerta de outro usuário';
  end if;
end
$assert_radar_generation$;

reset role;
set local role service_role;

do $assert_usage$
declare
  v_reservation uuid;
  v_user uuid := '10000000-0000-4000-8000-000000000001';
  v_other uuid := '10000000-0000-4000-8000-000000000002';
  v_status text;
  v_token uuid;
  v_old_token uuid;
  v_attempt integer;
  v_ok boolean;
begin
  -- Reservas atômicas: uma reserva pendente já consome a cota.
  v_reservation := public.ai_usage_reserve(v_user, 'phrase', 1, 1);
  if v_reservation is null then raise exception 'Primeira reserva de IA deveria ser aceita'; end if;
  if public.ai_usage_reserve(v_user, 'phrase', 1, 1) is not null then
    raise exception 'Cota de IA permitiu duas reservas simultâneas para limite 1';
  end if;
  if not public.ai_usage_finalize(v_reservation, true) then
    raise exception 'Finalização de reserva de IA deveria confirmar';
  end if;
  if public.ai_usage_reserve(v_user, 'phrase', 1, 1) is not null then
    raise exception 'Cota de IA ignorou uso já confirmado';
  end if;

  v_reservation := public.ai_usage_reserve(v_other, 'receipt', 1, 1);
  if v_reservation is null or not public.ai_usage_finalize(v_reservation, false) then
    raise exception 'Reserva liberada de IA não foi finalizada';
  end if;
  if public.ai_usage_reserve(v_other, 'receipt', 1, 1) is null then
    raise exception 'Reserva liberada não devolveu a cota de IA';
  end if;

  if not public.market_data_reserve('brapi', 'PETR4', 1)
     or public.market_data_reserve('brapi', 'VALE3', 1) then
    raise exception 'Quota mensal do provedor não foi reservada atomicamente';
  end if;

  if not public.rate_limit_allow(v_user, 'sql-assertion', 20261122, 1)
     or public.rate_limit_allow(v_user, 'sql-assertion', 20261122, 1) then
    raise exception 'Rate limit não respeitou o limite atômico';
  end if;

  -- Inbox: repetição, lease ativo, conclusão e fencing token expirado.
  select reservation_status, fencing_token, attempt_number
    into v_status, v_token, v_attempt
    from public.whatsapp_inbox_reserve('gv-inbox-duplicate', '{"event":"created"}', 60);
  if v_status <> 'reserved' or v_token is null or v_attempt <> 1 then
    raise exception 'Primeira reserva da inbox deveria ser aceita';
  end if;
  select reservation_status into v_status
    from public.whatsapp_inbox_reserve('gv-inbox-duplicate', '{"event":"created"}', 60);
  if v_status <> 'busy' then raise exception 'Inbox repetida deveria retornar busy'; end if;
  if not public.whatsapp_inbox_finalize('gv-inbox-duplicate', v_token, true, null) then
    raise exception 'Inbox não confirmou com fencing token válido';
  end if;
  select reservation_status into v_status
    from public.whatsapp_inbox_reserve('gv-inbox-duplicate', '{"event":"created"}', 60);
  if v_status <> 'completed' then raise exception 'Inbox concluída foi reservada novamente'; end if;

  select reservation_status, fencing_token into v_status, v_old_token
    from public.whatsapp_inbox_reserve('gv-inbox-expired', '{"event":"retry"}', 60);
  update public.whatsapp_inbox set lease_until = now() - interval '1 second'
   where message_id = 'gv-inbox-expired';
  select reservation_status, fencing_token, attempt_number
    into v_status, v_token, v_attempt
    from public.whatsapp_inbox_reserve('gv-inbox-expired', '{"event":"retry"}', 60);
  if v_status <> 'reserved' or v_token is null or v_attempt <> 2 then
    raise exception 'Inbox com lease expirado deveria gerar nova reserva';
  end if;
  if public.whatsapp_inbox_finalize('gv-inbox-expired', v_old_token, true, null) then
    raise exception 'Inbox aceitou fencing token antigo';
  end if;
  if not public.whatsapp_inbox_finalize('gv-inbox-expired', v_token, true, null) then
    raise exception 'Inbox rejeitou fencing token atual';
  end if;

  -- Outbox: retry somente em falha segura; timeout ambíguo não pode reenviar.
  select reservation_status, fencing_token into v_status, v_token
    from public.whatsapp_outbox_reserve('gv-outbox-safe', '+5511999999999', '{"text":"hello"}', 60);
  if v_status <> 'reserved' or v_token is null then raise exception 'Outbox inicial não reservada'; end if;
  select reservation_status into v_status
    from public.whatsapp_outbox_reserve('gv-outbox-safe', '+5511999999999', '{"text":"hello"}', 60);
  if v_status <> 'busy' then raise exception 'Outbox ativa deveria retornar busy'; end if;
  if not public.whatsapp_outbox_finalize('gv-outbox-safe', v_token, 'failed_safe', null, 'HTTP 429') then
    raise exception 'Outbox falha segura não finalizada';
  end if;
  select reservation_status, fencing_token, attempt_number
    into v_status, v_token, v_attempt
    from public.whatsapp_outbox_reserve('gv-outbox-safe', '+5511999999999', '{"text":"hello"}', 60);
  if v_status <> 'reserved' or v_attempt <> 2 then
    raise exception 'Outbox failed_safe não permitiu retry controlado';
  end if;
  if not public.whatsapp_outbox_finalize('gv-outbox-safe', v_token, 'sent', 'provider-123', null) then
    raise exception 'Outbox não confirmou envio';
  end if;
  select reservation_status into v_status
    from public.whatsapp_outbox_reserve('gv-outbox-safe', '+5511999999999', '{"text":"hello"}', 60);
  if v_status <> 'sent' then raise exception 'Outbox enviada foi reaberta'; end if;

  select reservation_status, fencing_token into v_status, v_old_token
    from public.whatsapp_outbox_reserve('gv-outbox-uncertain', '+5511888888888', '{"text":"maybe"}', 60);
  update public.whatsapp_outbox set lease_until = now() - interval '1 second'
   where idempotency_key = 'gv-outbox-uncertain';
  select reservation_status into v_status
    from public.whatsapp_outbox_reserve('gv-outbox-uncertain', '+5511888888888', '{"text":"maybe"}', 60);
  if v_status <> 'uncertain' then raise exception 'Outbox expirada deveria ficar uncertain'; end if;
  if public.whatsapp_outbox_finalize('gv-outbox-uncertain', v_old_token, 'sent', 'late-provider-id', null) then
    raise exception 'Outbox aceitou confirmação com fencing token expirado';
  end if;

  update public.settings set whatsapp_weekly_summary=true where user_id=v_user;
  insert into public.whatsapp_links(user_id, phone, weekly_summary_enabled)
  values (v_user, '+5511777777777', true)
  on conflict (user_id) do update set weekly_summary_enabled=true;
  if not public.whatsapp_summary_reserve(v_user, date '2026-11-23')
     or public.whatsapp_summary_reserve(v_user, date '2026-11-23') then
    raise exception 'Resumo semanal não preservou reserva idempotente';
  end if;
  if public.recurrence_next_date('monthly', 1, date '2026-01-31', 31::smallint, null::smallint) <> date '2026-02-28' then
    raise exception 'Recorrência mensal não preservou o último dia em fevereiro';
  end if;
  if public.recurrence_next_date('yearly', 1, date '2024-02-29', 29::smallint, 2::smallint) <> date '2025-02-28' then
    raise exception 'Recorrência anual não tratou ano bissexto';
  end if;
end $assert_usage$;

reset role;
rollback;

select 'GranaViva RLS/security assertions passed.' as result;
