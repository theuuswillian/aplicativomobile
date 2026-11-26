begin;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  institution_name text,
  institution_code text,
  institution_logo_key text,
  account_type text not null,
  opening_balance numeric(14,2) not null default 0,
  opening_balance_date date not null,
  is_primary boolean not null default false,
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (opening_balance > -1000000000000::numeric and opening_balance < 1000000000000::numeric),
  check ((is_archived and archived_at is not null) or (not is_archived and archived_at is null))
);

create unique index accounts_one_primary_per_user
on public.accounts(user_id) where is_primary and not is_archived;

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  name text not null check (length(btrim(name)) between 1 and 100),
  institution_name text not null,
  last_four char(4) not null check (last_four ~ '^[0-9]{4}$'),
  brand text,
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  interest_rate numeric(7,4),
  late_fee_rate numeric(7,4),
  monthly_interest_rate numeric(7,4),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, account_id) references public.accounts(user_id, id) on delete restrict,
  check (interest_rate is null or interest_rate >= 0),
  check (late_fee_rate is null or late_fee_rate >= 0),
  check (monthly_interest_rate is null or monthly_interest_rate >= 0)
);

create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  kind text not null check (kind in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0),
  category_id uuid,
  frequency text not null check (frequency in ('daily','weekly','biweekly','monthly','yearly','interval')),
  interval_count integer not null default 1 check (interval_count between 1 and 366),
  weekday smallint check (weekday between 0 and 6),
  month_day smallint check (month_day between 1 and 31),
  month_of_year smallint check (month_of_year between 1 and 12),
  starts_on date not null,
  ends_on date,
  next_occurrence_on date not null,
  account_id uuid,
  card_id uuid,
  payment_method text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, category_id) references public.categories(user_id, id) on delete restrict,
  foreign key (user_id, account_id) references public.accounts(user_id, id) on delete restrict,
  foreign key (user_id, card_id) references public.cards(user_id, id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  format text not null check (format in ('CSV','OFX')),
  destination_type text not null check (destination_type in ('account','card')),
  destination_id uuid not null,
  file_name text,
  imported_count integer not null default 0 check (imported_count >= 0),
  linked_count integer not null default 0 check (linked_count >= 0),
  ignored_count integer not null default 0 check (ignored_count >= 0),
  status text not null default 'preview' check (status in ('preview','committed','undone','failed')),
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  check (linked_count <= imported_count and ignored_count <= imported_count)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income','expense','transfer')),
  status text not null default 'paid' check (status in ('paid','planned','cancelled')),
  amount numeric(14,2) not null check (amount > 0),
  transaction_date date not null,
  description text not null check (length(btrim(description)) between 1 and 240),
  category_id uuid,
  subcategory text,
  notes text,
  tags text[] not null default '{}',
  account_id uuid,
  card_id uuid,
  transfer_from_account_id uuid,
  transfer_to_account_id uuid,
  payment_method text,
  settled_amount numeric(14,2) not null default 0 check (settled_amount >= 0),
  settled_at date,
  installment_group_id uuid,
  installment_number smallint,
  installment_count smallint,
  recurrence_id uuid,
  import_batch_id uuid,
  investment_operation_id uuid,
  source text not null default 'manual',
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, category_id) references public.categories(user_id, id) on delete restrict,
  foreign key (user_id, account_id) references public.accounts(user_id, id) on delete restrict,
  foreign key (user_id, card_id) references public.cards(user_id, id) on delete restrict,
  foreign key (user_id, transfer_from_account_id) references public.accounts(user_id, id) on delete restrict,
  foreign key (user_id, transfer_to_account_id) references public.accounts(user_id, id) on delete restrict,
  foreign key (user_id, recurrence_id) references public.recurrence_rules(user_id, id) on delete restrict,
  foreign key (user_id, import_batch_id) references public.import_batches(user_id, id) on delete restrict,
  check (settled_amount <= amount),
  check (
    (kind = 'transfer'
      and transfer_from_account_id is not null
      and transfer_to_account_id is not null
      and transfer_from_account_id <> transfer_to_account_id
      and category_id is null
      and card_id is null)
    or
    (kind <> 'transfer'
      and transfer_from_account_id is null
      and transfer_to_account_id is null)
  ),
  check (
    (installment_group_id is null and installment_number is null and installment_count is null)
    or
    (installment_group_id is not null and installment_number is not null
      and installment_count is not null and installment_number between 1 and installment_count
      and installment_count between 1 and 48)
  )
);

