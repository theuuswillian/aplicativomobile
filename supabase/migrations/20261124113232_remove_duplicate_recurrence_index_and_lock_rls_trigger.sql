begin;

-- Keep the original unique index created by migration 002.
-- Migration 009 introduced an identical index under a second name.
drop index if exists public.transactions_recurrence_occurrence_unique;

-- The event trigger remains owned by postgres and continues to run for DDL.
-- Prevent direct invocation of this SECURITY DEFINER function by API roles.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

commit;
