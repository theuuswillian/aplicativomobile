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
