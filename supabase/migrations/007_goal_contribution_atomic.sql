begin;

-- Contribuições de metas são registradas no histórico e atualizadas em uma única
-- transação. A função roda como invoker: RLS e permissões do usuário continuam valendo.
create or replace function public.add_goal_contribution(
  p_goal_id uuid,
  p_amount numeric,
  p_contribution_date date default current_date
)
returns table (
  contribution_id uuid,
  goal_id uuid,
  current_amount numeric,
  target_amount numeric
)
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current numeric(14,2);
  v_target numeric(14,2);
  v_contribution_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_goal_id is null or p_amount is null or p_amount <= 0 or p_amount > 10000000 then
    raise exception 'invalid contribution' using errcode = '22023';
  end if;
  if p_contribution_date is null or p_contribution_date > current_date + 1 then
    raise exception 'invalid contribution date' using errcode = '22023';
  end if;

  select g.current_amount, g.target_amount
    into v_current, v_target
    from public.goals g
   where g.id = p_goal_id and g.user_id = v_user_id
   for update;

  if not found then
    raise exception 'goal not found' using errcode = 'P0002';
  end if;

  insert into public.goal_contributions (
    user_id, goal_id, amount, contribution_date, source
  ) values (
    v_user_id, p_goal_id, p_amount, p_contribution_date, 'manual'
  ) returning id into v_contribution_id;

  update public.goals g
     set current_amount = g.current_amount + p_amount
   where g.id = p_goal_id and g.user_id = v_user_id
   returning g.current_amount, g.target_amount
        into v_current, v_target;

  return query select v_contribution_id, p_goal_id, v_current, v_target;
end;
$$;

revoke all on function public.add_goal_contribution(uuid, numeric, date) from public, anon;
grant execute on function public.add_goal_contribution(uuid, numeric, date) to authenticated;

commit;
