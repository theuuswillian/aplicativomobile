begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  locale text not null default 'pt-BR' check (length(locale) between 2 and 20),
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  accent text,
  currency text not null default 'BRL' check (currency = 'BRL'),
  whatsapp_weekly_summary boolean not null default true,
  push_enabled boolean not null default false,
  quiet_notifications boolean not null default true,
  financial_preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(financial_preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  normalized_name text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  kind text not null check (kind in ('income','expense')),
  color text,
  icon text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, kind, normalized_name)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(btrim(new.raw_user_meta_data ->> 'name'), ''))
  on conflict (id) do nothing;

  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_granaviva on auth.users;
create trigger on_auth_user_created_granaviva
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at before update on public.settings
for each row execute function public.set_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.categories enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy settings_select_own on public.settings
for select to authenticated using (user_id = (select auth.uid()));
create policy settings_insert_own on public.settings
for insert to authenticated with check (user_id = (select auth.uid()));
create policy settings_update_own on public.settings
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy categories_select_own on public.categories
for select to authenticated using (user_id = (select auth.uid()));
create policy categories_insert_own on public.categories
for insert to authenticated with check (user_id = (select auth.uid()));
create policy categories_update_own on public.categories
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy categories_delete_own on public.categories
for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.profiles, public.settings, public.categories from public, anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.settings to authenticated;
grant select, insert, update, delete on public.categories to authenticated;

grant all on public.profiles, public.settings, public.categories to service_role;

commit;
