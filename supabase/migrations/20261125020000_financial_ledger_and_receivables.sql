begin;

-- Ledger privado: a fonte contábil passa a ser um diário imutável de partidas dobradas.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Forma de pagamento explícita: crédito nunca é confundido com débito bancário.
alter table public.transactions add column if not exists payment_method text;
update public.transactions t
   set payment_method=case
     when t.kind='expense' and t.card_id is not null then 'credit'
     when t.kind='expense' and t.account_id is not null and exists(
       select 1 from public.accounts a where a.user_id=t.user_id and a.id=t.account_id and a.account_type='cash'
     ) then 'cash'
     when t.kind='expense' and t.account_id is not null then 'pix'
     else null end;
do $payment_method_constraint$
begin
  if not exists(select 1 from pg_constraint where conname='transactions_payment_method_check'
    and conrelid='public.transactions'::regclass) then
    alter table public.transactions add constraint transactions_payment_method_check
      check(payment_method is null or payment_method in ('pix','debit','cash','credit'));
  end if;
end $payment_method_constraint$;

-- Proventos recebidos precisam liquidar em uma conta BRL ou no caixa da corretora.
alter table public.income_events
  add column if not exists account_id uuid,
  add column if not exists transaction_id uuid,
  add column if not exists settlement_idempotency_key text,
  add column if not exists settlement_state text not null default 'unsettled'
    check(settlement_state in ('unsettled','settled'));
do $income_event_fks$
begin
  if not exists(select 1 from pg_constraint where conname='income_events_account_fk' and conrelid='public.income_events'::regclass) then
    alter table public.income_events add constraint income_events_account_fk
      foreign key(user_id,account_id) references public.accounts(user_id,id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conname='income_events_transaction_fk' and conrelid='public.income_events'::regclass) then
    alter table public.income_events add constraint income_events_transaction_fk
      foreign key(user_id,transaction_id) references public.transactions(user_id,id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conname='income_events_settlement_state_check' and conrelid='public.income_events'::regclass) then
    alter table public.income_events add constraint income_events_settlement_state_check
      check((settlement_state='settled' and account_id is not null and transaction_id is not null
             and settlement_idempotency_key is not null)
         or (settlement_state='unsettled' and transaction_id is null));
  end if;
end $income_event_fks$;
create unique index if not exists income_events_settlement_idempotency_uidx
  on public.income_events(user_id,settlement_idempotency_key)
  where settlement_idempotency_key is not null;
create unique index if not exists income_events_transaction_uidx
  on public.income_events(user_id,transaction_id)
  where transaction_id is not null;

create table private.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_kind text not null check (account_kind in (
    'bank','cash','investment_cash','card_liability','investment_asset','receivable_asset',
    'expense','income','opening_equity'
  )),
  name text not null check (length(btrim(name)) between 1 and 160),
  currency text not null default 'BRL' check(currency in ('BRL','USD')),
  source_account_id uuid,
  source_card_id uuid,
  source_investment_asset_id uuid,
  source_receivable_loan_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id,id),
  foreign key (user_id,source_account_id) references public.accounts(user_id,id) on delete restrict,
  foreign key (user_id,source_card_id) references public.cards(user_id,id) on delete restrict,
  foreign key (user_id,source_investment_asset_id) references public.investment_assets(user_id,id) on delete restrict,
  check (num_nonnulls(source_account_id,source_card_id,source_investment_asset_id,source_receivable_loan_id) <= 1),
  check (
    (account_kind in ('bank','cash','investment_cash') and source_account_id is not null
      and num_nonnulls(source_card_id,source_investment_asset_id,source_receivable_loan_id)=0)
    or (account_kind='card_liability' and source_card_id is not null
      and num_nonnulls(source_account_id,source_investment_asset_id,source_receivable_loan_id)=0)
    or (account_kind='investment_asset' and source_investment_asset_id is not null
      and num_nonnulls(source_account_id,source_card_id,source_receivable_loan_id)=0)
    or (account_kind='receivable_asset' and source_receivable_loan_id is not null
      and num_nonnulls(source_account_id,source_card_id,source_investment_asset_id)=0)
    or (account_kind in ('expense','income','opening_equity')
      and num_nonnulls(source_account_id,source_card_id,source_investment_asset_id,source_receivable_loan_id)=0)
  )
);
create unique index ledger_accounts_source_account_uidx
  on private.ledger_accounts(user_id,source_account_id) where source_account_id is not null;
create unique index ledger_accounts_source_card_uidx
  on private.ledger_accounts(user_id,source_card_id) where source_card_id is not null;
create unique index ledger_accounts_source_asset_uidx
  on private.ledger_accounts(user_id,source_investment_asset_id) where source_investment_asset_id is not null;
create unique index ledger_accounts_source_receivable_uidx
  on private.ledger_accounts(user_id,source_receivable_loan_id) where source_receivable_loan_id is not null;
create unique index ledger_accounts_system_uidx
  on private.ledger_accounts(user_id,account_kind)
  where account_kind in ('expense','income','opening_equity');

create table private.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_date date not null,
  description text not null check (length(btrim(description)) between 1 and 240),
  source_type text not null,
  source_id uuid not null,
  event_type text not null check (event_type in ('posting','reversal')),
  status text not null default 'draft' check (status in ('draft','posted')),
  reversal_of uuid references private.journal_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  unique (user_id,id),
  check ((event_type='reversal' and reversal_of is not null) or
         (event_type='posting' and reversal_of is null)),
  check ((status='posted' and posted_at is not null) or
         (status='draft' and posted_at is null))
);
create index journal_entries_user_date_idx
  on private.journal_entries(user_id,transaction_date desc,created_at desc);
create unique index journal_entries_one_reversal_uidx
  on private.journal_entries(reversal_of) where reversal_of is not null;

create table private.journal_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  journal_entry_id uuid not null,
  ledger_account_id uuid not null,
  debit numeric(15,2) not null default 0 check (debit >= 0),
  credit numeric(15,2) not null default 0 check (credit >= 0),
  category_id uuid,
  memo text,
  created_at timestamptz not null default now(),
  foreign key (user_id,journal_entry_id) references private.journal_entries(user_id,id) on delete cascade,
  foreign key (user_id,ledger_account_id) references private.ledger_accounts(user_id,id) on delete restrict,
  foreign key (user_id,category_id) references public.categories(user_id,id) on delete restrict,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index journal_lines_account_idx
  on private.journal_lines(user_id,ledger_account_id,journal_entry_id);

create table private.ledger_source_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  active_journal_id uuid,
  updated_at timestamptz not null default now(),
  primary key(user_id,source_type,source_id),
  foreign key (user_id,active_journal_id) references private.journal_entries(user_id,id) on delete cascade
);

alter table private.ledger_accounts enable row level security;
alter table private.journal_entries enable row level security;
alter table private.journal_lines enable row level security;
alter table private.ledger_source_state enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

-- Empréstimos a terceiros: ativo a receber, nunca despesa pessoal.
create table public.receivable_loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_name text not null check (length(btrim(person_name)) between 1 and 120),
  principal_amount numeric(15,2) not null check (principal_amount > 0),
  loan_date date not null,
  expected_date date,
  source_account_id uuid not null,
  notes text,
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  created_at timestamptz not null default now(),
  unique(user_id,id),
  unique(user_id,idempotency_key),
  foreign key(user_id,source_account_id) references public.accounts(user_id,id) on delete restrict
);
create table public.receivable_repayments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_id uuid not null,
  destination_account_id uuid not null,
  amount numeric(15,2) not null check (amount > 0),
  received_date date not null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  created_at timestamptz not null default now(),
  unique(user_id,id),
  unique(user_id,idempotency_key),
  foreign key(user_id,loan_id) references public.receivable_loans(user_id,id) on delete restrict,
  foreign key(user_id,destination_account_id) references public.accounts(user_id,id) on delete restrict
);
alter table private.ledger_accounts
  add constraint ledger_accounts_receivable_fk
  foreign key(user_id,source_receivable_loan_id)
  references public.receivable_loans(user_id,id) on delete restrict;
