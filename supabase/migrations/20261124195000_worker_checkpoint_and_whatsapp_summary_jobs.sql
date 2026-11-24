begin;

-- Checkpoint durável do Radar: uma página por invocação, com lease e fencing.
create table public.radar_worker_state (
  worker_key text primary key
    check (worker_key ~ '^radar-alerts(:[A-Z0-9.]{1,32})?$'),
  cursor_created_at timestamptz,
  cursor_id uuid,
  lease_token uuid,
  lease_until timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((cursor_created_at is null and cursor_id is null)
      or (cursor_created_at is not null and cursor_id is not null)),
  check ((lease_token is null and lease_until is null)
      or (lease_token is not null and lease_until is not null))
);
alter table public.radar_worker_state enable row level security;
revoke all on public.radar_worker_state from public, anon, authenticated;
grant all on public.radar_worker_state to service_role;

create or replace function public.radar_worker_claim(
  p_worker_key text,
  p_lease_seconds integer default 180
) returns table (
  reservation_status text,
  fencing_token uuid,
  cursor_created_at timestamptz,
  cursor_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.radar_worker_state%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if p_worker_key is null or p_worker_key !~ '^radar-alerts(:[A-Z0-9.]{1,32})?$'
     or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception 'Parâmetros inválidos para checkpoint Radar';
  end if;

  insert into public.radar_worker_state(worker_key)
  values (p_worker_key)
  on conflict (worker_key) do nothing;

  select * into v_row from public.radar_worker_state
   where worker_key = p_worker_key for update;

  if v_row.lease_until is not null and v_row.lease_until > now() then
    return query select 'busy'::text, null::uuid, v_row.cursor_created_at, v_row.cursor_id;
    return;
  end if;

  update public.radar_worker_state
     set lease_token = v_token,
         lease_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where worker_key = p_worker_key
   returning * into v_row;

  return query select 'reserved'::text, v_token, v_row.cursor_created_at, v_row.cursor_id;
end;
$$;

create or replace function public.radar_worker_checkpoint(
  p_worker_key text,
  p_fencing_token uuid,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_complete boolean
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_worker_key is null or p_fencing_token is null or p_complete is null
     or (not p_complete and (p_cursor_created_at is null or p_cursor_id is null))
     or (p_complete and (p_cursor_created_at is not null or p_cursor_id is not null)) then
    raise exception 'Parâmetros inválidos para checkpoint Radar';
  end if;

  update public.radar_worker_state
     set cursor_created_at = p_cursor_created_at,
         cursor_id = p_cursor_id,
         lease_token = null,
         lease_until = null,
         completed_at = case when p_complete then now() else completed_at end,
         updated_at = now()
   where worker_key = p_worker_key and lease_token = p_fencing_token;

  return found;
end;
$$;

revoke all on function public.radar_worker_claim(text,integer) from public, anon, authenticated;
revoke all on function public.radar_worker_checkpoint(text,uuid,timestamptz,uuid,boolean) from public, anon, authenticated;
grant execute on function public.radar_worker_claim(text,integer) to service_role;
grant execute on function public.radar_worker_checkpoint(text,uuid,timestamptz,uuid,boolean) to service_role;

-- Um resumo é persistido antes do primeiro envio. Repetições usam o mesmo
-- texto/chave idempotente; a outbox da Meta decide sent/uncertain/failed_safe.
create table public.whatsapp_weekly_summary_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  phone text not null check (phone ~ '^\\+[1-9][0-9]{7,14}$'),
  message text not null check (length(message) between 1 and 4096),
  status text not null default 'pending'
    check (status in ('pending','processing','sent','uncertain','failed','skipped')),
  lease_token uuid,
  lease_until timestamptz,
  attempts smallint not null default 0 check (attempts between 0 and 20),
  last_error text check (last_error is null or length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start),
  check ((status = 'processing' and lease_token is not null and lease_until is not null)
      or (status <> 'processing' and lease_token is null and lease_until is null))
);
-- Recupera automaticamente falhas seguras da implementação anterior:
-- a outbox já garante que repetir a mesma chave não duplica uma mensagem.
insert into public.whatsapp_weekly_summary_jobs(user_id, week_start, phone, message, status, last_error)
select parsed.user_id, parsed.week_start, o.phone, o.payload #>> '{text,body}', 'pending',
       'Recuperado de uma tentativa anterior marcada failed_safe'
  from public.whatsapp_outbox o
  cross join lateral (
    select (regexp_match(o.idempotency_key,
      '^weekly:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9]{4}-[0-9]{2}-[0-9]{2})
  on public.whatsapp_weekly_summary_jobs(status, lease_until, week_start, user_id)
  where status in ('pending','processing');
alter table public.whatsapp_weekly_summary_jobs enable row level security;
revoke all on public.whatsapp_weekly_summary_jobs from public, anon, authenticated;
grant all on public.whatsapp_weekly_summary_jobs to service_role;

create trigger whatsapp_weekly_summary_jobs_set_updated_at
before update on public.whatsapp_weekly_summary_jobs
for each row execute function public.set_updated_at();

create or replace function public.whatsapp_summary_job_enqueue(
  p_user_id uuid,
  p_week date,
  p_phone text,
  p_message text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_week is null
     or p_phone is null or p_phone !~ '^\\+[1-9][0-9]{7,14}$'
     or p_message is null or length(p_message) not between 1 and 4096 then
    raise exception 'Parâmetros inválidos para resumo semanal';
  end if;

  insert into public.whatsapp_weekly_summary_jobs(user_id, week_start, phone, message)
  select l.user_id, p_week, l.phone, p_message
    from public.whatsapp_links l
    join public.settings s on s.user_id = l.user_id
   where l.user_id = p_user_id
     and l.phone = p_phone
     and l.weekly_summary_enabled
     and s.whatsapp_weekly_summary
     and (l.last_summary_week is null or l.last_summary_week < p_week)
  on conflict (user_id, week_start) do nothing;

  return found;
end;
$$;

create or replace function public.whatsapp_summary_job_skip(
  p_user_id uuid,
  p_week date
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_week is null then
    raise exception 'Parâmetros inválidos para pular resumo semanal';
  end if;

  update public.whatsapp_links l
     set last_summary_week = p_week, updated_at = now()
   where l.user_id = p_user_id
     and l.weekly_summary_enabled
     and (l.last_summary_week is null or l.last_summary_week < p_week)
     and not exists (
       select 1 from public.settings s
        where s.user_id = p_user_id and s.whatsapp_weekly_summary
     );

  return found;
end;
$$;

create or replace function public.whatsapp_summary_job_claim(
  p_user_id uuid,
  p_week date,
  p_lease_seconds integer default 180
) returns table (
  reservation_status text,
  fencing_token uuid,
  phone text,
  message text,
  attempt_number integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.whatsapp_weekly_summary_jobs%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if p_user_id is null or p_week is null
     or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception 'Parâmetros inválidos para reservar resumo semanal';
  end if;

  select * into v_row from public.whatsapp_weekly_summary_jobs
   where user_id = p_user_id and week_start = p_week for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::text, 0;
    return;
  end if;

  if not exists (
    select 1 from public.whatsapp_links l
    join public.settings s on s.user_id = l.user_id
    where l.user_id = p_user_id and l.phone = v_row.phone
      and l.weekly_summary_enabled and s.whatsapp_weekly_summary
  ) then
    update public.whatsapp_weekly_summary_jobs
       set status = 'skipped', lease_token = null, lease_until = null,
           last_error = 'Consentimento removido antes do envio'
     where user_id = p_user_id and week_start = p_week;
    update public.whatsapp_links set last_summary_week = p_week, updated_at = now()
     where user_id = p_user_id and (last_summary_week is null or last_summary_week < p_week);
    return query select 'skipped'::text, null::uuid, v_row.phone, v_row.message, v_row.attempts::integer;
    return;
  end if;

  if v_row.status in ('sent','uncertain','failed','skipped') then
    return query select v_row.status, null::uuid, v_row.phone, v_row.message, v_row.attempts::integer;
    return;
  end if;

  if v_row.attempts >= 20 then
    update public.whatsapp_weekly_summary_jobs
       set status = 'failed', lease_token = null, lease_until = null,
           last_error = 'Limite de tentativas atingido'
     where user_id = p_user_id and week_start = p_week;
    update public.whatsapp_links set last_summary_week = p_week, updated_at = now()
     where user_id = p_user_id and (last_summary_week is null or last_summary_week < p_week);
    return query select 'failed'::text, null::uuid, v_row.phone, v_row.message, v_row.attempts::integer;
    return;
  end if;

  if v_row.status = 'processing' and v_row.lease_until > now() then
    return query select 'busy'::text, null::uuid, v_row.phone, v_row.message, v_row.attempts::integer;
    return;
  end if;

  update public.whatsapp_weekly_summary_jobs
     set status = 'processing', lease_token = v_token,
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = attempts + 1, last_error = null, updated_at = now()
   where user_id = p_user_id and week_start = p_week
   returning * into v_row;

  return query select 'reserved'::text, v_token, v_row.phone, v_row.message, v_row.attempts::integer;
end;
$$;

create or replace function public.whatsapp_summary_job_finalize(
  p_user_id uuid,
  p_week date,
  p_fencing_token uuid,
  p_status text,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_week is null or p_fencing_token is null
     or p_status is null or p_status not in ('pending','sent','uncertain','failed') then
    raise exception 'Parâmetros inválidos para finalizar resumo semanal';
  end if;

  update public.whatsapp_weekly_summary_jobs
     set status = p_status, lease_token = null, lease_until = null,
         last_error = case when p_status = 'sent' then null
                           else left(coalesce(p_error, 'falha sem detalhe'), 1000) end,
         updated_at = now()
   where user_id = p_user_id and week_start = p_week
     and status = 'processing' and lease_token = p_fencing_token;

  if not found then return false; end if;

  if p_status in ('sent','uncertain','failed') then
    update public.whatsapp_links
       set last_summary_week = p_week, updated_at = now()
     where user_id = p_user_id
       and (last_summary_week is null or last_summary_week < p_week);
  end if;

  return true;
end;
$$;

revoke all on function public.whatsapp_summary_job_enqueue(uuid,date,text,text) from public, anon, authenticated;
revoke all on function public.whatsapp_summary_job_skip(uuid,date) from public, anon, authenticated;
revoke all on function public.whatsapp_summary_job_claim(uuid,date,integer) from public, anon, authenticated;
revoke all on function public.whatsapp_summary_job_finalize(uuid,date,uuid,text,text) from public, anon, authenticated;
grant execute on function public.whatsapp_summary_job_enqueue(uuid,date,text,text) to service_role;
grant execute on function public.whatsapp_summary_job_skip(uuid,date) to service_role;
grant execute on function public.whatsapp_summary_job_claim(uuid,date,integer) to service_role;
grant execute on function public.whatsapp_summary_job_finalize(uuid,date,uuid,text,text) to service_role;

commit;
))[1]::uuid as user_id,
           ((regexp_match(o.idempotency_key,
      '^weekly:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9]{4}-[0-9]{2}-[0-9]{2})
  on public.whatsapp_weekly_summary_jobs(status, lease_until, week_start, user_id)
  where status in ('pending','processing');
alter table public.whatsapp_weekly_summary_jobs enable row level security;
revoke all on public.whatsapp_weekly_summary_jobs from public, anon, authenticated;
grant all on public.whatsapp_weekly_summary_jobs to service_role;

create trigger whatsapp_weekly_summary_jobs_set_updated_at
before update on public.whatsapp_weekly_summary_jobs
for each row execute function public.set_updated_at();

create or replace function public.whatsapp_summary_job_enqueue(
  p_user_id uuid,
  p_week date,
  p_phone text,
  p_message text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_week is null
     or p_phone is null or p_phone !~ '^\\+[1-9][0-9]{7,14}$'
     or p_message is null or length(p_message) not between 1 and 4096 then
    raise exception 'Parâmetros inválidos para resumo semanal';
  end if;

  insert into public.whatsapp_weekly_summary_jobs(user_id, week_start, phone, message)
  select l.user_id, p_week, l.phone, p_message
    from public.whatsapp_links l
    join public.settings s on s.user_id = l.user_id
   where l.user_id = p_user_id
     and l.phone = p_phone
     and l.weekly_summary_enabled
     and s.whatsapp_weekly_summary
     and (l.last_summary_week is null or l.last_summary_week < p_week)
  on conflict (user_id, week_start) do nothing;

  return found;
end;
$$;

create or replace function public.whatsapp_summary_job_skip(
  p_user_id uuid,
  p_week date
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_week is null then
    raise exception 'Parâmetros inválidos para pular resumo semanal';
  end if;

  update public.whatsapp_links l
     set last_summary_week = p_week, updated_at = now()
   where l.user_id = p_user_id
     and l.weekly_summary_enabled
     and (l.last_summary_week is null or l.last_summary_week < p_week)
     and not exists (
       select 1 from public.settings s
        where s.user_id = p_user_id and s.whatsapp_weekly_summary
     );

  return found;
end;
$$;

create or replace function public.whatsapp_summary_job_claim(
  p_user_id uuid,
  p_week date,
  p_lease_seconds integer default 180
) returns table (
  reservation_status text,
  fencing_token uuid,
  phone text,
  message text,
  attempt_number integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.whatsapp_weekly_summary_jobs%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if p_user_id is null or p_week is null
     or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception 'Parâmetros inválidos para reservar resumo semanal';
  end if;

  select * into v_row from public.whatsapp_weekly_summary_jobs
   where user_id = p_user_id and week_start = p_week for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::text, 0;
    return;
  end if;

  if not exists (
    select 1 from public.whatsapp_links l
    join public.settings s on s.user_id = l.user_id
    where l.user_id = p_user_id and l.phone = v_row.phone
      and l.weekly_summary_enabled and s.whatsapp_weekly_summary
  ) then
    update public.whatsapp_weekly_summary_jobs
       set status = 'skipped', lease_token = null, lease_until = null,
           last_error = 'Consentimento removido antes do envio'
     where user_id = p_user_id and week_start = p_week;
    update public.whatsapp_links set last_summary_week = p_week, updated_at = now()
     where user_id = p_user_id and (last_summary_week is null or last_summary_week < p_week);
    return query select 'skipped'::text, null::uuid, v_row.phone, v_row.message, v_row.attempts::integer;
    return;
  end if;

  if v_row.status in ('sent','uncertain','failed','skipped') then
    return query select v_row.status, null::uuid, v_row.phone, v_row.message, v_row.attempts::integer;
    return;
  end if;

  if v_row.status = 'processing' and v_row.lease_until > now() then
    return query select 'busy'::text, null::uuid, v_row.phone, v_row.message, v_row.attempts::integer;
    return;
  end if;

  update public.whatsapp_weekly_summary_jobs
     set status = 'processing', lease_token = v_token,
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = attempts + 1, last_error = null, updated_at = now()
   where user_id = p_user_id and week_start = p_week
   returning * into v_row;

  return query select 'reserved'::text, v_token, v_row.phone, v_row.message, v_row.attempts::integer;
end;
$$;

create or replace function public.whatsapp_summary_job_finalize(
  p_user_id uuid,
  p_week date,
  p_fencing_token uuid,
  p_status text,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_week is null or p_fencing_token is null
     or p_status is null or p_status not in ('pending','sent','uncertain','failed') then
    raise exception 'Parâmetros inválidos para finalizar resumo semanal';
  end if;

  update public.whatsapp_weekly_summary_jobs
     set status = p_status, lease_token = null, lease_until = null,
         last_error = case when p_status = 'sent' then null
                           else left(coalesce(p_error, 'falha sem detalhe'), 1000) end,
         updated_at = now()
   where user_id = p_user_id and week_start = p_week
     and status = 'processing' and lease_token = p_fencing_token;

  if not found then return false; end if;

  if p_status in ('sent','uncertain','failed') then
    update public.whatsapp_links
       set last_summary_week = p_week, updated_at = now()
     where user_id = p_user_id
       and (last_summary_week is null or last_summary_week < p_week);
  end if;

  return true;
end;
$$;

revoke all on function public.whatsapp_summary_job_enqueue(uuid,date,text,text) from public, anon, authenticated;
revoke all on function public.whatsapp_summary_job_skip(uuid,date) from public, anon, authenticated;
revoke all on function public.whatsapp_summary_job_claim(uuid,date,integer) from public, anon, authenticated;
revoke all on function public.whatsapp_summary_job_finalize(uuid,date,uuid,text,text) from public, anon, authenticated;
grant execute on function public.whatsapp_summary_job_enqueue(uuid,date,text,text) to service_role;
grant execute on function public.whatsapp_summary_job_skip(uuid,date) to service_role;
grant execute on function public.whatsapp_summary_job_claim(uuid,date,integer) to service_role;
grant execute on function public.whatsapp_summary_job_finalize(uuid,date,uuid,text,text) to service_role;

commit;
))[2])::date as week_start
  ) parsed
 where o.idempotency_key like 'weekly:%'
   and o.status = 'failed_safe'
   and jsonb_typeof(o.payload #> '{text}') = 'object'
   and length(coalesce(o.payload #>> '{text,body}', '')) between 1 and 4096
 on conflict (user_id, week_start) do nothing;

create index whatsapp_weekly_summary_jobs_pending_idx
  on public.whatsapp_weekly_summary_jobs(status, lease_until, week_start, user_id)
  where status in ('pending','processing');
alter table public.whatsapp_weekly_summary_jobs enable row level security;
revoke all on public.whatsapp_weekly_summary_jobs from public, anon, authenticated;
grant all on public.whatsapp_weekly_summary_jobs to service_role;

create trigger whatsapp_weekly_summary_jobs_set_updated_at
before update on public.whatsapp_weekly_summary_jobs
for each row execute function public.set_updated_at();

create or replace function public.whatsapp_summary_job_enqueue(
  p_user_id uuid,
  p_week date,
  p_phone text,
  p_message text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_week is null
     or p_phone is null or p_phone !~ '^\\+[1-9][0-9]{7,14}$'
     or p_message is null or length(p_message) not between 1 and 4096 then
    raise exception 'Parâmetros inválidos para resumo semanal';
  end if;

  insert into public.whatsapp_weekly_summary_jobs(user_id, week_start, phone, message)
  select l.user_id, p_week, l.phone, p_message
    from public.whatsapp_links l
    join public.settings s on s.user_id = l.user_id
   where l.user_id = p_user_id
     and l.phone = p_phone
     and l.weekly_summary_enabled
     and s.whatsapp_weekly_summary
     and (l.last_summary_week is null or l.last_summary_week < p_week)
  on conflict (user_id, week_start) do nothing;

  return found;
end;
$$;

create or replace function public.whatsapp_summary_job_skip(
  p_user_id uuid,
  p_week date
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_week is null then
    raise exception 'Parâmetros inválidos para pular resumo semanal';
  end if;

  update public.whatsapp_links l
     set last_summary_week = p_week, updated_at = now()
   where l.user_id = p_user_id
     and l.weekly_summary_enabled
     and (l.last_summary_week is null or l.last_summary_week < p_week)
     and not exists (
       select 1 from public.settings s
        where s.user_id = p_user_id and s.whatsapp_weekly_summary
     );

  return found;
end;
$$;

create or replace function public.whatsapp_summary_job_claim(
  p_user_id uuid,
  p_week date,
  p_lease_seconds integer default 180
) returns table (
  reservation_status text,
  fencing_token uuid,
  phone text,
  message text,
  attempt_number integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.whatsapp_weekly_summary_jobs%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if p_user_id is null or p_week is null
     or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception 'Parâmetros inválidos para reservar resumo semanal';
  end if;

  select * into v_row from public.whatsapp_weekly_summary_jobs
   where user_id = p_user_id and week_start = p_week for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::text, 0;
    return;
  end if;

  if not exists (
    select 1 from public.whatsapp_links l
    join public.settings s on s.user_id = l.user_id
    where l.user_id = p_user_id and l.phone = v_row.phone
      and l.weekly_summary_enabled and s.whatsapp_weekly_summary
  ) then
    update public.whatsapp_weekly_summary_jobs
       set status = 'skipped', lease_token = null, lease_until = null,
           last_error = 'Consentimento removido antes do envio'
     where user_id = p_user_id and week_start = p_week;
    update public.whatsapp_links set last_summary_week = p_week, updated_at = now()
     where user_id = p_user_id and (last_summary_week is null or last_summary_week < p_week);
    return query select 'skipped'::text, null::uuid, v_row.phone, v_row.message, v_row.attempts::integer;
    return;
  end if;

  if v_row.status in ('sent','uncertain','failed','skipped') then
    return query select v_row.status, null::uuid, v_row.phone, v_row.message, v_row.attempts::integer;
    return;
  end if;

  if v_row.status = 'processing' and v_row.lease_until > now() then
    return query select 'busy'::text, null::uuid, v_row.phone, v_row.message, v_row.attempts::integer;
    return;
  end if;

  update public.whatsapp_weekly_summary_jobs
     set status = 'processing', lease_token = v_token,
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = attempts + 1, last_error = null, updated_at = now()
   where user_id = p_user_id and week_start = p_week
   returning * into v_row;

  return query select 'reserved'::text, v_token, v_row.phone, v_row.message, v_row.attempts::integer;
end;
$$;

create or replace function public.whatsapp_summary_job_finalize(
  p_user_id uuid,
  p_week date,
  p_fencing_token uuid,
  p_status text,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_week is null or p_fencing_token is null
     or p_status is null or p_status not in ('pending','sent','uncertain','failed') then
    raise exception 'Parâmetros inválidos para finalizar resumo semanal';
  end if;

  update public.whatsapp_weekly_summary_jobs
     set status = p_status, lease_token = null, lease_until = null,
         last_error = case when p_status = 'sent' then null
                           else left(coalesce(p_error, 'falha sem detalhe'), 1000) end,
         updated_at = now()
   where user_id = p_user_id and week_start = p_week
     and status = 'processing' and lease_token = p_fencing_token;

  if not found then return false; end if;

  if p_status in ('sent','uncertain','failed') then
    update public.whatsapp_links
       set last_summary_week = p_week, updated_at = now()
     where user_id = p_user_id
       and (last_summary_week is null or last_summary_week < p_week);
  end if;

  return true;
end;
$$;

revoke all on function public.whatsapp_summary_job_enqueue(uuid,date,text,text) from public, anon, authenticated;
revoke all on function public.whatsapp_summary_job_skip(uuid,date) from public, anon, authenticated;
revoke all on function public.whatsapp_summary_job_claim(uuid,date,integer) from public, anon, authenticated;
revoke all on function public.whatsapp_summary_job_finalize(uuid,date,uuid,text,text) from public, anon, authenticated;
grant execute on function public.whatsapp_summary_job_enqueue(uuid,date,text,text) to service_role;
grant execute on function public.whatsapp_summary_job_skip(uuid,date) to service_role;
grant execute on function public.whatsapp_summary_job_claim(uuid,date,integer) to service_role;
grant execute on function public.whatsapp_summary_job_finalize(uuid,date,uuid,text,text) to service_role;

commit;
