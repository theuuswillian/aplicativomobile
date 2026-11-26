begin;

create table public.income_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  icon text not null default '🎯' check (length(icon) between 1 and 8),
  target_monthly_amount numeric(14,2) not null check (target_monthly_amount > 0),
  sort_order smallint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create index income_goals_user_order_idx
  on public.income_goals(user_id, sort_order, created_at);

alter table public.income_goals enable row level security;
create policy income_goals_select_own on public.income_goals
  for select to authenticated using (user_id = (select auth.uid()));
create policy income_goals_insert_own on public.income_goals
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy income_goals_update_own on public.income_goals
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy income_goals_delete_own on public.income_goals
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.income_goals from public, anon, authenticated;
grant select, insert, update, delete on public.income_goals to authenticated;
grant all on public.income_goals to service_role;

create trigger income_goals_set_updated_at
  before update on public.income_goals
  for each row execute function public.set_updated_at();

commit;