create index receivable_loans_user_due_idx on public.receivable_loans(user_id,expected_date);
create index receivable_repayments_loan_idx on public.receivable_repayments(user_id,loan_id,received_date);

-- Banco de horas extras: previsão não contabilizada até conversão explícita.
create table public.overtime_conversion_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_account_id uuid not null,
  entry_ids uuid[] not null check(cardinality(entry_ids)>0),
  total_amount numeric(15,2) not null check (total_amount > 0),
  received_date date not null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  journal_entry_id uuid,
  created_at timestamptz not null default now(),
  unique(user_id,id),
  unique(user_id,idempotency_key),
  foreign key(user_id,destination_account_id) references public.accounts(user_id,id) on delete restrict,
  foreign key(user_id,journal_entry_id) references private.journal_entries(user_id,id) on delete restrict
);
create table public.overtime_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  hours numeric(8,2) not null check (hours > 0 and hours <= 24),
  hourly_rate numeric(14,2) not null check (hourly_rate > 0),
  premium_percent numeric(6,2) not null default 0 check (premium_percent between 0 and 500),
  expected_amount numeric(15,2) generated always as
    (round(hours * hourly_rate * (1 + premium_percent / 100),2)) stored,
  description text,
  status text not null default 'pending' check (status in ('pending','converted','archived')),
  conversion_batch_id uuid,
  idempotency_key text not null check (length(idempotency_key) between 8 and 120),
  created_at timestamptz not null default now(),
  unique(user_id,id),
  unique(user_id,idempotency_key),
  foreign key(user_id,conversion_batch_id) references public.overtime_conversion_batches(user_id,id) on delete restrict,
  check ((status='converted' and conversion_batch_id is not null) or
         (status<>'converted' and conversion_batch_id is null))
);
create index overtime_entries_pending_idx on public.overtime_entries(user_id,work_date)
  where status='pending';

-- Alocação exata de parcelas às faturas; centavos residuais ficam na primeira parcela.
create table public.card_invoice_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  transaction_id uuid not null,
  card_id uuid not null,
  invoice_closing_date date not null,
  invoice_due_date date not null,
  installment_number smallint not null check (installment_number between 1 and 48),
  installment_count smallint not null check (installment_count between 1 and 48),
  amount numeric(15,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  foreign key(user_id,transaction_id) references public.transactions(user_id,id) on delete cascade,
  foreign key(user_id,card_id) references public.cards(user_id,id) on delete restrict,
  unique(user_id,transaction_id,installment_number),
  check(installment_number <= installment_count)
);
create index card_invoice_installments_cycle_idx
  on public.card_invoice_installments(user_id,card_id,invoice_closing_date);

-- Todas as tabelas expostas recebem RLS e grants explícitos (Supabase Data API).
do $$
declare t text;
begin
  foreach t in array array[
    'receivable_loans','receivable_repayments','overtime_conversion_batches',
    'overtime_entries','card_invoice_installments'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id=(select auth.uid()))',t||'_select_own',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
  end loop;
  grant select on public.receivable_loans,public.receivable_repayments,
    public.overtime_conversion_batches,public.overtime_entries,
    public.card_invoice_installments to authenticated;
  grant all on public.receivable_loans,public.receivable_repayments,
    public.overtime_conversion_batches,public.overtime_entries,
    public.card_invoice_installments to service_role;
end $$;


-- A exclusão de um usuário remove o ledger privado em ordem segura, sem órfãos.
create or replace function private.cleanup_user_financial_ledger()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog, public, private
as $cleanup$
begin
  perform set_config('app.cleanup_financial_ledger_user',old.id::text,true);
  -- A conta está sendo encerrada; remove o ponteiro antes das cascatas para não gerar estornos inúteis.
  delete from private.ledger_source_state where user_id=old.id;
  delete from public.income_events where user_id=old.id;
  delete from public.investment_operations where user_id=old.id;
  delete from public.overtime_entries where user_id=old.id;
  delete from public.overtime_conversion_batches where user_id=old.id;
  delete from public.receivable_repayments where user_id=old.id;
  delete from public.card_invoice_payments where user_id=old.id;
  delete from public.card_invoice_installments where user_id=old.id;
  delete from private.journal_entries where user_id=old.id;
  delete from private.ledger_accounts where user_id=old.id;
  return old;
end;
$cleanup$;
revoke all on function private.cleanup_user_financial_ledger() from public,anon,authenticated;
create trigger auth_users_cleanup_financial_ledger
before delete on auth.users
for each row execute function private.cleanup_user_financial_ledger();

-- Helpers internos. SECURITY DEFINER é restrito ao schema privado, com owner check no RPC público.
create or replace function private.ensure_ledger_account(
  p_user_id uuid,p_kind text,p_source_id uuid,p_name text
) returns uuid
language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare v_id uuid; v_account_type text; v_currency text:='BRL';
begin
  if p_kind in ('bank','cash','investment_cash') then
    select account_type into v_account_type from public.accounts
     where user_id=p_user_id and id=p_source_id;
    if not found then raise exception 'Conta financeira não pertence ao usuário' using errcode='23503'; end if;
    p_kind := case
      when lower(v_account_type) in ('cash','physical_cash','dinheiro','dinheiro_fisico') then 'cash'
      when lower(v_account_type)='investment' then 'investment_cash'
      else 'bank' end;
  elsif p_kind='card_liability' then
    if not exists(select 1 from public.cards where user_id=p_user_id and id=p_source_id) then
      raise exception 'Cartão não pertence ao usuário' using errcode='23503';
    end if;
  elsif p_kind='investment_asset' then
    select currency into v_currency from public.investment_assets
     where user_id=p_user_id and id=p_source_id;
    if not found then raise exception 'Ativo não pertence ao usuário' using errcode='23503'; end if;
  elsif p_kind='receivable_asset' then
    if not exists(select 1 from public.receivable_loans where user_id=p_user_id and id=p_source_id) then
      raise exception 'Título a receber não pertence ao usuário' using errcode='23503';
    end if;
  elsif p_kind not in ('expense','income','opening_equity') then
    raise exception 'Tipo de conta contábil inválido' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text||':'||p_kind||':'||coalesce(p_source_id::text,'system'),0));
  if p_kind in ('bank','cash','investment_cash') then
    select id into v_id from private.ledger_accounts
     where user_id=p_user_id and source_account_id=p_source_id;
  elsif p_kind='card_liability' then
    select id into v_id from private.ledger_accounts
     where user_id=p_user_id and source_card_id=p_source_id;
  elsif p_kind='investment_asset' then
    select id into v_id from private.ledger_accounts
     where user_id=p_user_id and source_investment_asset_id=p_source_id;
  elsif p_kind='receivable_asset' then
    select id into v_id from private.ledger_accounts
     where user_id=p_user_id and source_receivable_loan_id=p_source_id;
  else
    select id into v_id from private.ledger_accounts
     where user_id=p_user_id and account_kind=p_kind;
  end if;
  if v_id is not null then return v_id; end if;

  insert into private.ledger_accounts(
    user_id,account_kind,name,currency,source_account_id,source_card_id,
    source_investment_asset_id,source_receivable_loan_id
  ) values (
    p_user_id,p_kind,left(coalesce(nullif(btrim(p_name),''),p_kind),160),v_currency,
    case when p_kind in ('bank','cash','investment_cash') then p_source_id end,
    case when p_kind='card_liability' then p_source_id end,
    case when p_kind='investment_asset' then p_source_id end,
    case when p_kind='receivable_asset' then p_source_id end
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.post_pair(
  p_user_id uuid,p_date date,p_description text,p_source_type text,p_source_id uuid,
  p_debit_kind text,p_debit_source uuid,p_credit_kind text,p_credit_source uuid,
  p_amount numeric,p_category_id uuid default null
) returns uuid
language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare v_journal uuid; v_debit_account uuid; v_credit_account uuid; v_debit_currency text; v_credit_currency text;
begin
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) then
    raise exception 'Valor contábil deve ser positivo e ter no máximo duas casas decimais' using errcode='22023';
  end if;
  v_debit_account := private.ensure_ledger_account(p_user_id,p_debit_kind,p_debit_source,p_debit_kind);
  v_credit_account := private.ensure_ledger_account(p_user_id,p_credit_kind,p_credit_source,p_credit_kind);
  select currency into v_debit_currency from private.ledger_accounts where user_id=p_user_id and id=v_debit_account;
  select currency into v_credit_currency from private.ledger_accounts where user_id=p_user_id and id=v_credit_account;
  if v_debit_currency is distinct from v_credit_currency then
    raise exception 'Moeda incompatível entre as partidas (% / %); conversão cambial explícita necessária',
      v_debit_currency,v_credit_currency using errcode='23514';
  end if;
  insert into private.journal_entries(
    user_id,transaction_date,description,source_type,source_id,event_type,status
  ) values (p_user_id,p_date,left(p_description,240),p_source_type,p_source_id,'posting','draft')
  returning id into v_journal;
  insert into private.journal_lines(user_id,journal_entry_id,ledger_account_id,debit,credit,category_id)
  values
    (p_user_id,v_journal,v_debit_account,p_amount,0,p_category_id),
    (p_user_id,v_journal,v_credit_account,0,p_amount,p_category_id);
  update private.journal_entries set status='posted',posted_at=now() where id=v_journal;
  return v_journal;
