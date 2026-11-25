begin;

alter table public.radar_fires
  add column source text,
  add column quote_observed_at timestamptz;

-- Contador diário. A RPC limita a soma dos últimos 30 dias, não o mês civil,
-- para respeitar ciclos de cobrança do provedor que podem iniciar em qualquer dia.
create table public.market_data_usage (
  provider text not null check (provider in ('brapi')),
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, usage_date)
);

-- Cursor separado para que a rotação continue entre dias e execuções.
create table public.market_data_cursor (
  provider text primary key check (provider in ('brapi')),
  last_symbol text not null check (last_symbol ~ '^[A-Z0-9.]{1,32}$'),
  updated_at timestamptz not null default now()
);

alter table public.market_data_usage enable row level security;
alter table public.market_data_cursor enable row level security;
revoke all on public.market_data_usage from public, anon, authenticated;
revoke all on public.market_data_cursor from public, anon, authenticated;
grant all on public.market_data_usage to service_role;
grant all on public.market_data_cursor to service_role;

create or replace function public.market_data_reserve(
  p_provider text,
  p_symbol text,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_today date := (timezone('UTC', now()))::date;
  v_used bigint;
begin
  if p_provider is distinct from 'brapi'
     or p_symbol is null
     or p_symbol !~ '^[A-Z0-9.]{1,32}$'
     or p_limit is null or p_limit < 1 or p_limit > 15000 then
    raise exception 'Parâmetros inválidos para reserva de cotações';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_provider)::bigint);

  select coalesce(sum(request_count), 0) into v_used
    from public.market_data_usage
   where provider = p_provider
     and usage_date > v_today - 30
     and usage_date <= v_today;

  if v_used >= p_limit then
    return false;
  end if;

  insert into public.market_data_usage(provider, usage_date, request_count)
  values (p_provider, v_today, 1)
  on conflict (provider, usage_date) do update
    set request_count = public.market_data_usage.request_count + 1,
        updated_at = now();

  insert into public.market_data_cursor(provider, last_symbol)
  values (p_provider, p_symbol)
  on conflict (provider) do update
    set last_symbol = excluded.last_symbol,
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.market_data_reserve(text, text, integer) from public, anon, authenticated;
grant execute on function public.market_data_reserve(text, text, integer) to service_role;

commit;
