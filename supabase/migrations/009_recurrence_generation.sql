begin;

create unique index if not exists transactions_recurrence_occurrence_unique
  on public.transactions(user_id, recurrence_id, transaction_date)
  where recurrence_id is not null;

create or replace function public.recurrence_next_date(
  p_frequency text,
  p_interval_count integer,
  p_current date,
  p_month_day smallint default null,
  p_month_of_year smallint default null
) returns date
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_month_start date;
  v_day integer;
  v_month integer;
  v_last_day integer;
begin
  if p_current is null or p_interval_count is null or p_interval_count not between 1 and 366 then
    raise exception 'Parâmetros de recorrência inválidos';
  end if;

  case p_frequency
    when 'daily' then return p_current + p_interval_count;
    when 'weekly' then return p_current + (7 * p_interval_count);
    when 'biweekly' then return p_current + (14 * p_interval_count);
    when 'interval' then return p_current + p_interval_count;
    when 'monthly' then
      v_month_start := (date_trunc('month', p_current)::date + make_interval(months => p_interval_count))::date;
      v_day := coalesce(p_month_day, extract(day from p_current)::integer);
      v_last_day := extract(day from (v_month_start + interval '1 month - 1 day'))::integer;
      return v_month_start + least(v_day, v_last_day) - 1;
    when 'yearly' then
      v_month := coalesce(p_month_of_year, extract(month from p_current)::integer);
      v_day := coalesce(p_month_day, extract(day from p_current)::integer);
      v_month_start := make_date(extract(year from p_current)::integer + p_interval_count, v_month, 1);
      v_last_day := extract(day from (v_month_start + interval '1 month - 1 day'))::integer;
      return v_month_start + least(v_day, v_last_day) - 1;
    else
      raise exception 'Frequência de recorrência inválida';
  end case;
end;
$$;

create or replace function public.recurrence_generate_due(
  p_until date,
  p_max_occurrences integer default 100
) returns table (created_count integer, processed_count integer, has_more boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rule public.recurrence_rules%rowtype;
  v_occurrence date;
  v_next date;
  v_created integer := 0;
  v_processed integer := 0;
  v_rows integer := 0;
begin
  if p_until is null or p_until > current_date + 366
     or p_max_occurrences is null or p_max_occurrences not between 1 and 500 then
    raise exception 'Parâmetros de geração de recorrências inválidos';
  end if;

  for v_rule in
    select r.*
      from public.recurrence_rules r
     where r.is_active
       and r.next_occurrence_on <= p_until
       and (r.ends_on is null or r.next_occurrence_on <= r.ends_on)
     order by r.next_occurrence_on, r.created_at
     limit 100
     for update skip locked
  loop
    if (v_rule.account_id is null and v_rule.card_id is null)
       or (v_rule.account_id is not null and v_rule.card_id is not null)
       or (v_rule.card_id is not null and v_rule.kind <> 'expense')
       or (v_rule.account_id is not null and not exists (
         select 1 from public.accounts a
          where a.user_id=v_rule.user_id and a.id=v_rule.account_id and not a.is_archived
       ))
       or (v_rule.card_id is not null and not exists (
         select 1 from public.cards c
          where c.user_id=v_rule.user_id and c.id=v_rule.card_id and not c.is_archived
       ))
       or (v_rule.category_id is not null and not exists (
         select 1 from public.categories c
          where c.user_id=v_rule.user_id and c.id=v_rule.category_id and c.kind=v_rule.kind
       )) then
      update public.recurrence_rules
         set is_active=false, updated_at=now()
       where id=v_rule.id and user_id=v_rule.user_id;
      continue;
    end if;

    v_occurrence := v_rule.next_occurrence_on;
    while v_occurrence <= p_until
      and (v_rule.ends_on is null or v_occurrence <= v_rule.ends_on)
      and v_processed < p_max_occurrences
    loop
      insert into public.transactions (
        user_id, kind, status, amount, transaction_date, description,
        category_id, account_id, card_id, payment_method, settled_amount,
        recurrence_id, source
      ) values (
        v_rule.user_id, v_rule.kind, 'planned', v_rule.amount, v_occurrence,
        v_rule.name, v_rule.category_id, v_rule.account_id, v_rule.card_id,
        v_rule.payment_method, 0, v_rule.id, 'recurrence'
      )
      on conflict (user_id, recurrence_id, transaction_date)
        where recurrence_id is not null do nothing;
      get diagnostics v_rows = row_count;
      v_created := v_created + v_rows;
      v_processed := v_processed + 1;

      v_next := public.recurrence_next_date(
        v_rule.frequency, v_rule.interval_count, v_occurrence,
        v_rule.month_day, v_rule.month_of_year
      );
      if v_next <= v_occurrence then
        raise exception 'A recorrência não avançou a data';
      end if;
      v_occurrence := v_next;
    end loop;

    update public.recurrence_rules
       set next_occurrence_on=v_occurrence,
           is_active=case when ends_on is not null and v_occurrence > ends_on then false else is_active end,
           updated_at=now()
     where id=v_rule.id and user_id=v_rule.user_id;

    if v_processed >= p_max_occurrences then
      exit;
    end if;
  end loop;

  return query
  select v_created, v_processed,
    exists (
      select 1 from public.recurrence_rules r
       where r.is_active and r.next_occurrence_on <= p_until
         and (r.ends_on is null or r.next_occurrence_on <= r.ends_on)
    );
end;
$$;

revoke all on function public.recurrence_next_date(text, integer, date, smallint, smallint) from public, anon, authenticated;
grant execute on function public.recurrence_next_date(text, integer, date, smallint, smallint) to service_role;
revoke all on function public.recurrence_generate_due(date, integer) from public, anon, authenticated;
grant execute on function public.recurrence_generate_due(date, integer) to service_role;

commit;