end;
$$;

create or replace function private.reverse_journal(p_journal_id uuid,p_date date,p_reason text)
returns uuid
language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare v_original private.journal_entries%rowtype; v_reversal uuid;
begin
  select * into v_original from private.journal_entries where id=p_journal_id for update;
  if not found or v_original.status<>'posted' then
    raise exception 'Lançamento contábil original não encontrado' using errcode='23503';
  end if;
  insert into private.journal_entries(
    user_id,transaction_date,description,source_type,source_id,event_type,status,reversal_of
  ) values (
    v_original.user_id,p_date,left('Estorno: '||p_reason,240),
    v_original.source_type,v_original.source_id,'reversal','draft',v_original.id
  ) returning id into v_reversal;
  insert into private.journal_lines(user_id,journal_entry_id,ledger_account_id,debit,credit,category_id,memo)
  select user_id,v_reversal,ledger_account_id,credit,debit,category_id,'Estorno automático'
    from private.journal_lines where journal_entry_id=v_original.id;
  update private.journal_entries set status='posted',posted_at=now() where id=v_reversal;
  return v_reversal;
end;
$$;

create or replace function private.assert_journal_balanced()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,private
as $$
declare v_id uuid; v_status text; v_count integer; v_debit numeric; v_credit numeric;
begin
  if tg_table_name='journal_entries' then
    v_id := coalesce(new.id,old.id);
  else
    v_id := coalesce(new.journal_entry_id,old.journal_entry_id);
  end if;
  select status into v_status from private.journal_entries where id=v_id;
  if v_status is distinct from 'posted' then return null; end if;
  select count(*),coalesce(sum(debit),0),coalesce(sum(credit),0)
    into v_count,v_debit,v_credit
    from private.journal_lines where journal_entry_id=v_id;
  if v_count < 2 or v_debit <= 0 or v_debit <> v_credit then
    raise exception 'Partida dobrada inválida: diário % não está balanceado',v_id using errcode='23514';
  end if;
  return null;
end;
$$;

create or replace function private.protect_posted_journal()
returns trigger language plpgsql
set search_path=pg_catalog,private
as $protect$
declare v_status text;
begin
  if tg_table_name='journal_entries' then
    if old.status='posted' and not (
      tg_op='DELETE' and current_setting('app.cleanup_financial_ledger_user',true) is not distinct from old.user_id::text
    ) then
      raise exception 'Diários contabilizados são imutáveis; use estorno' using errcode='55000';
    end if;
  else
    select status into v_status from private.journal_entries where id=old.journal_entry_id;
    if v_status='posted' and not (
      tg_op='DELETE' and current_setting('app.cleanup_financial_ledger_user',true)=old.user_id::text
    ) then
      raise exception 'Linhas contabilizadas são imutáveis; use estorno' using errcode='55000';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$protect$;

create constraint trigger journal_entries_balanced
after insert or update on private.journal_entries
deferrable initially deferred for each row execute function private.assert_journal_balanced();
create constraint trigger journal_lines_balanced
after insert or update or delete on private.journal_lines
deferrable initially deferred for each row execute function private.assert_journal_balanced();
create trigger journal_entries_immutable before update or delete on private.journal_entries
for each row execute function private.protect_posted_journal();
create trigger journal_lines_immutable before update or delete on private.journal_lines
for each row execute function private.protect_posted_journal();


create or replace function private.normalize_transaction_payment_method()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog, public
as $normalize$
declare v_account_type text;
begin
  if new.kind<>'expense' then
    new.payment_method:=null;
    return new;
  end if;

  if new.card_id is not null then
    if new.account_id is not null then
      raise exception 'Despesa no crédito não pode debitar uma conta bancária' using errcode='23514';
    end if;
    new.payment_method:='credit';
    return new;
  end if;

  if new.account_id is null then
    new.payment_method:=null;
    return new;
  end if;

  select account_type into v_account_type from public.accounts
   where user_id=new.user_id and id=new.account_id;
  if not found then raise exception 'Conta de pagamento não encontrada' using errcode='23503'; end if;
  if v_account_type='investment' then
    raise exception 'Conta de investimentos é protegida e não pode pagar despesas' using errcode='23514';
  end if;

  if new.payment_method='whatsapp' then new.payment_method:=null; end if;
  if new.payment_method is null then
    new.payment_method:=case when v_account_type='cash' then 'cash' else 'pix' end;
  end if;
  if new.payment_method='credit' then
    raise exception 'Selecione um cartão para pagamento no crédito' using errcode='23514';
  elsif new.status='paid' and new.payment_method='cash' and v_account_type<>'cash' then
    raise exception 'Pagamento em dinheiro exige a carteira Dinheiro Físico' using errcode='23514';
  elsif new.status='paid' and new.payment_method in ('pix','debit') and v_account_type='cash' then
    raise exception 'Carteira Dinheiro Físico exige forma de pagamento Dinheiro' using errcode='23514';
  end if;
  return new;
end;
$normalize$;
create trigger transactions_normalize_payment_method
before insert or update on public.transactions
for each row execute function private.normalize_transaction_payment_method();

create or replace function private.protect_account_opening_balance()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog, public
as $account_guard$
begin
  if old.opening_balance is distinct from new.opening_balance
     or old.opening_balance_date is distinct from new.opening_balance_date
     or old.account_type is distinct from new.account_type then
    raise exception 'Saldo inicial, data-base e tipo da conta são imutáveis após o cadastro; registre um ajuste contábil' using errcode='55000';
  end if;
  return new;
end;
$account_guard$;
create trigger accounts_opening_balance_immutable
before update of opening_balance,opening_balance_date,account_type on public.accounts
for each row execute function private.protect_account_opening_balance();

