begin;

create table public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  usage_kind text not null check (usage_kind in ('phrase','receipt','statement','whatsapp')),
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date, usage_kind)
);

create table public.ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  usage_kind text not null check (usage_kind in ('phrase','receipt','statement','whatsapp')),
  status text not null default 'reserved' check (status in ('reserved','committed','released','expired')),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index ai_usage_reservations_active_idx
on public.ai_usage_reservations(user_id, usage_kind, usage_date, expires_at)
where status = 'reserved';

create table public.rate_limit_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (length(key) between 1 and 100),
  window_start bigint not null,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, key, window_start)
);

create table public.function_errors (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  function_name text not null check (length(function_name) between 1 and 100),
  stage text not null check (length(stage) between 1 and 100),
  error_code text,
  sanitized_message text not null check (length(sanitized_message) <= 1000)
);

create or replace function public.ai_usage_reserve(
  p_user_id uuid,
  p_usage_kind text,
  p_daily_limit integer,
  p_monthly_limit integer
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month_start date;
  v_monthly_used bigint;
  v_daily_used bigint;
  v_reservation uuid;
begin
  if p_user_id is null or p_usage_kind is null
     or p_usage_kind not in ('phrase','receipt','statement','whatsapp')
     or p_daily_limit is null or p_monthly_limit is null
     or p_daily_limit < 1 or p_monthly_limit < p_daily_limit
     or p_daily_limit > 10000 or p_monthly_limit > 100000 then
    raise exception 'Parâmetros inválidos para reserva de uso de IA';
  end if;

  v_month_start := date_trunc('month', v_today::timestamp)::date;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_usage_kind || ':' || v_month_start::text, 0));

  update public.ai_usage_reservations
     set status = 'expired', finalized_at = now()
   where user_id = p_user_id and usage_kind = p_usage_kind
     and status = 'reserved' and expires_at <= now();

  select coalesce(sum(count),0) into v_daily_used
    from public.ai_usage
   where user_id = p_user_id and usage_kind = p_usage_kind and usage_date = v_today;

  select coalesce(sum(count),0) into v_monthly_used
    from public.ai_usage
   where user_id = p_user_id and usage_kind = p_usage_kind
     and usage_date >= v_month_start and usage_date <= v_today;

  v_daily_used := v_daily_used + (
    select count(*) from public.ai_usage_reservations
     where user_id = p_user_id and usage_kind = p_usage_kind
       and usage_date = v_today and status = 'reserved' and expires_at > now()
  );
  v_monthly_used := v_monthly_used + (
    select count(*) from public.ai_usage_reservations
     where user_id = p_user_id and usage_kind = p_usage_kind
       and usage_date >= v_month_start and usage_date <= v_today
       and status = 'reserved' and expires_at > now()
  );

  if v_daily_used >= p_daily_limit or v_monthly_used >= p_monthly_limit then
    return null;
  end if;

  insert into public.ai_usage_reservations(user_id, usage_date, usage_kind)
  values (p_user_id, v_today, p_usage_kind)
  returning id into v_reservation;

  return v_reservation;
end;
$$;

create or replace function public.ai_usage_finalize(
  p_reservation_id uuid,
  p_success boolean
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_res public.ai_usage_reservations%rowtype;
begin
  if p_reservation_id is null or p_success is null then
    raise exception 'Parâmetros inválidos para finalizar reserva de IA';
  end if;

  select * into v_res
    from public.ai_usage_reservations
   where id = p_reservation_id
   for update;

  if not found or v_res.status <> 'reserved' or v_res.expires_at <= now() then
    return false;
  end if;

  if p_success then
    insert into public.ai_usage(user_id, usage_date, usage_kind, count)
    values (v_res.user_id, v_res.usage_date, v_res.usage_kind, 1)
    on conflict (user_id, usage_date, usage_kind)
    do update set count = public.ai_usage.count + 1, updated_at = now();
    update public.ai_usage_reservations
       set status = 'committed', finalized_at = now()
     where id = p_reservation_id;
  else
    update public.ai_usage_reservations
       set status = 'released', finalized_at = now()
     where id = p_reservation_id;
  end if;

  return true;
end;
$$;

create or replace function public.rate_limit_allow(
  p_user_id uuid,
  p_key text,
  p_window_start bigint,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if p_user_id is null or coalesce(length(p_key),0) not between 1 and 100
     or p_window_start is null or p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'Parâmetros inválidos para rate limit';
  end if;

  insert into public.rate_limit_buckets(user_id, key, window_start, count)
  values (p_user_id, p_key, p_window_start, 1)
  on conflict (user_id, key, window_start)
  do update set count = public.rate_limit_buckets.count + 1,
                updated_at = now()
    where public.rate_limit_buckets.count < p_limit
  returning count into v_count;

  return v_count is not null;
end;
$$;

create or replace function public.record_function_error(
  p_function_name text,
  p_stage text,
  p_error_code text,
  p_sanitized_message text
) returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id bigint;
begin
  if coalesce(length(p_function_name),0) not between 1 and 100
     or coalesce(length(p_stage),0) not between 1 and 100
     or p_sanitized_message is null or length(p_sanitized_message) > 1000 then
    raise exception 'Parâmetros inválidos para log de erro';
  end if;
  insert into public.function_errors(function_name, stage, error_code, sanitized_message)
  values (p_function_name, p_stage, left(p_error_code,100), p_sanitized_message)
  returning id into v_id;
  return v_id;
end;
$$;

alter table public.ai_usage enable row level security;
alter table public.ai_usage_reservations enable row level security;
alter table public.rate_limit_buckets enable row level security;
alter table public.function_errors enable row level security;

revoke all on public.ai_usage, public.ai_usage_reservations, public.rate_limit_buckets, public.function_errors
from public, anon, authenticated;
grant all on public.ai_usage, public.ai_usage_reservations, public.rate_limit_buckets, public.function_errors
to service_role;
grant usage, select on sequence public.function_errors_id_seq to service_role;

revoke all on function public.ai_usage_reserve(uuid,text,integer,integer) from public, anon, authenticated;
revoke all on function public.ai_usage_finalize(uuid,boolean) from public, anon, authenticated;
revoke all on function public.rate_limit_allow(uuid,text,bigint,integer) from public, anon, authenticated;
revoke all on function public.record_function_error(text,text,text,text) from public, anon, authenticated;
grant execute on function public.ai_usage_reserve(uuid,text,integer,integer) to service_role;
grant execute on function public.ai_usage_finalize(uuid,boolean) to service_role;
grant execute on function public.rate_limit_allow(uuid,text,bigint,integer) to service_role;
grant execute on function public.record_function_error(text,text,text,text) to service_role;

commit;