create index transactions_user_date_idx on public.transactions(user_id, transaction_date desc);
create index transactions_user_status_idx on public.transactions(user_id, status);
create index transactions_account_idx on public.transactions(user_id, account_id, transaction_date desc);
create index transactions_card_idx on public.transactions(user_id, card_id, transaction_date desc);
create index transactions_installment_group_idx on public.transactions(user_id, installment_group_id)
where installment_group_id is not null;
create unique index transactions_recurrence_occurrence_uidx
on public.transactions(user_id, recurrence_id, transaction_date)
where recurrence_id is not null;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  year smallint not null check (year between 2000 and 2200),
  month smallint not null check (month between 1 and 12),
  limit_amount numeric(14,2) not null check (limit_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, category_id, year, month),
  foreign key (user_id, category_id) references public.categories(user_id, id) on delete restrict
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  monthly_contribution numeric(14,2) not null default 0 check (monthly_contribution >= 0),
  target_month date,
  yield_assumption numeric(8,4),
  use_index_assumption boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (yield_assumption is null or yield_assumption >= 0)
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  transaction_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  contribution_date date not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  foreign key (user_id, goal_id) references public.goals(user_id, id) on delete restrict,
  foreign key (user_id, transaction_id) references public.transactions(user_id, id) on delete restrict
);

create table public.tangible_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  asset_type text not null check (asset_type in ('property','vehicle','other')),
  current_value numeric(14,2) not null check (current_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  liability_type text not null check (liability_type in ('loan','financing','debt','other')),
  outstanding_amount numeric(14,2) not null check (outstanding_amount >= 0),
  installment_amount numeric(14,2) not null default 0 check (installment_amount >= 0),
  interest_rate numeric(8,4) check (interest_rate is null or interest_rate >= 0),
  installments_remaining integer check (installments_remaining is null or installments_remaining >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference_month date not null,
  assets_total numeric(14,2) not null,
  liabilities_total numeric(14,2) not null,
  net_worth numeric(14,2) not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, reference_month)
);

create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_name text not null check (length(btrim(person_name)) between 1 and 120),
  phone text,
  expected_date date,
  notes text,
  repayment_mode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.import_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  transaction_id uuid,
  destination_type text not null check (destination_type in ('account','card')),
  destination_id uuid not null,
  dedupe_key text not null check (length(dedupe_key) between 1 and 240),
  source_reference text,
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  result text not null check (result in ('created','linked','ignored','duplicate')),
  created_at timestamptz not null default now(),
  foreign key (user_id, batch_id) references public.import_batches(user_id, id) on delete cascade,
  foreign key (user_id, transaction_id) references public.transactions(user_id, id) on delete restrict,
  unique (user_id, destination_type, destination_id, dedupe_key)
);

create table public.receipt_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  byte_size bigint not null check (byte_size between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (user_id, transaction_id) references public.transactions(user_id, id) on delete cascade,
  check (split_part(storage_path, '/', 1) = user_id::text)
);

create index budgets_user_period_idx on public.budgets(user_id, year, month);
create index goals_user_idx on public.goals(user_id);
create index goal_contributions_user_date_idx on public.goal_contributions(user_id, contribution_date desc);
create index tangible_assets_user_idx on public.tangible_assets(user_id);
create index liabilities_user_idx on public.liabilities(user_id);
create index net_worth_user_month_idx on public.net_worth_snapshots(user_id, reference_month desc);
create index import_batches_user_created_idx on public.import_batches(user_id, created_at desc);
create index import_items_batch_idx on public.import_items(user_id, batch_id);
create index receipt_files_transaction_idx on public.receipt_files(user_id, transaction_id);

do $body$
declare t text;
begin
  foreach t in array array[
    'accounts','cards','recurrence_rules','import_batches','transactions','budgets',
    'goals','goal_contributions','tangible_assets','liabilities','net_worth_snapshots',
    'receivables','import_items','receipt_files'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array[
    'accounts','cards','recurrence_rules','import_batches','transactions','budgets',
    'goals','tangible_assets','liabilities','receivables'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $body$;

commit;