create or replace function private.sync_transaction_ledger()
returns trigger
language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare v_user uuid; v_id uuid; v_active uuid; v_journal uuid; v_kind text; v_debit_kind text; v_credit_kind text; v_debit_source uuid; v_credit_source uuid; v_from_opening date; v_to_opening date; v_from_account_type text; v_investment_balance numeric(15,2); v_investment_ledger_id uuid; v_credit_limit numeric(15,2); v_card_balance numeric(15,2); v_card_ledger_id uuid;
begin
  v_user := case when tg_op='DELETE' then old.user_id else new.user_id end;
  v_id := case when tg_op='DELETE' then old.id else new.id end;
  if tg_op='UPDATE' and new.user_id<>old.user_id then raise exception 'Não é permitido transferir a titularidade de um lançamento' using errcode='42501'; end if;
  if auth.uid() is not null and auth.uid()<>v_user then
    raise exception 'Operação financeira não pertence à sessão autenticada' using errcode='42501';
  end if;
  select active_journal_id into v_active from private.ledger_source_state
   where user_id=v_user and source_type='transaction' and source_id=v_id for update;
  if v_active is not null then
    perform private.reverse_journal(v_active,current_date,'alteração ou exclusão do lançamento');
    update private.ledger_source_state set active_journal_id=null,updated_at=now()
     where user_id=v_user and source_type='transaction' and source_id=v_id;
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.status='paid' then
    if new.kind='transfer' then
      select opening_balance_date,account_type into v_from_opening,v_from_account_type from public.accounts
       where user_id=v_user and id=new.transfer_from_account_id;
      select opening_balance_date into v_to_opening from public.accounts
       where user_id=v_user and id=new.transfer_to_account_id;
      if v_from_account_type='investment' and new.transaction_date>=v_from_opening then
        perform pg_advisory_xact_lock(hashtextextended(v_user::text||':investment-resgate:'||new.transfer_from_account_id::text,0));
        v_investment_ledger_id:=private.ensure_ledger_account(v_user,'investment_cash',new.transfer_from_account_id,'investment_cash');
        select coalesce(sum(l.debit-l.credit),0) into v_investment_balance
          from private.journal_lines l
          join private.journal_entries j on j.user_id=l.user_id and j.id=l.journal_entry_id
         where l.user_id=v_user and l.ledger_account_id=v_investment_ledger_id and j.status='posted';
        if v_investment_balance<new.amount then
          raise exception 'Resgate excede o saldo disponível na conta de investimentos' using errcode='23514';
        end if;
      end if;
      v_debit_kind:=case when new.transaction_date<v_to_opening then 'opening_equity' else 'bank' end;
      v_credit_kind:=case when new.transaction_date<v_from_opening then 'opening_equity' else 'bank' end;
      v_debit_source:=case when v_debit_kind='bank' then new.transfer_to_account_id else null end;
      v_credit_source:=case when v_credit_kind='bank' then new.transfer_from_account_id else null end;
      if v_debit_kind<>'opening_equity' or v_credit_kind<>'opening_equity' then
        v_journal := private.post_pair(v_user,new.transaction_date,new.description,'transaction',new.id,
          v_debit_kind,v_debit_source,v_credit_kind,v_credit_source,new.amount,new.category_id);
      end if;
    elsif new.kind='income' then
      if new.account_id is null then raise exception 'Receita realizada exige conta de destino' using errcode='23514'; end if;
      if exists(select 1 from public.accounts where user_id=v_user and id=new.account_id and new.transaction_date>=opening_balance_date) then
      v_journal := private.post_pair(v_user,new.transaction_date,new.description,'transaction',new.id,
        'bank',new.account_id,'income',null,new.amount,new.category_id);
      end if;
    elsif new.kind='expense' and new.card_id is not null then
      select credit_limit into v_credit_limit from public.cards
       where user_id=v_user and id=new.card_id for update;
      if not found then raise exception 'Cartão não pertence ao usuário' using errcode='23503'; end if;
      v_card_ledger_id:=private.ensure_ledger_account(v_user,'card_liability',new.card_id,'card_liability');
      select coalesce(sum(l.credit-l.debit),0) into v_card_balance
        from private.journal_lines l
        join private.journal_entries j on j.user_id=l.user_id and j.id=l.journal_entry_id
       where l.user_id=v_user and l.ledger_account_id=v_card_ledger_id and j.status='posted';
      if v_card_balance+new.amount>v_credit_limit then
        raise exception 'Compra excede o limite disponível do cartão' using errcode='23514';
      end if;
      v_journal := private.post_pair(v_user,new.transaction_date,new.description,'transaction',new.id,
        'expense',null,'card_liability',new.card_id,new.amount,new.category_id);
    elsif new.kind='expense' then
      if new.account_id is null then raise exception 'Despesa realizada exige conta ou cartão' using errcode='23514'; end if;
      if exists(select 1 from public.accounts where user_id=v_user and id=new.account_id and account_type='investment' and new.transaction_date>=opening_balance_date) then
        raise exception 'Conta de investimentos é blindada e não pode pagar despesas' using errcode='23514';
      end if;
      if exists(select 1 from public.accounts where user_id=v_user and id=new.account_id and new.transaction_date>=opening_balance_date) then
      v_journal := private.post_pair(v_user,new.transaction_date,new.description,'transaction',new.id,
        'expense',null,'bank',new.account_id,new.amount,new.category_id);
      end if;
    end if;
    if v_journal is not null then
      insert into private.ledger_source_state(user_id,source_type,source_id,active_journal_id)
      values(v_user,'transaction',v_id,v_journal)
      on conflict(user_id,source_type,source_id) do update
        set active_journal_id=excluded.active_journal_id,updated_at=now();
    end if;
  end if;
  return new;
end;
$$;
create trigger transactions_sync_ledger
after insert or update or delete on public.transactions
for each row execute function private.sync_transaction_ledger();


create or replace function private.sync_income_event_settlement()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog, public
as $income_settlement$
declare v_currency text; v_symbol text; v_transaction_id uuid;
begin
  if tg_op='DELETE' then
    if old.status='received'
       and current_setting('app.cleanup_financial_ledger_user',true) is distinct from old.user_id::text then
      raise exception 'Provento recebido é imutável; preserve o lançamento contábil' using errcode='55000';
    end if;
    return old;
  end if;

  if tg_op='UPDATE' and old.status='received' then
    raise exception 'Provento recebido é imutável; registre uma correção por lançamento de ajuste' using errcode='55000';
  end if;

  if new.status='received' then
    if new.account_id is null or new.payment_date is null or new.received_amount<=0
       or length(coalesce(new.settlement_idempotency_key,'')) not between 8 and 120
       or new.transaction_id is not null then
      raise exception 'Para receber o provento, informe conta de destino, valor, data e chave de idempotência' using errcode='23514';
    end if;
    select currency,symbol into v_currency,v_symbol
      from public.investment_assets where user_id=new.user_id and id=new.asset_id;
    if not found then raise exception 'Ativo do provento não pertence ao usuário' using errcode='23503'; end if;
    if v_currency<>'BRL' then
      raise exception 'Provento em USD não pode ser misturado a contas BRL; conversão cambial explícita ainda não está habilitada' using errcode='23514';
    end if;
    if not exists(select 1 from public.accounts where user_id=new.user_id and id=new.account_id) then
      raise exception 'Conta de destino do provento não pertence ao usuário' using errcode='23503';
    end if;

    insert into public.transactions(
      user_id,kind,status,amount,transaction_date,description,account_id,
      payment_method,settled_amount,settled_at,source
    ) values (
      new.user_id,'income','paid',new.received_amount,new.payment_date,
      left('Provento '||v_symbol||' - '||new.event_type,240),new.account_id,
      null,new.received_amount,new.payment_date,'manual'
    ) returning id into v_transaction_id;

    new.transaction_id:=v_transaction_id;
    new.settlement_state:='settled';
  else
    if new.account_id is not null or new.transaction_id is not null or new.settlement_idempotency_key is not null then
      raise exception 'Destino e liquidação só podem ser definidos ao confirmar o recebimento' using errcode='23514';
    end if;
    new.settlement_state:='unsettled';
  end if;
  return new;
