begin;

create table public.investment_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (length(btrim(symbol)) between 1 and 32),
  name text not null check (length(btrim(name)) between 1 and 120),
  asset_class text not null check (asset_class in ('stock','fii','etf','bdr','fixed_income','crypto')),
  currency text not null default 'BRL' check (currency in ('BRL','USD')),
  quantity numeric(24,8) not null default 0 check (quantity >= 0),
  average_cost numeric(18,8) not null default 0 check (average_cost >= 0),
  current_price numeric(18,8) check (current_price is null or current_price >= 0),
  price_as_of timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, asset_class, symbol)
);

create table public.investment_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null,
  operation_type text not null check (operation_type in ('opening','buy','sell','income','bonus','split','amortization')),
  operation_date date not null,
  quantity numeric(24,8) not null default 0 check (quantity >= 0),
  unit_price numeric(18,8) not null default 0 check (unit_price >= 0),
  gross_amount numeric(14,2) not null default 0 check (gross_amount >= 0),
  fees numeric(14,2) not null default 0 check (fees >= 0),
  net_amount numeric(14,2) not null default 0 check (net_amount >= 0),
  transaction_id uuid,
  account_id uuid,
  created_at timestamptz not null default now(),
  foreign key (user_id, asset_id) references public.investment_assets(user_id, id) on delete restrict,
  foreign key (user_id, transaction_id) references public.transactions(user_id, id) on delete restrict,
  foreign key (user_id, account_id) references public.accounts(user_id, id) on delete restrict,
  unique (user_id, id)
);

create index investment_operations_ledger_idx
on public.investment_operations(user_id, asset_id, operation_date, created_at);

create table public.income_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null,
  event_type text not null check (event_type in ('dividend','jcp','distribution','coupon','interest','amortization','other')),
  reference_date date not null,
  payment_date date,
  announced_amount numeric(14,2) not null default 0 check (announced_amount >= 0),
  received_amount numeric(14,2) not null default 0 check (received_amount >= 0),
  status text not null check (status in ('announced','planned','received','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, asset_id) references public.investment_assets(user_id, id) on delete restrict,
  unique (user_id, id)
);

create table public.quote_cache (
  symbol text primary key check (length(btrim(symbol)) between 1 and 32),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  saved_at timestamptz not null default now()
);

create table public.radar_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_class text not null check (asset_class in ('stock','fii','etf','bdr','crypto')),
  symbol text not null check (length(btrim(symbol)) between 1 and 32),
  provider_asset_id text,
  condition_type text not null check (condition_type in ('above','below','daily_drop')),
  threshold numeric(18,8) not null check (threshold > 0),
  generation integer not null default 1 check (generation > 0),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, id, generation)
);

create index radar_alerts_enabled_symbol_idx
on public.radar_alerts(asset_class, symbol) where is_enabled;

create table public.radar_fires (
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_key text not null check (length(alert_key) between 1 and 160),
  fired_at timestamptz not null default now(),
  observed_price numeric(18,8) not null check (observed_price >= 0),
  primary key (user_id, alert_key)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 1 and 2048),
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.push_deliveries (
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery_key text not null check (length(delivery_key) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (user_id, delivery_key)
);

create index investment_assets_user_class_idx on public.investment_assets(user_id, asset_class);
create index income_events_user_payment_idx on public.income_events(user_id, payment_date desc);
create index radar_fires_user_fired_idx on public.radar_fires(user_id, fired_at desc);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

do $$
declare t text;
begin
  foreach t in array array[
    'investment_assets','investment_operations','income_events','radar_alerts',
    'radar_fires','push_subscriptions','push_deliveries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  alter table public.quote_cache enable row level security;
  revoke all on public.quote_cache from public, anon, authenticated;
  grant all on public.quote_cache to service_role;
end $$;

create trigger investment_assets_set_updated_at before update on public.investment_assets
for each row execute function public.set_updated_at();
create trigger income_events_set_updated_at before update on public.income_events
for each row execute function public.set_updated_at();
create trigger radar_alerts_set_updated_at before update on public.radar_alerts
for each row execute function public.set_updated_at();
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions
for each row execute function public.set_updated_at();

commit;
