begin;

-- Keep the original unique index created by migration 002.
-- Migration 009 introduced an identical index under a second name.
drop index if exists public.transactions_recurrence_occurrence_unique;

-- The event trigger remains owned by postgres and continues to run for DDL.
-- Prevent direct invocation of this SECURITY DEFINER function by API roles.
do $
begin
  -- Supabase projects may have this helper from the dashboard's
  -- automatic-RLS event trigger; vanilla PostgreSQL test databases do not.
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$;

commit;