end;
$income_settlement$;
create trigger income_events_settlement
before insert or update or delete on public.income_events
for each row execute function private.sync_income_event_settlement();

create or replace function private.protect_income_event_transaction()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog, public
as $income_tx_guard$
begin
  if exists(select 1 from public.income_events where user_id=old.user_id and transaction_id=old.id) then
    raise exception 'Lançamento de provento é protegido pelo histórico de investimentos' using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$income_tx_guard$;
create trigger transactions_protect_income_event
before update or delete on public.transactions
for each row execute function private.protect_income_event_transaction();

create or replace function private.sync_card_invoice_payment_ledger()
returns trigger language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare v_user uuid; v_id uuid; v_active uuid; v_journal uuid;
begin
  v_user := case when tg_op='DELETE' then old.user_id else new.user_id end;
  v_id := case when tg_op='DELETE' then old.id else new.id end;
  if tg_op='UPDATE' and new.user_id<>old.user_id then raise exception 'Não é permitido transferir a titularidade do pagamento' using errcode='42501'; end if;
  if auth.uid() is not null and auth.uid()<>v_user then
    raise exception 'Pagamento não pertence à sessão autenticada' using errcode='42501';
  end if;
  select active_journal_id into v_active from private.ledger_source_state
   where user_id=v_user and source_type='card_invoice_payment' and source_id=v_id for update;
  if v_active is not null then
    perform private.reverse_journal(v_active,current_date,'alteração ou exclusão do pagamento da fatura');
    update private.ledger_source_state set active_journal_id=null,updated_at=now()
     where user_id=v_user and source_type='card_invoice_payment' and source_id=v_id;
  end if;
  if tg_op='DELETE' then return old; end if;
  if exists(select 1 from public.accounts where user_id=v_user and id=new.account_id and account_type='investment') then
    raise exception 'Conta de investimentos não pode pagar fatura de cartão' using errcode='23514';
  end if;
  v_journal := private.post_pair(v_user,new.payment_date,
    coalesce(new.description,'Pagamento de fatura'),'card_invoice_payment',new.id,
    'card_liability',new.card_id,'bank',new.account_id,new.amount,null);
  insert into private.ledger_source_state(user_id,source_type,source_id,active_journal_id)
  values(v_user,'card_invoice_payment',v_id,v_journal)
  on conflict(user_id,source_type,source_id) do update
    set active_journal_id=excluded.active_journal_id,updated_at=now();
  return new;
end;
$$;
create trigger card_invoice_payments_sync_ledger
after insert or update or delete on public.card_invoice_payments
for each row execute function private.sync_card_invoice_payment_ledger();

create or replace function private.post_account_opening_balance()
returns trigger language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare v_kind text; v_journal uuid; v_amount numeric;
begin
  if new.opening_balance=0 then return new; end if;
  v_kind := case
    when lower(new.account_type) in ('cash','physical_cash','dinheiro','dinheiro_fisico') then 'cash'
    when lower(new.account_type)='investment' then 'investment_cash'
    else 'bank' end;
  v_amount := abs(new.opening_balance);
  if new.opening_balance > 0 then
    v_journal := private.post_pair(new.user_id,new.opening_balance_date,
      'Saldo inicial · '||new.name,'account_opening',new.id,
      v_kind,new.id,'opening_equity',null,v_amount,null);
  else
    v_journal := private.post_pair(new.user_id,new.opening_balance_date,
      'Saldo inicial negativo · '||new.name,'account_opening',new.id,
      'opening_equity',null,v_kind,new.id,v_amount,null);
  end if;
  insert into private.ledger_source_state(user_id,source_type,source_id,active_journal_id)
  values(new.user_id,'account_opening',new.id,v_journal);
  return new;
end;
$$;
create trigger accounts_post_opening_balance
after insert on public.accounts for each row execute function private.post_account_opening_balance();

-- Compras parceladas: uma única obrigação no ledger, distribuída por faturas.
create or replace function private.invoice_closing_date(p_date date,p_closing_day smallint)
returns date language plpgsql immutable
set search_path=pg_catalog
as $$
declare v_month date; v_last integer; v_close date;
begin
  if p_date is null or p_closing_day not between 1 and 31 then
    raise exception 'Data ou dia de fechamento inválido' using errcode='22023';
  end if;
  v_month:=date_trunc('month',p_date)::date;
  v_last:=extract(day from (v_month+interval '1 month - 1 day'))::integer;
  v_close:=v_month+(least(p_closing_day,v_last)-1);
  if p_date>v_close then
    v_month:=(v_month+interval '1 month')::date;
    v_last:=extract(day from (v_month+interval '1 month - 1 day'))::integer;
    v_close:=v_month+(least(p_closing_day,v_last)-1);
  end if;
  return v_close;
end;
$$;

create or replace function private.allocate_card_installments()
returns trigger language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare v_count integer; v_total_cents bigint; v_base bigint; v_remainder bigint;
  v_closing date; v_first_closing date; v_due date; v_month date; v_last integer; v_due_month date; v_amount numeric;
  v_card public.cards%rowtype; i integer; v_user uuid; v_card_ids uuid[]; v_lock_card uuid;
begin
  v_user:=case when tg_op='DELETE' then old.user_id else new.user_id end;
  v_card_ids:=array[]::uuid[];
  if tg_op<>'INSERT' and old.card_id is not null then v_card_ids:=array_append(v_card_ids,old.card_id); end if;
  if tg_op<>'DELETE' and new.card_id is not null then v_card_ids:=array_append(v_card_ids,new.card_id); end if;
  for v_lock_card in
    select distinct card_id from unnest(v_card_ids) as ids(card_id) order by card_id
  loop
    perform 1 from public.cards where user_id=v_user and id=v_lock_card for update;
  end loop;
  if tg_op='DELETE' then
    if exists(
      select 1 from public.card_invoice_installments i
      join public.card_invoice_payments p
        on p.user_id=i.user_id and p.card_id=i.card_id
       and p.invoice_closing_date=i.invoice_closing_date
      where i.user_id=old.user_id and i.transaction_id=old.id
    ) then
      raise exception 'Não é possível excluir uma compra após pagamento parcial ou total da fatura' using errcode='23514';
    end if;
    delete from public.card_invoice_installments where user_id=old.user_id and transaction_id=old.id;
    return old;
  end if;
  if tg_op='UPDATE' then
    if exists(
      select 1 from public.card_invoice_installments i
      join public.card_invoice_payments p
        on p.user_id=i.user_id and p.card_id=i.card_id
       and p.invoice_closing_date=i.invoice_closing_date
      where i.user_id=old.user_id and i.transaction_id=old.id
    ) and (
      old.amount is distinct from new.amount
      or old.transaction_date is distinct from new.transaction_date
      or old.card_id is distinct from new.card_id
      or old.installment_count is distinct from new.installment_count
      or old.status is distinct from new.status
    ) then
      raise exception 'Não é possível alterar valor, data ou parcelamento após pagamento parcial ou total da fatura' using errcode='23514';
    end if;
    delete from public.card_invoice_installments where user_id=old.user_id and transaction_id=old.id;
  end if;
  if new.card_id is null or new.kind<>'expense' or new.status<>'paid' then return new; end if;
  select * into v_card from public.cards where user_id=new.user_id and id=new.card_id for update;
  if not found then raise exception 'Cartão não encontrado' using errcode='23503'; end if;
  v_count:=coalesce(new.installment_count,1);
  if v_count<1 or v_count>48 then raise exception 'Número de parcelas inválido' using errcode='22023'; end if;
  v_total_cents:=round(new.amount*100)::bigint;
  v_base:=v_total_cents/v_count;
  v_remainder:=v_total_cents%v_count;
  v_closing:=private.invoice_closing_date(new.transaction_date,v_card.closing_day);
  v_first_closing:=v_closing;
  for i in 1..v_count loop
    v_month:=(date_trunc('month',v_first_closing)::date+make_interval(months=>i-1))::date;
    v_last:=extract(day from (v_month+interval '1 month - 1 day'))::integer;
    v_closing:=v_month+(least(v_card.closing_day,v_last)-1);
    v_due_month:=case when v_card.due_day>v_card.closing_day then v_month else (v_month+interval '1 month')::date end;
    v_last:=extract(day from (v_due_month+interval '1 month - 1 day'))::integer;
    v_due:=v_due_month+(least(v_card.due_day,v_last)-1);
    v_amount:=(v_base+case when i=1 then v_remainder else 0 end)::numeric/100;
    insert into public.card_invoice_installments(
      user_id,transaction_id,card_id,invoice_closing_date,invoice_due_date,
      installment_number,installment_count,amount
    ) values(new.user_id,new.id,new.card_id,v_closing,v_due,i,v_count,v_amount);
  end loop;
  return new;
