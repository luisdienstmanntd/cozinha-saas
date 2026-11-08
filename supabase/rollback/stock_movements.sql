-- Apply only when movement history is empty or has been safely migrated.
do $$ begin
  if exists (select 1 from public.stock_movements) then
    raise exception 'Histórico de movimentações não está vazio; preserve ou migre os eventos antes do rollback.';
  end if;
end $$;
drop function public.record_movement(uuid,uuid,uuid,text,numeric,text,uuid);
drop function private.record_movement(uuid,uuid,uuid,text,numeric,text,uuid);
drop table public.stock_movements;
