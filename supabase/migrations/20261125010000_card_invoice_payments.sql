-- Invoice payments are distinct ledger events: they debit the funding account
-- and release card limit without duplicating the original purchase expense.
create table if not exists public.card_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null,
  account_id uuid not null,
  invoice_closing_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null,
  description text not null default 'Pagamento de fatura'
    check (length(btrim(description)) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  constraint card_invoice_payments_user_card_fkey
    foreign key (user_id, card_id) references public.cards(user_id, id) on delete restrict,
  constraint card_invoice_payments_user_account_fkey
    foreign key (user_id, account_id) references public.accounts(user_id, id) on delete restrict
);
create index if not exists card_invoice_payments_user_card_invoice_idx
  on public.card_invoice_payments(user_id, card_id, invoice_closing_date, payment_date);
alter table public.card_invoice_payments enable row level security;
revoke all on public.card_invoice_payments from anon;
revoke all on public.card_invoice_payments from authenticated;
grant select, insert, update, delete on public.card_invoice_payments to authenticated;
create policy card_invoice_payments_select_own on public.card_invoice_payments
  for select to authenticated using (user_id = (select auth.uid()));
create policy card_invoice_payments_insert_own on public.card_invoice_payments
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy card_invoice_payments_update_own on public.card_invoice_payments
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy card_invoice_payments_delete_own on public.card_invoice_payments
  for delete to authenticated using (user_id = (select auth.uid()));


-- Calcula o fechamento real da fatura, respeitando meses com menos dias.
create or replace function public.card_invoice_closing_date(
  p_purchase_date date,
  p_closing_day smallint
)
returns date
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_month_start date := date_trunc('month', p_purchase_date)::date;
  v_last_day integer;
  v_close_date date;
begin
  if p_purchase_date is null or p_closing_day is null
     or p_closing_day < 1 or p_closing_day > 31 then
    raise exception 'Data de compra ou dia de fechamento inválido'
      using errcode = '22023';
  end if;

  v_last_day := extract(day from (v_month_start + interval '1 month - 1 day'))::integer;
  v_close_date := v_month_start + (least(p_closing_day, v_last_day) - 1);

  if p_purchase_date > v_close_date then
    v_month_start := (v_month_start + interval '1 month')::date;
    v_last_day := extract(day from (v_month_start + interval '1 month - 1 day'))::integer;
    v_close_date := v_month_start + (least(p_closing_day, v_last_day) - 1);
  end if;

  return v_close_date;
end;
$function$;

-- Serializa alterações da mesma fatura e valida o saldo no próprio PostgreSQL.
create or replace function public.enforce_card_invoice_payment_balance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_closing_day smallint;
  v_invoice_total numeric(14,2);
  v_already_paid numeric(14,2);
  v_lock_key text;
  v_lock_keys text[];
begin
  if new.payment_date > current_date then
    raise exception 'Pagamento de fatura não pode ter data futura'
      using errcode = '23514';
  end if;

  -- Em UPDATE, trava as chaves antiga e nova em ordem estável para evitar deadlocks.
  v_lock_keys := array[
    new.user_id::text || ':' || new.card_id::text || ':' || new.invoice_closing_date::text
  ];
  if tg_op = 'UPDATE' then
    v_lock_keys := array_append(
      v_lock_keys,
      old.user_id::text || ':' || old.card_id::text || ':' || old.invoice_closing_date::text
    );
  end if;

  for v_lock_key in
    select distinct key_value from unnest(v_lock_keys) as keys(key_value)
    order by key_value
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));
  end loop;

  select c.closing_day
    into v_closing_day
    from public.cards c
   where c.id = new.card_id
     and c.user_id = new.user_id;

  if v_closing_day is null then
    raise exception 'Cartão não encontrado para este usuário'
      using errcode = '23503';
  end if;

  select coalesce(sum(t.amount), 0)
    into v_invoice_total
    from public.transactions t
   where t.user_id = new.user_id
     and t.card_id = new.card_id
     and t.kind = 'expense'
     and t.status = 'paid'
     and public.card_invoice_closing_date(t.transaction_date, v_closing_day)
         = new.invoice_closing_date;

  select coalesce(sum(p.amount), 0)
    into v_already_paid
    from public.card_invoice_payments p
   where p.user_id = new.user_id
     and p.card_id = new.card_id
     and p.invoice_closing_date = new.invoice_closing_date
     and p.payment_date <= current_date
     and (tg_op <> 'UPDATE' or p.id <> new.id);

  if v_invoice_total <= 0 then
    raise exception 'Não existe valor pago nesta fatura'
      using errcode = '23514';
  end if;

  if v_already_paid + new.amount > v_invoice_total then
    raise exception 'Pagamento excede o saldo disponível da fatura'
      using errcode = '23514',
            detail = format('Total da fatura: %s; já pago: %s; novo pagamento: %s',
              v_invoice_total, v_already_paid, new.amount);
  end if;

  return new;
end;
$function$;

drop trigger if exists card_invoice_payments_enforce_balance on public.card_invoice_payments;
create trigger card_invoice_payments_enforce_balance
before insert or update on public.card_invoice_payments
for each row execute function public.enforce_card_invoice_payment_balance();

revoke all on function public.enforce_card_invoice_payment_balance() from public, anon, authenticated;
grant execute on function public.enforce_card_invoice_payment_balance() to service_role;