end;
$$;
create trigger transactions_allocate_card_installments
after insert or update or delete on public.transactions
for each row execute function private.allocate_card_installments();

-- Atualiza o limite da validação de pagamento: a fatura soma as parcelas efetivamente alocadas.
create or replace function public.enforce_card_invoice_payment_balance()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog, public
as $$
declare v_invoice_total numeric(15,2); v_already_paid numeric(15,2);
  v_lock_key text; v_lock_keys text[]; v_closing_day smallint;
begin
  if auth.uid() is not null and auth.uid()<>new.user_id then
    raise exception 'Pagamento não pertence à sessão autenticada' using errcode='42501';
  end if;
  if new.payment_date>current_date then
    raise exception 'Pagamento de fatura não pode ter data futura' using errcode='23514';
  end if;
  v_lock_keys:=array[new.user_id::text||':'||new.card_id::text||':'||new.invoice_closing_date::text];
  if tg_op='UPDATE' then
    v_lock_keys:=array_append(v_lock_keys,old.user_id::text||':'||old.card_id::text||':'||old.invoice_closing_date::text);
  end if;
  for v_lock_key in select distinct key_value from unnest(v_lock_keys) keys(key_value) order by key_value loop
    perform pg_advisory_xact_lock(hashtextextended(v_lock_key,0));
  end loop;
  select closing_day into v_closing_day from public.cards
   where user_id=new.user_id and id=new.card_id;
  if v_closing_day is null then raise exception 'Cartão não encontrado' using errcode='23503'; end if;
  select coalesce(sum(amount),0) into v_invoice_total
    from public.card_invoice_installments
   where user_id=new.user_id and card_id=new.card_id
     and invoice_closing_date=new.invoice_closing_date;
  if not exists(select 1 from public.card_invoice_installments
     where user_id=new.user_id and card_id=new.card_id
       and invoice_closing_date=new.invoice_closing_date) then
    select coalesce(sum(t.amount),0) into v_invoice_total
      from public.transactions t
     where t.user_id=new.user_id and t.card_id=new.card_id
       and t.kind='expense' and t.status='paid'
       and private.invoice_closing_date(t.transaction_date,v_closing_day)=new.invoice_closing_date;
  end if;
  select coalesce(sum(p.amount),0) into v_already_paid
    from public.card_invoice_payments p
   where p.user_id=new.user_id and p.card_id=new.card_id
     and p.invoice_closing_date=new.invoice_closing_date
     and p.payment_date<=current_date
     and (tg_op<>'UPDATE' or p.id<>new.id);
  if v_invoice_total<=0 then
    raise exception 'Não existe valor pago nesta fatura' using errcode='23514';
  end if;
  if v_already_paid+new.amount>v_invoice_total then
    raise exception 'Pagamento excede o saldo disponível da fatura'
      using errcode='23514',
      detail=format('Total da fatura: %s; já pago: %s; novo pagamento: %s',v_invoice_total,v_already_paid,new.amount);
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_card_invoice_payment_balance() from public,anon,authenticated;
grant execute on function public.enforce_card_invoice_payment_balance() to service_role;

-- RPCs de empréstimos: o título e a partida contábil são gravados na mesma transação.
create or replace function public.create_receivable_loan(
  p_person_name text,p_amount numeric,p_loan_date date,p_expected_date date,
  p_source_account_id uuid,p_notes text,p_idempotency_key text
) returns public.receivable_loans
language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare v_user uuid:=auth.uid(); v_row public.receivable_loans%rowtype;
begin
  if v_user is null then raise exception 'Autenticação obrigatória' using errcode='42501'; end if;
  if length(btrim(coalesce(p_person_name,''))) not between 1 and 120
     or p_amount<=0 or p_amount<>round(p_amount,2)
     or p_loan_date is null or (p_expected_date is not null and p_expected_date<p_loan_date)
     or length(coalesce(p_idempotency_key,'')) not between 8 and 120 then
    raise exception 'Dados do empréstimo inválidos' using errcode='22023';
  end if;
  perform 1 from public.accounts where user_id=v_user and id=p_source_account_id and account_type<>'investment' for update;
  if not found then raise exception 'Conta de origem inválida ou protegida como investimento' using errcode='23503'; end if;
  select * into v_row from public.receivable_loans
   where user_id=v_user and idempotency_key=p_idempotency_key;
  if found then
    if v_row.principal_amount<>p_amount or v_row.person_name<>btrim(p_person_name)
       or v_row.source_account_id<>p_source_account_id or v_row.loan_date<>p_loan_date
       or v_row.expected_date is distinct from p_expected_date then
      raise exception 'Chave de idempotência reutilizada com dados diferentes' using errcode='23505';
    end if;
    return v_row;
  end if;
  insert into public.receivable_loans(
    user_id,person_name,principal_amount,loan_date,expected_date,source_account_id,notes,idempotency_key
  ) values(v_user,btrim(p_person_name),p_amount,p_loan_date,p_expected_date,p_source_account_id,p_notes,p_idempotency_key)
  returning * into v_row;
  perform private.post_pair(v_user,p_loan_date,'Empréstimo para '||v_row.person_name,
    'receivable_loan',v_row.id,'receivable_asset',v_row.id,'bank',p_source_account_id,p_amount,null);
  return v_row;
end;
$$;
revoke all on function public.create_receivable_loan(text,numeric,date,date,uuid,text,text) from public,anon;
grant execute on function public.create_receivable_loan(text,numeric,date,date,uuid,text,text) to authenticated;

create or replace function public.register_receivable_repayment(
  p_loan_id uuid,p_destination_account_id uuid,p_amount numeric,
  p_received_date date,p_idempotency_key text
) returns public.receivable_repayments
language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare v_user uuid:=auth.uid(); v_loan public.receivable_loans%rowtype;
  v_paid numeric(15,2); v_row public.receivable_repayments%rowtype;
