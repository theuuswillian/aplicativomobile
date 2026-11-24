begin;

alter table public.radar_fires
  add column source text,
  add column quote_observed_at timestamptz;

-- Quota global do provedor. Não contém dados pessoais e é acessível apenas
-- pela service role através da RPC atômica.
create table public.market_data_usage (
  provider text not null check (provider in ('brapi')),
  period_start date not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, period_start)
);

alter table public.market_data_usage enable row level security;
revoke all on public.market_data_usage from public, anon, authenticated;
grant all on public.market_data_usage to service_role;

create or replace function public.market_data_reserve(
  p_provider text,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_period_start date := date_trunc('month', timezone('UTC', now()))::date;
  v_count integer;
begin
  if p_provider is distinct from 'brapi'
     or p_limit is null or p_limit < 1 or p_limit > 15000 then
    raise exception 'Parâmetros inválidos para reserva de cotações';
  end if;

  insert into public.market_data_usage(provider, period_start, request_count)
  values (p_provider, v_period_start, 1)
  on conflict (provider, period_start) do update
    set request_count = public.market_data_usage.request_count + 1,
        updated_at = now()
    where public.market_data_usage.request_count < p_limit
  returning request_count into v_count;

  return found;
end;
$$;

revoke all on function public.market_data_reserve(text, integer) from public, anon, authenticated;
grant execute on function public.market_data_reserve(text, integer) to service_role;

commit;
