begin;

-- Resumos semanais exigem consentimento afirmativo; dados antigos herdaram
-- defaults permissivos e não podem ser tratados como consentimento explícito.
alter table public.settings
  alter column whatsapp_weekly_summary set default false;
update public.settings set whatsapp_weekly_summary = false;

alter table public.whatsapp_links
  alter column weekly_summary_enabled set default false;
update public.whatsapp_links set weekly_summary_enabled = false;

-- Comprovantes ficam em bucket privado; os dois primeiros segmentos do caminho
-- são user_id/transaction_id e ambos precisam pertencer à sessão autenticada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipt-files', 'receipt-files', false, 5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='receipt_files_insert_own_transaction') then
    create policy receipt_files_insert_own_transaction on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'receipt-files'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and exists (
          select 1 from public.transactions t
           where t.user_id = (select auth.uid())
             and t.id::text = (storage.foldername(name))[2]
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='receipt_files_select_own_transaction') then
    create policy receipt_files_select_own_transaction on storage.objects
      for select to authenticated
      using (
        bucket_id = 'receipt-files'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and exists (
          select 1 from public.transactions t
           where t.user_id = (select auth.uid())
             and t.id::text = (storage.foldername(name))[2]
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='receipt_files_delete_own_transaction') then
    create policy receipt_files_delete_own_transaction on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'receipt-files'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and exists (
          select 1 from public.transactions t
           where t.user_id = (select auth.uid())
             and t.id::text = (storage.foldername(name))[2]
        )
      );
  end if;
end
$policies$;

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

  update public.whatsapp_links l
     set last_summary_week=p_week, updated_at=now()
   where l.user_id=p_user_id and l.weekly_summary_enabled
     and exists (
       select 1 from public.settings s
        where s.user_id=p_user_id and s.whatsapp_weekly_summary
     )
     and (l.last_summary_week is null or l.last_summary_week < p_week);

  return found;
end;
$$;

create or replace function public.whatsapp_pending_confirm(
  p_pending_id text
) returns table (result text, transaction_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pending public.whatsapp_pending_transactions%rowtype;
  v_link_phone text;
  v_kind text;
  v_amount numeric(14,2);
  v_amount_text text;
  v_date date;
  v_description text;
  v_category_id uuid;
  v_account_id uuid;
  v_card_id uuid;
  v_transaction_id uuid;
begin
  if p_pending_id is null or length(p_pending_id) not between 1 and 160 then
    raise exception 'Identificador de lançamento pendente inválido';
  end if;

  select * into v_pending
    from public.whatsapp_pending_transactions
   where id=p_pending_id
   for update;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if v_pending.status <> 'pending' then
    return query select v_pending.status, null::uuid;
    return;
  end if;
  if v_pending.expires_at <= now() then
    update public.whatsapp_pending_transactions set status='expired' where id=p_pending_id;
    return query select 'expired'::text, null::uuid;
    return;
  end if;

  select l.phone into v_link_phone
    from public.whatsapp_links l
   where l.user_id=v_pending.user_id;
  if v_link_phone is null or v_link_phone <> v_pending.phone then
    return query select 'not_linked'::text, null::uuid;
    return;
  end if;

  begin
    v_kind := v_pending.payload->>'kind';
    v_amount_text := v_pending.payload->>'amount';
    if v_amount_text is null
       or v_amount_text !~ '^[0-9.]+$'
       or length(split_part(v_amount_text, '.', 1)) not between 1 and 8
       or (position('.' in v_amount_text) > 0 and length(split_part(v_amount_text, '.', 2)) not between 1 and 2)
       or length(v_amount_text) - length(replace(v_amount_text, '.', '')) > 1 then
      return query select 'invalid_payload'::text, null::uuid;
      return;
    end if;
    v_amount := v_amount_text::numeric;
    v_date := (v_pending.payload->>'transaction_date')::date;
    v_description := btrim(v_pending.payload->>'description');
    v_category_id := nullif(v_pending.payload->>'category_id','')::uuid;
    v_account_id := nullif(v_pending.payload->>'account_id','')::uuid;
    v_card_id := nullif(v_pending.payload->>'card_id','')::uuid;
  exception when others then
    return query select 'invalid_payload'::text, null::uuid;
    return;
  end;

  if v_kind is null or v_kind not in ('income','expense')
     or v_amount is null or v_amount <= 0 or v_amount > 10000000
     or round(v_amount,2) <> v_amount
     or v_date is null or v_date > current_date + 1
     or v_description is null or length(v_description) not between 1 and 240
     or (v_account_id is null and v_card_id is null)
     or (v_account_id is not null and v_card_id is not null)
     or (v_card_id is not null and v_kind <> 'expense')
     or (v_account_id is not null and not exists (
       select 1 from public.accounts a
        where a.user_id=v_pending.user_id and a.id=v_account_id and not a.is_archived
     ))
     or (v_card_id is not null and not exists (
       select 1 from public.cards c
        where c.user_id=v_pending.user_id and c.id=v_card_id and not c.is_archived
     ))
     or (v_category_id is not null and not exists (
       select 1 from public.categories c
        where c.user_id=v_pending.user_id and c.id=v_category_id and c.kind=v_kind
     )) then
    return query select 'invalid_payload'::text, null::uuid;
    return;
  end if;

  insert into public.transactions (
    user_id, kind, status, amount, transaction_date, description,
    category_id, account_id, card_id, payment_method, settled_amount,
    settled_at, source, external_reference
  ) values (
    v_pending.user_id, v_kind, 'paid', v_amount, v_date, v_description,
    v_category_id, v_account_id, v_card_id, 'whatsapp', v_amount,
    v_date, 'whatsapp', v_pending.source_message_id
  ) returning id into v_transaction_id;

  update public.whatsapp_pending_transactions
     set status='confirmed'
   where id=p_pending_id and status='pending';

  return query select 'confirmed'::text, v_transaction_id;
end;
$$;

revoke all on function public.whatsapp_pending_confirm(text) from public, anon, authenticated;
grant execute on function public.whatsapp_pending_confirm(text) to service_role;

commit;