begin
  if v_user is null then raise exception 'Autenticação obrigatória' using errcode='42501'; end if;
  if p_amount<=0 or p_amount<>round(p_amount,2) or p_received_date is null
     or length(coalesce(p_idempotency_key,'')) not between 8 and 120 then
    raise exception 'Dados do recebimento inválidos' using errcode='22023';
  end if;
  select * into v_row from public.receivable_repayments
   where user_id=v_user and idempotency_key=p_idempotency_key;
  if found then
    if v_row.loan_id<>p_loan_id or v_row.destination_account_id<>p_destination_account_id
       or v_row.amount<>p_amount or v_row.received_date<>p_received_date then
      raise exception 'Chave de idempotência reutilizada com dados diferentes' using errcode='23505';
    end if;
    return v_row;
  end if;
  select * into v_loan from public.receivable_loans
   where user_id=v_user and id=p_loan_id for update;
  if not found then raise exception 'Título a receber não encontrado' using errcode='23503'; end if;
  perform 1 from public.accounts where user_id=v_user and id=p_destination_account_id and account_type<>'investment';
  if not found then raise exception 'Conta de destino inválida ou protegida como investimento' using errcode='23503'; end if;
  select coalesce(sum(amount),0) into v_paid from public.receivable_repayments
   where user_id=v_user and loan_id=p_loan_id;
  if v_paid+p_amount>v_loan.principal_amount then
    raise exception 'Recebimento ultrapassa o saldo devedor' using errcode='23514';
  end if;
  insert into public.receivable_repayments(
    user_id,loan_id,destination_account_id,amount,received_date,idempotency_key
  ) values(v_user,p_loan_id,p_destination_account_id,p_amount,p_received_date,p_idempotency_key)
  returning * into v_row;
  perform private.post_pair(v_user,p_received_date,'Devolução de empréstimo · '||v_loan.person_name,
    'receivable_repayment',v_row.id,'bank',p_destination_account_id,
    'receivable_asset',p_loan_id,p_amount,null);
  return v_row;
end;
$$;
revoke all on function public.register_receivable_repayment(uuid,uuid,numeric,date,text) from public,anon;
grant execute on function public.register_receivable_repayment(uuid,uuid,numeric,date,text) to authenticated;

create or replace function public.record_overtime_entry(
  p_work_date date,p_hours numeric,p_hourly_rate numeric,p_premium_percent numeric,
  p_description text,p_idempotency_key text
) returns public.overtime_entries
language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare v_user uuid:=auth.uid(); v_row public.overtime_entries%rowtype;
begin
  if v_user is null then raise exception 'Autenticação obrigatória' using errcode='42501'; end if;
  if p_work_date is null or p_hours<=0 or p_hours>24 or p_hours<>round(p_hours,2)
     or p_hourly_rate<=0 or p_hourly_rate<>round(p_hourly_rate,2)
     or p_premium_percent<0 or p_premium_percent>500
     or length(coalesce(p_idempotency_key,'')) not between 8 and 120 then
    raise exception 'Dados de hora extra inválidos' using errcode='22023';
  end if;
  select * into v_row from public.overtime_entries
   where user_id=v_user and idempotency_key=p_idempotency_key;
  if found then
    if v_row.work_date<>p_work_date or v_row.hours<>p_hours or v_row.hourly_rate<>p_hourly_rate
       or v_row.premium_percent<>p_premium_percent then
      raise exception 'Chave de idempotência reutilizada com dados diferentes' using errcode='23505';
    end if;
    return v_row;
  end if;
  insert into public.overtime_entries(
    user_id,work_date,hours,hourly_rate,premium_percent,description,idempotency_key
  ) values(v_user,p_work_date,p_hours,p_hourly_rate,p_premium_percent,p_description,p_idempotency_key)
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.record_overtime_entry(date,numeric,numeric,numeric,text,text) from public,anon;
grant execute on function public.record_overtime_entry(date,numeric,numeric,numeric,text,text) to authenticated;

create or replace function public.convert_overtime_to_receipt(
  p_entry_ids uuid[],p_destination_account_id uuid,p_received_date date,p_idempotency_key text
) returns public.overtime_conversion_batches
language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare v_user uuid:=auth.uid(); v_batch public.overtime_conversion_batches%rowtype;
  v_total numeric(15,2); v_count integer; v_journal uuid; v_entry_ids uuid[];
begin
  if v_user is null then raise exception 'Autenticação obrigatória' using errcode='42501'; end if;
  if coalesce(cardinality(p_entry_ids),0)=0 or cardinality(p_entry_ids)>100
     or p_received_date is null or length(coalesce(p_idempotency_key,'')) not between 8 and 120 then
    raise exception 'Selecione horas extras válidas para converter' using errcode='22023';
  end if;
  v_entry_ids:=array(select distinct entry_id from unnest(p_entry_ids) as ids(entry_id) order by entry_id);
  if cardinality(v_entry_ids)<>cardinality(p_entry_ids) then
    raise exception 'Lista de horas extras contém IDs duplicados' using errcode='22023';
  end if;
  select * into v_batch from public.overtime_conversion_batches
   where user_id=v_user and idempotency_key=p_idempotency_key;
  if found then
    if v_batch.destination_account_id<>p_destination_account_id
       or v_batch.received_date<>p_received_date or v_batch.entry_ids<>v_entry_ids then
      raise exception 'Chave de idempotência reutilizada com dados diferentes' using errcode='23505';
    end if;
    return v_batch;
  end if;
  perform 1 from public.accounts where user_id=v_user and id=p_destination_account_id and account_type<>'investment';
  if not found then raise exception 'Conta de destino inválida ou protegida como investimento' using errcode='23503'; end if;
  perform 1 from public.overtime_entries
   where user_id=v_user and id=any(p_entry_ids) and status='pending'
   order by id for update;
  select count(*),coalesce(sum(expected_amount),0)
    into v_count,v_total
    from public.overtime_entries
   where user_id=v_user and id=any(p_entry_ids) and status='pending';
  if v_count<>cardinality(p_entry_ids) or v_total<=0 then
    raise exception 'Há horas extras inválidas, já convertidas ou de outro usuário' using errcode='23514';
  end if;
  insert into public.overtime_conversion_batches(
    user_id,destination_account_id,entry_ids,total_amount,received_date,idempotency_key
  ) values(v_user,p_destination_account_id,v_entry_ids,v_total,p_received_date,p_idempotency_key)
  returning * into v_batch;
  v_journal:=private.post_pair(v_user,p_received_date,'Recebimento de horas extras',
    'overtime_conversion',v_batch.id,'bank',p_destination_account_id,'income',null,v_total,null);
  update public.overtime_conversion_batches set journal_entry_id=v_journal where id=v_batch.id;
  update public.overtime_entries set status='converted',conversion_batch_id=v_batch.id
   where user_id=v_user and id=any(p_entry_ids) and status='pending';
  select * into v_batch from public.overtime_conversion_batches where id=v_batch.id;
  return v_batch;
end;
$$;
revoke all on function public.convert_overtime_to_receipt(uuid[],uuid,date,text) from public,anon;
grant execute on function public.convert_overtime_to_receipt(uuid[],uuid,date,text) to authenticated;

-- Consulta única do dashboard; moeda não é misturada e investimento não compõe liquidez.
create or replace function public.get_financial_summary()
returns jsonb
language plpgsql security definer
set search_path=pg_catalog, public
as $$
declare v_user uuid:=auth.uid(); v_liquid numeric(15,2); v_card numeric(15,2);
  v_receivable numeric(15,2); v_overtime numeric(15,2); v_investment_brl numeric(15,2);
  v_investment_usd numeric(15,2);
