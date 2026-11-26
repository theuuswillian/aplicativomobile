-- Income goals are private and writable only by their owner.
do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'income_goals'
  ) then raise exception 'income_goals table missing'; end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'income_goals' and c.relrowsecurity
  ) then raise exception 'income_goals RLS is not enabled'; end if;
  if has_table_privilege('anon', 'public.income_goals', 'select') then
    raise exception 'anon must not read income_goals';
  end if;
  if not has_table_privilege('authenticated', 'public.income_goals', 'select') then
    raise exception 'authenticated must read own income_goals through RLS';
  end if;
end $$;
