-- Internal function reads the private journal for the authenticated user only.
create or replace function private.get_account_balances(p_as_of date)
returns table(account_id uuid, balance numeric(15,2))
language plpgsql
stable
security definer
set search_path=pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Autenticação obrigatória' using errcode='42501';
  end if;
  if p_as_of is null then
    raise exception 'Data de referência obrigatória' using errcode='22023';
  end if;

  return query
  select
    a.id,
    coalesce(
      sum(jl.debit - jl.credit) filter (
        where je.status = 'posted'
          and je.transaction_date <= p_as_of
      ),
      0
    )::numeric(15,2) as balance
  from public.accounts a
  left join private.ledger_accounts la
    on la.user_id = a.user_id
   and la.source_account_id = a.id
   and la.account_kind in ('bank', 'cash', 'investment_cash')
  left join private.journal_lines jl
    on jl.user_id = la.user_id
   and jl.ledger_account_id = la.id
  left join private.journal_entries je
    on je.user_id = jl.user_id
   and je.id = jl.journal_entry_id
  where a.user_id = v_user
  group by a.id
  order by a.created_at, a.id;
end;
$$;

-- The private schema stays unexposed. Authenticated users receive schema usage
-- only so the invoker wrapper can call this one narrowly-granted function.
grant usage on schema private to authenticated;
revoke all on function private.get_account_balances(date) from public, anon, authenticated;
grant execute on function private.get_account_balances(date) to authenticated;

-- Public API wrapper is SECURITY INVOKER; elevated access remains in private.
create or replace function public.get_account_balances(p_as_of date)
returns table(account_id uuid, balance numeric(15,2))
language sql
stable
security invoker
set search_path=pg_catalog, public
as $$
  select * from private.get_account_balances(p_as_of);
$$;

revoke all on function public.get_account_balances(date) from public, anon;
grant execute on function public.get_account_balances(date) to authenticated;

comment on function private.get_account_balances(date) is
  'Função interna: retorna saldo por conta do usuário autenticado a partir do ledger privado.';
comment on function public.get_account_balances(date) is
  'RPC somente de leitura para retornar o saldo contábil por conta na data local informada.';
