-- Assertions de segurança para executar após as cinco migrations em Supabase/PostgreSQL isolado.
-- Executar como postgres/superuser. Tudo é revertido ao final.
begin;

do $$
declare
  v_missing text;
begin
  select string_agg(t.table_name, ', ' order by t.table_name)
    into v_missing
  from (values
    ('profiles'),('settings'),('categories'),
    ('accounts'),('cards'),('recurrence_rules'),('import_batches'),('transactions'),
    ('budgets'),('goals'),('goal_contributions'),('tangible_assets'),('liabilities'),
    ('net_worth_snapshots'),('receivables'),('import_items'),('receipt_files'),
    ('investment_assets'),('investment_operations'),('income_events'),('quote_cache'),
    ('radar_alerts'),('radar_fires'),('push_subscriptions'),('push_deliveries'),
    ('ai_usage'),('ai_usage_reservations'),('rate_limit_buckets'),('function_errors'),
    ('whatsapp_links'),('whatsapp_link_codes'),('whatsapp_link_attempts'),
    ('whatsapp_pending_transactions'),('whatsapp_inbox'),('whatsapp_outbox')
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
      ('investment_assets'),('investment_operations'),('income_events'),('quote_cache'),
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
     or has_table_privilege('authenticated','public.whatsapp_pending_transactions','select') then
    raise exception 'Tabela interna concedeu acesso de leitura a anon/authenticated';
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
    'public.whatsapp_summary_reserve(uuid,date)'::regprocedure
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

-- Cria duas identidades de fixture; o trigger da migration 001 cria profiles/settings.
insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','gv-rls-a@example.invalid','', '{}'::jsonb, '{}'::jsonb, now(), now()),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','gv-rls-b@example.invalid','', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.accounts(user_id,name,account_type,opening_balance,opening_balance_date)
values
 ('10000000-0000-4000-8000-000000000001','Conta fixture A','checking',100,'2026-01-01'),
 ('10000000-0000-4000-8000-000000000002','Conta fixture B','checking',200,'2026-01-01');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.accounts;
  if v_count <> 1 then
    raise exception 'RLS de accounts vazou dados entre usuários: esperado 1, recebido %', v_count;
  end if;

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

reset role;
rollback;

select 'GranaViva RLS/security assertions passed.' as result;
