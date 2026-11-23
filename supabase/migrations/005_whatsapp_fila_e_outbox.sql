begin;

create table public.whatsapp_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text not null unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  weekly_summary_enabled boolean not null default true,
  last_summary_week date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.whatsapp_link_codes (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index whatsapp_link_codes_user_expiry_idx
on public.whatsapp_link_codes(user_id, expires_at);

create table public.whatsapp_link_attempts (
  phone text primary key check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  window_started_at timestamptz not null,
  attempts smallint not null default 0 check (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.whatsapp_pending_transactions (
  id text primary key check (length(id) between 1 and 160),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  source_message_id text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (user_id, source_message_id)
);

create index whatsapp_pending_user_expiry_idx
on public.whatsapp_pending_transactions(user_id, expires_at)
where status = 'pending';

create table public.whatsapp_inbox (
  message_id text primary key check (length(message_id) between 1 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','exhausted')),
  lease_token uuid,
  lease_until timestamptz,
  attempts smallint not null default 0 check (attempts between 0 and 8),
  last_error text check (last_error is null or length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'processing' and lease_token is not null and lease_until is not null)
      or (status <> 'processing' and lease_token is null and lease_until is null))
);

create index whatsapp_inbox_recovery_idx
on public.whatsapp_inbox(lease_until, created_at)
where status in ('queued','processing');

create table public.whatsapp_outbox (
  idempotency_key text primary key check (length(idempotency_key) between 1 and 200),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'sending'
    check (status in ('sending','sent','failed_safe','failed','uncertain')),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 1 check (attempts >= 1),
  provider_message_id text,
  last_error text check (last_error is null or length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'sending' and lease_token is not null and lease_until is not null)
      or (status <> 'sending' and lease_token is null and lease_until is null))
);

create index whatsapp_outbox_recovery_idx
on public.whatsapp_outbox(lease_until, updated_at)
where status in ('sending','failed_safe');

create or replace function public.whatsapp_link_attempt_allow(p_phone text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.whatsapp_link_attempts%rowtype;
begin
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Telefone inválido';
  end if;

  insert into public.whatsapp_link_attempts(phone, window_started_at, attempts, updated_at)
  values (p_phone, now(), 1, now())
  on conflict (phone) do update
    set window_started_at = case
          when public.whatsapp_link_attempts.window_started_at <= now() - interval '15 minutes' then now()
          else public.whatsapp_link_attempts.window_started_at end,
        attempts = case
          when public.whatsapp_link_attempts.window_started_at <= now() - interval '15 minutes' then 1
          else public.whatsapp_link_attempts.attempts + 1 end,
        blocked_until = case
          when public.whatsapp_link_attempts.blocked_until > now() then public.whatsapp_link_attempts.blocked_until
          when public.whatsapp_link_attempts.window_started_at <= now() - interval '15 minutes' then null
          when public.whatsapp_link_attempts.attempts + 1 > 10 then now() + interval '15 minutes'
          else null end,
        updated_at = now()
  returning * into v_row;

  return v_row.attempts <= 10 and (v_row.blocked_until is null or v_row.blocked_until <= now());
end;
$$;

create or replace function public.whatsapp_link_consume(
  p_code_hash text,
  p_phone text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
begin
  if p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$'
     or p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Código ou telefone inválido';
  end if;

  select user_id into v_user_id
    from public.whatsapp_link_codes
   where code_hash = p_code_hash and expires_at > now()
   for update;

  if not found then return null; end if;

  insert into public.whatsapp_links(user_id, phone)
  values (v_user_id, p_phone)
  on conflict (user_id) do update
    set phone = excluded.phone, weekly_summary_enabled = public.whatsapp_links.weekly_summary_enabled,
        updated_at = now();

  delete from public.whatsapp_link_codes where code_hash = p_code_hash;
  delete from public.whatsapp_pending_transactions where user_id = v_user_id and phone <> p_phone;
  return v_user_id;
exception
  when unique_violation then
    raise exception 'Telefone já vinculado a outra conta';
end;
$$;

create or replace function public.whatsapp_inbox_reserve(
  p_message_id text,
  p_payload jsonb,
  p_lease_seconds integer default 180
) returns table (reservation_status text, fencing_token uuid, attempt_number integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.whatsapp_inbox%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if coalesce(length(p_message_id),0) not between 1 and 200
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Parâmetros inválidos para reservar mensagem';
  end if;

  insert into public.whatsapp_inbox(message_id, payload, status, lease_token, lease_until, attempts)
  values (p_message_id, p_payload, 'processing', v_token, now() + make_interval(secs => p_lease_seconds), 1)
  on conflict (message_id) do nothing;

  if found then
    return query select 'reserved'::text, v_token, 1;
    return;
  end if;

  select * into v_row from public.whatsapp_inbox
   where message_id = p_message_id for update;

  if v_row.status = 'completed' then
    return query select 'completed'::text, null::uuid, v_row.attempts::integer;
  elsif v_row.status = 'exhausted' or v_row.attempts >= 8 then
    update public.whatsapp_inbox set status='exhausted', lease_token=null, lease_until=null
     where message_id=p_message_id;
    return query select 'exhausted'::text, null::uuid, v_row.attempts::integer;
  elsif v_row.status = 'processing' and v_row.lease_until > now() then
    return query select 'busy'::text, null::uuid, v_row.attempts::integer;
  elsif v_row.status = 'failed' or v_row.status = 'queued'
     or (v_row.status = 'processing' and v_row.lease_until <= now()) then
    update public.whatsapp_inbox
       set status='processing', lease_token=v_token,
           lease_until=now() + make_interval(secs => p_lease_seconds),
           attempts=attempts+1, updated_at=now(), last_error=null
     where message_id=p_message_id
     returning attempts into v_row.attempts;
    return query select 'reserved'::text, v_token, v_row.attempts::integer;
  else
    return query select 'busy'::text, null::uuid, v_row.attempts::integer;
  end if;
end;
$$;

create or replace function public.whatsapp_inbox_finalize(
  p_message_id text,
  p_fencing_token uuid,
  p_success boolean,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_message_id is null or p_fencing_token is null or p_success is null then
    raise exception 'Parâmetros inválidos para finalizar mensagem';
  end if;

  update public.whatsapp_inbox
     set status = case when p_success then 'completed'
                       when attempts >= 8 then 'exhausted' else 'failed' end,
         lease_token = null, lease_until = null,
         last_error = case when p_success then null else left(coalesce(p_error,'falha sem detalhe'),1000) end,
         completed_at = case when p_success then now() else completed_at end,
         updated_at = now()
   where message_id = p_message_id and status = 'processing'
     and lease_token = p_fencing_token;

  return found;
end;
$$;

create or replace function public.whatsapp_outbox_reserve(
  p_idempotency_key text,
  p_phone text,
  p_payload jsonb,
  p_lease_seconds integer default 90
) returns table (reservation_status text, fencing_token uuid, attempt_number integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.whatsapp_outbox%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if coalesce(length(p_idempotency_key),0) not between 1 and 200
     or p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$'
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Parâmetros inválidos para outbox';
  end if;

  insert into public.whatsapp_outbox(idempotency_key, phone, payload, status, lease_token, lease_until, attempts)
  values (p_idempotency_key, p_phone, p_payload, 'sending', v_token,
          now() + make_interval(secs => p_lease_seconds), 1)
  on conflict (idempotency_key) do nothing;

  if found then
    return query select 'reserved'::text, v_token, 1;
    return;
  end if;

  select * into v_row from public.whatsapp_outbox
   where idempotency_key = p_idempotency_key for update;

  if v_row.phone <> p_phone or v_row.payload <> p_payload then
    raise exception 'Chave idempotente reutilizada com destinatário ou payload divergente';
  end if;

  if v_row.status = 'sent' then
    return query select 'sent'::text, null::uuid, v_row.attempts;
  elsif v_row.status = 'uncertain' then
    return query select 'uncertain'::text, null::uuid, v_row.attempts;
  elsif v_row.status = 'failed' then
    return query select 'failed'::text, null::uuid, v_row.attempts;
  elsif v_row.status = 'sending' and v_row.lease_until > now() then
    return query select 'busy'::text, null::uuid, v_row.attempts;
  elsif v_row.status = 'sending' and v_row.lease_until <= now() then
    update public.whatsapp_outbox set status='uncertain', lease_token=null,
      lease_until=null, last_error='Lease expirou sem confirmação do provedor', updated_at=now()
     where idempotency_key=p_idempotency_key;
    return query select 'uncertain'::text, null::uuid, v_row.attempts;
  elsif v_row.status = 'failed_safe' then
    update public.whatsapp_outbox set status='sending', lease_token=v_token,
      lease_until=now() + make_interval(secs => p_lease_seconds),
      attempts=attempts+1, last_error=null, updated_at=now()
     where idempotency_key=p_idempotency_key
     returning attempts into v_row.attempts;
    return query select 'reserved'::text, v_token, v_row.attempts;
  else
    return query select 'failed'::text, null::uuid, v_row.attempts;
  end if;
end;
$$;

create or replace function public.whatsapp_outbox_finalize(
  p_idempotency_key text,
  p_fencing_token uuid,
  p_status text,
  p_provider_message_id text default null,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_idempotency_key is null or p_fencing_token is null
     or p_status not in ('sent','failed_safe','failed','uncertain') then
    raise exception 'Parâmetros inválidos para finalizar outbox';
  end if;

  update public.whatsapp_outbox
     set status=p_status, lease_token=null, lease_until=null,
         provider_message_id=coalesce(p_provider_message_id, provider_message_id),
         last_error=case when p_status='sent' then null else left(coalesce(p_error,'falha sem detalhe'),1000) end,
         updated_at=now()
   where idempotency_key=p_idempotency_key and status='sending'
     and lease_token=p_fencing_token;

  return found;
end;
$$;

create or replace function public.whatsapp_summary_reserve(
  p_user_id uuid,
  p_week date
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or p_week is null then
    raise exception 'Parâmetros inválidos para resumo semanal';
  end if;

  update public.whatsapp_links
     set last_summary_week=p_week, updated_at=now()
   where user_id=p_user_id and weekly_summary_enabled
     and (last_summary_week is null or last_summary_week < p_week);

  return found;
end;
$$;

do $$
begin
  alter table public.whatsapp_links enable row level security;
  create policy whatsapp_links_select_own on public.whatsapp_links
    for select to authenticated using (user_id = (select auth.uid()));

  alter table public.whatsapp_link_codes enable row level security;
  alter table public.whatsapp_link_attempts enable row level security;
  alter table public.whatsapp_pending_transactions enable row level security;
  alter table public.whatsapp_inbox enable row level security;
  alter table public.whatsapp_outbox enable row level security;

  revoke all on public.whatsapp_links, public.whatsapp_link_codes, public.whatsapp_link_attempts,
    public.whatsapp_pending_transactions, public.whatsapp_inbox, public.whatsapp_outbox
    from public, anon, authenticated;
  grant select on public.whatsapp_links to authenticated;
  grant all on public.whatsapp_links, public.whatsapp_link_codes, public.whatsapp_link_attempts,
    public.whatsapp_pending_transactions, public.whatsapp_inbox, public.whatsapp_outbox
    to service_role;
end $$;

create trigger whatsapp_links_set_updated_at before update on public.whatsapp_links
for each row execute function public.set_updated_at();
create trigger whatsapp_link_attempts_set_updated_at before update on public.whatsapp_link_attempts
for each row execute function public.set_updated_at();
create trigger whatsapp_inbox_set_updated_at before update on public.whatsapp_inbox
for each row execute function public.set_updated_at();
create trigger whatsapp_outbox_set_updated_at before update on public.whatsapp_outbox
for each row execute function public.set_updated_at();

revoke all on function public.whatsapp_link_attempt_allow(text) from public, anon, authenticated;
revoke all on function public.whatsapp_link_consume(text,text) from public, anon, authenticated;
revoke all on function public.whatsapp_inbox_reserve(text,jsonb,integer) from public, anon, authenticated;
revoke all on function public.whatsapp_inbox_finalize(text,uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.whatsapp_outbox_reserve(text,text,jsonb,integer) from public, anon, authenticated;
revoke all on function public.whatsapp_outbox_finalize(text,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.whatsapp_summary_reserve(uuid,date) from public, anon, authenticated;
grant execute on function public.whatsapp_link_attempt_allow(text) to service_role;
grant execute on function public.whatsapp_link_consume(text,text) to service_role;
grant execute on function public.whatsapp_inbox_reserve(text,jsonb,integer) to service_role;
grant execute on function public.whatsapp_inbox_finalize(text,uuid,boolean,text) to service_role;
grant execute on function public.whatsapp_outbox_reserve(text,text,jsonb,integer) to service_role;
grant execute on function public.whatsapp_outbox_finalize(text,uuid,text,text,text) to service_role;
grant execute on function public.whatsapp_summary_reserve(uuid,date) to service_role;

commit;
