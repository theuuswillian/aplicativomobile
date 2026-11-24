begin;

-- Reativar um alerta inicia uma nova geração; updates concorrentes são serializados
-- pelo UPDATE da própria linha e não criam disparos duplicados por geração.
create or replace function public.radar_alert_set_enabled(
  p_alert_id uuid,
  p_enabled boolean
) returns table (
  id uuid,
  generation integer,
  is_enabled boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_alert_id is null or p_enabled is null then
    raise exception 'Parâmetros inválidos para atualizar alerta';
  end if;

  return query
  update public.radar_alerts as alert
     set is_enabled = p_enabled,
         generation = case
           when alert.is_enabled = false and p_enabled = true then alert.generation + 1
           else alert.generation
         end
   where alert.id = p_alert_id
     and alert.user_id = (select auth.uid())
  returning alert.id, alert.generation, alert.is_enabled;
end;
$$;

revoke all on function public.radar_alert_set_enabled(uuid, boolean) from public, anon;
grant execute on function public.radar_alert_set_enabled(uuid, boolean) to authenticated;

commit;