begin
  if v_user is null then raise exception 'Autenticação obrigatória' using errcode='42501'; end if;
  select coalesce(sum(l.debit-l.credit),0) into v_liquid
    from private.journal_lines l join private.ledger_accounts a
      on a.user_id=l.user_id and a.id=l.ledger_account_id
    join private.journal_entries j on j.user_id=l.user_id and j.id=l.journal_entry_id
   where l.user_id=v_user and j.status='posted' and a.account_kind in ('bank','cash');
  select coalesce(sum(l.credit-l.debit),0) into v_card
    from private.journal_lines l join private.ledger_accounts a
      on a.user_id=l.user_id and a.id=l.ledger_account_id
    join private.journal_entries j on j.user_id=l.user_id and j.id=l.journal_entry_id
   where l.user_id=v_user and j.status='posted' and a.account_kind='card_liability';
  select coalesce(sum(rl.principal_amount-coalesce(r.paid,0)),0) into v_receivable
    from public.receivable_loans rl
    left join lateral (select sum(amount) paid from public.receivable_repayments where user_id=v_user and loan_id=rl.id) r on true
   where rl.user_id=v_user;
  select coalesce(sum(expected_amount),0) into v_overtime
    from public.overtime_entries where user_id=v_user and status='pending';
  select coalesce(sum(l.debit-l.credit),0) into v_investment_brl
    from private.journal_lines l join private.ledger_accounts a
      on a.user_id=l.user_id and a.id=l.ledger_account_id
    join private.journal_entries j on j.user_id=l.user_id and j.id=l.journal_entry_id
   where l.user_id=v_user and j.status='posted' and a.account_kind='investment_cash';
  select v_investment_brl + coalesce(sum(quantity*coalesce(current_price,average_cost)),0) into v_investment_brl
    from public.investment_assets where user_id=v_user and currency='BRL';
  select coalesce(sum(quantity*coalesce(current_price,average_cost)),0) into v_investment_usd
    from public.investment_assets where user_id=v_user and currency='USD';
  return jsonb_build_object(
    'liquid_balance_brl',v_liquid,
    'card_liability_brl',v_card,
    'receivables_brl',v_receivable,
    'overtime_forecast_brl',v_overtime,
    'investment_reference_brl',v_investment_brl,
    'investment_reference_usd',v_investment_usd,
    'as_of',current_date
  );
end;
$$;
revoke all on function public.get_financial_summary() from public,anon;
grant execute on function public.get_financial_summary() to authenticated;


-- Backfill idempotente dos saldos existentes. O saldo inicial já representa a posição
-- na data de abertura; movimentos anteriores não podem ser debitados novamente do banco.
do $backfill$
declare
  a record; t record; p record; v_kind text; v_debit_kind text; v_credit_kind text;
  v_debit_source uuid; v_credit_source uuid; v_journal uuid;
begin
  -- Gera a distribuição das compras com cartão que já existiam antes desta migration.
  update public.transactions set updated_at=updated_at
   where card_id is not null and kind='expense' and status='paid';

  for a in select * from public.accounts where opening_balance<>0 loop
    if not exists(select 1 from private.ledger_source_state
      where user_id=a.user_id and source_type='account_opening' and source_id=a.id) then
      v_kind:=case
        when lower(a.account_type) in ('cash','physical_cash','dinheiro','dinheiro_fisico') then 'cash'
        when lower(a.account_type)='investment' then 'investment_cash'
        else 'bank' end;
      if a.opening_balance>0 then
        v_journal:=private.post_pair(a.user_id,a.opening_balance_date,'Saldo inicial · '||a.name,
          'account_opening',a.id,v_kind,a.id,'opening_equity',null,a.opening_balance,null);
      else
        v_journal:=private.post_pair(a.user_id,a.opening_balance_date,'Saldo inicial negativo · '||a.name,
          'account_opening',a.id,'opening_equity',null,v_kind,a.id,abs(a.opening_balance),null);
      end if;
      insert into private.ledger_source_state(user_id,source_type,source_id,active_journal_id)
      values(a.user_id,'account_opening',a.id,v_journal)
      on conflict(user_id,source_type,source_id) do nothing;
    end if;
  end loop;

  for t in select * from public.transactions where status='paid' order by transaction_date,created_at loop
    if exists(select 1 from private.ledger_source_state
      where user_id=t.user_id and source_type='transaction' and source_id=t.id) then
      continue;
    end if;
    v_journal:=null;
    if t.kind='expense' and t.card_id is not null then
      v_journal:=private.post_pair(t.user_id,t.transaction_date,t.description,'transaction',t.id,
        'expense',null,'card_liability',t.card_id,t.amount,t.category_id);
    elsif t.kind in ('income','expense') and t.account_id is not null then
      select * into a from public.accounts where user_id=t.user_id and id=t.account_id;
      if found and t.transaction_date>=a.opening_balance_date then
        if t.kind='income' then
          v_journal:=private.post_pair(t.user_id,t.transaction_date,t.description,'transaction',t.id,
            'bank',t.account_id,'income',null,t.amount,t.category_id);
        elsif a.account_type<>'investment' then
          v_journal:=private.post_pair(t.user_id,t.transaction_date,t.description,'transaction',t.id,
            'expense',null,'bank',t.account_id,t.amount,t.category_id);
        end if;
      end if;
    elsif t.kind='transfer' then
      select * into a from public.accounts where user_id=t.user_id and id=t.transfer_from_account_id;
      v_credit_kind:=case when found and t.transaction_date<a.opening_balance_date then 'opening_equity' else 'bank' end;
      v_credit_source:=case when v_credit_kind='bank' then t.transfer_from_account_id else null end;
      select * into p from public.accounts where user_id=t.user_id and id=t.transfer_to_account_id;
      v_debit_kind:=case when found and t.transaction_date<p.opening_balance_date then 'opening_equity' else 'bank' end;
      v_debit_source:=case when v_debit_kind='bank' then t.transfer_to_account_id else null end;
      if v_credit_kind='opening_equity' and v_debit_kind='opening_equity' then
        -- Ambos os lados já estão refletidos nos saldos iniciais.
        v_journal:=null;
      else
        v_journal:=private.post_pair(t.user_id,t.transaction_date,t.description,'transaction',t.id,
          v_debit_kind,v_debit_source,v_credit_kind,v_credit_source,t.amount,null);
      end if;
    end if;
    if v_journal is not null then
      insert into private.ledger_source_state(user_id,source_type,source_id,active_journal_id)
      values(t.user_id,'transaction',t.id,v_journal)
      on conflict(user_id,source_type,source_id) do nothing;
    end if;
  end loop;

  for p in select pay.*,acct.opening_balance_date,acct.account_type
    from public.card_invoice_payments pay
    join public.accounts acct on acct.user_id=pay.user_id and acct.id=pay.account_id
    order by pay.payment_date,pay.created_at loop
    if exists(select 1 from private.ledger_source_state
      where user_id=p.user_id and source_type='card_invoice_payment' and source_id=p.id) then
      continue;
    end if;
    if p.payment_date>=p.opening_balance_date then
      v_journal:=private.post_pair(p.user_id,p.payment_date,
        coalesce(p.description,'Pagamento de fatura'),'card_invoice_payment',p.id,
        'card_liability',p.card_id,'bank',p.account_id,p.amount,null);
    else
      v_journal:=private.post_pair(p.user_id,p.payment_date,
        coalesce(p.description,'Pagamento de fatura'),'card_invoice_payment',p.id,
        'card_liability',p.card_id,'opening_equity',null,p.amount,null);
    end if;
    insert into private.ledger_source_state(user_id,source_type,source_id,active_journal_id)
    values(p.user_id,'card_invoice_payment',p.id,v_journal)
    on conflict(user_id,source_type,source_id) do nothing;
  end loop;
end $backfill$;

commit;
